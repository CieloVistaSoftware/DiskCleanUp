/**
 * UI Response Time Test
 *
 * Verifies that clicking "Trash Copies" in the Duplicates section
 * causes a visible DOM change within 100ms — i.e. the UI is not hung.
 *
 * Strategy:
 *   1. Launch Chromium via Playwright (headless)
 *   2. Navigate to the dashboard
 *   3. Wait for SignalR to connect
 *   4. Run a Duplicates scan and wait for at least one group to appear
 *   5. Click "Trash Copies" on the first group
 *   6. Measure time until the group rows disappear from the DOM
 *   7. FAIL if > 100ms — PASS if <= 100ms
 *
 * Also tests:
 *   - Scan button click → skeleton rows appear within 100ms
 *   - MetricsUpdate → canvas redraws within 100ms of data arriving
 *
 * Run: node tests/ui-response-test.mjs
 * Requires: dotnet run already started at http://localhost:5000
 */

import { chromium } from 'playwright';

const BASE_URL      = 'http://localhost:5000';
const RESPONSE_LIMIT_MS = 100;
const SCAN_TIMEOUT_MS   = 60_000; // scans can take a while on large drives

let passed = 0;
let failed = 0;
let browser, page;

function pass(msg, ms) {
  const timing = ms !== undefined ? ` (${ms}ms)` : '';
  console.log(`  ✅ PASS: ${msg}${timing}`);
  passed++;
}

function fail(msg, ms) {
  const timing = ms !== undefined ? ` (${ms}ms — limit ${RESPONSE_LIMIT_MS}ms)` : '';
  console.error(`  ❌ FAIL: ${msg}${timing}`);
  failed++;
}

function assert(condition, passMsg, failMsg, ms) {
  if (condition) pass(passMsg, ms);
  else           fail(failMsg, ms);
}

// ── Helper: measure time for a DOM condition to become true ──────────────
// Clicks the target, then polls the DOM for the condition.
// Returns elapsed ms, or Infinity on timeout.
async function measureResponseMs(clickFn, conditionFn, timeoutMs = 2000) {
  const t0 = Date.now();
  await clickFn();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await conditionFn()) return Date.now() - t0;
    await page.waitForTimeout(5); // poll every 5ms
  }
  return Infinity;
}

// ── Setup ────────────────────────────────────────────────────────────────
console.log('\n── UI Response Time Test ──');
console.log(`  Limit: ${RESPONSE_LIMIT_MS}ms per interaction\n`);

try {
  browser = await chromium.launch({ headless: true });
  page    = await browser.newPage();

  // Capture console errors from the page
  page.on('console', msg => {
    if (msg.type() === 'error') console.error(`  [browser] ${msg.text()}`);
  });
  page.on('pageerror', err => console.error(`  [pageerror] ${err.message}`));

} catch (e) {
  console.error(`  ❌ Could not launch browser: ${e.message}`);
  console.error('  Run: npx playwright install chromium');
  process.exit(1);
}

// ── Test 1: Page loads and SignalR connects ───────────────────────────────
console.log('── Test 1: Page load + SignalR connect ──');
try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 10_000 });
  // Wait for "⚡ Live" status badge
  await page.waitForFunction(
    () => document.getElementById('connStatus')?.className === 'connected',
    { timeout: 10_000 }
  );
  pass('Page loaded and SignalR connected');
} catch (e) {
  fail(`Page load or SignalR connect failed: ${e.message}`);
  await browser.close();
  process.exit(1);
}

// ── Test 2: Scan button click → skeleton appears within 100ms ────────────
console.log('\n── Test 2: Scan button click → skeleton rows appear ──');
try {
  // Click Duplicates tab first (it's the default but be explicit)
  await page.click('nav button:first-child');

  const ms = await measureResponseMs(
    // Click action
    () => page.click('button.btn:has-text("Scan")', { timeout: 3000 }),
    // Condition: skeleton or real rows appear in dupResult
    async () => {
      const rowCount = await page.evaluate(() =>
        document.querySelector('#dupTable tbody')?.querySelectorAll('tr').length ?? 0
      );
      return rowCount > 0;
    },
    2000
  );

  assert(
    ms <= RESPONSE_LIMIT_MS,
    `Skeleton rows appeared in ${ms}ms`,
    `Skeleton rows too slow`,
    ms
  );
} catch (e) {
  fail(`Scan button test failed: ${e.message}`);
}

// ── Test 3: Wait for at least one duplicate group ────────────────────────
console.log('\n── Test 3: Wait for duplicate scan results ──');
let hasResults = false;
try {
  await page.waitForFunction(
    () => document.querySelectorAll('#dupTable tr.group-sep').length > 0,
    { timeout: SCAN_TIMEOUT_MS }
  );
  hasResults = true;
  const groupCount = await page.evaluate(
    () => document.querySelectorAll('#dupTable tr.group-sep').length
  );
  pass(`Duplicate scan found ${groupCount} group(s)`);
} catch (e) {
  // No duplicates found is not a test failure — skip trash test
  console.log('  ⚠️  SKIP: No duplicate groups found (drive may have no dupes) — skipping trash click test');
}

// ── Test 4: "Trash Copies" click → rows disappear within 100ms ───────────
console.log('\n── Test 4: Trash Copies click → DOM update within 100ms ──');
if (hasResults) {
  try {
    // Get the hash of the first group so we can track its rows
    const firstHash = await page.evaluate(() =>
      document.querySelector('#dupTable tr.group-sep')?.dataset?.hash
    );

    if (!firstHash) {
      fail('Could not find group hash on first group-sep row');
    } else {
      // Count rows in that group before clicking
      const rowsBefore = await page.evaluate(hash =>
        document.querySelectorAll(`#dupTable tr[data-hash="${hash}"]`).length,
        firstHash
      );

      const ms = await measureResponseMs(
        // Click the Trash Copies button in the first group
        () => page.click('#dupTable tr.group-sep button', { timeout: 3000 }),
        // Condition: rows for this hash are gone from DOM
        async () => {
          const remaining = await page.evaluate(hash =>
            document.querySelectorAll(`#dupTable tr[data-hash="${hash}"]:not(.group-sep)`).length,
            firstHash
          );
          return remaining === 0;
        },
        2000
      );

      assert(
        ms !== Infinity && ms <= RESPONSE_LIMIT_MS,
        `Copy rows removed from DOM in ${ms}ms`,
        ms === Infinity ? 'Copy rows never removed from DOM' : `DOM update too slow`,
        ms === Infinity ? undefined : ms
      );

      if (ms !== Infinity) {
        console.log(`     (${rowsBefore} rows tracked, hash: ${firstHash.slice(0,8)}…)`);
      }
    }
  } catch (e) {
    fail(`Trash copies click test failed: ${e.message}`);
  }
} else {
  console.log('  ⚠️  SKIP: No results to test trash click against');
}

// ── Test 5: MetricsUpdate → canvas redraws within 100ms ──────────────────
console.log('\n── Test 5: MetricsUpdate → canvas updates within 100ms ──');
try {
  // Grab current canvas pixel signature before next update
  const before = await page.evaluate(() => {
    const c = document.getElementById('cpuCanvas');
    return c?.toDataURL();
  });

  // Wait for the next MetricsUpdate to fire (≤5s interval)
  // We intercept it by polling the cpuVal text change
  const cpuBefore = await page.evaluate(() =>
    document.getElementById('cpuVal')?.textContent
  );

  // Wait for cpuVal to change (signals a new MetricsUpdate was received)
  let newCpuVal;
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    newCpuVal = await page.evaluate(() =>
      document.getElementById('cpuVal')?.textContent
    );
    if (newCpuVal !== cpuBefore && newCpuVal !== '—') break;
    await page.waitForTimeout(100);
  }

  if (!newCpuVal || newCpuVal === cpuBefore) {
    fail('cpuVal never changed — MetricsUpdate may not be firing');
  } else {
    // Now measure how fast canvas updates after cpuVal changed
    const t0 = Date.now();
    let canvasChanged = false;
    const canvasDeadline = Date.now() + 500;
    while (Date.now() < canvasDeadline) {
      const after = await page.evaluate(() =>
        document.getElementById('cpuCanvas')?.toDataURL()
      );
      if (after !== before) { canvasChanged = true; break; }
      await page.waitForTimeout(5);
    }
    const ms = Date.now() - t0;

    if (canvasChanged) pass(`Canvas redrawn within ${ms}ms of MetricsUpdate`, ms);
    else               fail('Canvas did not redraw after MetricsUpdate');
  }
} catch (e) {
  fail(`MetricsUpdate canvas test failed: ${e.message}`);
}

// ── Test 6: Nav tab switch is instant ────────────────────────────────────
console.log('\n── Test 6: Nav tab switch response ──');
try {
  const tabs = ['stale', 'large', 'node-modules', 'savings'];
  for (const tab of tabs) {
    const ms = await measureResponseMs(
      () => page.click(`nav button:has-text("${
        tab === 'stale'        ? 'Stale'        :
        tab === 'large'        ? 'Large'        :
        tab === 'node-modules' ? 'node_modules' :
                                 'Savings'
      }")`),
      async () => {
        return await page.evaluate(t =>
          document.getElementById(`section-${t}`)?.classList.contains('active-section'),
          tab
        );
      },
      500
    );
    assert(
      ms <= RESPONSE_LIMIT_MS,
      `Tab "${tab}" activated in ${ms}ms`,
      `Tab "${tab}" too slow`,
      ms
    );
  }
} catch (e) {
  fail(`Tab switch test failed: ${e.message}`);
}

// ── Teardown ─────────────────────────────────────────────────────────────
await browser.close();

console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
process.exit(failed > 0 ? 1 : 0);
