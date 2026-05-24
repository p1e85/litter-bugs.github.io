// js/testmodules/admin.js
//
// Admin panel module.
// - Stats tab: live counts pulled from Firestore (getCountFromServer is cheap;
//   one read per collection regardless of size).
// - Pending Events: approves docs from `eventRequests` by creating in `meetups`
//   and marking the request approved. Rejection marks the request rejected.
// - Pending Squads: same flow for `squadRequests` -> `squads`.
//
// All writes here go through the user's auth. Security relies on the deployed
// Firestore rules — these client-side admin checks are UX only.

import {
    db, collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
    query, where, getCountFromServer
} from './firebase.js';
import { state } from './config.js';
import { renderReportsTab } from './reports.js';
import { getAdminChallenges, createNewChallenge, deleteChallenge } from './community.js';
import { calculateRouteDistance, convertRouteFromFirestore } from './utils.js';

// utils.calculateRouteDistance returns meters; we present miles.
const METERS_TO_MILES = 0.000621371;

// ---------------------------------------------------------------------------
// PERMISSION HELPERS
// ---------------------------------------------------------------------------

/**
 * Reads the currently signed-in user's publicProfile and returns role flags.
 */
export async function getCurrentUserPermissions() {
    if (!state.currentUser) {
        return { isAdmin: false, isApprovedEventOrganizer: false, signedIn: false };
    }
    try {
        const snap = await getDoc(doc(db, 'publicProfiles', state.currentUser.uid));
        if (!snap.exists()) {
            return { isAdmin: false, isApprovedEventOrganizer: false, signedIn: true };
        }
        const data = snap.data();
        return {
            isAdmin: data.role === 'admin',
            isApprovedEventOrganizer: data.isApprovedEventOrganizer === true,
            signedIn: true
        };
    } catch (err) {
        console.error('getCurrentUserPermissions failed:', err);
        return { isAdmin: false, isApprovedEventOrganizer: false, signedIn: true };
    }
}

export async function userIsAdmin() {
    const p = await getCurrentUserPermissions();
    return p.isAdmin;
}
export async function userCanCreateEventsDirectly() {
    const p = await getCurrentUserPermissions();
    return p.isAdmin || p.isApprovedEventOrganizer;
}

// ---------------------------------------------------------------------------
// STATS
// ---------------------------------------------------------------------------

/**
 * Returns a snapshot of live counts. Uses Firestore's count aggregator so we
 * pay 1 read per query regardless of collection size. Pin/mile aggregates
 * scan `publishedRoutes` docs - fine while small (<2000), should move to a
 * Cloud Function aggregate if the DB ever grows past that.
 */
export async function fetchAdminStats() {
    const stats = {
        users: 0, publishedRoutes: 0, meetups: 0, squads: 0, challenges: 0,
        pendingEvents: 0, pendingSquads: 0, openReports: 0,
        totalPins: 0, totalMiles: 0, recentRoutes7d: 0,
        errors: []
    };

    const safeCount = async (name, q) => {
        try {
            const snap = await getCountFromServer(q);
            return snap.data().count;
        } catch (err) {
            console.warn(`Count failed for ${name}:`, err);
            stats.errors.push(name);
            return 0;
        }
    };

    [
        stats.users, stats.publishedRoutes, stats.meetups, stats.squads,
        stats.challenges, stats.pendingEvents, stats.pendingSquads
    ] = await Promise.all([
        safeCount('publicProfiles', collection(db, 'publicProfiles')),
        safeCount('publishedRoutes', collection(db, 'publishedRoutes')),
        safeCount('meetups', collection(db, 'meetups')),
        safeCount('squads', collection(db, 'squads')),
        safeCount('challenges', collection(db, 'challenges')),
        safeCount('eventRequests', query(collection(db, 'eventRequests'), where('status', '==', 'pending'))),
        safeCount('squadRequests', query(collection(db, 'squadRequests'), where('status', '==', 'pending')))
    ]);

    stats.openReports = await safeCount(
        'reports-open',
        query(collection(db, 'reports'), where('status', '==', 'open'))
    );

    if (stats.publishedRoutes > 0 && stats.publishedRoutes <= 2000) {
        try {
            const routesSnap = await getDocs(collection(db, 'publishedRoutes'));
            const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
            let pins = 0, miles = 0, recent = 0;
            routesSnap.forEach(d => {
                const data = d.data();
                if (Array.isArray(data.pins)) pins += data.pins.length;

                // Always compute miles from the actual route coords. The stored
                // `distance` field is unreliable: it's missing on Android publishes
                // and on web routes published before the test version, and is
                // sometimes in different units. Going to the source coords is the
                // only consistent path.
                if (Array.isArray(data.route) && data.route.length > 1) {
                    const lngLatArr = convertRouteFromFirestore(data.route);
                    if (lngLatArr && lngLatArr.length > 1) {
                        const meters = calculateRouteDistance(lngLatArr);
                        if (Number.isFinite(meters)) {
                            miles += meters * METERS_TO_MILES;
                        }
                    }
                }

                const ts = data.timestamp;
                const tsMs = ts && typeof ts.toMillis === 'function'
                    ? ts.toMillis()
                    : (ts && ts.seconds ? ts.seconds * 1000 : null);
                if (tsMs && tsMs >= sevenDaysAgo) recent++;
            });
            stats.totalPins = pins;
            stats.totalMiles = miles;
            stats.recentRoutes7d = recent;
        } catch (err) {
            console.warn('Failed to aggregate route details:', err);
            stats.errors.push('route-aggregate');
        }
    } else if (stats.publishedRoutes > 2000) {
        stats.errors.push('routes-too-large-skipped');
    }

    return stats;
}

// ---------------------------------------------------------------------------
// PENDING EVENTS (eventRequests -> meetups)
// ---------------------------------------------------------------------------

export async function fetchPendingEvents() {
    try {
        // Pull all & filter client-side; volumes are tiny and avoids needing a
        // composite index for (status, createdAt).
        const snap = await getDocs(collection(db, 'eventRequests'));
        const rows = [];
        snap.forEach(d => {
            const data = d.data();
            if ((data.status || 'pending') === 'pending') {
                rows.push({ id: d.id, ...data });
            }
        });
        rows.sort((a, b) => {
            const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
            const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
            return tb - ta;
        });
        return rows;
    } catch (err) {
        console.error('fetchPendingEvents failed:', err);
        return [];
    }
}

/**
 * Approve a pending event: create the meetup, then mark the request approved.
 * We keep the request doc (not delete) so there's an audit trail.
 */
export async function approveEventRequest(requestId) {
    try {
        const reqRef = doc(db, 'eventRequests', requestId);
        const reqSnap = await getDoc(reqRef);
        if (!reqSnap.exists()) {
            alert('Request not found (already processed?).');
            return false;
        }
        const r = reqSnap.data();
        const meetup = {
            organizerId: r.organizerId,
            organizerName: r.organizerName || 'Anonymous',
            poiName: r.poiName || null,
            title: r.title || 'Untitled Event',
            description: r.description || '',
            eventDate: r.eventDate || null,
            createdAt: new Date(),
            coordinates: r.coordinates || null,
            approvedBy: state.currentUser ? state.currentUser.uid : null,
            approvedAt: new Date(),
            fromRequestId: requestId
        };
        const newDoc = await addDoc(collection(db, 'meetups'), meetup);
        await updateDoc(reqRef, {
            status: 'approved',
            meetupId: newDoc.id,
            reviewedBy: state.currentUser ? state.currentUser.uid : null,
            reviewedAt: new Date()
        });
        return true;
    } catch (err) {
        console.error('approveEventRequest failed:', err);
        alert('Could not approve event: ' + err.message);
        return false;
    }
}

export async function rejectEventRequest(requestId, reason) {
    try {
        await updateDoc(doc(db, 'eventRequests', requestId), {
            status: 'rejected',
            rejectionReason: reason || '(no reason provided)',
            reviewedBy: state.currentUser ? state.currentUser.uid : null,
            reviewedAt: new Date()
        });
        return true;
    } catch (err) {
        console.error('rejectEventRequest failed:', err);
        alert('Could not reject event: ' + err.message);
        return false;
    }
}

// ---------------------------------------------------------------------------
// PENDING SQUADS (squadRequests -> squads)
// ---------------------------------------------------------------------------

export async function fetchPendingSquads() {
    try {
        const snap = await getDocs(collection(db, 'squadRequests'));
        const rows = [];
        snap.forEach(d => {
            const data = d.data();
            if ((data.status || 'pending') === 'pending') {
                rows.push({ id: d.id, ...data });
            }
        });
        rows.sort((a, b) => {
            const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
            const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
            return tb - ta;
        });
        return rows;
    } catch (err) {
        console.error('fetchPendingSquads failed:', err);
        return [];
    }
}

/**
 * Approve a pending squad: create the squad with the requester as leader
 * and as the only member (fixing the bug where new squads had no leader).
 */
export async function approveSquadRequest(requestId) {
    try {
        const reqRef = doc(db, 'squadRequests', requestId);
        const reqSnap = await getDoc(reqRef);
        if (!reqSnap.exists()) {
            alert('Request not found (already processed?).');
            return false;
        }
        const r = reqSnap.data();
        // Field name compatibility: community.js initializeSquad writes
        // `creatorId`/`creatorName`; older docs/Android may use `requesterId`.
        const ownerId = r.creatorId || r.requesterId;
        if (!ownerId) {
            alert('Request is missing the creator/requester ID; cannot approve.');
            return false;
        }
        const squad = {
            squadName: r.squadName,
            callsign: r.callsign,
            homeSector: r.homeSector || null,
            bio: r.bio || '',
            createdAt: new Date(),
            leaderId: ownerId,
            coLeaderIds: [],
            members: [ownerId],
            memberCount: 1,
            totalPins: 0,
            status: 'active',
            approvedBy: state.currentUser ? state.currentUser.uid : null,
            approvedAt: new Date(),
            fromRequestId: requestId
        };
        const newDoc = await addDoc(collection(db, 'squads'), squad);
        await updateDoc(reqRef, {
            status: 'approved',
            squadId: newDoc.id,
            reviewedBy: state.currentUser ? state.currentUser.uid : null,
            reviewedAt: new Date()
        });
        return true;
    } catch (err) {
        console.error('approveSquadRequest failed:', err);
        alert('Could not approve squad: ' + err.message);
        return false;
    }
}

export async function rejectSquadRequest(requestId, reason) {
    try {
        await updateDoc(doc(db, 'squadRequests', requestId), {
            status: 'rejected',
            rejectionReason: reason || '(no reason provided)',
            reviewedBy: state.currentUser ? state.currentUser.uid : null,
            reviewedAt: new Date()
        });
        return true;
    } catch (err) {
        console.error('rejectSquadRequest failed:', err);
        alert('Could not reject squad: ' + err.message);
        return false;
    }
}

// ---------------------------------------------------------------------------
// PANEL ORCHESTRATION
// ---------------------------------------------------------------------------

export async function openAdminPanel() {
    const modal = document.getElementById('adminPanelModal');
    if (!modal) {
        console.error('Admin panel modal not found in DOM.');
        return;
    }
    const perms = await getCurrentUserPermissions();
    if (!perms.isAdmin) {
        alert('Admin access required.');
        return;
    }
    modal.style.display = 'flex';
    switchAdminTab('stats');
}

export async function switchAdminTab(tabName) {
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    // HTML uses .admin-tab-body (not .admin-tab-panel)
    document.querySelectorAll('.admin-tab-body').forEach(panel => {
        panel.style.display = panel.dataset.tab === tabName ? 'block' : 'none';
    });
    // HTML uses data-tab="pendingEvents" and "pendingSquads"
    switch (tabName) {
        case 'stats': await renderStatsTab(); break;
        case 'pendingEvents': await renderPendingEventsTab(); break;
        case 'pendingSquads': await renderPendingSquadsTab(); break;
        case 'activeEvents': await renderActiveEventsTab(); break;
        case 'activeSquads': await renderActiveSquadsTab(); break;
        case 'users': await renderUsersTab(); break;
        case 'reports': await renderReportsTab(); break;
        case 'challenges': await renderChallengesTab(); break;
        default: console.warn('Unknown admin tab:', tabName);
    }
}

export const showAdminTab = switchAdminTab;

// --- TAB RENDERERS ----------------------------------------------------------

async function renderStatsTab() {
    const container = document.getElementById('adminStatsContent');
    if (!container) return;
    container.innerHTML = '<p>Loading stats…</p>';
    const stats = await fetchAdminStats();

    // CSS class names match what's in maptest.html: admin-stats-grid (plural),
    // admin-stat-card, admin-stat-attention for warning cards.
    const card = (label, value, opts = {}) => {
        const cls = 'admin-stat-card' + (opts.attention ? ' admin-stat-attention' : '');
        return `
            <div class="${cls}">
                <div class="admin-stat-value">${value}</div>
                <div class="admin-stat-label">${label}</div>
                ${opts.extra ? `<div class="admin-stat-extra" style="font-size:0.75em;color:#666;margin-top:4px;">${opts.extra}</div>` : ''}
            </div>
        `;
    };

    container.innerHTML = `
        <div class="admin-stats-grid">
            ${card('Users', stats.users)}
            ${card('Published Routes', stats.publishedRoutes, { extra: `${stats.recentRoutes7d} this week` })}
            ${card('Pins Logged', stats.totalPins)}
            ${card('Miles Cleaned', stats.totalMiles.toFixed(1))}
            ${card('Meetups', stats.meetups)}
            ${card('Squads', stats.squads)}
            ${card('Challenges', stats.challenges)}
            ${card('Open Reports', stats.openReports, { attention: stats.openReports > 0 })}
            ${card('Pending Events', stats.pendingEvents, { attention: stats.pendingEvents > 0, extra: stats.pendingEvents > 0 ? '⚠️ Needs review' : '' })}
            ${card('Pending Squads', stats.pendingSquads, { attention: stats.pendingSquads > 0, extra: stats.pendingSquads > 0 ? '⚠️ Needs review' : '' })}
        </div>
        ${stats.errors.length ? `<p style="color:#b00; margin-top:10px;">Some counts failed: ${stats.errors.join(', ')}</p>` : ''}
        <p style="text-align:center; margin-top:14px;">
            <button id="adminStatsRefreshBtn" class="modal-button btn-secondary" style="width:auto; padding:6px 16px;">🔄 Refresh</button>
        </p>
    `;
    document.getElementById('adminStatsRefreshBtn')?.addEventListener('click', renderStatsTab);
}

async function renderPendingEventsTab() {
    const container = document.getElementById('adminPendingEventsContent');
    if (!container) return;
    container.innerHTML = '<p>Loading pending events…</p>';
    const rows = await fetchPendingEvents();
    if (rows.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px; color:#666;">No pending event requests. 🎉</p>';
        return;
    }
    container.innerHTML = rows.map(r => `
        <div class="admin-queue-card" data-id="${r.id}">
            <div>
                <h4>${escapeHtml(r.title || '(untitled)')}</h4>
                <p class="admin-queue-meta">
                    Organizer: <strong>${escapeHtml(r.organizerName || 'Unknown')}</strong>
                    ${r.poiName ? ` • Location: ${escapeHtml(r.poiName)}` : ''}
                    ${r.eventDate && r.eventDate.toDate ? ` • ${escapeHtml(r.eventDate.toDate().toLocaleString())}` : ''}
                </p>
                <p class="admin-queue-desc">${escapeHtml(r.description || '')}</p>
            </div>
            <div class="admin-queue-card-actions">
                <button class="modal-button btn-primary admin-approve-btn">Approve</button>
                <button class="modal-button btn-danger admin-reject-btn">Reject</button>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.admin-approve-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.closest('.admin-queue-card').dataset.id;
            btn.disabled = true; btn.textContent = 'Approving…';
            const ok = await approveEventRequest(id);
            if (ok) renderPendingEventsTab();
            else { btn.disabled = false; btn.textContent = 'Approve'; }
        });
    });
    container.querySelectorAll('.admin-reject-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.closest('.admin-queue-card').dataset.id;
            const reason = prompt('Reason for rejection (optional):', '');
            if (reason === null) return;
            btn.disabled = true; btn.textContent = 'Rejecting…';
            const ok = await rejectEventRequest(id, reason);
            if (ok) renderPendingEventsTab();
            else { btn.disabled = false; btn.textContent = 'Reject'; }
        });
    });
}

async function renderPendingSquadsTab() {
    const container = document.getElementById('adminPendingSquadsContent');
    if (!container) return;
    container.innerHTML = '<p>Loading pending squads…</p>';
    const rows = await fetchPendingSquads();
    if (rows.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px; color:#666;">No pending squad requests. 🎉</p>';
        return;
    }
    container.innerHTML = rows.map(r => `
        <div class="admin-queue-card" data-id="${r.id}">
            <div>
                <h4>[${escapeHtml(r.callsign || '???')}] ${escapeHtml(r.squadName || '(unnamed)')}</h4>
                <p class="admin-queue-meta">
                    Requester: <strong>${escapeHtml(r.creatorName || r.requesterName || 'Unknown')}</strong>
                    ${r.homeSector ? ` • Sector: ${escapeHtml(r.homeSector)}` : ''}
                </p>
                <p class="admin-queue-desc">${escapeHtml(r.bio || '')}</p>
            </div>
            <div class="admin-queue-card-actions">
                <button class="modal-button btn-primary admin-approve-btn">Approve</button>
                <button class="modal-button btn-danger admin-reject-btn">Reject</button>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.admin-approve-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.closest('.admin-queue-card').dataset.id;
            btn.disabled = true; btn.textContent = 'Approving…';
            const ok = await approveSquadRequest(id);
            if (ok) renderPendingSquadsTab();
            else { btn.disabled = false; btn.textContent = 'Approve'; }
        });
    });
    container.querySelectorAll('.admin-reject-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.closest('.admin-queue-card').dataset.id;
            const reason = prompt('Reason for rejection (optional):', '');
            if (reason === null) return;
            btn.disabled = true; btn.textContent = 'Rejecting…';
            const ok = await rejectSquadRequest(id, reason);
            if (ok) renderPendingSquadsTab();
            else { btn.disabled = false; btn.textContent = 'Reject'; }
        });
    });
}

// --- CHALLENGES TAB ---------------------------------------------------------

/**
 * Renders the Challenges tab: creation form on top, active challenges list
 * below. Replaces the old adminChallengeModal that used to be its own modal
 * opened from Challenge Central.
 */
async function renderChallengesTab() {
    const container = document.getElementById('adminChallengesContent');
    if (!container) return;

    // Today's date as the min for the expiry input
    const today = new Date().toISOString().split('T')[0];

    container.innerHTML = `
        <div class="admin-form-container" style="text-align:left;">
            <div class="form-group">
                <label>Quest Title</label>
                <input type="text" id="newChalTitle" placeholder="e.g. The Weekend Warrior" style="width:100%; padding:8px;">
            </div>
            <div class="form-group">
                <label>Brief Briefing</label>
                <textarea id="newChalDesc" rows="3" placeholder="Explain the mission objectives..." style="width:100%; padding:8px;"></textarea>
            </div>
            <div class="form-row" style="display:flex; gap:10px;">
                <div class="form-group" style="flex:1;">
                    <label>Type</label>
                    <select id="newChalType" style="width:100%; padding:8px;">
                        <option value="distance">📏 Distance (Miles)</option>
                        <option value="count">🗑 Item Count</option>
                    </select>
                </div>
                <div class="form-group" style="flex:1;">
                    <label>Target Goal</label>
                    <input type="number" id="newChalGoal" placeholder="e.g. 50" style="width:100%; padding:8px;">
                </div>
            </div>
            <div class="form-row" style="display:flex; gap:10px;">
                <div class="form-group" style="flex:1;">
                    <label>Time Limit (Mins, optional)</label>
                    <input type="number" id="newChalTime" placeholder="Optional" style="width:100%; padding:8px;">
                </div>
                <div class="form-group" style="flex:1;">
                    <label>Badge Icon</label>
                    <input type="text" id="newChalBadge" value="🏅" style="width:100%; padding:8px; text-align:center; font-size:1.2em;">
                </div>
            </div>
            <div class="form-group">
                <label>Quest Expires On</label>
                <input type="date" id="newChalExpire" min="${today}" style="width:100%; padding:8px;">
            </div>
            <button id="newChalSubmitBtn" class="modal-button btn-primary" style="width:100%; margin-top:8px;">
                🚀 LAUNCH CHALLENGE
            </button>
        </div>

        <hr style="margin:20px 0;">

        <h4 style="margin-bottom:8px;">Manage Active Challenges</h4>
        <div id="adminChallengeListInPanel" style="max-height:300px; overflow-y:auto;">
            <p>Loading…</p>
        </div>
    `;

    // Wire create button
    document.getElementById('newChalSubmitBtn').addEventListener('click', async () => {
        const title = document.getElementById('newChalTitle').value.trim();
        const desc = document.getElementById('newChalDesc').value.trim();
        const type = document.getElementById('newChalType').value;
        const goal = document.getElementById('newChalGoal').value;
        const timeLimit = document.getElementById('newChalTime').value;
        const badge = document.getElementById('newChalBadge').value || '🏅';
        const expire = document.getElementById('newChalExpire').value;

        if (!title || !goal || !expire) {
            alert('Please fill in Title, Goal, and Expiration Date.');
            return;
        }
        const submitBtn = document.getElementById('newChalSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Launching…';
        try {
            await createNewChallenge(title, desc, type, goal, timeLimit, badge, expire);
            alert('Challenge created!');
            // Refresh list and clear inputs
            await renderChallengesTab();
        } catch (err) {
            console.error('Failed to create challenge:', err);
            alert('Could not create challenge: ' + err.message);
            submitBtn.disabled = false;
            submitBtn.textContent = '🚀 LAUNCH CHALLENGE';
        }
    });

    // Load the active challenges list
    await loadChallengeListInPanel();
}

async function loadChallengeListInPanel() {
    const listEl = document.getElementById('adminChallengeListInPanel');
    if (!listEl) return;
    listEl.innerHTML = '<p>Loading…</p>';

    let challenges;
    try {
        challenges = await getAdminChallenges();
    } catch (err) {
        console.error('Failed to load challenges:', err);
        listEl.innerHTML = '<p style="color:#b00;">Failed to load challenges.</p>';
        return;
    }

    if (!challenges || challenges.length === 0) {
        listEl.innerHTML = '<p style="color:#666;">No active challenges.</p>';
        return;
    }

    listEl.innerHTML = '';
    challenges.forEach(chal => {
        const item = document.createElement('div');
        item.style.cssText = 'border-bottom:1px solid #eee; padding:10px; display:flex; justify-content:space-between; align-items:center; gap:10px;';
        const expiresDisplay = chal.expires_at && chal.expires_at.seconds
            ? new Date(chal.expires_at.seconds * 1000).toLocaleDateString()
            : 'N/A';
        // Goal field name varies by older docs - try a couple
        const goalDisplay = chal.goal_miles || chal.goal_count || chal.goal || '—';
        item.innerHTML = `
            <div style="flex:1; min-width:0;">
                <strong>${escapeHtml(chal.title || '(no title)')}</strong><br>
                <small style="color:#666;">Goal: ${escapeHtml(String(goalDisplay))} • Exp: ${expiresDisplay}</small>
            </div>
            <button class="admin-chal-delete-btn" style="background:#dc3545; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">🗑️</button>
        `;
        item.querySelector('.admin-chal-delete-btn').addEventListener('click', async () => {
            if (!confirm(`Delete the challenge "${chal.title}"? This can't be undone.`)) return;
            try {
                await deleteChallenge(chal.id);
                await loadChallengeListInPanel();
            } catch (err) {
                console.error('Failed to delete challenge:', err);
                alert('Could not delete challenge: ' + err.message);
            }
        });
        listEl.appendChild(item);
    });
}

// --- USERS TAB --------------------------------------------------------------

/**
 * Lists all publicProfiles with key info (username, role flags, badge count).
 * Read-only for now; role-management buttons come in Phase 3.
 */
async function renderUsersTab() {
async function renderUsersTab() {
    const container = document.getElementById('adminUsersContent');
    if (!container) return;
    container.innerHTML = '<p>Loading users…</p>';

    let users = [];
    try {
        const snap = await getDocs(collection(db, 'publicProfiles'));
        snap.forEach(d => users.push({ id: d.id, ...d.data() }));
    } catch (err) {
        console.error('Failed to load users:', err);
        container.innerHTML = '<p style="color:#b00;">Failed to load users.</p>';
        return;
    }

    if (users.length === 0) {
        container.innerHTML = '<p style="color:#666;">No users yet.</p>';
        return;
    }

    // Sort alphabetically by username
    users.sort((a, b) => {
        const ua = (a.username || '').toLowerCase();
        const ub = (b.username || '').toLowerCase();
        return ua.localeCompare(ub);
    });

    const currentUid = state.currentUser ? state.currentUser.uid : null;

    container.innerHTML = `
        <input type="text" id="adminUserSearch" placeholder="🔍 Search by username..."
            style="width:100%; padding:8px; margin-bottom:10px; box-sizing:border-box;">
        <p style="color:#666; font-size:0.85em; margin:4px 0;">${users.length} user${users.length === 1 ? '' : 's'} total</p>
        <div id="adminUserList"></div>
    `;

    const renderList = (filter = '') => {
        const list = document.getElementById('adminUserList');
        const f = filter.toLowerCase().trim();
        const filtered = f
            ? users.filter(u => (u.username || '').toLowerCase().includes(f))
            : users;

        if (filtered.length === 0) {
            list.innerHTML = '<p style="color:#666;">No matches.</p>';
            return;
        }

        list.innerHTML = filtered.map(u => {
            const badgeCount = u.badges ? Object.keys(u.badges).length : 0;
            const isAdminUser = u.role === 'admin';
            const isOrganizer = u.isApprovedEventOrganizer === true;
            const isSelf = u.id === currentUid;

            // Self-row note: admin can't modify their own role from this UI
            // to prevent lockouts (you could demote yourself and lose access).
            // Event-organizer toggling on self is allowed (low-risk; reversible
            // from any other admin or the user themselves doesn't matter — only
            // admins can set this anyway).
            return `
                <div class="admin-user-row" data-uid="${escapeHtml(u.id)}" style="flex-direction:column; align-items:stretch;">
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <div>
                            <strong>${escapeHtml(u.username || '(no username)')}</strong>
                            ${isAdminUser ? '<span class="admin-badge admin-badge-admin">ADMIN</span>' : ''}
                            ${isOrganizer ? '<span class="admin-badge admin-badge-organizer">EVENT ORG</span>' : ''}
                            ${isSelf ? '<span class="admin-badge" style="background:#666; color:white;">YOU</span>' : ''}
                        </div>
                        <div style="font-size:0.8em; color:#666;">
                            ${badgeCount} badge${badgeCount === 1 ? '' : 's'}
                            ${u.totalDistance ? ` • ${(u.totalDistance * METERS_TO_MILES).toFixed(1)}mi` : ''}
                            ${u.totalPins ? ` • ${u.totalPins} pins` : ''}
                        </div>
                        <div style="font-size:0.7em; color:#999; font-family:monospace; word-break:break-all;">
                            uid: ${escapeHtml(u.id)}
                        </div>
                    </div>
                    <div class="admin-user-actions" style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">
                        <button class="admin-user-action-btn" data-action="toggleOrganizer"
                            style="font-size:0.8em; padding:5px 10px; cursor:pointer; border:1px solid #4A7C59; background:${isOrganizer ? '#4A7C59' : 'white'}; color:${isOrganizer ? 'white' : '#4A7C59'}; border-radius:4px;">
                            ${isOrganizer ? '✓ Event Organizer' : 'Make Event Organizer'}
                        </button>
                        ${isAdminUser
                            ? `<button class="admin-user-action-btn" data-action="demoteAdmin" ${isSelf ? 'disabled title="Cannot demote yourself"' : ''}
                                  style="font-size:0.8em; padding:5px 10px; cursor:${isSelf ? 'not-allowed' : 'pointer'}; border:1px solid #dc3545; background:#dc3545; color:white; border-radius:4px; opacity:${isSelf ? '0.5' : '1'};">
                                  Remove Admin
                                </button>`
                            : `<button class="admin-user-action-btn" data-action="promoteAdmin" ${isSelf ? 'disabled title="Cannot modify your own role"' : ''}
                                  style="font-size:0.8em; padding:5px 10px; cursor:${isSelf ? 'not-allowed' : 'pointer'}; border:1px solid #dc3545; background:white; color:#dc3545; border-radius:4px; opacity:${isSelf ? '0.5' : '1'};">
                                  ⚠️ Make Admin
                                </button>`}
                    </div>
                </div>
            `;
        }).join('');

        // Wire actions
        list.querySelectorAll('.admin-user-action-btn').forEach(btn => {
            if (btn.disabled) return;
            btn.addEventListener('click', async (e) => {
                const row = e.target.closest('.admin-user-row');
                const uid = row.dataset.uid;
                const action = btn.dataset.action;
                const u = users.find(x => x.id === uid);
                if (!u) return;
                await handleUserAction(action, u, btn);
            });
        });
    };

    renderList();
    document.getElementById('adminUserSearch').addEventListener('input', (e) => {
        renderList(e.target.value);
    });
}

/**
 * Handles one of the per-user action buttons in the Users tab.
 * Each action confirms appropriately and updates the publicProfile.
 */
async function handleUserAction(action, user, btn) {
    const username = user.username || '(no username)';
    const profileRef = doc(db, 'publicProfiles', user.id);
    let updatePayload = null;
    let successMessage = '';

    if (action === 'toggleOrganizer') {
        const newVal = !(user.isApprovedEventOrganizer === true);
        const verb = newVal ? 'GRANT' : 'REVOKE';
        if (!confirm(`${verb} event-organizer status for "${username}"?\n\nThis lets them create events directly without admin approval.`)) {
            return;
        }
        updatePayload = { isApprovedEventOrganizer: newVal };
        successMessage = newVal
            ? `${username} can now create events without approval.`
            : `Event-organizer status removed from ${username}.`;
    } else if (action === 'promoteAdmin') {
        // Two-step confirm because admin powers are unrestricted.
        if (!confirm(`⚠️ MAKE "${username}" AN ADMIN?\n\nAdmins can approve/reject events and squads, delete any content, manage users, create challenges, and resolve reports. This is a powerful role.\n\nClick OK to continue to confirmation.`)) {
            return;
        }
        const typed = prompt(`To confirm, type the word PROMOTE (all caps) and press OK:`);
        if (typed !== 'PROMOTE') {
            alert('Promotion cancelled.');
            return;
        }
        updatePayload = { role: 'admin' };
        successMessage = `${username} is now an admin.`;
    } else if (action === 'demoteAdmin') {
        if (!confirm(`Remove admin status from "${username}"?\n\nThey will lose all admin powers immediately.`)) {
            return;
        }
        const typed = prompt(`To confirm, type the word DEMOTE (all caps) and press OK:`);
        if (typed !== 'DEMOTE') {
            alert('Demotion cancelled.');
            return;
        }
        // We can't store `role: null` and rely on the rule. The rule checks
        // `role == 'admin'`, so anything other than "admin" effectively demotes.
        // Setting to "user" makes the data clean and grep-able.
        updatePayload = { role: 'user' };
        successMessage = `${username} is no longer an admin.`;
    } else {
        console.warn('Unknown user action:', action);
        return;
    }

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Saving…';
    try {
        await updateDoc(profileRef, updatePayload);
        alert(successMessage);
        await renderUsersTab();
    } catch (err) {
        console.error('User action failed:', err);
        // Most common failure: Firestore rule rejected the update because the
        // current user isn't admin. Surface that clearly.
        const msg = err.code === 'permission-denied'
            ? 'Permission denied. Check that your account has role=admin in publicProfiles.'
            : err.message;
        alert(`Action failed: ${msg}`);
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// --- ACTIVE EVENTS TAB ------------------------------------------------------

/**
 * Lists currently scheduled meetups (approved events). Admin can delete any.
 */
async function renderActiveEventsTab() {
    const container = document.getElementById('adminActiveEventsContent');
    if (!container) return;
    container.innerHTML = '<p>Loading events…</p>';

    let events = [];
    try {
        const snap = await getDocs(collection(db, 'meetups'));
        snap.forEach(d => events.push({ id: d.id, ...d.data() }));
    } catch (err) {
        console.error('Failed to load events:', err);
        container.innerHTML = '<p style="color:#b00;">Failed to load events.</p>';
        return;
    }

    if (events.length === 0) {
        container.innerHTML = '<p style="color:#666;">No active events.</p>';
        return;
    }

    // Sort by event date asc (upcoming first); past events at the bottom
    const now = Date.now();
    events.sort((a, b) => {
        const ta = (a.eventDate && a.eventDate.toMillis) ? a.eventDate.toMillis() : 0;
        const tb = (b.eventDate && b.eventDate.toMillis) ? b.eventDate.toMillis() : 0;
        const aPast = ta > 0 && ta < now;
        const bPast = tb > 0 && tb < now;
        if (aPast !== bPast) return aPast ? 1 : -1;
        return ta - tb;
    });

    container.innerHTML = `<p style="color:#666; font-size:0.85em; margin:4px 0;">${events.length} event${events.length === 1 ? '' : 's'} total</p>` + events.map(ev => {
        const date = ev.eventDate && ev.eventDate.toDate ? ev.eventDate.toDate() : null;
        const dateStr = date ? date.toLocaleString() : 'no date';
        const isPast = date && date.getTime() < now;
        return `
            <div class="admin-queue-card" data-id="${ev.id}">
                <div style="flex:1; min-width:0;">
                    <h4>
                        ${escapeHtml(ev.title || '(untitled)')}
                        ${isPast ? '<span class="admin-badge admin-badge-past">PAST</span>' : ''}
                    </h4>
                    <p class="admin-queue-meta">
                        Organizer: <strong>${escapeHtml(ev.organizerName || 'Unknown')}</strong>
                        ${ev.poiName ? ` • ${escapeHtml(ev.poiName)}` : ''}
                    </p>
                    <p class="admin-queue-meta">📅 ${escapeHtml(dateStr)}</p>
                    ${ev.description ? `<p class="admin-queue-desc">${escapeHtml(ev.description)}</p>` : ''}
                </div>
                <div class="admin-queue-card-actions">
                    <button class="modal-button btn-danger admin-event-delete-btn">Delete</button>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.admin-event-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const card = e.target.closest('.admin-queue-card');
            const id = card.dataset.id;
            if (!confirm('Delete this event? This cannot be undone.')) return;
            btn.disabled = true;
            btn.textContent = 'Deleting…';
            try {
                await deleteDoc(doc(db, 'meetups', id));
                renderActiveEventsTab();
            } catch (err) {
                console.error('Failed to delete event:', err);
                alert('Could not delete event: ' + err.message);
                btn.disabled = false;
                btn.textContent = 'Delete';
            }
        });
    });
}

// --- ACTIVE SQUADS TAB ------------------------------------------------------

async function renderActiveSquadsTab() {
    const container = document.getElementById('adminActiveSquadsContent');
    if (!container) return;
    container.innerHTML = '<p>Loading squads…</p>';

    let squads = [];
    try {
        const snap = await getDocs(collection(db, 'squads'));
        snap.forEach(d => squads.push({ id: d.id, ...d.data() }));
    } catch (err) {
        console.error('Failed to load squads:', err);
        container.innerHTML = '<p style="color:#b00;">Failed to load squads.</p>';
        return;
    }

    if (squads.length === 0) {
        container.innerHTML = '<p style="color:#666;">No active squads.</p>';
        return;
    }

    squads.sort((a, b) => (a.squadName || '').localeCompare(b.squadName || ''));

    container.innerHTML = `<p style="color:#666; font-size:0.85em; margin:4px 0;">${squads.length} squad${squads.length === 1 ? '' : 's'} total</p>` + squads.map(sq => {
        const memberCount = sq.memberCount || (Array.isArray(sq.members) ? sq.members.length : 0);
        return `
            <div class="admin-queue-card" data-id="${sq.id}">
                <div style="flex:1; min-width:0;">
                    <h4>[${escapeHtml(sq.callsign || '???')}] ${escapeHtml(sq.squadName || '(unnamed)')}</h4>
                    <p class="admin-queue-meta">
                        ${memberCount} member${memberCount === 1 ? '' : 's'}
                        ${sq.homeSector ? ` • ${escapeHtml(sq.homeSector)}` : ''}
                        ${sq.totalPins ? ` • ${sq.totalPins} pins` : ''}
                    </p>
                    ${sq.bio ? `<p class="admin-queue-desc">${escapeHtml(sq.bio)}</p>` : ''}
                    <p class="admin-queue-meta" style="font-size:0.75em; color:#999; font-family:monospace;">
                        leader: ${escapeHtml(sq.leaderId || '(none)')}
                    </p>
                </div>
                <div class="admin-queue-card-actions">
                    <button class="modal-button btn-danger admin-squad-delete-btn">Delete</button>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.admin-squad-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const card = e.target.closest('.admin-queue-card');
            const id = card.dataset.id;
            const sq = squads.find(s => s.id === id);
            const label = sq ? `[${sq.callsign}] ${sq.squadName}` : 'this squad';
            if (!confirm(`Delete ${label}? Members will be removed. This cannot be undone.`)) return;
            btn.disabled = true;
            btn.textContent = 'Deleting…';
            try {
                await deleteDoc(doc(db, 'squads', id));
                renderActiveSquadsTab();
            } catch (err) {
                console.error('Failed to delete squad:', err);
                alert('Could not delete squad: ' + err.message);
                btn.disabled = false;
                btn.textContent = 'Delete';
            }
        });
    });
}

// --- HELPER -----------------------------------------------------------------

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
