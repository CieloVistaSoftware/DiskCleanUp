/**
 * hang-test.mjs
 * Clicks Scan, pings the page every 100ms, logs results to tests/hang-test.log.
 * You can tail -f the log at any time to see live progress.
 * Run: node tests/hang-test.mjs
 * Requires: dotnet run already started at http://localhost:5000
 */
import { chromium } from 'playwright';
import { writeFileSync, appendFileSync } from 'fs';

const BASE    = 'http://localhost:5000';
const LOGFILE = 'tests/hang-test.log';

// Wipe log at start, then every log() call flushes immediately to disk
writeFileSync(LOGFILE, `=== hang-test started ${new Date().toISOString()} ===\n`);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(LOGFILE, line + '\n');  // sync = always on disk, even if process dies
}

log('Launching browser...');
const browser = await chromium.launch({ headless: true });
const page    = await browser.newPage();

page.on('pageerror', e => log(`[pageerror] ${e.message}`));
page.on('console',   m => { if (m.type() === 'error') log(`[browser-error] ${m.text()}`); });

// ── Connect ───────────────────────────────────────────────────────────────
log(`Navigating to ${BASE}...`);
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 10_000 });
await page.waitForFunction(
  () => document.getElementById('connStatus')?.className === 'connected',
  { timeout: 10_000 }
);
log('✅ SignalR connected');

// ── Ping loop ─────────────────────────────────────────────────────────────
// Every 100ms: measure how long a simple DOM read takes.
// >100ms = main thread was blocked by JS work.
let maxPing     = 0;
let pingCount   = 0;
let firstFreeze = null;
const start     = Date.now();

const pingLoop = setInterval(async () => {
  const t0 = Date.now();
  try {
    await page.evaluate(() => document.getElementById('connStatus')?.textContent);
    const ms = Date.now() - t0;
    pingCount++;
    if (ms > maxPing) maxPing = ms;

    if (ms > 100) {
      const msg = `❌ FREEZE  ping#${pingCount}  ${ms}ms  (t+${Date.now()-start}ms from start)`;
      log(msg);
      if (!firstFreeze) firstFreeze = { ms, pingCount };
    } else if (ms > 50) {
      log(`⚠️  SLOW   ping#${pingCount}  ${ms}ms`);
    }
  } catch { /* page closed */ }
}, 100);

// ── Expose log bridge so page-side JS can write to the log ───────────────
await page.exposeFunction('__testLog', msg => log(`[page] ${msg}`));

// ── Patch _drainQueue inside the page to report queue depth ──────────────
await page.evaluate(() => {
  if (typeof window._drainQueue !== 'function') {
    window.__testLog('_drainQueue not found — batching may not be active');
    return;
  }
  const orig = window._drainQueue;
  let total  = 0;
  window._drainQueue = function() {
    const before = window._eventQueue?.length ?? 0;
    orig.call(this);
    const after     = window._eventQueue?.length ?? 0;
    const processed = before - after;
    total += processed;
    // Log every 100 events so the file shows steady progress
    if (processed > 0 && total % 100 === 0) {
      window.__testLog(`drained total=${total}  this_frame=${processed}  queued=${after}`);
    }
  };
  window.__testLog('_drainQueue patched OK');
});

// ── Click Scan ────────────────────────────────────────────────────────────
log('Clicking Duplicates tab...');
await page.click('nav button:first-child');
await page.waitForTimeout(200);

log('Clicking Scan...');
await page.click('button.btn:has-text("Scan")');
log('Scan clicked — monitoring for 60 seconds...');

// ── Monitor ───────────────────────────────────────────────────────────────
// Log a heartbeat every 5s so you can see the test is still alive
const heartbeat = setInterval(async () => {
  const q = await page.evaluate(() => ({
    queued:     window._eventQueue?.length  ?? 'N/A',
    rafPending: window._rafPending          ?? 'N/A',
    rows:       document.querySelectorAll('#dupTable tbody tr').length,
    status:     document.getElementById('sbv-duplicates-status')?.textContent ?? '?',
  })).catch(() => null);
  if (q) log(`heartbeat  status="${q.status}"  rows=${q.rows}  queued=${q.queued}  raf=${q.rafPending}  maxPing=${maxPing}ms`);
}, 5_000);

await page.waitForTimeout(60_000);

clearInterval(pingLoop);
clearInterval(heartbeat);

// ── Final report ──────────────────────────────────────────────────────────
const final = await page.evaluate(() => ({
  queued:  window._eventQueue?.length  ?? 'N/A',
  rafPending: window._rafPending       ?? 'N/A',
  rows:    document.querySelectorAll('#dupTable tbody tr').length,
  status:  document.getElementById('sbv-duplicates-status')?.textContent ?? '?',
})).catch(() => ({}));

log('');
log('═══ RESULTS ═══');
log(`  Total pings : ${pingCount}`);
log(`  Max ping    : ${maxPing}ms`);
log(`  Freeze      : ${firstFreeze ? `YES — first at ping#${firstFreeze.pingCount} (${firstFreeze.ms}ms)` : 'NONE (all pings < 100ms)'}`);
log(`  Final rows  : ${final.rows ?? 'N/A'}`);
log(`  Queue left  : ${final.queued}`);
log(`  Status      : ${final.status}`);
log(`  Log file    : ${LOGFILE}`);
log('═══════════════');

await browser.close();
process.exit(firstFreeze ? 1 : 0);
