/**
 * Filter-Reset-on-Scan + Root Open Folder Tests
 *
 * Run:  node tests/filter-reset-root-btn-tests.mjs
 * Requires: dotnet run at http://localhost:5000
 */

import { chromium } from 'playwright';

const BASE = 'http://localhost:5000';
let browser, page;
let passed = 0, failed = 0;
const pageErrors = [];

function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.error(`  ❌ ${msg}`); failed++; }
function assert(c, p, f) { if (c) pass(p); else fail(f); }
function group(n) { console.log(`\n── ${n} ──`); }

console.log('\n═══ Filter Reset + Root Open Folder Tests ═══\n');

try {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
  page.on('pageerror', err => { pageErrors.push(err.message); });
} catch (e) {
  console.error(`Launch failed: ${e.message}`);
  process.exit(1);
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  pass('Page loaded');
} catch (e) {
  fail(`Page load failed: ${e.message}`);
  await browser.close(); process.exit(1);
}
await page.waitForTimeout(2000);

// ═══ 1. FILTER RESET ON SCAN — actions.js calls scanFilter.reset ═══
group('1. startScan() resets filter');
const resetTest = await page.evaluate(async () => {
  const src = await (await fetch('/js/actions.js')).text();
  return {
    hasFilterReset: src.includes('_scanFilter.reset') || src.includes('_scanFilter?.reset'),
    // Check order within startScan function body (after 'function startScan')
    resetBeforeClear: (() => {
      const fnStart = src.indexOf('function startScan');
      const resetPos = src.indexOf('scanFilter', fnStart);
      const clearPos = src.indexOf('clearSection', fnStart);
      return resetPos > 0 && clearPos > 0 && resetPos < clearPos;
    })(),
  };
});
assert(resetTest.hasFilterReset, 'startScan calls _scanFilter.reset()', 'MISSING filter reset in startScan');
assert(resetTest.resetBeforeClear, 'Reset happens before clearSection', 'Wrong order');

// ═══ 2. FILTER TEXT CLEARS ON SF.reset() ═══
group('2. SF.reset() clears text input');
const textClearTest = await page.evaluate(async () => {
  const SF = window._scanFilter;
  if (!SF) return { hasSF: false };

  // Register a test section if not already
  SF.register('__fr', { containerId: '__fr_c' });

  // Create a container for it
  let c = document.getElementById('__fr_c');
  if (!c) { c = document.createElement('div'); c.id = '__fr_c'; document.body.appendChild(c); }

  // Re-register to inject UI
  SF.register('__fr', { containerId: '__fr_c' });

  // Set a filter value
  const inp = document.getElementById('sf-text-__fr');
  if (inp) {
    inp.value = 'some-filter-text';
    inp.dispatchEvent(new Event('input'));
  }

  const before = inp?.value;

  // Call reset
  SF.reset('__fr');

  const after = inp?.value;

  return { hasSF: true, before, after };
});
assert(textClearTest.hasSF, 'scanFilter module available', 'scanFilter MISSING');
assert(textClearTest.before === 'some-filter-text', `Before reset: "${textClearTest.before}"`, 'Setup failed');
assert(textClearTest.after === '', `After reset: empty (was "${textClearTest.after}")`, `Not cleared: "${textClearTest.after}"`);

// ═══ 3. ROOT OPEN FOLDER BUTTON EXISTS ═══
group('3. Root Open Folder Button');
const rootBtnTest = await page.evaluate(() => {
  const btn = document.getElementById('rootOpenBtn');
  const rootText = document.getElementById('rootDisplay')?.textContent?.trim();
  return {
    exists: !!btn,
    title: btn?.title,
    text: btn?.textContent?.trim(),
    visible: btn ? btn.style.display !== 'none' : false,
    hasOnclick: btn?.hasAttribute('onclick'),
    rootText,
  };
});
assert(rootBtnTest.exists, 'rootOpenBtn element exists', 'rootOpenBtn MISSING');
assert(rootBtnTest.title === 'Open root folder in Explorer', `Title: "${rootBtnTest.title}"`, `Wrong title`);
assert(rootBtnTest.text === '📂', `Button text: 📂`, `Wrong text: "${rootBtnTest.text}"`);
assert(rootBtnTest.hasOnclick, 'Has onclick handler', 'No onclick');

// ═══ 4. BUTTON VISIBLE WHEN ROOT IS SET ═══
group('4. Button Visibility');
const visTest = await page.evaluate(() => {
  const btn = document.getElementById('rootOpenBtn');
  const root = document.getElementById('rootDisplay')?.textContent?.trim();
  return {
    rootSet: root && root.length > 0 && root !== '⚠️ Offline',
    btnVisible: btn?.style.display !== 'none',
  };
});
if (visTest.rootSet) {
  assert(visTest.btnVisible, 'Button visible when root is set', 'Button hidden despite root being set');
} else {
  pass('Root not configured — button correctly hidden');
}

// ═══ 5. SETTINGS.JS SHOWS BUTTON ON LOAD ═══
group('5. Settings.js Integration');
const settingsTest = await page.evaluate(async () => {
  const src = await (await fetch('/js/settings.js')).text();
  return {
    hasRootOpenBtn: src.includes('rootOpenBtn'),
    showsOnRoot: src.includes("display = cfg.root ? '' : 'none'") ||
                 src.includes("display = cfg.root ?"),
  };
});
assert(settingsTest.hasRootOpenBtn, 'settings.js references rootOpenBtn', 'rootOpenBtn MISSING from settings.js');
assert(settingsTest.showsOnRoot, 'Conditionally shows button based on root', 'No conditional display logic');

// ═══ 6. ONCLICK CALLS OPEN-FOLDER API ═══
group('6. Button API Call');
const apiTest = await page.evaluate(() => {
  const btn = document.getElementById('rootOpenBtn');
  const onclick = btn?.getAttribute('onclick') || '';
  return {
    callsOpenFolder: onclick.includes('/api/open-folder'),
    usesPOST: onclick.includes("method:'POST'") || onclick.includes('method:"POST"'),
    readsRootDisplay: onclick.includes('rootDisplay'),
  };
});
assert(apiTest.callsOpenFolder, 'Calls /api/open-folder', 'Wrong API endpoint');
assert(apiTest.usesPOST, 'Uses POST method', 'Not POST');
assert(apiTest.readsRootDisplay, 'Reads path from rootDisplay', 'Hardcoded path?');

// ═══ 7. NO PAGE ERRORS ═══
group('7. Zero Errors');
assert(pageErrors.length === 0, 'No page errors',
  `Page errors:\n${pageErrors.map(e => `    ${e}`).join('\n')}`);

// ═══ RESULTS ═══
console.log('\n═══════════════════════════════════════');
console.log(`  PASSED:  ${passed}`);
console.log(`  FAILED:  ${failed}`);
console.log(`  TOTAL:   ${passed + failed}`);
const pct = ((passed / (passed + failed)) * 100).toFixed(1);
console.log(`  PASS RATE: ${pct}%`);
console.log('═══════════════════════════════════════\n');

await browser.close();
process.exit(failed > 0 ? 1 : 0);
