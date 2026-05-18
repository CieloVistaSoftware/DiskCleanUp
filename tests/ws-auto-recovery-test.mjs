/**
 * ws-auto-recovery-test.mjs
 *
 * Issue: DiskCleanUp Dashboard gets stuck at "Connecting..." after a WebSocket
 * failure and never auto-recovers — or the fatal overlay persists even after
 * the server comes back.
 *
 * Root causes (from ws-diagram.html connection chain analysis):
 *
 *   Case A — WS broken, HTTP alive:
 *     Service up but /ws handshake failed (mid-restart, route issue).
 *     Fix: "Restart Service" button → POST /api/restart → auto-reconnect.
 *
 *   Case B — Port mismatch:
 *     Browser on wrong port (:5000 dev vs :5100 prod, or vice versa).
 *     Fix: probe alternate port → "Switch to :PORT" redirect button.
 *
 *   Case C — Service down:
 *     Nothing responds. Fix: tray "Restart Service" guidance + auto-backoff.
 *
 *   Plus three foundational fixes:
 *   4. onopen() must clear the overlay — reconnect loop can succeed while overlay is up
 *   5. Dismiss must reset _fatalShown — so future failures still show the panel
 *   6. wsConnect() must set "Connecting…" status at the start
 *   7. WsManager bare catch{} silently swallows exceptions → add ILogger
 *   8. KeepAliveInterval = TimeSpan.Zero → TCP silent drops undetected
 *
 * This test verifies ALL fixes are present in the source files.
 * Run: node tests/ws-auto-recovery-test.mjs
 */

'use strict';

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir  = dirname(fileURLToPath(import.meta.url));
const ROOT   = resolve(__dir, '..');

const WS_TS  = readFileSync(resolve(ROOT, 'DiskCleanUp.Service/wwwroot/js/websocket.ts'), 'utf8');
const WS_CS  = readFileSync(resolve(ROOT, 'DiskCleanUp.Service/Services/WsManager.cs'), 'utf8');
const PROG   = readFileSync(resolve(ROOT, 'DiskCleanUp.Service/Program.cs'), 'utf8');

let passed = 0, failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  PASS  ${name}`);
        passed++;
    } catch (err) {
        console.error(`  FAIL  ${name}`);
        console.error(`        ${err.message}`);
        failed++;
    }
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

console.log('WS Auto-Recovery — source checks (diagram-informed)');
console.log('─'.repeat(60));

// ─── Case A: WS broken, HTTP alive ──────────────────────────────────────

test('Case A — "Restart Service" button rendered when HTTP is up but WS failed', () => {
    // ws-fatal-restart button must exist in the overlay template
    assert(
        WS_TS.includes('ws-fatal-restart'),
        'No ws-fatal-restart button — Case A (WS broken, service up) has no repair path'
    );
});

test('Case A — Restart Service calls POST /api/restart', () => {
    // Search specifically for the onclick handler (not the HTML template declaration)
    const handlerIdx = WS_TS.indexOf("getElementById('ws-fatal-restart')");
    assert(handlerIdx !== -1, "getElementById('ws-fatal-restart') onclick handler not found in websocket.ts");
    const block = WS_TS.slice(handlerIdx, handlerIdx + 600);
    assert(
        block.includes('/api/restart'),
        'ws-fatal-restart handler does not call /api/restart — service cannot be restarted from overlay'
    );
});

// ─── Case B: Port mismatch ───────────────────────────────────────────────

test('Case B — alternate port is probed when current port does not respond', () => {
    assert(
        WS_TS.includes('altPort') || WS_TS.includes('alt_port') || WS_TS.includes('altPortOk'),
        '_showFatalError does not probe the alternate port — port-mismatch case (:5000↔:5100) never detected'
    );
});

test('Case B — "Switch to :PORT" redirect button rendered when alternate port is alive', () => {
    assert(
        WS_TS.includes('ws-fatal-switch'),
        'No ws-fatal-switch button — Case B (wrong port) has no redirect path'
    );
});

test('Case B — Switch button navigates to the alternate port', () => {
    const handlerIdx = WS_TS.indexOf("getElementById('ws-fatal-switch')");
    assert(handlerIdx !== -1, "getElementById('ws-fatal-switch') onclick handler not found in websocket.ts");
    const block = WS_TS.slice(handlerIdx, handlerIdx + 300);
    assert(
        block.includes('location.href') || block.includes('window.location'),
        'ws-fatal-switch handler does not redirect — port switch does nothing'
    );
});

// ─── Foundational fixes ───────────────────────────────────────────────────

test('onopen removes #ws-fatal-overlay when it exists', () => {
    const openIdx  = WS_TS.indexOf('_ws.onopen');
    assert(openIdx !== -1, '_ws.onopen not found in websocket.ts');
    const openBody = WS_TS.slice(openIdx, openIdx + 600);
    assert(
        openBody.includes('ws-fatal-overlay') || openBody.includes('wsFatalOverlay'),
        'onopen does not remove the fatal overlay — overlay stays after successful reconnect'
    );
});

test('onopen resets _fatalShown = false', () => {
    const openIdx  = WS_TS.indexOf('_ws.onopen');
    assert(openIdx !== -1, '_ws.onopen not found');
    const openBody = WS_TS.slice(openIdx, openIdx + 600);
    assert(
        openBody.includes('_fatalShown = false'),
        'onopen does not reset _fatalShown — future connection drops will not show the error panel'
    );
});

test('wsConnect() sets status to "Connecting…" before creating the WebSocket', () => {
    const fnIdx  = WS_TS.indexOf('export function wsConnect');
    assert(fnIdx !== -1, 'wsConnect not found');
    const fnBody = WS_TS.slice(fnIdx, fnIdx + 300);
    assert(
        fnBody.includes('Connecting'),
        'wsConnect() does not set "Connecting…" status — status bar is stale during reconnect'
    );
});

test('Dismiss button handler resets _fatalShown = false', () => {
    const handlerIdx = WS_TS.indexOf("getElementById('ws-fatal-dismiss').onclick");
    assert(handlerIdx !== -1, "getElementById('ws-fatal-dismiss').onclick not found in websocket.ts");
    const dismissBlock = WS_TS.slice(handlerIdx, handlerIdx + 300);
    assert(
        dismissBlock.includes('_fatalShown = false'),
        'Dismiss button handler does not reset _fatalShown — next failure will not show the error panel'
    );
});

test('Overlay shows auto-reconnect backoff note (users know recovery is automatic)', () => {
    assert(
        WS_TS.includes('backoff') || WS_TS.includes('Auto-reconnect'),
        'Overlay does not mention auto-reconnect backoff — users think they must act manually'
    );
});

// ─── WsManager.cs checks ─────────────────────────────────────────────────

test('WsManager.HandleAsync outer catch logs exception (not bare catch{})', () => {
    const handleIdx = WS_CS.indexOf('public async Task HandleAsync');
    assert(handleIdx !== -1, 'HandleAsync not found in WsManager.cs');
    const handleBody = WS_CS.slice(handleIdx, handleIdx + 2000);
    assert(
        handleBody.includes('_logger') || handleBody.includes('fileLogger') || handleBody.includes('Log('),
        'WsManager.HandleAsync outer catch does not log — exceptions are silently swallowed'
    );
});

// ─── Program.cs checks ───────────────────────────────────────────────────

test('WebSocketOptions.KeepAliveInterval is not TimeSpan.Zero', () => {
    assert(
        !PROG.includes('KeepAliveInterval = TimeSpan.Zero'),
        'KeepAliveInterval is still TimeSpan.Zero — silent TCP drops go undetected by the server'
    );
});

test('WebSocketOptions.KeepAliveInterval is set to a positive value (e.g. FromSeconds)', () => {
    assert(
        PROG.includes('KeepAliveInterval') && (PROG.includes('FromSeconds') || PROG.includes('FromMinutes')),
        'KeepAliveInterval is not set to a positive interval — server cannot detect dead sockets'
    );
});

// ─── Summary ─────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
    console.log(`✓ All ${passed} checks passed — WS auto-recovery is properly implemented.`);
    process.exit(0);
} else {
    console.error(`✗ ${failed} of ${passed + failed} checks FAILED — auto-recovery fixes are missing.`);
    process.exit(1);
}
