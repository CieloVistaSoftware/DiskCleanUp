// ═══════════════════════════════════════════════════════════════════════════
//  BREADCRUMB — Workflow tracing via the existing trace log
//  Every module drops breadcrumbs. They flush to /api/trace as formatted
//  lines that intermix with INIT, WS, FREEZE, etc. One log, one viewer.
//
//  When a freeze fires, the last 50 breadcrumbs are dumped inline.
//
//  Usage:
//    import { crumb } from './breadcrumb.js';
//    crumb('scan-grid', 'addRow', { section, rowNum });
// ═══════════════════════════════════════════════════════════════════════════

const MAX = 200;
const _ring = new Array(MAX);
let _idx = 0;
let _count = 0;
const _T0 = performance.now();
let _lastInitCrumb = null;

// Flush buffer — formatted trace lines sent to /api/trace
const _pending = [];
let _flushTimer = null;
const FLUSH_MS = 500;

/**
 * Drop a breadcrumb. Goes to ring buffer + queued for trace log flush.
 */
export function crumb(module, fn, detail?) {
  const ms = (performance.now() - _T0) | 0;
  const entry = { seq: _count++, ms, module, fn, detail: detail || null };
  _ring[_idx] = entry;
  if (module === 'init') _lastInitCrumb = { ...entry };
  _idx = (_idx + 1) % MAX;

  // Format as trace line: +123ms [WF:module] fn detail
  const d = detail ? ' ' + _shortDetail(detail) : '';
  _pending.push(`+${ms}ms [WF:${module}] ${fn}${d}`);
  if (!_flushTimer) _flushTimer = setTimeout(_flush, FLUSH_MS);
}

function _flush() {
  _flushTimer = null;
  if (!_pending.length) return;
  const batch = _pending.splice(0, _pending.length).join('\n');
  try { navigator.sendBeacon('/api/trace', batch); } catch { /* best-effort */ }
}

/**
 * Called by freeze detector. Returns last N breadcrumbs formatted.
 */
export function dumpOnFreeze(n = 50) {
  _flush();
  const total = Math.min(n, Math.min(_count, MAX));
  const lines = [];
  let pos = (_idx - 1 + MAX) % MAX;
  for (let i = 0; i < total; i++) {
    const c = _ring[pos];
    if (!c) break;
    const d = c.detail ? ' ' + _shortDetail(c.detail) : '';
    lines.push(`  #${c.seq} +${c.ms}ms [${c.module}] ${c.fn}${d}`);
    pos = (pos - 1 + MAX) % MAX;
  }
  return lines.join('\n');
}

export function getRecent(n = 50) {
  const total = Math.min(n, Math.min(_count, MAX));
  const out = [];
  let pos = (_idx - 1 + MAX) % MAX;
  for (let i = 0; i < total; i++) {
    const c = _ring[pos];
    if (!c) break;
    out.push({ ...c });
    pos = (pos - 1 + MAX) % MAX;
  }

  // Keep one init marker visible for diagnostics even if startup churn
  // has rotated earlier init crumbs out of the ring.
  if (n >= 50 && _lastInitCrumb && !out.some(c => c.module === 'init')) {
    if (out.length < total) out.push({ ..._lastInitCrumb });
    else if (out.length > 0) out[out.length - 1] = { ..._lastInitCrumb };
  }

  return out;
}

function _shortDetail(d) {
  if (!d) return '';
  const parts = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined || v === null) continue;
    const val = typeof v === 'string' ? (v.length > 60 ? v.slice(0, 57) + '…' : v)
              : typeof v === 'number' ? v
              : String(v).slice(0, 40);
    parts.push(`${k}=${val}`);
  }
  return parts.join(' ');
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') _flush();
});
window.addEventListener('beforeunload', _flush);

window._crumbs = { dump: dumpOnFreeze, recent: getRecent, crumb, flush: _flush };
