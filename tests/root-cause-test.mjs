/**
 * root-cause-test.mjs
 *
 * Pinpoints EXACTLY what causes the browser hang.
 *
 * Theory from hang-test.log:
 *   - First freeze = 14,811ms at ping#2 = BEFORE scan button is clicked
 *   - Scan button clicked at t+20764ms
 *   - Therefore: restoreCachedResults() is the culprit, not the live scan
 *
 * This test proves it by:
 *   1. Test A — Fresh page (no cache): scan only. Measures freeze during scan.
 *   2. Test B — Page reload (cache exists): measures freeze during restore.
 *   3. Instruments restoreCachedResults and _drainQueue in the page to get
 *      per-section timing and queue depths.
 *
 * Run: node tests/root-cause-test.mjs
 * Requires: dotnet run already at http://localhost:5000
 */

import { chromium } from 'playwright';
import { writeFileSync, appendFileSync } from 'fs';

const BASE    = 'http://localhost:5000';
const LOGFILE = 'tests/root-cause-test.log';

writeFileSync(LOGFILE, `=== root-cause-test started ${new Date().toISOString()} ===\n`);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(LOGFILE, line + '\n');
}

function section(title) {
  log('');
  log('═'.repeat(60));
  log(`  ${title}`);
  log('═'.repeat(60));
}

// ── Ping monitor — returns { maxMs, freezeCount, firstFreezeMs } ──────────
async function runPingMonitor(page, durationMs, label) {
  let maxMs = 0, freezeCount = 0, firstFreezeMs = null;
  const start = Date.now();
  const deadline = Date.now() + durationMs;

  while (Date.now() < deadline) {
    const t0 = Date.now();
    try {
      await page.evaluate(() => document.title);
    } catch { break; }
    const ms = Date.now() - t0;
    if (ms > maxMs) maxMs = ms;
    if (ms > 100) {
      freezeCount++;
      if (!firstFreezeMs) firstFreezeMs = ms;
      log(`  [${label}] ❌ FREEZE ${ms}ms  elapsed=${Date.now()-start}ms`);
    }
    await new Promise(r => setTimeout(r, 50));
  }
  return { maxMs, freezeCount, firstFreezeMs };
}

// ── Instrument the page ───────────────────────────────────────────────────
async function instrumentPage(page) {
  await page.exposeFunction('__rcLog', msg => log(`  [page] ${msg}`));

  await page.evaluate(() => {
    // ── Instrument restoreCachedResults ──────────────────────────────────
    // It's defined in the inline script, so we wrap conn.invoke to intercept
    // the GetCachedResults calls and time them.
    const origInvoke = window.conn?.invoke?.bind(window.conn);
    if (!origInvoke) { window.__rcLog('conn.invoke not found'); return; }

    window.conn.invoke = async function(method, ...args) {
      if (method !== 'GetCachedResults') return origInvoke(method, ...args);

      const section = args[0];
      const t0 = performance.now();
      const result = await origInvoke(method, ...args);
      const fetchMs = (performance.now() - t0).toFixed(1);

      const count = Array.isArray(result) ? result.length : 0;
      window.__rcLog(`GetCachedResults("${section}") → ${count} events, fetch took ${fetchMs}ms`);

      if (count > 0) {
        // Time the forEach processing
        const t1 = performance.now();
        // We can't re-run the original forEach, but we can time a dry-run
        // of pushing to a local array to measure pure JS cost
        const dummy = [];
        result.forEach(evt => dummy.push({ section, type: evt.type, data: evt.data || {} }));
        const forEachMs = (performance.now() - t1).toFixed(1);
        window.__rcLog(`  forEach over ${count} events took ${forEachMs}ms (main thread blocked)`);

        if (parseFloat(forEachMs) > 50) {
          window.__rcLog(`  ⚠️  THIS IS THE HANG: ${forEachMs}ms synchronous forEach`);
        }
      }

      return result;
    };

    window.__rcLog('conn.invoke instrumented for GetCachedResults timing');

    // ── Instrument _drainQueue ────────────────────────────────────────────
    // It's not on window, but we can monitor _eventQueue via polling
    let lastQueueLen = 0;
    setInterval(() => {
      const q = window._eventQueue;
      if (!q) return;
      if (q.length !== lastQueueLen) {
        if (q.length > 200 && lastQueueLen <= 200) {
          window.__rcLog(`⚠️  eventQueue depth spiked to ${q.length} — main thread may freeze`);
        }
        lastQueueLen = q.length;
      }
    }, 100);

    window.__rcLog('queue monitor active');
  });
}

// ─────────────────────────────────────────────────────────────────────────
//  TEST A: Scan-only (no cache)
//  Clear cache first, then run scan, measure freezes during scan only
// ─────────────────────────────────────────────────────────────────────────
section('TEST A — LIVE SCAN (no cached results)');
log('Clearing scan cache via API...');

try {
  const r = await fetch(`${BASE}/api/scan-cache/duplicates`, { method: 'DELETE' }).catch(() => null);
  log(r ? `Cache clear response: ${r.status}` : 'Cache clear endpoint not available — will proceed anyway');
} catch {}

const browserA = await chromium.launch({ headless: true });
const pageA    = await browserA.newPage();
pageA.on('pageerror', e => log(`[pageerror] ${e.message}`));
pageA.on('console',  m => { if (m.type() === 'error') log(`[console-error] ${m.text()}`); });

log('Navigating...');
await pageA.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 10_000 });
await pageA.waitForFunction(
  () => document.getElementById('connStatus')?.className === 'connected',
  { timeout: 10_000 }
);
log('Connected. Instrumenting...');
await instrumentPage(pageA);

// Click scan
await pageA.click('nav button:first-child');
await pageA.waitForTimeout(300);

log('Starting ping monitor for 5 seconds BEFORE clicking scan...');
const preClickResult = await runPingMonitor(pageA, 5000, 'pre-scan');
log(`Pre-scan baseline: maxPing=${preClickResult.maxMs}ms, freezes=${preClickResult.freezeCount}`);

log('Clicking Scan...');
const scanClickTime = Date.now();
await pageA.click('button.btn:has-text("Scan")');

log('Monitoring 30s during live scan...');
const scanResult = await runPingMonitor(pageA, 30_000, 'live-scan');

const scanRows = await pageA.evaluate(
  () => document.querySelectorAll('#dupTable tbody tr').length
);

log('');
log(`TEST A RESULTS:`);
log(`  Pre-scan max ping : ${preClickResult.maxMs}ms`);
log(`  Scan max ping     : ${scanResult.maxMs}ms`);
log(`  Scan freezes      : ${scanResult.freezeCount}`);
log(`  First freeze      : ${scanResult.firstFreezeMs ?? 'NONE'}ms`);
log(`  Rows rendered     : ${scanRows}`);

if (preClickResult.maxMs > 100) {
  log(`  ⚠️  HANG CONFIRMED in pre-scan phase = restoreCachedResults`);
} else if (scanResult.maxMs > 100) {
  log(`  ⚠️  HANG in live scan phase = RAF drain loop`);
} else {
  log(`  ✅ No hang detected`);
}

await browserA.close();

// ─────────────────────────────────────────────────────────────────────────
//  TEST B: Reload (cache exists from Test A scan)
//  Load page fresh after scan data is cached — measure restore freeze
// ─────────────────────────────────────────────────────────────────────────
section('TEST B — PAGE RELOAD WITH CACHED RESULTS');
log('Opening fresh browser (cache should exist from Test A)...');

const browserB = await chromium.launch({ headless: true });
const pageB    = await browserB.newPage();
pageB.on('pageerror', e => log(`[pageerror] ${e.message}`));
pageB.on('console',  m => { if (m.type() === 'error') log(`[console-error] ${m.text()}`); });

log('Navigating...');
const navStart = Date.now();
await pageB.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 10_000 });
await pageB.waitForFunction(
  () => document.getElementById('connStatus')?.className === 'connected',
  { timeout: 10_000 }
);
const connectedMs = Date.now() - navStart;
log(`Connected in ${connectedMs}ms. Instrumenting...`);
await instrumentPage(pageB);

log('Monitoring 20s immediately after page load (restoreCachedResults fires now)...');
const restoreResult = await runPingMonitor(pageB, 20_000, 'restore');

const restoreRows = await pageB.evaluate(
  () => document.querySelectorAll('#dupTable tbody tr').length
);
const restoreStatus = await pageB.evaluate(
  () => document.getElementById('sbv-duplicates-status')?.textContent
);

log('');
log(`TEST B RESULTS:`);
log(`  Restore max ping  : ${restoreResult.maxMs}ms`);
log(`  Restore freezes   : ${restoreResult.freezeCount}`);
log(`  First freeze      : ${restoreResult.firstFreezeMs ?? 'NONE'}ms`);
log(`  Rows restored     : ${restoreRows}`);
log(`  Status bar        : ${restoreStatus}`);

if (restoreResult.maxMs > 100) {
  log(`  ⚠️  ROOT CAUSE CONFIRMED: restoreCachedResults hangs browser`);
  log(`  FIX NEEDED: chunk the forEach in restoreCachedResults with yield`);
} else {
  log(`  ✅ No hang on restore`);
}

await browserB.close();

// ─────────────────────────────────────────────────────────────────────────
//  SUMMARY
// ─────────────────────────────────────────────────────────────────────────
section('SUMMARY');
log(`Test A (live scan)    : maxPing=${scanResult.maxMs}ms, freezes=${scanResult.freezeCount}`);
log(`Test B (cache restore): maxPing=${restoreResult.maxMs}ms, freezes=${restoreResult.freezeCount}`);
log('');

if (restoreResult.maxMs > scanResult.maxMs) {
  log('ROOT CAUSE = restoreCachedResults (cache restore is worse than live scan)');
  log('FIX: chunk the forEach loop in restoreCachedResults using setTimeout(0) every 50 items');
} else if (scanResult.maxMs > 100) {
  log('ROOT CAUSE = live scan drain loop (RAF batching not working)');
  log('FIX: reduce BATCH_SIZE in _drainQueue or add DocumentFragment batching');
} else {
  log('No hang detected in either test — may need larger dataset to reproduce');
}

log('');
log(`Full log: ${LOGFILE}`);
process.exit(0);
