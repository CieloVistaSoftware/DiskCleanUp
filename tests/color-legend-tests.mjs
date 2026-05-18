/**
 * Color Legend Tests
 *
 * Run:  node tests/color-legend-tests.mjs
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

console.log('\n═══ Color Legend Tests ═══\n');

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

// ═══ 1. LEGEND HIDDEN WHEN NO ROWS ═══
group('1. Legend hidden when empty');
const hiddenTest = await page.evaluate(async () => {
  let c = document.getElementById('__lg1');
  if (!c) { c = document.createElement('div'); c.id = '__lg1'; document.body.appendChild(c); }
  c.innerHTML = '';
  const SG = window._scanGrid;
  SG.create('__lg1', '__lg1', [
    { key: 'path', label: 'File', flex: 1, type: 'path' },
  ]);
  const legend = document.getElementById('sg-legend-__lg1');
  return {
    exists: !!legend,
    display: legend?.style.display,
  };
});
assert(hiddenTest.exists, 'Legend element exists', 'Legend MISSING');
assert(hiddenTest.display === 'none', 'Hidden when no rows', `Display: "${hiddenTest.display}"`);

// ═══ 2. LEGEND APPEARS WITH ROWS ═══
group('2. Legend appears with data');
const showTest = await page.evaluate(async () => {
  let c = document.getElementById('__lg2');
  if (!c) { c = document.createElement('div'); c.id = '__lg2'; document.body.appendChild(c); }
  c.innerHTML = '';
  const SG = window._scanGrid;
  SG.create('__lg2', '__lg2', [
    { key: 'path', label: 'File', flex: 1, type: 'path' },
    { key: 'size', label: 'Size', width: 80, type: 'size' },
  ]);
  SG.addRow('__lg2', { path: 'C:\\test.js', size: 100 });
  SG.addRow('__lg2', { path: 'C:\\style.css', size: 200 });
  SG.addRow('__lg2', { path: 'C:\\app.ts', size: 300 });
  SG.addRow('__lg2', { path: 'C:\\other.js', size: 400 }); // duplicate ext
  await new Promise(r => setTimeout(r, 150));

  const legend = document.getElementById('sg-legend-__lg2');
  const chips = legend?.querySelectorAll('.sg-legend-chip');
  const label = legend?.querySelector('.sg-legend-label');
  const dots = legend?.querySelectorAll('.ext-dot');
  const chipTexts = chips ? [...chips].map(c => c.textContent.trim()) : [];
  // Check visibility: legend has content (chips rendered = legend active)
  const hasContent = (chips?.length || 0) > 0;

  SG.clear('__lg2');
  return {
    visible: hasContent,
    chipCount: chips?.length,
    labelText: label?.textContent,
    dotCount: dots?.length,
    chipTexts,
  };
});
assert(showTest.visible, 'Legend visible with rows', 'Legend still hidden');
assert(showTest.chipCount === 3, `${showTest.chipCount} chips (3 unique exts from 4 rows)`, `Expected 3, got ${showTest.chipCount}`);
assert(showTest.labelText?.includes('3'), `Label says "File types (3)"`, `Label: "${showTest.labelText}"`);
assert(showTest.dotCount === 3, `3 colored dots`, `${showTest.dotCount} dots`);
assert(showTest.chipTexts.includes('.js'), 'Has .js chip', 'Missing .js');
assert(showTest.chipTexts.includes('.css'), 'Has .css chip', 'Missing .css');
assert(showTest.chipTexts.includes('.ts'), 'Has .ts chip', 'Missing .ts');

// ═══ 3. LEGEND TRACKS SUB-PATH EXTENSIONS ═══
group('3. Sub-path extensions in legend');
const subTest = await page.evaluate(async () => {
  let c = document.getElementById('__lg3');
  if (!c) { c = document.createElement('div'); c.id = '__lg3'; document.body.appendChild(c); }
  c.innerHTML = '';
  const SG = window._scanGrid;
  SG.create('__lg3', '__lg3', [
    { key: 'keep', label: 'Keep', flex: 1, type: 'path' },
    { key: 'delete', label: 'Will Delete', flex: 2, type: 'paths' },
  ]);
  SG.addRow('__lg3', {
    keep: 'C:\\main.css',
    delete: ['C:\\copy.css.map', 'C:\\other.scss'],
  });
  await new Promise(r => setTimeout(r, 150));

  const legend = document.getElementById('sg-legend-__lg3');
  const chipTexts = legend ? [...legend.querySelectorAll('.sg-legend-chip')].map(c => c.textContent.trim()) : [];
  SG.clear('__lg3');
  return chipTexts;
});
assert(subTest.includes('.css'), 'Tracks .css from keep path', 'Missing .css');
assert(subTest.includes('.map'), 'Tracks .map from sub-path', 'Missing .map');
assert(subTest.includes('.scss'), 'Tracks .scss from sub-path', 'Missing .scss');

// ═══ 4. LEGEND CLEARS ON CLEAR() ═══
group('4. Legend clears with grid');
const clearTest = await page.evaluate(async () => {
  let c = document.getElementById('__lg4');
  if (!c) { c = document.createElement('div'); c.id = '__lg4'; document.body.appendChild(c); }
  c.innerHTML = '';
  const SG = window._scanGrid;
  SG.create('__lg4', '__lg4', [
    { key: 'path', label: 'File', flex: 1, type: 'path' },
  ]);
  SG.addRow('__lg4', { path: 'C:\\test.py' });
  await new Promise(r => setTimeout(r, 150));

  const beforeChips = document.getElementById('sg-legend-__lg4')?.querySelectorAll('.sg-legend-chip').length;

  SG.clear('__lg4');

  const legend = document.getElementById('sg-legend-__lg4');
  return {
    beforeChips,
    afterDisplay: legend?.style.display,
    afterHTML: legend?.innerHTML,
  };
});
assert(clearTest.beforeChips === 1, `Before clear: ${clearTest.beforeChips} chip`, 'Wrong');
assert(clearTest.afterDisplay === 'none', 'Hidden after clear', `Display: "${clearTest.afterDisplay}"`);
assert(clearTest.afterHTML === '', 'Empty innerHTML after clear', 'Not empty');

// ═══ 5. LEGEND POSITIONED BETWEEN HEADER AND BODY ═══
group('5. Legend DOM position');
const posTest = await page.evaluate(async () => {
  let c = document.getElementById('__lg5');
  if (!c) { c = document.createElement('div'); c.id = '__lg5'; document.body.appendChild(c); }
  c.innerHTML = '';
  const SG = window._scanGrid;
  SG.create('__lg5', '__lg5', [
    { key: 'path', label: 'File', flex: 1, type: 'path' },
  ]);
  SG.addRow('__lg5', { path: 'C:\\a.txt' });
  await new Promise(r => setTimeout(r, 100));

  const children = [...c.children];
  const headerIdx = children.findIndex(el => el.classList.contains('sg-header'));
  const legendIdx = children.findIndex(el => el.classList.contains('sg-legend'));
  const bodyIdx = children.findIndex(el => el.classList.contains('sg-body'));
  SG.clear('__lg5');
  return { headerIdx, legendIdx, bodyIdx };
});
assert(posTest.legendIdx === posTest.headerIdx + 1, 'Legend directly after header', `Header:${posTest.headerIdx} Legend:${posTest.legendIdx}`);
assert(posTest.legendIdx === posTest.bodyIdx - 1, 'Legend directly before body', `Legend:${posTest.legendIdx} Body:${posTest.bodyIdx}`);

// ═══ 6. CSS STYLING ═══
group('6. CSS styling');
const cssTest = await page.evaluate(async () => {
  const src = await (await fetch('/css/dashboard.css')).text();
  return {
    hasLegend: src.includes('.sg-legend'),
    hasLabel: src.includes('.sg-legend-label'),
    hasChip: src.includes('.sg-legend-chip'),
    hasFlexWrap: src.includes('flex-wrap: wrap') || src.includes('flex-wrap:wrap'),
  };
});
assert(cssTest.hasLegend, 'sg-legend CSS defined', 'MISSING');
assert(cssTest.hasLabel, 'sg-legend-label CSS defined', 'MISSING');
assert(cssTest.hasChip, 'sg-legend-chip CSS defined', 'MISSING');
assert(cssTest.hasFlexWrap, 'Flex-wrap for overflow', 'MISSING');

// ═══ 7. CHIPS SORTED ALPHABETICALLY ═══
group('7. Alphabetical sort');
const sortTest = await page.evaluate(async () => {
  let c = document.getElementById('__lg7');
  if (!c) { c = document.createElement('div'); c.id = '__lg7'; document.body.appendChild(c); }
  c.innerHTML = '';
  const SG = window._scanGrid;
  SG.create('__lg7', '__lg7', [
    { key: 'path', label: 'File', flex: 1, type: 'path' },
  ]);
  SG.addRow('__lg7', { path: 'C:\\z.py' });
  SG.addRow('__lg7', { path: 'C:\\a.css' });
  SG.addRow('__lg7', { path: 'C:\\m.js' });
  await new Promise(r => setTimeout(r, 150));

  const chips = [...document.getElementById('sg-legend-__lg7').querySelectorAll('.sg-legend-chip')];
  const order = chips.map(c => c.textContent.trim());
  SG.clear('__lg7');
  return order;
});
assert(sortTest[0] === '.css', `First: ${sortTest[0]}`, 'Not sorted');
assert(sortTest[1] === '.js', `Second: ${sortTest[1]}`, 'Not sorted');
assert(sortTest[2] === '.py', `Third: ${sortTest[2]}`, 'Not sorted');

// ═══ 8. NO PAGE ERRORS ═══
group('8. Zero Errors');
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
