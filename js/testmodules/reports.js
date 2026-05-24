// js/testmodules/reports.js
//
// Pin reporting + admin report-queue management.
//
// Schema (collection: reports/{id}):
//   {
//     type:        "pin" | "event" | "squad"
//     targetId:    string  // pin id or doc id
//     targetRouteId: string  // for type=pin: the publishedRoutes doc the pin lives in
//     targetUserId: string  // who created the offending content (publishedRoutes.userId)
//     targetSnapshot: { ... }  // a minimal snapshot of what was reported (for the queue UI)
//     reporterId:   string
//     reporterName: string
//     reason:       string
//     details:      string   // optional free-text
//     status:       "open" | "resolved" | "dismissed"
//     createdAt:    Timestamp
//     reviewedBy:   string?
//     reviewedAt:   Timestamp?
//     resolution:   string?
//   }
//
// The Firestore rule for /reports allows create-if-signed-in, read/update/delete
// only if the requester is admin. So submit is open, review is admin-only.

import {
    db, collection, addDoc, getDoc, getDocs, doc, updateDoc, query, where
} from './firebase.js';
import { state } from './config.js';

// ---------------------------------------------------------------------------
// REPORT SUBMISSION (called from community pin popup)
// ---------------------------------------------------------------------------

// In-memory state for the currently-open report modal — what pin the user
// clicked 🚩 on. Cleared on close/submit.
let pendingReport = null;

/**
 * Called from map.js when the user clicks 🚩 on a community pin. Pops the
 * report modal and pre-fills the target context. The actual submit happens
 * when the user picks a reason in the modal.
 */
export function openReportPinModal(pinInfo, routeInfo) {
    if (!state.currentUser) {
        alert('Please log in to report content.');
        return;
    }
    pendingReport = {
        type: 'pin',
        targetId: pinInfo.id || null,
        targetRouteId: routeInfo.routeId || null,
        targetUserId: routeInfo.userId || null,
        // Snapshot just enough to render the queue without re-fetching the route
        targetSnapshot: {
            title: pinInfo.title || '(untitled pin)',
            category: pinInfo.category || null,
            thumbnailURL: pinInfo.thumbnailURL || pinInfo.imageURL || null,
            username: routeInfo.username || 'Unknown'
        }
    };

    const modal = document.getElementById('reportPinModal');
    if (!modal) {
        console.error('reportPinModal not in DOM');
        return;
    }
    // Reset form state
    const detailsEl = document.getElementById('reportDetailsInput');
    if (detailsEl) detailsEl.value = '';
    const reasonEl = document.getElementById('reportReasonSelect');
    if (reasonEl) reasonEl.value = 'inappropriate';

    // Populate the preview block so the user can see what they're reporting
    const previewEl = document.getElementById('reportTargetPreview');
    if (previewEl) {
        previewEl.innerHTML = `
            ${pendingReport.targetSnapshot.thumbnailURL ? `<img src="${pendingReport.targetSnapshot.thumbnailURL}" alt="" style="max-width:120px; max-height:120px; border-radius:4px; display:block; margin-bottom:6px;">` : ''}
            <div style="font-size:0.9em;">
                <strong>${escapeHtml(pendingReport.targetSnapshot.title)}</strong><br>
                <span style="color:#666;">By: ${escapeHtml(pendingReport.targetSnapshot.username)}</span>
            </div>
        `;
    }
    modal.style.display = 'flex';
}

export function closeReportPinModal() {
    const modal = document.getElementById('reportPinModal');
    if (modal) modal.style.display = 'none';
    pendingReport = null;
}

/**
 * Submits the report. Called by the modal's Submit button.
 */
export async function submitPendingReport() {
    if (!pendingReport) {
        closeReportPinModal();
        return;
    }
    if (!state.currentUser) {
        alert('Please log in to submit a report.');
        return;
    }

    const reason = document.getElementById('reportReasonSelect')?.value || 'unspecified';
    const details = (document.getElementById('reportDetailsInput')?.value || '').trim();
    const submitBtn = document.getElementById('reportSubmitBtn');

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting…';
    }

    try {
        // Reporter name: fetch from publicProfiles so the reports queue shows a
        // real username, not an email. Fall back through a chain if anything fails.
        let reporterName = 'Anonymous';
        try {
            const profSnap = await getDoc(doc(db, 'publicProfiles', state.currentUser.uid));
            if (profSnap.exists() && profSnap.data().username) {
                reporterName = profSnap.data().username;
            } else {
                reporterName = state.currentUser.displayName || state.currentUser.email || 'Anonymous';
            }
        } catch (_) {
            reporterName = state.currentUser.displayName || state.currentUser.email || 'Anonymous';
        }

        await addDoc(collection(db, 'reports'), {
            ...pendingReport,
            reporterId: state.currentUser.uid,
            reporterName,
            reason,
            details,
            status: 'open',
            createdAt: new Date()
        });

        alert('Report submitted. Thank you — an admin will review it.');
        closeReportPinModal();
    } catch (err) {
        console.error('submitPendingReport failed:', err);
        alert('Could not submit report: ' + err.message);
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Report';
        }
    }
}

// ---------------------------------------------------------------------------
// ADMIN-SIDE: fetch + resolve/dismiss
// ---------------------------------------------------------------------------

/**
 * Fetches all reports with status === 'open'. Tiny dataset expected; client-
 * side sort by createdAt desc avoids needing a composite index.
 */
export async function fetchOpenReports() {
    try {
        const snap = await getDocs(query(collection(db, 'reports'), where('status', '==', 'open')));
        const rows = [];
        snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
        rows.sort((a, b) => {
            const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
            const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
            return tb - ta;
        });
        return rows;
    } catch (err) {
        console.error('fetchOpenReports failed:', err);
        return [];
    }
}

export async function resolveReport(reportId, resolutionNote) {
    try {
        await updateDoc(doc(db, 'reports', reportId), {
            status: 'resolved',
            resolution: resolutionNote || 'Resolved by admin',
            reviewedBy: state.currentUser ? state.currentUser.uid : null,
            reviewedAt: new Date()
        });
        return true;
    } catch (err) {
        console.error('resolveReport failed:', err);
        alert('Could not resolve report: ' + err.message);
        return false;
    }
}

export async function dismissReport(reportId, reason) {
    try {
        await updateDoc(doc(db, 'reports', reportId), {
            status: 'dismissed',
            resolution: reason || 'Dismissed (no action taken)',
            reviewedBy: state.currentUser ? state.currentUser.uid : null,
            reviewedAt: new Date()
        });
        return true;
    } catch (err) {
        console.error('dismissReport failed:', err);
        alert('Could not dismiss report: ' + err.message);
        return false;
    }
}

// ---------------------------------------------------------------------------
// ADMIN-SIDE: renderer for the Reports tab in admin panel
// ---------------------------------------------------------------------------

/**
 * Renders the Reports tab body. Called by admin.js's switchAdminTab when the
 * user clicks the Reports tab.
 */
export async function renderReportsTab() {
    const container = document.getElementById('adminReportsContent');
    if (!container) return;
    container.innerHTML = '<p>Loading reports…</p>';

    const rows = await fetchOpenReports();
    if (rows.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px; color:#666;">No open reports. 🎉</p>';
        return;
    }

    container.innerHTML = rows.map(r => {
        const snap = r.targetSnapshot || {};
        const dateStr = r.createdAt && r.createdAt.toDate
            ? r.createdAt.toDate().toLocaleString()
            : '';
        return `
            <div class="admin-queue-card" data-id="${r.id}">
                <div style="display:flex; gap:12px; align-items:flex-start;">
                    ${snap.thumbnailURL ? `<img src="${escapeHtml(snap.thumbnailURL)}" alt="" style="width:80px; height:80px; object-fit:cover; border-radius:4px; flex-shrink:0;">` : ''}
                    <div style="flex:1; min-width:0;">
                        <h4>🚩 ${escapeHtml(r.reason || 'unspecified')} — ${escapeHtml(r.type || 'pin')}</h4>
                        <p class="admin-queue-meta">
                            Target: <strong>${escapeHtml(snap.title || '(no title)')}</strong>
                            ${snap.username ? ` by ${escapeHtml(snap.username)}` : ''}
                        </p>
                        <p class="admin-queue-meta">
                            Reported by: <strong>${escapeHtml(r.reporterName || 'Unknown')}</strong>
                            ${dateStr ? ` • ${escapeHtml(dateStr)}` : ''}
                        </p>
                        ${r.details ? `<p class="admin-queue-desc">"${escapeHtml(r.details)}"</p>` : ''}
                    </div>
                </div>
                <div class="admin-queue-card-actions">
                    <button class="modal-button btn-primary admin-resolve-btn" title="Mark as actioned (no automatic content removal)">Resolve</button>
                    <button class="modal-button btn-secondary admin-dismiss-btn" title="Dismiss without action">Dismiss</button>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.admin-resolve-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.closest('.admin-queue-card').dataset.id;
            const note = prompt('Resolution note (optional):', 'Reviewed and actioned');
            if (note === null) return;
            btn.disabled = true;
            btn.textContent = 'Resolving…';
            const ok = await resolveReport(id, note);
            if (ok) renderReportsTab();
            else { btn.disabled = false; btn.textContent = 'Resolve'; }
        });
    });
    container.querySelectorAll('.admin-dismiss-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.closest('.admin-queue-card').dataset.id;
            const reason = prompt('Why dismiss? (optional):', 'No violation');
            if (reason === null) return;
            btn.disabled = true;
            btn.textContent = 'Dismissing…';
            const ok = await dismissReport(id, reason);
            if (ok) renderReportsTab();
            else { btn.disabled = false; btn.textContent = 'Dismiss'; }
        });
    });
}

// ---------------------------------------------------------------------------
// HELPER
// ---------------------------------------------------------------------------

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
