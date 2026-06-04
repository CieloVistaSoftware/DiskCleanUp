// ═══════════════════════════════════════════════════════════════════════════
//  WEBSOCKET CONNECTION — pure WS, signal channel only
//  WS carries SIGNALS, not data. Result data lives on disk (scan-cache).
//
//  Client sends: { type: 'start'|'cancel', section }
//  Server sends:
//    { section, type: 'started' }         — scan began
//    { section, type: 'progress', data }  — status bar update
//    { section, type: 'batch-ready', data: { count } } — N rows on disk, fetch them
//    { section, type: 'done', data }      — scan complete
//    { section, type: 'error', data }     — scan failed
//    { section: 'metrics', type: 'update', data } — CPU/memory gauge
// ═══════════════════════════════════════════════════════════════════════════

import { ErrLog }   from './error-logger.js';
import { Metrics }  from './metrics.js';
import { pushEvent } from './event-queue.js';
import { loadPage, resetPaging, resumeFromEof } from './page-loader.js';
import { crumb } from './breadcrumb.js';

let _ws = null;
let _wsReconnectDelay = 0;
const _wsDelays = [0, 2000, 5000, 10000, 20000];

export function wsSend(msg) {
  if (_ws && _ws.readyState === WebSocket.OPEN)
    _ws.send(JSON.stringify(msg));
}
// Expose for non-module code (metrics red zone cancel)
window._wsSend = (raw) => { if (_ws && _ws.readyState === WebSocket.OPEN) _ws.send(raw); };

let _connectTimer = null;
const WS_CONNECT_TIMEOUT = 10000; // 10 seconds

// ── Scan timeout: if no results within 10s of 'started', auto-fail ───────
const SCAN_RESULT_TIMEOUT = 10000;
const _scanTimers = {};  // section → timeoutId

function _startScanTimer(section) {
  _clearScanTimer(section);
  _scanTimers[section] = setTimeout(() => {
    const err = new Error(
      `Scan timeout: section "${section}" — no results received within ${SCAN_RESULT_TIMEOUT / 1000}s`
    );
    ErrLog.log(`[scan:${section}]`, err.message, err.stack, 'SCAN_TIMEOUT');
    window._T?.('WS', `scan timeout ${section}`);
    // Push error event so section handler shows failure in UI
    pushEvent(section, 'error', { message: err.message });
    // Tell backend to cancel
    wsSend({ type: 'cancel', section });
    delete _scanTimers[section];
  }, SCAN_RESULT_TIMEOUT);
}

function _clearScanTimer(section) {
  if (_scanTimers[section]) {
    clearTimeout(_scanTimers[section]);
    delete _scanTimers[section];
  }
}

export function wsConnect() {
  _ws = new WebSocket(`ws://${location.host}/ws`);

  // Start connection timeout — if no onopen within 10s, log error + set status to error
  clearTimeout(_connectTimer);
  _connectTimer = setTimeout(() => {
    const err = new Error(`WebSocket connection timeout after ${WS_CONNECT_TIMEOUT / 1000}s — server may be down`);
    ErrLog.log('[ws]', err.message, err.stack, 'WS_TIMEOUT');
    setConnStatus('❌ Error', false);
    window._T?.('WS', 'connect timeout');
    // Close the hanging socket so onclose fires and triggers reconnect
    try { _ws?.close(); } catch {}
  }, WS_CONNECT_TIMEOUT);

  _ws.onopen = () => {
    clearTimeout(_connectTimer);
    _wsReconnectDelay = 0;
    setConnStatus('⚡ Live', true);
    window._T?.('WS', 'connected');
  };

  _ws.onclose = (ev) => {
    clearTimeout(_connectTimer);
    setConnStatus('⚡ Reconnecting…', false);
    ErrLog.log('[ws]',
      ev.wasClean ? 'WebSocket closed cleanly' : `WebSocket dropped (code ${ev.code})`,
      null, ev.wasClean ? 'WS_CLOSED' : 'WS_RECONNECTING');
    const delay = _wsDelays[Math.min(_wsReconnectDelay++, _wsDelays.length - 1)]
                  + Math.floor(Math.random() * 1000);
    setTimeout(wsConnect, delay);
  };

  _ws.onerror = () => {
    // onclose fires immediately after — no duplicate log needed
  };

  let _wsMsgCount = 0;
  let _wsScanMsgCount = 0;
  _ws.onmessage = (ev) => {
    _wsMsgCount++;
    Metrics.markAlive(); // Any WS message = server is alive
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }

    // Metrics broadcast — bypass RAF queue, update graphs directly
    if (msg.section === 'metrics' && msg.type === 'update') {
      if (_wsMsgCount <= 3 || _wsMsgCount % 500 === 0)
        window._T?.('WS', `metrics #${_wsMsgCount}`);
      Metrics.update(msg.data || {});
      return;
    }

    // batch-ready: backend has written N rows to cache — fetch them via HTTP
    if (msg.type === 'batch-ready') {
      _clearScanTimer(msg.section);  // results arrived — cancel timeout
      _wsScanMsgCount++;
      crumb('ws', 'batch-ready', { section: msg.section, count: msg.data?.count });
      window._T?.('WS', `batch-ready ${msg.section} (${msg.data?.count} rows)`);
      _fetchBatch(msg.section);
      return;
    }

    // started: reset page-loader offset so batches read from byte 0
    if (msg.type === 'started') {
      crumb('ws', 'started', { section: msg.section });
      resetPaging(msg.section);
      _startScanTimer(msg.section);  // start 10s result timeout
    }

    // done/error: scan finished — clear any pending timeout
    if (msg.type === 'done' || msg.type === 'error') {
      _clearScanTimer(msg.section);
    }

    // All other scan events (started/progress/done/error) go through the RAF queue
    _wsScanMsgCount++;
    crumb('ws', 'pushEvent', { section: msg.section, type: msg.type });
    if (_wsScanMsgCount <= 20 || _wsScanMsgCount % 100 === 0)
      window._T?.('WS', `scan#${_wsScanMsgCount} ${msg.section}:${msg.type}`);
    pushEvent(msg.section, msg.type, msg.data);
  };
}

// ── Batch fetcher ─────────────────────────────────────────────────────────
// Fetches ALL available pages of results from disk cache and pushes rows
// through the event queue. Drains until EOF, then waits for the next
// batch-ready signal (which means more data was appended).
//
// FIX (2026-03-03): old code used a boolean _fetchPending flag that lost
// count when hundreds of batch-ready signals arrived during one HTTP fetch.
// New code: loop until loadPage returns empty (EOF), then exit. The next
// batch-ready signal restarts the process with resumeFromEof().
const _fetchActive  = new Set();   // currently fetching
const _fetchPending = {};          // a batch-ready arrived while fetching

async function _fetchBatch(section) {
  // If already fetching, mark pending so we retry after hitting EOF
  if (_fetchActive.has(section)) {
    crumb('ws', '_fetchBatch:queued', { section });
    _fetchPending[section] = true;
    return;
  }
  _fetchActive.add(section);
  crumb('ws', '_fetchBatch:start', { section });
  try {
    do {
      _fetchPending[section] = false;
      // If we hit EOF on a previous iteration, restore the byte offset
      // so loadPage reads from where we left off (new data may exist)
      resumeFromEof(section);
      const { rows } = await loadPage(section);
      crumb('ws', '_fetchBatch:loaded', { section, rows: rows.length });
      window._T?.('WS', `batch-fetch ${section}: ${rows.length} rows from cache`);

      if (!rows.length) {
        // Hit EOF — if a batch-ready arrived while we were fetching,
        // new data was written; retry. Otherwise, exit and wait.
        if (_fetchPending[section]) continue;
        break;
      }

      for (const evt of rows) {
        if (evt.type === 'started' || evt.type === 'progress' || evt.type === 'done') continue;
        pushEvent(section, evt.type, evt.data || {});
      }
      // Rebuild scan-filter dropdown after batch
      const SF = window._scanFilter;
      if (SF?.rebuild) SF.rebuild(section);
    } while (true);  // keep draining pages until EOF
  } catch (e) {
    window._T?.('WS', `batch-fetch ${section} error: ${e.message}`);
  } finally {
    _fetchActive.delete(section);
    delete _fetchPending[section];
  }
}

function setConnStatus(text, connected) {
  const el = document.getElementById('connStatus');
  if (!el) return;
  el.textContent = text;
  el.className = connected ? 'connected' : 'disconnected';
}

// Expose setConnStatus for use in init
export { setConnStatus };
