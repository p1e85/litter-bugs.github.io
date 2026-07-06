// js/testmodules/xp.js
//
// XP & Level display system for Litter Troopers web app.
//
// ⚠️  GOLDEN RULE (from spec): This module NEVER writes xp, level, xpToday,
//     or xpTodayDate to Firestore. Those fields are Cloud-Function-only.
//     The ONE permitted client write is `showLevel` (user preference only).
//
// What this module does:
//   - Pure display math (LEVEL_THRESHOLDS, xpForLevel, etc.)
//   - XP toast (green pill, slides in from top)
//   - Level-up overlay (full-screen celebration with particles)
//   - Profile XP section renderer (bar, badge, today chip, toggle)
//   - Level badge HTML generator (for pins, leaderboard, squads)
//   - checkXpDelta() — called after publish/quickpin, waits 3s, shows toast/overlay

import { db, doc, getDoc, updateDoc } from './firebase.js';

// ---------------------------------------------------------------------------
// LEVEL MATH  (pure display helpers, no side effects)
// ---------------------------------------------------------------------------

export const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1600, 2500, 4000, 6500, 10000];

export function xpForLevel(level) {
    return LEVEL_THRESHOLDS[level - 1] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
}

export function xpForNextLevel(level) {
    return LEVEL_THRESHOLDS[level] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
}

export function xpProgressInLevel(xp, level) {
    const start = xpForLevel(level);
    const end = xpForNextLevel(level);
    if (end === start) return 1; // max level
    return Math.min(1, Math.max(0, (xp - start) / (end - start)));
}

// ---------------------------------------------------------------------------
// LEVEL BADGE HTML  (respects showLevel + level > 1 rule from spec)
// ---------------------------------------------------------------------------

/**
 * Returns an inline-styled gold circle badge with the level number.
 * Returns '' when conditions aren't met (level 1, or showLevel false/unset).
 *
 * @param {number}  level
 * @param {boolean} showLevel  — from publicProfiles.showLevel (default true per spec)
 * @param {number}  sizePx     — diameter in px; default 22 for inline badge
 */
export function getLevelBadgeHTML(level, showLevel, sizePx = 22) {
    // Per spec: NEVER show a badge for level 1, even if showLevel is true.
    if (!showLevel || level <= 1) return '';
    const fontSize = Math.round(sizePx * 0.45);
    return `<span class="lt-lvl-badge" title="Level ${level}" style="
        display:inline-flex;align-items:center;justify-content:center;
        width:${sizePx}px;height:${sizePx}px;border-radius:50%;
        background:radial-gradient(circle at 40% 35%,#FFD700,#FF8C00);
        color:white;font-weight:700;font-size:${fontSize}px;line-height:1;
        vertical-align:middle;box-shadow:0 1px 3px rgba(0,0,0,0.25);
        margin-left:4px;flex-shrink:0;
    ">${level}</span>`;
}

// ---------------------------------------------------------------------------
// FLAVOR TEXT (verbatim from spec)
// ---------------------------------------------------------------------------

const FLAVOR = {
    2:  "You're finding your stride, Trooper!",
    3:  "The streets are cleaner for having you.",
    4:  "A dedicated cleaner is emerging.",
    5:  "Halfway to legend. Keep it up! 🌿",
    6:  "Your commitment is inspiring others.",
    7:  "Elite Trooper status achieved.",
    8:  "You're a force of nature.",
    9:  "Almost at the top. One more push!",
    10: "Maximum level. A true Planet Guardian. 🌍",
};
const FLAVOR_DEFAULT = "Keep cleaning. Every pin counts.";

// ---------------------------------------------------------------------------
// CSS (injected once into <head>)
// ---------------------------------------------------------------------------

function ensureStyles() {
    if (document.getElementById('lt-xp-styles')) return;
    const s = document.createElement('style');
    s.id = 'lt-xp-styles';
    s.textContent = `
    /* ---------- XP Toast (top-center, green pill) ---------- */
    #lt-xp-toast-root {
        position:fixed; top:16px; left:50%; transform:translateX(-50%);
        z-index:99998; display:flex; flex-direction:column; align-items:center;
        gap:8px; pointer-events:none;
    }
    .lt-xp-toast {
        background:#4A7C59; color:#fff; font-weight:700; font-size:1.05em;
        padding:10px 24px; border-radius:999px;
        box-shadow:0 4px 14px rgba(0,0,0,0.22);
        opacity:0; transform:translateY(-18px);
        transition:opacity 0.2s ease, transform 0.2s ease;
        white-space:nowrap;
    }
    .lt-xp-toast.lt-show { opacity:1; transform:translateY(0); }

    /* ---------- Level-Up Overlay ---------- */
    #lt-levelup-overlay {
        position:fixed; inset:0; background:rgba(0,0,0,0.8);
        z-index:99999; display:flex; flex-direction:column;
        align-items:center; justify-content:center;
        cursor:pointer; -webkit-tap-highlight-color:transparent;
    }
    #lt-lu-title {
        font-size:2.6em; font-weight:900; color:#FFD700;
        letter-spacing:0.12em;
        text-shadow:0 0 24px rgba(255,215,0,0.7);
        opacity:0; transform:translateY(-28px);
        animation:lt-text-in 0.4s ease 0.1s forwards;
        margin-bottom:28px;
    }
    .lt-lu-badge-wrap {
        position:relative; width:140px; height:140px;
        display:flex; align-items:center; justify-content:center;
        margin-bottom:26px;
    }
    .lt-lu-badge-core {
        position:relative; z-index:2; width:140px; height:140px;
        border-radius:50%;
        background:radial-gradient(circle at 40% 35%,#FFD700,#FF8C00);
        display:flex; flex-direction:column;
        align-items:center; justify-content:center;
        box-shadow:0 0 40px rgba(255,200,0,0.55), 0 0 80px rgba(255,140,0,0.3);
        opacity:0; transform:scale(0);
        animation:lt-badge-spring 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.3s forwards;
    }
    .lt-lu-lightning { font-size:1.8em; margin-bottom:-4px; }
    .lt-lu-num { font-size:2.5em; font-weight:900; color:#fff; line-height:1; }
    .lt-lu-lbl { font-size:0.68em; font-weight:700; color:rgba(255,255,255,0.85); letter-spacing:0.1em; }
    .lt-lu-particle {
        position:absolute; width:10px; height:10px; border-radius:50%;
        top:50%; left:50%; margin:-5px 0 0 -5px; z-index:1;
        opacity:0; animation:lt-particle 0.72s ease-out 0.5s forwards;
    }
    #lt-lu-flavor {
        color:#fff; font-size:1.05em; text-align:center;
        max-width:280px; padding:0 16px;
        opacity:0; animation:lt-fadein 0.4s ease 1.1s forwards;
        margin-bottom:20px;
    }
    #lt-lu-hint {
        color:rgba(255,255,255,0.4); font-size:0.78em;
        opacity:0; animation:lt-fadein 0.4s ease 1.8s forwards;
    }
    @keyframes lt-text-in  { to { opacity:1; transform:translateY(0); } }
    @keyframes lt-fadein   { to { opacity:1; } }
    @keyframes lt-badge-spring {
        0%  { opacity:0; transform:scale(0); }
        60% { opacity:1; transform:scale(1.15); }
        80% { transform:scale(0.93); }
        100%{ opacity:1; transform:scale(1); }
    }
    @keyframes lt-particle {
        0%   { opacity:1; transform:translate(0,0); }
        100% { opacity:0; transform:translate(var(--px),var(--py)); }
    }

    /* ---------- Profile XP section ---------- */
    .lt-xp-section {
        background:#1A1A2E; border-radius:10px; padding:16px;
        margin:12px 0; color:#fff;
    }
    .lt-xp-level-row {
        display:flex; align-items:center; gap:10px; margin-bottom:10px;
    }
    .lt-xp-level-badge-lg {
        width:44px; height:44px; border-radius:50%; flex-shrink:0;
        background:radial-gradient(circle at 40% 35%,#FFD700,#FF8C00);
        display:flex; align-items:center; justify-content:center;
        font-size:1.3em; font-weight:900; color:#fff;
        box-shadow:0 0 14px rgba(255,200,0,0.4);
    }
    .lt-xp-info strong  { font-size:1.05em; }
    .lt-xp-info small   { color:rgba(255,255,255,0.55); font-size:0.8em; display:block; }
    .lt-xp-bar-wrap {
        height:8px; background:rgba(255,255,255,0.12);
        border-radius:999px; overflow:hidden; margin:8px 0;
    }
    .lt-xp-bar-fill {
        height:100%; border-radius:999px;
        background:linear-gradient(90deg,#4A7C59,#FFD700);
        transition:width 0.6s ease;
    }
    .lt-xp-progress-txt { font-size:0.78em; color:rgba(255,255,255,0.6); }
    .lt-today-chip {
        display:inline-block; background:#4A7C59; color:#fff;
        font-size:0.8em; font-weight:600; padding:2px 10px;
        border-radius:999px; margin-top:8px;
    }
    .lt-show-level-row {
        display:flex; align-items:center; justify-content:space-between;
        margin-top:12px; font-size:0.87em; color:rgba(255,255,255,0.7);
    }
    .lt-toggle-wrap {
        position:relative; width:42px; height:24px; flex-shrink:0;
    }
    .lt-toggle-wrap input { opacity:0; width:0; height:0; position:absolute; }
    .lt-toggle-track {
        position:absolute; inset:0; border-radius:24px; cursor:pointer;
        transition:background 0.2s;
    }
    .lt-toggle-thumb {
        position:absolute; top:3px; width:18px; height:18px;
        background:#fff; border-radius:50%; transition:left 0.2s; pointer-events:none;
    }
    `;
    document.head.appendChild(s);
}

// ---------------------------------------------------------------------------
// XP TOAST (slides in from top-center)
// ---------------------------------------------------------------------------

let _xpToastRoot = null;

export function showXpToast(amount) {
    ensureStyles();
    if (!_xpToastRoot) {
        _xpToastRoot = document.createElement('div');
        _xpToastRoot.id = 'lt-xp-toast-root';
        document.body.appendChild(_xpToastRoot);
    }
    const el = document.createElement('div');
    el.className = 'lt-xp-toast';
    el.textContent = `⚡ +${amount} XP`;
    _xpToastRoot.appendChild(el);

    // Double-rAF ensures initial state is painted before transition fires
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('lt-show')));

    setTimeout(() => {
        el.classList.remove('lt-show');
        setTimeout(() => el.remove(), 220);
    }, 2500);
}

// ---------------------------------------------------------------------------
// LEVEL-UP OVERLAY (full-screen celebration with particles)
// ---------------------------------------------------------------------------

export function showLevelUpOverlay(level) {
    ensureStyles();
    document.getElementById('lt-levelup-overlay')?.remove();

    const flavor = FLAVOR[level] ?? FLAVOR_DEFAULT;

    // 12 particles at 30° intervals, alternating gold/green
    const COLORS = ['#FFD700','#4A7C59','#FF8C00'];
    const DIST = 90;
    const particles = Array.from({ length: 12 }, (_, i) => {
        const rad = (i * 30) * Math.PI / 180;
        const px = Math.round(Math.cos(rad) * DIST);
        const py = Math.round(Math.sin(rad) * DIST);
        const color = COLORS[i % COLORS.length];
        return `<div class="lt-lu-particle" style="--px:${px}px;--py:${py}px;background:${color};"></div>`;
    }).join('');

    const overlay = document.createElement('div');
    overlay.id = 'lt-levelup-overlay';
    overlay.innerHTML = `
        <div id="lt-lu-title">LEVEL UP!</div>
        <div class="lt-lu-badge-wrap">
            ${particles}
            <div class="lt-lu-badge-core">
                <span class="lt-lu-lightning">⚡</span>
                <span class="lt-lu-num">${level}</span>
                <span class="lt-lu-lbl">LEVEL</span>
            </div>
        </div>
        <div id="lt-lu-flavor">${esc(flavor)}</div>
        <div id="lt-lu-hint">Tap anywhere to continue</div>
    `;

    const dismiss = () => {
        overlay.style.transition = 'opacity 0.28s ease';
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 300);
    };
    overlay.addEventListener('click', dismiss);
    // Auto-dismiss after 4 seconds per spec
    setTimeout(() => { if (overlay.isConnected) dismiss(); }, 4000);

    document.body.appendChild(overlay);
}

// ---------------------------------------------------------------------------
// POST-ACTION XP CHECK  (call non-blocking after publishRoute / saveQuickPin)
// ---------------------------------------------------------------------------

/**
 * Waits 3 seconds for the Cloud Function to run, reads the updated profile,
 * then shows an XP toast or level-up overlay if XP increased.
 *
 * Per spec: if delta === 0 (e.g. anti-farming gate hit), show nothing.
 * Never throws — this is a non-critical display path.
 *
 * @param {string} uid
 * @param {number} xpBefore    — profile.xp before the triggering action
 * @param {number} levelBefore — profile.level before the triggering action
 */
export async function checkXpDelta(uid, xpBefore, levelBefore) {
    try {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const snap = await getDoc(doc(db, 'publicProfiles', uid));
        if (!snap.exists()) return;
        const p = snap.data();
        const delta = (p.xp ?? 0) - xpBefore;
        if (delta <= 0) return; // anti-farming gate or 0 XP route — silent
        if ((p.level ?? 1) > levelBefore) {
            showLevelUpOverlay(p.level);
        } else {
            showXpToast(delta);
        }
    } catch (err) {
        console.warn('[xp] checkXpDelta failed:', err);
    }
}

// ---------------------------------------------------------------------------
// PROFILE XP SECTION  (render into a container element)
// ---------------------------------------------------------------------------

/**
 * Renders the full XP/Level section into `container`.
 * Includes: large level badge, XP progress bar, progress text,
 *           today's XP chip, and the show-level toggle.
 *
 * @param {HTMLElement} container   — cleared and populated
 * @param {object}      profile     — data from publicProfiles/{uid}
 * @param {string|null} uid         — null = read-only (no toggle)
 */
export function renderProfileXpSection(container, profile, uid = null) {
    ensureStyles();

    const xp       = profile.xp       ?? 0;
    const level    = profile.level    ?? 1;
    const xpToday  = profile.xpToday  ?? 0;
    const showLevel = profile.showLevel !== false; // default true per spec
    const isMax    = level >= 10;

    const pct        = Math.round(xpProgressInLevel(xp, level) * 100);
    const xpInLevel  = xp - xpForLevel(level);
    const xpNeeded   = isMax ? 0 : xpForNextLevel(level) - xpForLevel(level);
    const progressTxt = isMax
        ? 'Max level reached — Planet Guardian 🌍'
        : `${xpInLevel.toLocaleString()} / ${xpNeeded.toLocaleString()} XP to Level ${level + 1}`;

    container.innerHTML = `
        <div class="lt-xp-section">
            <div class="lt-xp-level-row">
                <div class="lt-xp-level-badge-lg">${level}</div>
                <div class="lt-xp-info">
                    <strong>Level ${level}</strong>
                    <small>${xp.toLocaleString()} total XP</small>
                </div>
            </div>
            ${!isMax ? `
                <div class="lt-xp-bar-wrap">
                    <div class="lt-xp-bar-fill" style="width:${pct}%;"></div>
                </div>
            ` : ''}
            <div class="lt-xp-progress-txt">${progressTxt}</div>
            ${xpToday > 0 ? `<div class="lt-today-chip">⚡ +${xpToday.toLocaleString()} today</div>` : ''}
            ${uid ? `
                <div class="lt-show-level-row">
                    <span>Show level on community pins</span>
                    <label class="lt-toggle-wrap">
                        <input type="checkbox" id="lt-showlevel-cb" ${showLevel ? 'checked' : ''}>
                        <div class="lt-toggle-track" id="lt-toggle-track-el"
                            style="background:${showLevel ? '#4A7C59' : '#555'};">
                            <div class="lt-toggle-thumb" id="lt-toggle-thumb-el"
                                style="left:${showLevel ? '21px' : '3px'};"></div>
                        </div>
                    </label>
                </div>
            ` : ''}
        </div>
    `;

    // Wire the show-level toggle. Per spec, this is the ONE permitted client
    // write — it's a UI preference, not an XP field.
    if (uid) {
        const cb    = container.querySelector('#lt-showlevel-cb');
        const track = container.querySelector('#lt-toggle-track-el');
        const thumb = container.querySelector('#lt-toggle-thumb-el');
        cb?.addEventListener('change', async () => {
            const v = cb.checked;
            if (track) track.style.background = v ? '#4A7C59' : '#555';
            if (thumb) thumb.style.left = v ? '21px' : '3px';
            try {
                await updateDoc(doc(db, 'publicProfiles', uid), { showLevel: v });
            } catch (err) {
                console.error('[xp] showLevel toggle failed:', err);
            }
        });
    }
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
