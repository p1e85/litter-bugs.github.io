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
    query, where, getCountFromServer, functions, httpsCallable
} from './firebase.js';
import { state } from './config.js';
import { renderReportsTab } from './reports.js';
import { getAdminChallenges, createNewChallenge, deleteChallenge } from './community.js';
import { calculateRouteDistance, convertRouteFromFirestore } from './utils.js';
import { toast } from './toast.js';
import { logAdminAction, fetchAuditLog, getActionLabel } from './audit.js';

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
            toast('Request not found (already processed?).', 'error');
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
        logAdminAction('approveEvent', {
            targetId: newDoc.id,
            targetType: 'meetup',
            summary: r.title || 'Untitled Event',
            requestId
        });
        return true;
    } catch (err) {
        console.error('approveEventRequest failed:', err);
        toast('Could not approve event: ' + err.message, 'error');
        return false;
    }
}

export async function rejectEventRequest(requestId, reason) {
    try {
        // Capture the title before update so the audit log can reference it
        const before = await getDoc(doc(db, 'eventRequests', requestId));
        const summary = before.exists() ? (before.data().title || 'Untitled') : 'Unknown';
        await updateDoc(doc(db, 'eventRequests', requestId), {
            status: 'rejected',
            rejectionReason: reason || '(no reason provided)',
            reviewedBy: state.currentUser ? state.currentUser.uid : null,
            reviewedAt: new Date()
        });
        logAdminAction('rejectEvent', {
            targetId: requestId,
            targetType: 'eventRequest',
            summary,
            reason: reason || null
        });
        return true;
    } catch (err) {
        console.error('rejectEventRequest failed:', err);
        toast('Could not reject event: ' + err.message, 'error');
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
            toast('Request not found (already processed?).', 'error');
            return false;
        }
        const r = reqSnap.data();

        // Field compatibility: new initializeSquad writes leaderId/leaderName
        // (matching Android). Older requests used creatorId/creatorName, and
        // some older Android docs might use requesterId. Accept all three.
        const ownerId = r.leaderId || r.creatorId || r.requesterId;
        const ownerName = r.leaderName || r.creatorName || r.requesterName;
        if (!ownerId) {
            toast('Request is missing the leader ID; cannot approve.', 'error');
            return false;
        }

        // If we don't have a name from the request (legacy data), fetch one.
        let leaderName = ownerName;
        if (!leaderName) {
            try {
                const profSnap = await getDoc(doc(db, 'publicProfiles', ownerId));
                leaderName = profSnap.exists() ? (profSnap.data().username || 'Unknown') : 'Unknown';
            } catch (_) {
                leaderName = 'Unknown';
            }
        }

        // Pull policy fields, defaulting per the Android spec.
        const isOpen = r.isOpen !== false; // default true unless explicitly false
        let maxMembers = parseInt(r.maxMembers, 10);
        if (!Number.isFinite(maxMembers) || maxMembers < 2) maxMembers = 20;
        if (maxMembers > 50) maxMembers = 50;

        // Android schema: members is a MAP<uid, SquadMember>.
        const leaderMember = {
            uid: ownerId,
            username: leaderName,
            role: 'leader',
            totalPins: 0,
            totalRoutes: 0,
            joinedAt: new Date()
        };

        const squad = {
            squadName: r.squadName,
            callsign: r.callsign,
            homeSector: r.homeSector || null,
            bio: r.bio || '',
            isOpen: isOpen,
            maxMembers: maxMembers,
            memberCount: 1,
            leaderId: ownerId,
            coLeaderIds: [],
            members: { [ownerId]: leaderMember },
            totalPins: 0,
            totalDistance: 0,
            totalRoutes: 0,
            createdAt: new Date(),
            // Audit metadata (not in Android spec but harmless to include)
            approvedBy: state.currentUser ? state.currentUser.uid : null,
            approvedAt: new Date(),
            fromRequestId: requestId
        };
        const newDoc = await addDoc(collection(db, 'squads'), squad);

        // Mark request as approved with a pointer to the live squad.
        await updateDoc(reqRef, {
            status: 'approved',
            squadId: newDoc.id,
            reviewedBy: state.currentUser ? state.currentUser.uid : null,
            reviewedAt: new Date()
        });

        // Denormalize squad affiliation onto the new leader's publicProfile.
        // This is what enforces one-squad-per-user across both apps.
        try {
            await updateDoc(doc(db, 'publicProfiles', ownerId), {
                squadId: newDoc.id,
                squadCallsign: r.callsign,
                squadRole: 'leader'
            });
        } catch (profErr) {
            // Best-effort: a stale profile shouldn't block the approval.
            // We log and let the admin know so they can manually fix if needed.
            console.warn('Could not update leader publicProfile:', profErr);
            toast('Squad approved, but failed to update leader profile. Leader may need to refresh.', 'warn');
        }

        logAdminAction('approveSquad', {
            targetId: newDoc.id,
            targetType: 'squad',
            summary: `[${r.callsign}] ${r.squadName}`,
            requestId
        });
        return true;
    } catch (err) {
        console.error('approveSquadRequest failed:', err);
        toast('Could not approve squad: ' + err.message, 'error');
        return false;
    }
}

export async function rejectSquadRequest(requestId, reason) {
    try {
        const before = await getDoc(doc(db, 'squadRequests', requestId));
        const summary = before.exists()
            ? `[${before.data().callsign || '???'}] ${before.data().squadName || ''}`
            : 'Unknown';
        await updateDoc(doc(db, 'squadRequests', requestId), {
            status: 'rejected',
            rejectionReason: reason || '(no reason provided)',
            reviewedBy: state.currentUser ? state.currentUser.uid : null,
            reviewedAt: new Date()
        });
        logAdminAction('rejectSquad', {
            targetId: requestId,
            targetType: 'squadRequest',
            summary,
            reason: reason || null
        });
        return true;
    } catch (err) {
        console.error('rejectSquadRequest failed:', err);
        toast('Could not reject squad: ' + err.message, 'error');
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
        case 'audit': await renderAuditLogTab(); break;
        case 'mail': await renderMailTab(); break;
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
        ${stats.errors.length ? `<p sty