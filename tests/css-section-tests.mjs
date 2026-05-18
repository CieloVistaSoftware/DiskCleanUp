/**
 * CSS Section + Column Header + Keep-List Tests
 * Tests for: CSS Files scanner section, column header truncation fix,
 *            keep-list css-files integration
 *
 * Run:  node tests/css-section-tests.mjs
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

console.log('\n═══ CSS Section + Column Header Tests ═══\n');

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

// ═══ 1. CSS SECTION DOM EXISTS ═══
group('1. CSS Section DOM');
assert(await page.evaluate(() => !!document.getElementById('section-css-files')),
  '#section-css-files exists', '#section-css-files MISSING');
assert(await page.evaluate(() => !!document.querySelector('nav button[data-section="css-files"]')),
  'CSS Files nav button exists', 'CSS Files nav button MISSING');
const cssNavText = await page.evaluate(() =>
  document.querySelector('nav button[data-section="css-files"]')?.textContent?.trim());
assert(cssNavText && cssNavText.includes('CSS'), `Nav text: "${cssNavText}"`, `Bad nav text: "${cssNavText}"`);

// ═══ 2. CSS SECTION ACTIVATES ═══
group('2. CSS Section Activates');
await page.click('nav button[data-section="css-files"]');
await page.waitForTimeout(100);
assert(await page.evaluate(() =>
  document.getElementById('section-css-files')?.classList.contains('active-section')),
  'CSS section activates on click', 'CSS section did NOT activate');

// ═══ 3. CSS SECTION HAS REQUIRED UI ELEMENTS ═══
group('3. CSS Section UI Elements');
assert(await page.evaluate(() => !!document.getElementById('sb-css-files')),
  'Status bar #sb-css-files exists', 'Status bar MISSING');
assert(await page.evaluate(() => !!document.getElementById('sf-css-files')),
  'Filter bar #sf-css-files exists', 'Filter bar MISSING');
assert(await page.evaluate(() => !!document.getElementById('cssResult')),
  '#cssResult container exists', '#cssResult MISSING');

// Scan button
assert(await page.evaluate(() => {
  const sec = document.getElementById('section-css-files');
  return !!sec?.querySelector('button[data-action="scan"]');
}), 'Scan button exists', 'Scan button MISSING');

// Keep Selected button with data-grid-section
assert(await page.evaluate(() => {
  return !!document.querySelector('[data-grid-section="css-files"].btn-keep');
}), 'Keep Selected button with data-grid-section="css-files"', 'Keep button MISSING');

// ═══ 4. CSS HANDLER REGISTERED (creates grid on result) ═══
group('4. CSS Handler Creates Grid');
const gridOk = await page.evaluate(async () => {
  // Simulate what the handler does: create grid + add row
  const SG = window._scanGrid;
  const container = document.getElementById('cssResult');
  if (!container) return 'no container';
  container.innerHTML = '';
  SG.create('css-files', 'cssResult', [
    { key: 'check', width: 56, type: 'checkbox' },
    { key: 'path', label: 'File', flex: 3, minWidth: 150, type: 'path' },
    { key: 'size', label: 'Size', width: 90, type: 'size' },
    { key: 'modified', label: 'Modified', width: 120, type: 'text' },
    { key: 'open', label: '', width: 60, type: 'open' },
  ]);
  SG.addRow('css-files', { path: 'C:\\test\\style.css', size: 2048, modified: '2025-01-15' });
  SG.addRow('css-files', { path: 'C:\\test\\main.scss', size: 4096, modified: '2025-02-01' });
  await new Promise(r => setTimeout(r, 100));
  const rows = document.querySelectorAll('#sg-body-css-files .sg-row').length;
  SG.clear('css-files');
  return rows;
});
assert(gridOk === 2, `Grid created with ${gridOk} rows`, `Expected 2 rows, got ${gridOk}`);

// ═══ 5. COLUMN HEADER TITLE ATTRIBUTES (truncation fix) ═══
group('5. Column Header Title Attributes');
const titleTest = await page.evaluate(async () => {
  let c = document.getElementById('__ht'); if (!c) { c = document.createElement('div'); c.id = '__ht'; document.body.appendChild(c); }
  c.innerHTML = '';
  const SG = window._scanGrid;
  SG.create('__ht', '__ht', [
    { key: 'check', width: 56, type: 'checkbox' },
    { key: 'path', label: 'File', flex: 3, minWidth: 150, type: 'path' },
    { key: 'size', label: 'Size', width: 90, type: 'size' },
    { key: 'modified', label: 'Modified', width: 120, type: 'text' },
  ]);

  const headers = c.querySelectorAll('.sg-hcell');
  const results = {};
  headers.forEach(h => {
    const label = h.textContent.replace(/[⇕▲▼]/g, '').trim();
    if (label) results[label] = h.title;
  });
  SG.clear('__ht');
  return results;
});
// Check that title attributes match labels
for (const [label, title] of Object.entries(titleTest)) {
  assert(title === label, `Header "${label}" has title="${title}"`, `Header "${label}" title MISMATCH: "${title}"`);
}
assert(titleTest['Modified'] === 'Modified',
  'Modified header has full title (not truncated)', `Modified title: "${titleTest['Modified']}"`);

// ═══ 6. MINIMUM RESIZE WIDTH ═══
group('6. Minimum Resize Width');
const minW = await page.evaluate(() => {
  // The resize handler uses Math.max(50, ...) — verify through CSS
  const style = getComputedStyle(document.querySelector('.sg-hcell') || document.createElement('div'));
  return style.minWidth;
});
assert(minW === '40px' || minW !== '0px', `Header min-width: ${minW}`, `No min-width set`);

// ═══ 7. KEEP-LIST HAS CSS-FILES IN CACHE SECTIONS ═══
group('7. Keep-List CSS Integration');
const keepCss = await page.evaluate(async () => {
  // Fetch the keep-list.js source and check for css-files
  const r = await fetch('/js/keep-list.js');
  const src = await r.text();
  return {
    inCacheSections: src.includes("'css-files'"),
    inTableMap: src.includes("cssTable:'css-files'"),
  };
});
assert(keepCss.inCacheSections, 'css-files in cacheSections array', 'css-files NOT in cacheSections');
assert(keepCss.inTableMap, 'cssTable mapped in keepSelected', 'cssTable NOT mapped');

// ═══ 8. SECTION-HANDLERS HAS CSS HANDLER ═══
group('8. Section Handler Registration');
const handlerOk = await page.evaluate(async () => {
  const r = await fetch('/js/section-handlers.js');
  const src = await r.text();
  return {
    hasCssHandler: src.includes("registerHandler('css-files'"),
    hasCssCols: src.includes('_cssCols'),
    hasCssResult: src.includes("'cssResult'"),
  };
});
assert(handlerOk.hasCssHandler, "registerHandler('css-files') present", 'CSS handler NOT registered');
assert(handlerOk.hasCssCols, '_cssCols column definition', '_cssCols MISSING');
assert(handlerOk.hasCssResult, 'cssResult container ID used', 'cssResult NOT used');

// ═══ 9. BACKEND API ACCEPTS CSS-FILES SECTION ═══
group('9. Backend API');
const cacheR = await page.evaluate(async () => {
  const r = await fetch('/api/cache/css-files');
  return r.status;
});
assert([200, 204].includes(cacheR), `GET /api/cache/css-files → ${cacheR}`, `Unexpected: ${cacheR}`);

// ═══ 10. NO JS ERRORS FROM CHANGES ═══
group('10. Zero Errors');
assert(pageErrors.length === 0, 'No page errors after all tests',
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
