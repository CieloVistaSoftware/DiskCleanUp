/**
 * SignalR smoke test — verifies:
 *   1. Server is reachable at http://localhost:5000
 *   2. SignalR hub connects at /scanhub
 *   3. MetricsUpdate fires within 10s with valid cpu_pct and mem_pct
 *   4. StartScan('stale') can be invoked without throwing
 *   5. ScanEvent fires after StartScan
 *
 * Run after `dotnet run` is up:
 *   node tests/signalr-smoke-test.mjs
 */

import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';

const BASE_URL   = 'http://localhost:5000';
const TIMEOUT_MS = 10_000;

let passed = 0;
let failed = 0;

function pass(msg) { console.log(`  ✅ PASS: ${msg}`); passed++; }
function fail(msg) { console.error(`  ❌ FAIL: ${msg}`); failed++; }

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms — ${label}`)), ms)
    )
  ]);
}

// ── 1. HTTP reachability ─────────────────────────────────────────────────
console.log('\n── Test 1: HTTP reachability ──');
try {
  const res = await fetch(`${BASE_URL}/api/config`);
  if (res.ok) pass(`GET /api/config → HTTP ${res.status}`);
  else        fail(`GET /api/config → HTTP ${res.status}`);
} catch (e) {
  fail(`Server not reachable at ${BASE_URL}: ${e.message}`);
  console.error('\n  ⚠️  Is dotnet run running? Aborting remaining tests.');
  process.exit(1);
}

// ── 2. SignalR connection ─────────────────────────────────────────────────
console.log('\n── Test 2: SignalR connection ──');
const conn = new HubConnectionBuilder()
  .withUrl(`${BASE_URL}/scanhub`)
  .configureLogging(LogLevel.Error)
  .withAutomaticReconnect()
  .build();

try {
  await withTimeout(conn.start(), 5000, 'hub connect');
  pass('Hub connected');
} catch (e) {
  fail(`Hub connect failed: ${e.message}`);
  process.exit(1);
}

// ── 3. MetricsUpdate fires with valid data ────────────────────────────────
console.log('\n── Test 3: MetricsUpdate fires within 10s ──');
try {
  const data = await withTimeout(
    new Promise(resolve => conn.on('MetricsUpdate', resolve)),
    TIMEOUT_MS,
    'MetricsUpdate'
  );

  if (typeof data.cpu_pct === 'number') pass(`cpu_pct is number (${data.cpu_pct}%)`);
  else                                   fail(`cpu_pct missing or wrong type: ${JSON.stringify(data)}`);

  if (typeof data.mem_pct === 'number') pass(`mem_pct is number (${data.mem_pct}%)`);
  else                                   fail(`mem_pct missing or wrong type: ${JSON.stringify(data)}`);

  if (data.cpu_pct >= 0 && data.cpu_pct <= 100) pass('cpu_pct in valid range [0,100]');
  else                                            fail(`cpu_pct out of range: ${data.cpu_pct}`);

  if (data.mem_pct >= 0 && data.mem_pct <= 100) pass('mem_pct in valid range [0,100]');
  else                                            fail(`mem_pct out of range: ${data.mem_pct}`);

} catch (e) {
  fail(`MetricsUpdate never received: ${e.message}`);
}

// ── 4. StartScan invocation doesn't throw ────────────────────────────────
console.log('\n── Test 4: StartScan invocation ──');
try {
  await withTimeout(conn.invoke('StartScan', 'stale'), 5000, 'StartScan');
  pass('StartScan("stale") invoked without error');
} catch (e) {
  fail(`StartScan threw: ${e.message}`);
}

// ── 5. ScanEvent fires after StartScan ───────────────────────────────────
console.log('\n── Test 5: ScanEvent fires after StartScan ──');
try {
  const evt = await withTimeout(
    new Promise(resolve =>
      conn.on('ScanEvent', (section, type, data) => resolve({ section, type, data }))
    ),
    TIMEOUT_MS,
    'ScanEvent'
  );
  if (evt.section === 'stale') pass(`ScanEvent section = "${evt.section}"`);
  else                         fail(`ScanEvent section wrong: "${evt.section}"`);

  if (typeof evt.type === 'string') pass(`ScanEvent type = "${evt.type}"`);
  else                              fail(`ScanEvent type missing`);

} catch (e) {
  fail(`ScanEvent never received: ${e.message}`);
}

// ── Done ─────────────────────────────────────────────────────────────────
await conn.stop();

console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
process.exit(failed > 0 ? 1 : 0);
