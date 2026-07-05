// js/testmodules/profile.js
//
// "My Profile" screen for the logged-in user.
// Spec: display-only with exactly two write actions: selectedTitle and showLevel.
// XP/level/stats/badges are all read-only (server-owned).
//
// Opens from "👤 My Profile" in the main menu.
// Contains an "✏️ Edit Profile" button that opens the existing profileModal
// (bio, location, coffee link) — web app's addition to the Android spec.

import { db, doc, getDoc, updateDoc } from './firebase.js';
import { state, allBadges, allTitles } from './config.js';
import { toast } from './toast.js';
import { xpForLevel, xpForNextLevel, xpProgressInLevel } from './xp.js';

// ---------------------------------------------------------------------------
// CSS (injected once)
// ---------------------------------------------------------------------------

function ensureStyles() {
    if (document.getElementById('lt-mpp-styles')) return;
    const s = document.createElement('style');
    s.id = 'lt-mpp-styles';
    s.textContent = `
    /* ---- Modal shell ---- */
    #myProfileModal .modal-content {
        max-width: 500px;
        padding: 0;
        border-radius: 12px;
        overflow: hidden;
        max-height: 92vh;
        overflow-y: auto;
        position: relative;
    }
    @media (max-width: 600px) {
        #myProfileModal .modal-content {
            max-width: 100%;
            width: 100%;
            border-radius: 0;
            max-height: 100vh;
        }
    }

    /* ---- Header (dark gradient banner) ---- */
    .mpp-header {
        background: linear-gradient(180deg, #1A1A2E 0%, #2A2A4E 100%);
        padding: 32px 20px 24px;
        text-align: center;
        position: relative;
    }
    .mpp-close {
        position: absolute; top: 12px; right: 14px;
        background: rgba(255,255,255,0.15); border: none;
        border-radius: 50%; width: 30px; height: 30px;
        color: white; font-size: 1.1em; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        line-height: 1;
    }
    .mpp-avatar {
        width: 72px; height: 72px; border-radius: 50%;
        background: #4A7C59; margin: 0 auto 12px;
        display: flex; align-items: center; justify-content: center;
        font-size: 2em; font-weight: 700; color: white;
        border: 3px solid rgba(255,255,255,0.2);
    }
    .mpp-username {
        font-size: 1.35em; font-weight: 700; color: white; margin-bottom: 6px;
    }
    .mpp-title-pill {
        display: inline-block; background: #4A7C59;
        color: white; font-size: 0.82em; font-weight: 600;
        padding: 3px 12px; border-radius: 999px; margin-bottom: 6px;
    }
    .mpp-location {
        font-size: 0.85em; color: rgba(255,255,255,0.7); margin-bottom: 5px;
    }
    .mpp-squad-chip {
        display: inline-block; background: rgba(255,255,255,0.15);
        color: white; font-size: 0.82em; font-weight: 500;
        padding: 3px 12px; border-radius: 999px;
    }

    /* ---- Body ---- */
    .mpp-body {
        background: white;
        padding: 20px 20px 32px;
    }

    /* ---- Level / XP block ---- */
    .mpp-xp-block {
        background: #F7F9F7;
        border: 1px solid #E0EDE5;
        border-radius: 10px;
        padding: 14px 16px;
        margin-bottom: 14px;
    }
    .mpp-level-row {
        display: flex; align-items: center; gap: 12px; margin-bottom: 12px;
    }
    .mpp-level-badge {
        width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
        background: radial-gradient(circle at 40% 35%, #FFD700, #FF8C00);
        display: flex; align-items: center; justify-content: center;
        font-size: 1.3em; font-weight: 900; color: white;
        box-shadow: 0 2px 8px rgba(255,200,0,0.35);
    }
    .mpp-level-info { flex: 1; }
    .mpp-level-info strong { font-size: 1.05em; color: #333; display: block; }
    .mpp-level-info span  { font-size: 0.82em; color: #888; }
    .mpp-today-chip {
        background: #E8F5E9; color: #4A7C59;
        font-size: 0.8em; font-weight: 600;
        padding: 3px 10px; border-radius: 999px; white-space: nowrap;
    }
    .mpp-bar-wrap {
        height: 10px; background: #E0E0E0;
        border-radius: 999px; overflow: hidden; margin-bottom: 6px;
    }
    .mpp-bar-fill {
        height: 100%; border-radius: 999px;
        background: linear-gradient(90deg, #4A7C59, #66BB6A);
        transition: width 0.5s ease;
    }
    .mpp-bar-txt { font-size: 0.78em; color: #888; }
    .mpp-bar-txt.mpp-maxlevel { color: #4A7C59; font-weight: 600; }

    /* ---- Show-level toggle ---- */
    .mpp-toggle-row {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; padding: 14px 0;
        border-top: 1px solid #F0F0F0;
        border-bottom: 1px solid #F0F0F0;
        margin-bottom: 14px;
    }
    .mpp-toggle-label strong { font-size: 0.95em; color: #333; display: block; }
    .mpp-toggle-label small  { font-size: 0.78em; color: #888; }
    .mpp-toggle-switch {
        position: relative; width: 44px; height: 26px; flex-shrink: 0;
    }
    .mpp-toggle-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
    .mpp-toggle-track {
        position: absolute; inset: 0; border-radius: 26px;
        cursor: pointer; transition: background 0.2s;
    }
    .mpp-toggle-thumb {
        position: absolute; top: 3px; width: 20px; height: 20px;
        background: white; border-radius: 50%;
        box-shadow: 0 1px 3px rgba(0,0,0,0.25);
        transition: left 0.2s; pointer-events: none;
    }

    /* ---- Stats ---- */
    .mpp-stats {
        display: flex; gap: 0;
        background: #F7F9F7; border: 1px solid #E0EDE5;
        border-radius: 10px; overflow: hidden;
        margin-bottom: 16px;
    }
    .mpp-stat {
        flex: 1; text-align: center; padding: 14px 8px;
        border-right: 1px solid #E0EDE5;
    }
    .mpp-stat:last-child { border-right: none; }
    .mpp-stat-emoji { font-size: 1.3em; margin-bottom: 4px; }
    .mpp-stat-val { font-size: 1.2em; font-weight: 700; color: #4A7C59; }
    .mpp-stat-lbl { font-size: 0.72em; color: #888; margin-top: 2px; }

    /* ---- Section labels ---- */
    .mpp-section-label {
        font-size: 0.8em; font-weight: 600; color: #888;
        text-transform: uppercase; letter-spacing: 0.05em;
        margin-bottom: 8px; margin-top: 16px;
    }

    /* ---- Bio ---- */
    .mpp-bio-text { font-size: 0.95em; color: #333; line-height: 1.5; }

    /* ---- Badges ---- */
    .mpp-badge-grid {
        display: grid; grid-template-columns: repeat(4, 1fr);
        gap: 8px;
    }
    @media (max-width: 400px) {
        .mpp-badge-grid { grid-template-columns: repeat(3, 1fr); }
    }
    .mpp-badge-item {
        background: #F5F5F5; border-radius: 8px;
        padding: 10px 4px 6px;
        text-align: center;
    }
    .mpp-badge-emoji { font-size: 1.6em; display: block; margin-bottom: 4px; }
    .mpp-badge-name  {
        font-size: 0.65em; color: #666; line-height: 1.25;
        overflow: hidden; display: -webkit-box;
        -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    }

    /* ---- Title selector ---- */
    .mpp-title-option {
        padding: 12px 14px; border-radius: 8px; margin-bottom: 6px;
        cursor: pointer; display: flex; align-items: center;
        justify-content: space-between; font-size: 0.95em;
        transition: opacity 0.15s;
        border: none; width: 100%; text-align: left;
    }
    .mpp-title-option:active { opacity: 0.75; }
    .mpp-title-selected { background: #4A7C59; color: white; font-weight: 700; }
    .mpp-title-unselected { background: #F0F0F0; color: #333; }
    .mpp-title-none-selected { background: #1A1A2E; color: white; font-weight: 700; }
    .mpp-title-none-unselected { background: #F0F0F0; color: #888; }

    /* ---- Edit Profile button ---- */
    .mpp-edit-btn {
        margin-top: 20px; width: 100%;
        padding: 12px;
        background: white; color: #4A7C59;
        border: 2px solid #4A7C59;
        border-radius: 8px; font-size: 0.95em;
        font-weight: 600; cursor: pointer;
        transition: background 0.15s, color 0.15s;
    }
    .mpp-edit-btn:hover { background: #4A7C59; color: white; }
    `;
    document.head.appendChild(s);
}

// ---------------------------------------------------------------------------
// MAIN ENTRY POINT
// ---------------------------------------------------------------------------

export async function openMyProfileModal() {
    ensureStyles();
    if (!state.currentUser) {
        toast('Please log in to view your profile.', 'error');
        return;
    }

    const modal = document.getElementById('myProfileModal');
    const content = document.getElementById('myProfileContent');
    if (!modal || !content) {
        console.error('myProfileModal not found in DOM');
        return;
    }

    // Close menu first
    document.getElementById('menuModal').style.display = 'none';
    modal.style.display = 'flex';
    content.innerHTML = '<div style="padding:60px 20px; text-align:center; color:#888;">Loading…</div>';

    try {
        const snap = await getDoc(doc(db, 'publicProfiles', state.currentUser.uid));
        if (!snap.exists()) {
            content.innerHTML = '<div style="padding:40px; text-align:center; color:#888;">Profile not found.</div>';
            return;
        }
        renderMyProfile(content, snap.data(), state.currentUser.uid);
    } catch (err) {
        console.error('openMyProfileModal failed:', err);
        content.innerHTML = `<div style="padding:40px; text-align:center; color:#888;">Could not load profile.<br><small>${err.message || ''}</small></div>`;
    }
}

// ---------------------------------------------------------------------------
// RENDERER
// ---------------------------------------------------------------------------

function renderMyProfile(container, profile, uid) {
    // ---- Defensive defaults for missing fields (spec requirement) ----
    const username    = profile.username    || 'Trooper';
    const bio         = profile.bio         || '';
    const location    = profile.location    || '';
    const squadId     = profile.squadId     || '';
    const squadCS     = profile.squadCallsign || '';
    const squadRole   = profile.squadRole   || '';
    const totalPins   = profile.totalPins   || 0;
    const totalRoutes = profile.totalRoutes || 0;
    const totalDist   = profile.totalDistance || 0;
    const xp          = profile.xp          ?? 0;
    const level       = profile.level        ?? 1;
    const xpToday     = profile.xpToday      ?? 0;
    const showLevel   = profile.showLevel !== false;
    const badges      = profile.badges       || {};
    const unlockedTitles = Array.isArray(profile.unlockedTitles)
        ? profile.unlockedTitles
        : [];
    let selectedTitle  = profile.selectedTitle || '';

    const miles  = (totalDist * 0.000621371).toFixed(1);
    const initial = (username[0] || '?').toUpperCase();

    // ---- XP math ----
    const isMax    = level >= 10;
    const pct      = Math.round(xpProgressInLevel(xp, level) * 100);
    const xpInLvl  = xp - xpForLevel(level);
    const xpNeeded = isMax ? 0 : xpForNextLevel(level) - xpForLevel(level);
    const progressTxt = isMax
        ? 'Max level reached — Planet Guardian 🌍'
        : `${xpInLvl.toLocaleString()} / ${xpNeeded.toLocaleString()} XP to Level ${level + 1}`;

    // ---- Role display (capitalize) ----
    const roleDisplay = squadRole
        ? squadRole.charAt(0).toUpperCase() + squadRole.slice(1)
        : '';

    // ---- Earned badges ----
    const earnedBadges = Object.keys(allBadges).filter(k => badges[k] === true);

    // ---- Toggle track/thumb style helper ----
    const trackStyle  = (on) => `background:${on ? '#4A7C59' : '#CCC'};`;
    const thumbStyle  = (on) => `left:${on ? '21px' : '3px'};`;

    // ---- Build HTML ----
    container.innerHTML = `
        <!-- HEADER -->
        <div class="mpp-header">
            <button class="mpp-close" id="mppClose">&times;</button>
            <div class="mpp-avatar">${esc(initial)}</div>
            <div class="mpp-username">${esc(username)}</div>
            ${selectedTitle && allTitles[selectedTitle]
                ? `<div class="mpp-title-pill" id="mppTitlePill">${esc(allTitles[selectedTitle].name)}</div>`
                : `<div id="mppTitlePill" style="display:none;"></div>`}
            ${location ? `<div class="mpp-location">📍 ${esc(location)}</div>` : ''}
            ${squadId   ? `<div class="mpp-squad-chip">🛡️ ${esc(squadCS)} · ${esc(roleDisplay)}</div>` : ''}
        </div>

        <!-- BODY -->
        <div class="mpp-body">

            <!-- XP / Level block -->
            <div class="mpp-xp-block">
                <div class="mpp-level-row">
                    <div class="mpp-level-badge">${level}</div>
                    <div class="mpp-level-info">
                        <strong>Level ${level}</strong>
                        <span>${xp.toLocaleString()} XP total</span>
                    </div>
                    ${xpToday > 0
                        ? `<div class="mpp-today-chip">⚡ +${xpToday.toLocaleString()} today</div>`
                        : ''}
                </div>
                ${!isMax ? `
                    <div class="mpp-bar-wrap">
                        <div class="mpp-bar-fill" style="width:${pct}%;"></div>
                    </div>
                ` : ''}
                <div class="mpp-bar-txt${isMax ? ' mpp-maxlevel' : ''}">${progressTxt}</div>
            </div>

            <!-- Show-level toggle -->
            <div class="mpp-toggle-row">
                <div class="mpp-toggle-label">
                    <strong>Show level on community pins</strong>
                    <small>Others can see your level when viewing your pins</small>
                </div>
                <label class="mpp-toggle-switch">
                    <input type="checkbox" id="mppShowLevelCb" ${showLevel ? 'checked' : ''}>
                    <div class="mpp-toggle-track" id="mppToggleTrack" style="${trackStyle(showLevel)}">
                        <div class="mpp-toggle-thumb" id="mppToggleThumb" style="${thumbStyle(showLevel)}"></div>
                    </div>
                </label>
            </div>

            <!-- Stats row -->
            <div class="mpp-stats">
                <div class="mpp-stat">
                    <div class="mpp-stat-emoji">📍</div>
                    <div class="mpp-stat-val">${totalPins.toLocaleString()}</div>
                    <div class="mpp-stat-lbl">Pins</div>
                </div>
                <div class="mpp-stat">
                    <div class="mpp-stat-emoji">🗺️</div>
                    <div class="mpp-stat-val">${totalRoutes.toLocaleString()}</div>
                    <div class="mpp-stat-lbl">Routes</div>
                </div>
                <div class="mpp-stat">
                    <div class="mpp-stat-emoji">🚶</div>
                    <div class="mpp-stat-val">${miles}</div>
                    <div class="mpp-stat-lbl">Miles</div>
                </div>
            </div>

            <!-- Bio (hidden when empty) -->
            ${bio ? `
                <div class="mpp-section-label">About</div>
                <div class="mpp-bio-text">${esc(bio)}</div>
            ` : ''}

            <!-- Badges (hidden when none earned) -->
            ${earnedBadges.length > 0 ? `
                <div class="mpp-section-label">Badges (${earnedBadges.length})</div>
                <div class="mpp-badge-grid">
                    ${earnedBadges.map(k => {
                        const b = allBadges[k];
                        return `<div class="mpp-badge-item" title="${esc(b.description || b.name)}">
                            <span class="mpp-badge-emoji">${b.icon}</span>
                            <div class="mpp-badge-name">${esc(b.name)}</div>
                        </div>`;
                    }).join('')}
                </div>
            ` : ''}

            <!-- Title selector (hidden when none unlocked) -->
            ${unlockedTitles.length > 0 ? `
                <div class="mpp-section-label">Display Title</div>
                <div id="mppTitleList">
                    ${unlockedTitles.map(k => {
                        const t = allTitles[k];
                        const name = t ? t.name : k;
                        const isSel = k === selectedTitle;
                        return `<button class="mpp-title-option ${isSel ? 'mpp-title-selected' : 'mpp-title-unselected'}"
                            data-title-key="${esc(k)}">
                            <span>${esc(name)}</span>
                            ${isSel ? '<span>✓</span>' : ''}
                        </button>`;
                    }).join('')}
                    <button class="mpp-title-option ${!selectedTitle ? 'mpp-title-none-selected' : 'mpp-title-none-unselected'}"
                        data-title-key="">
                        <span>None</span>
                        ${!selectedTitle ? '<span>✓</span>' : ''}
                    </button>
                </div>
            ` : ''}

            <!-- Edit Profile (user's addition to spec) -->
            <button class="mpp-edit-btn" id="mppEditBtn">✏️ Edit Profile</button>

        </div>
    `;

    // ---- Wire interactions ----

    // Close button
    document.getElementById('mppClose')?.addEventListener('click', () => {
        document.getElementById('myProfileModal').style.display = 'none';
    });

    // Edit Profile → opens existing profileModal / loadProfileForEditing
    document.getElementById('mppEditBtn')?.addEventListener('click', () => {
        document.getElementById('myProfileModal').style.display = 'none';
        // Dynamically import to avoid circular deps between profile.js ↔ community.js
        import('./community.js').then(m => {
            m.loadProfileForEditing();
            document.getElementById('profileModal').style.display = 'flex';
        });
    });

    // Show-level toggle — ONLY permitted client write (user preference)
    const cb    = document.getElementById('mppShowLevelCb');
    const track = document.getElementById('mppToggleTrack');
    const thumb = document.getElementById('mppToggleThumb');
    let showLevelLocal = showLevel;

    cb?.addEventListener('change', async () => {
        const next = cb.checked;
        // Optimistic UI update
        showLevelLocal = next;
        if (track) track.style.background = next ? '#4A7C59' : '#CCC';
        if (thumb) thumb.style.left = next ? '21px' : '3px';
        try {
            await updateDoc(doc(db, 'publicProfiles', uid), { showLevel: next });
        } catch (err) {
            // Revert on failure
            showLevelLocal = !next;
            cb.checked = !next;
            if (track) track.style.background = showLevelLocal ? '#4A7C59' : '#CCC';
            if (thumb) thumb.style.left = showLevelLocal ? '21px' : '3px';
            toast('Could not save preference.', 'error');
        }
    });

    // Title selector
    let currentTitle = selectedTitle;
    document.getElementById('mppTitleList')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-title-key]');
        if (!btn) return;
        const key = btn.dataset.titleKey; // "" = None

        // Tapping current selection = deselect
        const next = key === currentTitle ? '' : key;
        currentTitle = next;

        // Update header pill immediately
        const pill = document.getElementById('mppTitlePill');
        if (pill) {
            if (next && allTitles[next]) {
                pill.textContent = allTitles[next].name;
                pill.style.display = 'inline-block';
            } else {
                pill.style.display = 'none';
            }
        }

        // Re-render title list with new selection
        const list = document.getElementById('mppTitleList');
        if (list) {
            list.querySelectorAll('[data-title-key]').forEach(b => {
                const k = b.dataset.titleKey;
                const isSel = k === next;
                if (k === '') {
                    b.className = `mpp-title-option ${!next ? 'mpp-title-none-selected' : 'mpp-title-none-unselected'}`;
                } else {
                    b.className = `mpp-title-option ${isSel ? 'mpp-title-selected' : 'mpp-title-unselected'}`;
                }
                // Rebuild inner HTML to show/hide checkmark
                const t = allTitles[k];
                const name = t ? t.name : (k || 'None');
                b.innerHTML = `<span>${esc(name)}</span>${isSel || (k === '' && !next) ? '<span>✓</span>' : ''}`;
            });
        }

        // Write to Firestore
        try {
            await updateDoc(doc(db, 'publicProfiles', uid), { selectedTitle: next });
        } catch (err) {
            toast('Could not save title.', 'error');
            // Revert
            currentTitle = next === selectedTitle ? '' : selectedTitle;
        }
    });
}

// ---------------------------------------------------------------------------
// HELPER
// ---------------------------------------------------------------------------

function esc(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
