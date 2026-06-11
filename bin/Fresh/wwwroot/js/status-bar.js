// ═══════════════════════════════════════════════════════════════════════════
//  STATUS BAR — per-section scanning status, timers, folder display
//  Includes a red ⛔ STOP button that appears during scans.
// ═══════════════════════════════════════════════════════════════════════════

import { ErrLog } from './error-logger.js';
import { wsSend } from './websocket.js';

const _sbStarts = {};
const _sbTimers = {};

export const SB = {
  begin(section) {
    clearInterval(_sbTimers[section]);
    _sbStarts[section] = Date.now();
    _set(section, 'status', 'Scanning\u2026');
    _set(section, 'time',    '0.0s');
    _set(section, 'files',   '0');
    _set(section, 'results', '0');
    _set(section, 'rows',    '0');
    const bar = document.getElementById(`sb-${section}`);
    if (bar) {
      bar.className = 'section-sb scanning';
      _addStopBtn(bar, section);
    }
    _folder(section, 'Running\u2026');
    _sbTimers[section] = setInterval(() => {
      _set(section, 'time', ((Date.now() - _sbStarts[section]) / 1000).toFixed(1) + 's');
    }, 200);
  },

  progress(section, data) {
    if (data.files   !== undefined) _set(section, 'files',   data.files.toLocaleString());
    if (data.results !== undefined) _set(section, 'results', data.results.toLocaleString());
    if (data.folder  !== undefined) _folder(section, data.folder);
  },

  done(section, label) {
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
  _removeStopBtn(bar); // no dupes
  const btn = document.createElement('button');
  btn.className = 'sb-stop-btn';
  btn.textContent = '\u26d4 STOP';
  btn.title = 'Cancel this scan';
  btn.addEventListener('click', () => {
    wsSend({ type: 'cancel', section });
    btn.disabled = true;
    btn.textContent = 'Stopping\u2026';
  });
  bar.appendChild(btn);
}

function _removeStopBtn(bar) {
  const btn = bar.querySelector('.sb-stop-btn');
  if (btn) btn.remove();
}

export function _set(section, key, val) {
  const el = document.getElementById(`sbv-${section}-${key}`);
  if (el) el.textContent = val;
}

export function _folder(section, txt) {
  const el = document.getElementById(`sbf-${section}`);
  if (el) el.textContent = txt;
}

export function _getVal(section, key) {
  const el = document.getElementById(`sbv-${section}-${key}`);
  return el ? el.textContent : '0';
}

// Expose for plain scripts (duplicates.js)
window.SB = SB;
