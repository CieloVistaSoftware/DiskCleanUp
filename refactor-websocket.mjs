import { readFileSync, writeFileSync } from 'fs';

const file = 'C:/Users/jwpmi/source/repos/DiskCleanUp/DiskCleanUp.Service/wwwroot/js/websocket.ts';
let src = readFileSync(file, 'utf8');

// ── Replace _showFatalError ───────────────────────────────────────────────────
const FE_START = 'async function _showFatalError() {';
const FE_END   = '\n// Scan timers removed';
const OLD_FE   = src.slice(src.indexOf(FE_START), src.indexOf(FE_END));

const NEW_FE = `// ── Fatal-error helpers ─────────────────────────────────────────────────────

async function _probeCurrentPort(): Promise<{ httpOk: boolean; httpDetail: string }> {
  let httpOk = false;
  let httpDetail = '';
  try {
    const r = await fetch('/api/service/info', { signal: AbortSignal.timeout(4000) });
    httpOk     = r.ok;
    httpDetail = \`HTTP \${r.status} \${r.statusText}\`;
  } catch (e) {
    httpDetail = String((e as Error).message);
  }
  return { httpOk, httpDetail };
}

async function _probeAltPort(httpOk: boolean, altPort: number): Promise<boolean> {
  if (httpOk) return false;
  try {
    const r = await fetch(\`http://localhost:\${altPort}/api/service/info\`,
                          { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch { return false; }
}

function _classifyWsFailure(httpOk: boolean, altPortOk: boolean, currentPort: number, altPort: number) {
  const isWsBroken     = httpOk;
  const isPortMismatch = !httpOk && altPortOk;
  const isServiceDown  = !httpOk && !altPortOk;
  let title: string;
  let reason: string;
  if (isWsBroken) {
    title  = '⚠️ WebSocket handshake failed';
    reason = \`The DiskCleanUp service on <b>\${location.host}</b> is responding to HTTP but the WebSocket handshake on <b>ws://\${location.host}/ws</b> did not complete.\\n\\nThe service may be mid-restart. Auto-reconnect is running — this usually clears itself within 30 seconds.\`;
  } else if (isPortMismatch) {
    title  = '⚠️ Browser is on the wrong port';
    reason = \`This tab is connected to <b>localhost:\${currentPort}</b> but the DiskCleanUp service is running on <b>localhost:\${altPort}</b>.\\n\\nThis happens when the dev console mode (:\${altPort}) and the Windows Service (:5100) are both present. Click "Switch to :\${altPort}" to load the correct dashboard.\`;
  } else {
    title  = '❌ Service is not responding';
    reason = \`The DiskCleanUp service on <b>localhost:\${currentPort}</b> did not respond after 15 seconds.\\n\\nThe Windows service may have crashed, failed to start, or is stuck.\\nAuto-reconnect is retrying in the background.\\n\\n<b>Quickest fix:</b> Right-click the DiskCleanUp tray icon → <i>Restart Service</i>.\`;
  }
  return { isWsBroken, isPortMismatch, isServiceDown, title, reason };
}

function _buildFatalOverlay(
  borderColor: string, title: string, reason: string,
  httpLine: string, retryBtn: string, restartBtn: string,
  switchBtn: string, dismissBtn: string, diagLink: string, stack: string
): HTMLElement {
  const overlay = document.createElement('div');
  overlay.id = 'ws-fatal-overlay';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:99999',
    'background:rgba(0,0,0,.82)', 'display:flex',
    'align-items:center', 'justify-content:center',
    'font-family:Segoe UI,sans-serif',
  ].join(';');
  overlay.innerHTML = \`
    <div style="background:#161b22;border:2px solid \${borderColor};border-radius:10px;
                max-width:700px;width:90vw;padding:28px 32px;box-shadow:0 16px 64px rgba(0,0,0,.9)">
      <div style="font-size:1.1rem;font-weight:700;color:\${borderColor};margin-bottom:10px">\${title}</div>
      <div style="color:#e6edf3;font-size:.9rem;line-height:1.65;white-space:pre-wrap;margin-bottom:14px">\${reason}</div>
      <div style="background:#0d1117;border:1px solid #30363d;border-radius:6px;
                  padding:9px 13px;font:11px/1.5 'Cascadia Code',monospace;color:#e3b341;
                  margin-bottom:14px">\${httpLine}</div>
      <details style="margin-bottom:18px">
        <summary style="cursor:pointer;color:#8b949e;font-size:.8rem;margin-bottom:6px">Stack trace</summary>
        <pre style="background:#0d1117;border:1px solid #30363d;border-radius:6px;
                    padding:9px 13px;font:11px/1.5 'Cascadia Code',monospace;
                    color:#8b949e;overflow:auto;max-height:200px;margin:0">\${stack}</pre>
      </details>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        \${retryBtn}\${restartBtn}\${switchBtn}\${dismissBtn}\${diagLink}
      </div>
      <div style="margin-top:12px;font-size:.8rem;color:#6e7681">
        Auto-reconnect is running in the background (0 → 2 → 5 → 10 → 20s backoff).
      </div>
    </div>\`;
  return overlay;
}

function _wireFatalHandlers(overlay: HTMLElement, altPort: number, isWsBroken: boolean, isPortMismatch: boolean) {
  document.getElementById('ws-fatal-retry')!.onclick = () => {
    overlay.remove();
    _fatalShown = false;
    _wsReconnectDelay = 0;
    wsConnect();
  };
  const restartEl = document.getElementById('ws-fatal-restart') as HTMLButtonElement | null;
  if (restartEl) restartEl.onclick = async () => {
    restartEl.disabled = true;
    restartEl.textContent = '⟳ Restarting…';
    try {
      await fetch('/api/restart', { method: 'POST', signal: AbortSignal.timeout(5000) });
    } catch { /* service restarts — fetch will fail, that's expected */ }
    setTimeout(() => {
      overlay.remove();
      _fatalShown = false;
      _wsReconnectDelay = 0;
      wsConnect();
    }, 3000);
  };
  const switchEl = document.getElementById('ws-fatal-switch');
  if (switchEl) switchEl.onclick = () => { window.location.href = \`http://localhost:\${altPort}\`; };
  document.getElementById('ws-fatal-dismiss')!.onclick = () => {
    overlay.remove();
    _fatalShown = false;
  };
}

async function _showFatalError() {
  if (_fatalShown) return;
  _fatalShown = true;

  const stack        = new Error('Connection failed').stack ?? '(stack unavailable)';
  const currentPort  = parseInt(location.port || '5100', 10);
  const altPort      = currentPort === 5100 ? 5000 : 5100;

  const { httpOk, httpDetail } = await _probeCurrentPort();
  const altPortOk              = await _probeAltPort(httpOk, altPort);

  const { isWsBroken, isPortMismatch, isServiceDown, title, reason } =
    _classifyWsFailure(httpOk, altPortOk, currentPort, altPort);

  const httpLine   = isPortMismatch
    ? \`Current port :\${currentPort} — no response | Alternate port :\${altPort} — ✓ alive\`
    : \`HTTP probe :\${currentPort}: \${httpDetail || 'no response'}\`;
  const borderColor = isServiceDown ? '#f85149' : '#e3b341';

  const retryBtn   = \`<button id="ws-fatal-retry" style="background:#58a6ff;color:#000;border:none;padding:8px 20px;border-radius:6px;font-size:.9rem;font-weight:700;cursor:pointer">↺ Retry Now</button>\`;
  const restartBtn = isWsBroken
    ? \`<button id="ws-fatal-restart" style="background:#f0883e;color:#000;border:none;padding:8px 20px;border-radius:6px;font-size:.9rem;font-weight:700;cursor:pointer">⟳ Restart Service</button>\`
    : '';
  const switchBtn  = isPortMismatch
    ? \`<button id="ws-fatal-switch" style="background:#3fb950;color:#000;border:none;padding:8px 20px;border-radius:6px;font-size:.9rem;font-weight:700;cursor:pointer">→ Switch to :\${altPort}</button>\`
    : '';
  const dismissBtn = \`<button id="ws-fatal-dismiss" style="background:#30363d;color:#e6edf3;border:none;padding:8px 20px;border-radius:6px;font-size:.9rem;cursor:pointer">Dismiss</button>\`;
  const diagLink   = \`<a href="/ws-diagram.html" target="_blank" style="color:#8b949e;font-size:.8rem;text-decoration:none;align-self:center">📐 Connection diagram</a>\`;

  const overlay = _buildFatalOverlay(borderColor, title, reason, httpLine,
    retryBtn, restartBtn, switchBtn, dismissBtn, diagLink, stack);
  document.body.appendChild(overlay);
  _wireFatalHandlers(overlay, altPort, isWsBroken, isPortMismatch);

  setConnStatus('❌ Failed', false);
  const caseTag = isWsBroken ? 'WS_BROKEN' : isPortMismatch ? 'PORT_MISMATCH' : 'BACKEND_DOWN';
  window._T?.('WS', \`fatal: \${title} | \${httpLine} | case=\${caseTag}\`);
  ErrLog.log('[ws]', title, stack, caseTag);
}`;

if (!src.includes(FE_START)) { console.error('FE startMark not found'); process.exit(1); }
if (src.indexOf(FE_END) === -1) { console.error('FE endMark not found'); process.exit(1); }
src = src.replace(OLD_FE, NEW_FE);

// ── Replace wsConnect ─────────────────────────────────────────────────────────
const WC_START = 'export function wsConnect() {';
const WC_END   = '\n// ── Batch fetcher';
const OLD_WC   = src.slice(src.indexOf(WC_START), src.indexOf(WC_END));

const NEW_WC = `// ── wsConnect helpers ───────────────────────────────────────────────────────

function _handleWsOpen(wsRef: { ws: WebSocket | null }, watchdogTimer: { val: ReturnType<typeof setInterval> | null }) {
  clearTimeout(_connectTimer);
  _wsReconnectDelay = 0;
  setConnStatus('⚡ Live', true);
  window._T?.('WS', 'connected');
  const overlay = document.getElementById('ws-fatal-overlay');
  if (overlay) overlay.remove();
  _fatalShown = false;
  if (watchdogTimer.val !== null) { clearInterval(watchdogTimer.val); watchdogTimer.val = null; }
}

function _handleWsClose(ev: CloseEvent, oncloseCalledRef: { called: boolean }) {
  oncloseCalledRef.called = true;
  clearTimeout(_connectTimer);
  setConnStatus('⚡ Reconnecting…', false);
  ErrLog.log('[ws]',
    ev.wasClean ? 'WebSocket closed cleanly' : \`WebSocket dropped (code \${ev.code})\`,
    null, ev.wasClean ? 'WS_CLOSED' : 'WS_RECONNECTING');
  const delay = _wsDelays[Math.min(_wsReconnectDelay++, _wsDelays.length - 1)]
                + Math.floor(Math.random() * 1000);
  setTimeout(wsConnect, delay);
}

function _handleWsMessage(ev: MessageEvent, section: string) {
  _wsMsgCount++;
  Metrics.markAlive();
  let msg: any;
  try { msg = JSON.parse(ev.data); } catch { return; }

  if (msg.section === 'metrics' && msg.type === 'update') {
    if (_wsMsgCount <= 3 || _wsMsgCount % 500 === 0)
      window._T?.('WS', \`metrics #\${_wsMsgCount}\`);
    Metrics.update(msg.data || {});
    return;
  }
  if (msg.type === 'batch-ready') {
    _wsScanMsgCount++;
    crumb('ws', 'batch-ready', { section: msg.section, count: msg.data?.count });
    window._T?.('WS', \`batch-ready \${msg.section} (\${msg.data?.count} rows)\`);
    _fetchBatch(msg.section);
    return;
  }
  if (msg.type === 'started') {
    crumb('ws', 'started', { section: msg.section });
    resetPaging(msg.section);
    delete _deferredDone[msg.section];
  }
  if ((msg.type === 'done' || msg.type === 'error') && _fetchActive.has(msg.section)) {
    _wsScanMsgCount++;
    crumb('ws', 'deferred', { section: msg.section, type: msg.type });
    window._T?.('WS', \`deferring \${msg.type} for \${msg.section} until fetch drains\`);
    _deferredDone[msg.section] = { type: msg.type, data: msg.data };
    return;
  }
  _wsScanMsgCount++;
  crumb('ws', 'pushEvent', { section: msg.section, type: msg.type });
  if (_wsScanMsgCount <= 20 || _wsScanMsgCount % 100 === 0)
    window._T?.('WS', \`scan#\${_wsScanMsgCount} \${msg.section}:\${msg.type}\`);
  pushEvent(msg.section, msg.type, msg.data);
}

let _wsMsgCount = 0;
let _wsScanMsgCount = 0;

export function wsConnect() {
  setConnStatus('⚡ Connecting…', false);
  _lastWsStatusTime = Date.now();
  _startWatchdog();

  const wsScheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = \`\${wsScheme}://\${location.host}/ws\`;
  try {
    _ws = new WebSocket(wsUrl);
  } catch (ex) {
    ErrLog.log('[ws]', \`WebSocket constructor failed: \${wsUrl}\`, (ex as Error)?.stack || null, 'WS_CONSTRUCTOR_FAILED');
    setConnStatus('⚡ Reconnecting…', false);
    const delay = _wsDelays[Math.min(_wsReconnectDelay++, _wsDelays.length - 1)]
                  + Math.floor(Math.random() * 1000);
    setTimeout(wsConnect, delay);
    return;
  }

  clearTimeout(_connectTimer);
  const oncloseCalledRef = { called: false };
  const watchdogTimer    = { val: _watchdogTimer };
  _connectTimer = setTimeout(() => {
    window._T?.('WS', 'connect timeout — probing backend');
    try { _ws?.close(); } catch (ex) {
      ErrLog.log('[WEBSOCKET]', (ex as Error).message, (ex as Error).stack, 'CAUGHT_ERROR');
    }
    _showFatalError();
    setTimeout(() => {
      if (!oncloseCalledRef.called) {
        window._T?.('WS', 'WARNING: onclose not fired after close(), forcing reconnect');
        _ws = null;
        _wsReconnectDelay = 0;
        wsConnect();
      }
    }, 2000);
  }, WS_CONNECT_TIMEOUT);

  _ws.onopen  = () => _handleWsOpen({ ws: _ws }, watchdogTimer);
  _ws.onclose = (ev) => _handleWsClose(ev, oncloseCalledRef);
  _ws.onerror = () => { /* onclose fires immediately after */ };
  _ws.onmessage = (ev) => _handleWsMessage(ev, '');
}`;

if (!src.includes(WC_START)) { console.error('WC startMark not found'); process.exit(1); }
if (src.indexOf(WC_END) === -1) { console.error('WC endMark not found'); process.exit(1); }
src = src.replace(OLD_WC, NEW_WC);

// ── Replace runDiagnostics ────────────────────────────────────────────────────
const RD_START = 'async function runDiagnostics() {';
const RD_END   = '\n// Expose diagnostic function';
const OLD_RD   = src.slice(src.indexOf(RD_START), src.indexOf(RD_END));

const NEW_RD = `// ── Diagnostics helpers ─────────────────────────────────────────────────────

async function _checkHttpEndpoint(currentPort: number) {
  try {
    const r = await fetch('/api/service/info', { signal: AbortSignal.timeout(4000) });
    const json = await r.json();
    console.log('✅ HTTP Service Endpoint: PASS\\n   Detail:', json);
    return { name: 'HTTP Service Endpoint', status: 'PASS', detail: \`\${r.status} \${r.statusText} | Uptime: \${json.uptime}\` };
  } catch (e) {
    const msg = String((e as Error).message);
    console.log('❌ HTTP Service Endpoint: FAIL\\n   Error:', msg);
    return { name: 'HTTP Service Endpoint', status: 'FAIL', detail: msg };
  }
}

function _checkWebSocket() {
  const wsStatus = _ws
    ? \`ReadyState: \${_ws.readyState} (0=connecting, 1=open, 2=closing, 3=closed)\`
    : 'No connection object';
  const wsConnected = _ws?.readyState === WebSocket.OPEN;
  console.log(\`\${wsConnected ? '✅' : '⏳'} WebSocket Connection: \${wsStatus}\\n\`);
  return { name: 'WebSocket Connection', status: wsConnected ? 'PASS' : 'CONNECTING/FAILED', detail: wsStatus };
}

async function _checkAltPort(currentPort: number) {
  const altPort = currentPort === 5100 ? 5000 : 5100;
  try {
    const r = await fetch(\`http://localhost:\${altPort}/api/service/info\`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      console.log(\`⚠️  Alternate Port \${altPort}: REACHABLE (possible port mismatch)\\n\`);
      return { name: \`Alternate Port (\${altPort})\`, status: 'REACHABLE', detail: \`Service running on wrong port? Try http://localhost:\${altPort}\` };
    }
  } catch { /* unreachable is correct */ }
  console.log(\`✅ Alternate Port \${altPort}: UNREACHABLE (correct)\\n\`);
  return { name: \`Alternate Port (\${altPort})\`, status: 'UNREACHABLE', detail: 'Both ports unavailable' };
}

function _checkEventQueue() {
  const q = window._eventQueue as any;
  const info = q ? { size: q?.length || 0, isProcessing: window._processingQueue ? true : false }
                 : { size: 'unknown', isProcessing: 'unknown' };
  console.log(\`📊 Event Queue: \${JSON.stringify(info)}\\n\`);
  return { name: 'Event Queue', status: 'INFO', detail: \`Queue length: \${info.size}, Processing: \${info.isProcessing}\` };
}

function _checkBrowserConnectivity() {
  const isOnline = navigator.onLine;
  console.log(\`\${isOnline ? '✅' : '❌'} Browser Connectivity: \${isOnline ? 'ONLINE' : 'OFFLINE'}\\n\`);
  return { name: 'Browser Connectivity', status: isOnline ? 'ONLINE' : 'OFFLINE', detail: isOnline ? 'Browser can reach network' : 'Browser is offline' };
}

function _buildDiagSummary(checks: Array<{ name: string; status: string; detail: string }>) {
  const passCount = checks.filter(c => c.status === 'PASS' || c.status === 'ONLINE').length;
  const failCount = checks.filter(c => c.status === 'FAIL' || c.status === 'OFFLINE').length;
  if (passCount === checks.length)     return '✅ All checks passed!';
  if (failCount > 0)                   return \`❌ \${failCount} check(s) failed\`;
  return '⏳ Connection in progress (auto-reconnecting)';
}

async function runDiagnostics() {
  const timestamp = new Date().toISOString();
  console.log('🔍 DiskCleanUp Diagnostics Starting...\\n');
  const currentPort = parseInt(location.port || '5100', 10);
  console.log(\`Current port: localhost:\${currentPort}\`);

  const checks = await Promise.all([
    _checkHttpEndpoint(currentPort),
    Promise.resolve(_checkWebSocket()),
    _checkAltPort(currentPort),
    Promise.resolve(_checkEventQueue()),
    Promise.resolve(_checkBrowserConnectivity()),
  ]);

  const summary = _buildDiagSummary(checks);
  console.log('════════════════════════════════════════');
  console.log(summary);
  console.log('════════════════════════════════════════\\n');

  alert([
    '🔍 DiskCleanUp Diagnostics Results', '',
    ...checks.map(c => \`\${c.name}: \${c.status}\`),
    '', summary, '', 'Full details in browser console (F12)'
  ].join('\\n'));

  return { timestamp, checks, summary };
}`;

if (!src.includes(RD_START)) { console.error('RD startMark not found'); process.exit(1); }
if (src.indexOf(RD_END) === -1) { console.error('RD endMark not found'); process.exit(1); }
src = src.replace(OLD_RD, NEW_RD);

// Also remove the now-duplicate let _wsMsgCount / _wsScanMsgCount that were inside wsConnect
// (they were local vars moved to module scope in the refactor above)
// The old declarations inside the original onmessage closure are gone; nothing to remove.

writeFileSync(file, src, 'utf8');
console.log('Done. websocket.ts refactored: _showFatalError, wsConnect, runDiagnostics.');
