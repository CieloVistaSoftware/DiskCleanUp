// ═══════════════════════════════════════════════════════════════════════════
//  STATUS BAR — per-section scanning status, timers, folder display
//  Includes a red ⛔ STOP button that appears during scans.
// ═══════════════════════════════════════════════════════════════════════════
import { ErrLog } from './error-logger.js';
import { wsSend } from './websocket.js';
const _sbStarts = {};
const _sbTimers = {};
export const SB = {
    begin(section, root) {
        try {
            clearInterval(_sbTimers[section]);
            _sbStarts[section] = Date.now();
            _set(section, 'status', 'Scanning…');
            _set(section, 'time', '0.0s');
            _set(section, 'files', '0');
            _set(section, 'results', '0');
            _set(section, 'rows', '0');
            const bar = document.getElementById(`sb-${section}`);
            if (bar) {
                bar.className = 'section-sb scanning';
                _addStopBtn(bar, section);
            }
            _folder(section, root ? `Root: ${root}` : 'Running…');
            _sbTimers[section] = setInterval(() => {
                _set(section, 'time', ((Date.now() - _sbStarts[section]) / 1000).toFixed(1) + 's');
            }, 200);
        } catch (e) {
            ErrLog.log('[status-bar]', e?.message || String(e), e?.stack || null, 'BEGIN_ERROR');
        }
    },
    progress(section, data) {
        try {
            if (data.files !== undefined)
                _set(section, 'files', data.files.toLocaleString());
            if (data.results !== undefined)
                _set(section, 'results', data.results.toLocaleString());
            if (data.folder !== undefined)
                _folder(section, data.folder);
        } catch (e) {
            ErrLog.log('[status-bar]', e?.message || String(e), e?.stack || null, 'PROGRESS_ERROR');
        }
    },
    done(section, label) {
        try {
            clearInterval(_sbTimers[section]);
            const t = ((Date.now() - (_sbStarts[section] || Date.now())) / 1000).toFixed(1);
            _set(section, 'status', label || 'Done');
            _set(section, 'time', t + 's');
            const bar = document.getElementById(`sb-${section}`);
            if (bar) {
                bar.className = 'section-sb done';
                _removeStopBtn(bar);
            }
            _folder(section, `Completed in ${t}s`);
        } catch (e) {
            ErrLog.log('[status-bar]', e?.message || String(e), e?.stack || null, 'DONE_ERROR');
        }
    },
    error(section, msg) {
        clearInterval(_sbTimers[section]);
        _set(section, 'status', 'Error');
        const bar = document.getElementById(`sb-${section}`);
        if (bar) {
            bar.className = 'section-sb';
            _removeStopBtn(bar);
        }
        _folder(section, msg || 'Scan failed');
        ErrLog.log(`[${section}]`, msg || 'Scan failed', null, 'SCAN_ERROR');
    }
};
function _addStopBtn(bar, section) {
    try {
        _removeStopBtn(bar); // no dupes
        const btn = document.createElement('button');
        btn.className = 'sb-stop-btn';
        btn.textContent = '⛔ STOP';
        btn.title = 'Cancel this scan';
        btn.addEventListener('click', () => {
            try {
                wsSend({ type: 'cancel', section });
                btn.disabled = true;
                btn.textContent = 'Stopping…';
            } catch (e) {
                ErrLog.log('[status-bar]', e?.message || String(e), e?.stack || null, 'STOP_BTN_ERROR');
            }
        });
        bar.appendChild(btn);
    } catch (e) {
        ErrLog.log('[status-bar]', e?.message || String(e), e?.stack || null, 'ADD_STOP_BTN_ERROR');
    }
}
function _removeStopBtn(bar) {
    const btn = bar.querySelector('.sb-stop-btn');
    if (btn)
        btn.remove();
}
export function _set(section, key, val) {
    const el = document.getElementById(`sbv-${section}-${key}`);
    if (el)
        el.textContent = val;
}
export function _folder(section, txt) {
    const el = document.getElementById(`sbf-${section}`);
    if (el)
        el.textContent = txt;
}
export function _getVal(section, key) {
    const el = document.getElementById(`sbv-${section}-${key}`);
    return el ? el.textContent : '0';
}
// Expose for plain scripts (duplicates.js)
window.SB = SB;
//# sourceMappingURL=status-bar.js.map