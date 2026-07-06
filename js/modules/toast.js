// js/testmodules/toast.js
//
// Tiny toast helper. Replaces blocking alert() for non-critical confirmations
// across the admin panel and elsewhere. The toast container is created lazily
// on first call, so no HTML setup is required.
//
// Usage:
//   import { toast } from './toast.js';
//   toast('Saved!', 'success');
//   toast('Could not save.', 'error');
//   toast('Heads up.', 'info');
//   toast('Be careful.', 'warn');
//
// Stays in the lower-right corner on desktop, stretches across the bottom
// on mobile. Auto-dismisses after 3s (5s for errors/warns). Click to dismiss
// immediately. Pass a duration in ms as third arg to override; pass 0 for sticky.

let containerEl = null;

function ensureContainer() {
    if (containerEl) return containerEl;

    containerEl = document.createElement('div');
    containerEl.id = 'lt-toast-container';
    containerEl.setAttribute('aria-live', 'polite');
    containerEl.style.cssText = [
        'position:fixed',
        'bottom:16px',
        'right:16px',
        'z-index:99999',
        'display:flex',
        'flex-direction:column',
        'align-items:flex-end',
        'gap:8px',
        'pointer-events:none',   // toasts themselves opt back in
        'max-width:calc(100vw - 32px)'
    ].join(';');
    document.body.appendChild(containerEl);

    // Inject styles once. Inline styles can't hold @media, so we use a <style>.
    if (!document.getElementById('lt-toast-styles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'lt-toast-styles';
        styleEl.textContent = `
            @media (max-width: 600px) {
                #lt-toast-container {
                    left: 16px;
                    right: 16px;
                    align-items: stretch !important;
                }
                #lt-toast-container .lt-toast {
                    width: auto !important;
                    max-width: none !important;
                }
            }
            .lt-toast {
                pointer-events: auto;
                padding: 12px 16px;
                border-radius: 6px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                color: #fff;
                font-size: 0.95em;
                line-height: 1.35;
                max-width: 360px;
                opacity: 0;
                transform: translateY(8px);
                transition: opacity 0.18s ease, transform 0.18s ease;
                cursor: pointer;
                word-wrap: break-word;
            }
            .lt-toast.lt-toast-show { opacity: 1; transform: translateY(0); }
            .lt-toast-success { background: #4A7C59; }
            .lt-toast-error   { background: #dc3545; }
            .lt-toast-info    { background: #444; }
            .lt-toast-warn    { background: #b8860b; }
        `;
        document.head.appendChild(styleEl);
    }
    return containerEl;
}

/**
 * Show a toast.
 * @param {string} message - text to display
 * @param {string} kind - 'success' | 'error' | 'info' | 'warn'
 * @param {number} [duration] - ms; 0 = sticky; default 3000 (5000 for error/warn)
 * @returns {Function} dismiss - call to remove immediately
 */
export function toast(message, kind = 'info', duration) {
    const root = ensureContainer();
    const el = document.createElement('div');
    el.className = `lt-toast lt-toast-${kind}`;
    el.textContent = String(message);
    el.title = 'Click to dismiss';
    root.appendChild(el);

    // Default durations by severity
    if (duration === undefined) {
        duration = (kind === 'error' || kind === 'warn') ? 5000 : 3000;
    }

    // Trigger slide-in. Double-rAF makes the initial state paint before
    // the transition starts.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => el.classList.add('lt-toast-show'));
    });

    const dismiss = () => {
        el.classList.remove('lt-toast-show');
        setTimeout(() => el.remove(), 200);
    };

    if (duration > 0) setTimeout(dismiss, duration);
    el.addEventListener('click', dismiss);
    return dismiss;
}
