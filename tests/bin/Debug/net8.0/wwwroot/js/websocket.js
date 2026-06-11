import { ErrLog } from "./error-logger.js";
import { Metrics } from "./metrics.js";
import { pushEvent } from "./event-queue.js";
import { loadPage, resetPaging, resumeFromEof } from "./page-loader.js";
import { crumb } from "./breadcrumb.js";
let _ws = null;
let _wsReconnectDelay = 0;
const _wsDelays = [0, 2e3, 5e3, 1e4, 2e4];
function wsSend(msg) {
  if (_ws && _ws.readyState === WebSocket.OPEN)
    _ws.send(JSON.stringify(msg));
}
window._wsSend = (raw) => {
  if (_ws && _ws.readyState === WebSocket.OPEN) _ws.send(raw);
};
let _connectTimer = null;
let _fatalShown = false;
const WS_CONNECT_TIMEOUT = 15e3;
let _lastWsStatusTime = Date.now();
let _watchdogTimer = null;
async function _probeCurrentPort() {
  let httpOk = false;
  let httpDetail = "";
  try {
    const r = await fetch("/api/service/info", { signal: AbortSignal.timeout(4e3) });
    httpOk = r.ok;
    httpDetail = `HTTP ${r.status} ${r.statusText}`;
  } catch (e) {
    httpDetail = String(e.message);
  }
  return { httpOk, httpDetail };
}
async function _probeAltPort(httpOk, altPort) {
  if (httpOk) return false;
  try {
    const r = await fetch(
      `http://localhost:${altPort}/api/service/info`,
      { signal: AbortSignal.timeout(3e3) }
    );
    return r.ok;
  } catch {
    return false;
  }
}
function _classifyWsFailure(httpOk, altPortOk, currentPort, altPort) {
  const isWsBroken = httpOk;
  const isPortMismatch = !httpOk && altPortOk;
  const isServiceDown = !httpOk && !altPortOk;
  let title;
  let reason;
  if (isWsBroken) {
    title = "\u26A0\uFE0F WebSocket handshake failed";
    reason = `The DiskCleanUp service on <b>${location.host}</b> is responding to HTTP but the WebSocket handshake on <b>ws://${location.host}/ws</b> did not complete.

The service may be mid-restart. Auto-reconnect is running \u2014 this usually clears itself within 30 seconds.`;
  } else if (isPortMismatch) {
    title = "\u26A0\uFE0F Browser is on the wrong port";
    reason = `This tab is connected to <b>localhost:${currentPort}</b> but the DiskCleanUp service is running on <b>localhost:${altPort}</b>.

This happens when the dev console mode (:${altPort}) and the Windows Service (:5100) are both present. Click "Switch to :${altPort}" to load the correct dashboard.`;
  } else {
    title = "\u274C Service is not responding";
    reason = `The DiskCleanUp service on <b>localhost:${currentPort}</b> did not respond after 15 seconds.

The Windows service may have crashed, failed to start, or is stuck.
Auto-reconnect is retrying in the background.

<b>Quickest fix:</b> Right-click the DiskCleanUp tray icon \u2192 <i>Restart Service</i>.`;
  }
  return { isWsBroken, isPortMismatch, isServiceDown, title, reason };
}
function _buildFatalOverlay(borderColor, title, reason, httpLine, retryBtn, restartBtn, switchBtn, dismissBtn, diagLink, stack) {
  const overlay = document.createElement("div");
  overlay.id = "ws-fatal-overlay";
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:99999",
    "background:rgba(0,0,0,.82)",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "font-family:Segoe UI,sans-serif"
  ].join(";");
  overlay.innerHTML = `
    <div style="background:#161b22;border:2px solid ${borderColor};border-radius:10px;
                max-width:700px;width:90vw;padding:28px 32px;box-shadow:0 16px 64px rgba(0,0,0,.9)">
      <div style="font-size:1.1rem;font-weight:700;color:${borderColor};margin-bottom:10px">${title}</div>
      <div style="color:#e6edf3;font-size:.9rem;line-height:1.65;white-space:pre-wrap;margin-bottom:14px">${reason}</div>
      <div style="background:#0d1117;border:1px solid #30363d;border-radius:6px;
                  padding:9px 13px;font:11px/1.5 'Cascadia Code',monospace;color:#e3b341;
                  margin-bottom:14px">${httpLine}</div>
      <details style="margin-bottom:18px">
        <summary style="cursor:pointer;color:#8b949e;font-size:.8rem;margin-bottom:6px">Stack trace</summary>
        <pre style="background:#0d1117;border:1px solid #30363d;border-radius:6px;
                    padding:9px 13px;font:11px/1.5 'Cascadia Code',monospace;
                    color:#8b949e;overflow:auto;max-height:200px;margin:0">${stack}</pre>
      </details>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        ${retryBtn}${restartBtn}${switchBtn}${dismissBtn}${diagLink}
      </div>
      <div style="margin-top:12px;font-size:.8rem;color:#6e7681">
        Auto-reconnect is running in the background (0 \u2192 2 \u2192 5 \u2192 10 \u2192 20s backoff).
      </div>
    </div>`;
  return overlay;
}
function _wireFatalHandlers(overlay, altPort, isWsBroken, isPortMismatch) {
  document.getElementById("ws-fatal-retry").onclick = () => {
    overlay.remove();
    _fatalShown = false;
    _wsReconnectDelay = 0;
    wsConnect();
  };
  const restartEl = document.getElementById("ws-fatal-restart");
  if (restartEl) restartEl.onclick = async () => {
    restartEl.disabled = true;
    restartEl.textContent = "\u27F3 Restarting\u2026";
    try {
      await fetch("/api/restart", { method: "POST", signal: AbortSignal.timeout(5e3) });
    } catch {
    }
    setTimeout(() => {
      overlay.remove();
      _fatalShown = false;
      _wsReconnectDelay = 0;
      wsConnect();
    }, 3e3);
  };
  const switchEl = document.getElementById("ws-fatal-switch");
  if (switchEl) switchEl.onclick = () => {
    window.location.href = `http://localhost:${altPort}`;
  };
  document.getElementById("ws-fatal-dismiss").onclick = () => {
    overlay.remove();
    _fatalShown = false;
  };
}
async function _showFatalError() {
  if (_fatalShown) return;
  _fatalShown = true;
  const stack = new Error("Connection failed").stack ?? "(stack unavailable)";
  const currentPort = parseInt(location.port || "5100", 10);
  const altPort = currentPort === 5100 ? 5e3 : 5100;
  const { httpOk, httpDetail } = await _probeCurrentPort();
  const altPortOk = await _probeAltPort(httpOk, altPort);
  const { isWsBroken, isPortMismatch, isServiceDown, title, reason } = _classifyWsFailure(httpOk, altPortOk, currentPort, altPort);
  const httpLine = isPortMismatch ? `Current port :${currentPort} \u2014 no response | Alternate port :${altPort} \u2014 \u2713 alive` : `HTTP probe :${currentPort}: ${httpDetail || "no response"}`;
  const borderColor = isServiceDown ? "#f85149" : "#e3b341";
  const retryBtn = `<button id="ws-fatal-retry" style="background:#58a6ff;color:#000;border:none;padding:8px 20px;border-radius:6px;font-size:.9rem;font-weight:700;cursor:pointer">\u21BA Retry Now</button>`;
  const restartBtn = isWsBroken ? `<button id="ws-fatal-restart" style="background:#f0883e;color:#000;border:none;padding:8px 20px;border-radius:6px;font-size:.9rem;font-weight:700;cursor:pointer">\u27F3 Restart Service</button>` : "";
  const switchBtn = isPortMismatch ? `<button id="ws-fatal-switch" style="background:#3fb950;color:#000;border:none;padding:8px 20px;border-radius:6px;font-size:.9rem;font-weight:700;cursor:pointer">\u2192 Switch to :${altPort}</button>` : "";
  const dismissBtn = `<button id="ws-fatal-dismiss" style="background:#30363d;color:#e6edf3;border:none;padding:8px 20px;border-radius:6px;font-size:.9rem;cursor:pointer">Dismiss</button>`;
  const diagLink = `<a href="/ws-diagram.html" target="_blank" style="color:#8b949e;font-size:.8rem;text-decoration:none;align-self:center">\u{1F4D0} Connection diagram</a>`;
  const overlay = _buildFatalOverlay(
    borderColor,
    title,
    reason,
    httpLine,
    retryBtn,
    restartBtn,
    switchBtn,
    dismissBtn,
    diagLink,
    stack
  );
  document.body.appendChild(overlay);
  _wireFatalHandlers(overlay, altPort, isWsBroken, isPortMismatch);
  setConnStatus("\u274C Failed", false);
  const caseTag = isWsBroken ? "WS_BROKEN" : isPortMismatch ? "PORT_MISMATCH" : "BACKEND_DOWN";
  window._T?.("WS", `fatal: ${title} | ${httpLine} | case=${caseTag}`);
  ErrLog.log("[ws]", title, stack, caseTag);
}
function _startWatchdog() {
  clearInterval(_watchdogTimer);
  _watchdogTimer = setInterval(() => {
    const el = document.getElementById("connStatus");
    const isLive = el?.className === "connected";
    const timeSinceLastAttempt = Date.now() - _lastWsStatusTime;
    if (!isLive && timeSinceLastAttempt > 45e3) {
      window._T?.("WS", `watchdog triggered: forcing reconnect (${timeSinceLastAttempt}ms since last attempt)`);
      clearTimeout(_connectTimer);
      if (_ws) {
        try {
          _ws.close();
        } catch {
        }
        _ws = null;
      }
      _wsReconnectDelay = 0;
      wsConnect();
    }
  }, 3e4);
}
function _handleWsOpen(wsRef, watchdogTimer) {
  clearTimeout(_connectTimer);
  if (_startBannerTimer) {
    clearTimeout(_startBannerTimer);
    _startBannerTimer = null;
  }
  _hideStartBanner();
  _wsReconnectDelay = 0;
  setConnStatus("\u26A1 Live", true);
  window._T?.("WS", "connected");
  const overlay = document.getElementById("ws-fatal-overlay");
  if (overlay) overlay.remove();
  _fatalShown = false;
  if (watchdogTimer.val !== null) {
    clearInterval(watchdogTimer.val);
    watchdogTimer.val = null;
  }
}
function _handleWsClose(ev, oncloseCalledRef) {
  oncloseCalledRef.called = true;
  clearTimeout(_connectTimer);
  setConnStatus("\u26A1 Reconnecting\u2026", false);
  if (_wsReconnectDelay === 0 || !ev.wasClean) {
    ErrLog.log(
      "[ws]",
      ev.wasClean ? "WebSocket closed cleanly" : `WebSocket dropped (code ${ev.code})`,
      null,
      ev.wasClean ? "WS_CLOSED" : "WS_RECONNECTING"
    );
  }
  const attemptIndex = _wsReconnectDelay++;
  if (attemptIndex >= _wsDelays.length) {
    void _showFatalError();
    return;
  }
  const delay = _wsDelays[attemptIndex] + Math.floor(Math.random() * 1e3);
  setTimeout(wsConnect, delay);
}
function _handleWsMessage(ev, section) {
  _wsMsgCount++;
  Metrics.markAlive();
  let msg;
  try {
    msg = JSON.parse(ev.data);
  } catch {
    return;
  }
  if (msg.section === "metrics" && msg.type === "update") {
    if (_wsMsgCount <= 3 || _wsMsgCount % 500 === 0)
      window._T?.("WS", `metrics #${_wsMsgCount}`);
    Metrics.update(msg.data || {});
    return;
  }
  if (msg.type === "batch-ready") {
    _wsScanMsgCount++;
    crumb("ws", "batch-ready", { section: msg.section, count: msg.data?.count });
    window._T?.("WS", `batch-ready ${msg.section} (${msg.data?.count} rows)`);
    _fetchBatch(msg.section);
    return;
  }
  if (msg.type === "started") {
    crumb("ws", "started", { section: msg.section });
    resetPaging(msg.section);
    delete _deferredDone[msg.section];
  }
  if ((msg.type === "done" || msg.type === "error") && _fetchActive.has(msg.section)) {
    _wsScanMsgCount++;
    crumb("ws", "deferred", { section: msg.section, type: msg.type });
    window._T?.("WS", `deferring ${msg.type} for ${msg.section} until fetch drains`);
    _deferredDone[msg.section] = { type: msg.type, data: msg.data };
    return;
  }
  _wsScanMsgCount++;
  crumb("ws", "pushEvent", { section: msg.section, type: msg.type });
  if (_wsScanMsgCount <= 20 || _wsScanMsgCount % 100 === 0)
    window._T?.("WS", `scan#${_wsScanMsgCount} ${msg.section}:${msg.type}`);
  pushEvent(msg.section, msg.type, msg.data);
}
let _wsMsgCount = 0;
let _wsScanMsgCount = 0;
let _startBannerTimer = null;
function _showStartBanner() {
  if (document.getElementById("ws-start-banner")) return;
  const b = document.createElement("div");
  b.id = "ws-start-banner";
  b.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99998;background:#7c3aed;color:#fff;padding:10px 20px;font-size:13px;display:flex;align-items:center;gap:12px;font-family:Segoe UI,sans-serif";
  b.innerHTML = `
    <span>\u26A0 DiskCleanUp service is not running.</span>
    <span style="opacity:.8">Start it: open a terminal in the project folder and run <code style="background:rgba(0,0,0,.3);padding:1px 6px;border-radius:3px">npm run restart</code></span>
    <button onclick="this.parentElement.remove()" style="margin-left:auto;background:none;border:1px solid rgba(255,255,255,.5);color:#fff;padding:2px 10px;border-radius:3px;cursor:pointer">Dismiss</button>`;
  document.body.prepend(b);
}
function _hideStartBanner() {
  document.getElementById("ws-start-banner")?.remove();
}
function wsConnect() {
  setConnStatus("\u26A1 Connecting\u2026", false);
  _lastWsStatusTime = Date.now();
  _startWatchdog();
  if (_startBannerTimer) clearTimeout(_startBannerTimer);
  _startBannerTimer = setTimeout(_showStartBanner, 3e3);
  const wsScheme = location.protocol === "https:" ? "wss" : "ws";
  const wsUrl = `${wsScheme}://${location.host}/ws`;
  try {
    _ws = new WebSocket(wsUrl);
  } catch (ex) {
    ErrLog.log("[ws]", `WebSocket constructor failed: ${wsUrl}`, ex?.stack || null, "WS_CONSTRUCTOR_FAILED");
    setConnStatus("\u26A1 Reconnecting\u2026", false);
    const delay = _wsDelays[Math.min(_wsReconnectDelay++, _wsDelays.length - 1)] + Math.floor(Math.random() * 1e3);
    setTimeout(wsConnect, delay);
    return;
  }
  clearTimeout(_connectTimer);
  const oncloseCalledRef = { called: false };
  const watchdogTimer = { val: _watchdogTimer };
  _connectTimer = setTimeout(() => {
    window._T?.("WS", "connect timeout \u2014 probing backend");
    try {
      _ws?.close();
    } catch (ex) {
      ErrLog.log("[WEBSOCKET]", ex.message, ex.stack, "CAUGHT_ERROR");
    }
    _showFatalError();
    setTimeout(() => {
      if (!oncloseCalledRef.called) {
        window._T?.("WS", "WARNING: onclose not fired after close(), forcing reconnect");
        _ws = null;
        _wsReconnectDelay = 0;
        wsConnect();
      }
    }, 2e3);
  }, WS_CONNECT_TIMEOUT);
  _ws.onopen = () => _handleWsOpen({ ws: _ws }, watchdogTimer);
  _ws.onclose = (ev) => _handleWsClose(ev, oncloseCalledRef);
  _ws.onerror = () => {
  };
  _ws.onmessage = (ev) => _handleWsMessage(ev, "");
}
const _fetchActive = /* @__PURE__ */ new Set();
const _fetchPending = {};
const _deferredDone = {};
async function _fetchBatch(section) {
  if (_fetchActive.has(section)) {
    crumb("ws", "_fetchBatch:queued", { section });
    _fetchPending[section] = true;
    return;
  }
  _fetchActive.add(section);
  crumb("ws", "_fetchBatch:start", { section });
  try {
    do {
      _fetchPending[section] = false;
      resumeFromEof(section);
      const { rows } = await loadPage(section);
      crumb("ws", "_fetchBatch:loaded", { section, rows: rows.length });
      window._T?.("WS", `batch-fetch ${section}: ${rows.length} rows from cache`);
      if (!rows.length) {
        if (_fetchPending[section]) continue;
        break;
      }
      for (const evt of rows) {
        if (evt.type === "started" || evt.type === "progress" || evt.type === "done") continue;
        pushEvent(section, evt.type, evt.data || {});
      }
      const SF = window._scanFilter;
      if (SF?.rebuild) SF.rebuild(section);
    } while (true);
  } catch (e) {
    window._T?.("WS", `batch-fetch ${section} error: ${e.message}`);
  } finally {
    _fetchActive.delete(section);
    delete _fetchPending[section];
    const deferred = _deferredDone[section];
    if (deferred) {
      delete _deferredDone[section];
      window._T?.("WS", `_fetchBatch: firing deferred ${deferred.type} for ${section}`);
      crumb("ws", "_fetchBatch:deferred-flush", { section, type: deferred.type });
      pushEvent(section, deferred.type, deferred.data);
    }
  }
}
function setConnStatus(text, connected) {
  const el = document.getElementById("connStatus");
  if (!el) return;
  el.textContent = text;
  el.className = connected ? "connected" : "disconnected";
}
async function _checkHttpEndpoint(currentPort) {
  try {
    const r = await fetch("/api/service/info", { signal: AbortSignal.timeout(4e3) });
    const json = await r.json();
    console.log("\u2705 HTTP Service Endpoint: PASS\n   Detail:", json);
    return { name: "HTTP Service Endpoint", status: "PASS", detail: `${r.status} ${r.statusText} | Uptime: ${json.uptime}` };
  } catch (e) {
    const msg = String(e.message);
    console.log("\u274C HTTP Service Endpoint: FAIL\n   Error:", msg);
    return { name: "HTTP Service Endpoint", status: "FAIL", detail: msg };
  }
}
function _checkWebSocket() {
  const wsStatus = _ws ? `ReadyState: ${_ws.readyState} (0=connecting, 1=open, 2=closing, 3=closed)` : "No connection object";
  const wsConnected = _ws?.readyState === WebSocket.OPEN;
  console.log(`${wsConnected ? "\u2705" : "\u23F3"} WebSocket Connection: ${wsStatus}
`);
  return { name: "WebSocket Connection", status: wsConnected ? "PASS" : "CONNECTING/FAILED", detail: wsStatus };
}
async function _checkAltPort(currentPort) {
  const altPort = currentPort === 5100 ? 5e3 : 5100;
  try {
    const r = await fetch(`http://localhost:${altPort}/api/service/info`, { signal: AbortSignal.timeout(3e3) });
    if (r.ok) {
      console.log(`\u26A0\uFE0F  Alternate Port ${altPort}: REACHABLE (possible port mismatch)
`);
      return { name: `Alternate Port (${altPort})`, status: "REACHABLE", detail: `Service running on wrong port? Try http://localhost:${altPort}` };
    }
  } catch {
  }
  console.log(`\u2705 Alternate Port ${altPort}: UNREACHABLE (correct)
`);
  return { name: `Alternate Port (${altPort})`, status: "UNREACHABLE", detail: "Both ports unavailable" };
}
function _checkEventQueue() {
  const q = window._eventQueue;
  const info = q ? { size: q?.length || 0, isProcessing: window._processingQueue ? true : false } : { size: "unknown", isProcessing: "unknown" };
  console.log(`\u{1F4CA} Event Queue: ${JSON.stringify(info)}
`);
  return { name: "Event Queue", status: "INFO", detail: `Queue length: ${info.size}, Processing: ${info.isProcessing}` };
}
function _checkBrowserConnectivity() {
  const isOnline = navigator.onLine;
  console.log(`${isOnline ? "\u2705" : "\u274C"} Browser Connectivity: ${isOnline ? "ONLINE" : "OFFLINE"}
`);
  return { name: "Browser Connectivity", status: isOnline ? "ONLINE" : "OFFLINE", detail: isOnline ? "Browser can reach network" : "Browser is offline" };
}
function _buildDiagSummary(checks) {
  const passCount = checks.filter((c) => c.status === "PASS" || c.status === "ONLINE").length;
  const failCount = checks.filter((c) => c.status === "FAIL" || c.status === "OFFLINE").length;
  if (passCount === checks.length) return "\u2705 All checks passed!";
  if (failCount > 0) return `\u274C ${failCount} check(s) failed`;
  return "\u23F3 Connection in progress (auto-reconnecting)";
}
async function runDiagnostics() {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  console.log("\u{1F50D} DiskCleanUp Diagnostics Starting...\n");
  const currentPort = parseInt(location.port || "5100", 10);
  console.log(`Current port: localhost:${currentPort}`);
  const checks = await Promise.all([
    _checkHttpEndpoint(currentPort),
    Promise.resolve(_checkWebSocket()),
    _checkAltPort(currentPort),
    Promise.resolve(_checkEventQueue()),
    Promise.resolve(_checkBrowserConnectivity())
  ]);
  const summary = _buildDiagSummary(checks);
  console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  console.log(summary);
  console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
  alert([
    "\u{1F50D} DiskCleanUp Diagnostics Results",
    "",
    ...checks.map((c) => `${c.name}: ${c.status}`),
    "",
    summary,
    "",
    "Full details in browser console (F12)"
  ].join("\n"));
  return { timestamp, checks, summary };
}
window._runDiagnostics = runDiagnostics;
export {
  setConnStatus,
  wsConnect,
  wsSend
};
