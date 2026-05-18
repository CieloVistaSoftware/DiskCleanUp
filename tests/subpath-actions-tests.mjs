/**
 * Sub-Path Actions Tests — 🗑️📄📂 buttons in 'paths' column (Will Delete)
 *
 * Run:  node tests/subpath-actions-tests.mjs
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

console.log('\n═══ Sub-Path Actions Tests ═══\n');

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

// ═══ 1. SUBPATH BUTTONS RENDER ═══
group('1. Sub-path buttons render in paths column');
const renderTest = await page.evaluate(async () => {
  let c = document.getElementById('__sp1');
  if (!c) { c = document.createElement('div'); c.id = '__sp1'; document.body.appendChild(c); }
  c.innerHTML = '';
  const SG = window._scanGrid;
  SG.create('__sp1', '__sp1', [
    { key: 'keep', label: 'Keep', flex: 2, minWidth: 120, type: 'path' },
    { key: 'delete', label: 'Will Delete', flex: 3, minWidth: 150, type: 'paths' },
    { key: 'size', label: 'Size', width: 90, type: 'size' },
  ]);
  SG.addRow('__sp1', {
    keep: 'C:\\docs\\report.pdf',
    delete: [
      'C:\\docs\\report (1).pdf',
      'C:\\docs\\report (2).pdf',
      'C:\\docs\\report copy.pdf',
    ],
    size: 5000,
  });
  await new Promise(r => setTimeout(r, 100));

  const subpaths = c.querySelectorAll('.sg-subpath');
  const subpathActions = c.querySelectorAll('.sg-subpath-actions');
  const xxsBtns = c.querySelectorAll('.btn-xxs');

  // Each subpath should have 3 buttons (trash, open file, open folder)
  const result = {
    subpathCount: subpaths.length,
    actionsCount: subpathActions.length,
    btnCount: xxsBtns.length,
    btnsPerSubpath: subpathActions.length > 0 ? subpathActions[0].querySelectorAll('button').length : 0,
  };
  SG.clear('__sp1');
  return result;
});
assert(renderTest.subpathCount === 3, `${renderTest.subpathCount} sub-paths rendered`, `Expected 3`);
assert(renderTest.actionsCount === 3, `${renderTest.actionsCount} action containers`, `Expected 3`);
assert(renderTest.btnCount === 9, `${renderTest.btnCount} buttons (3 per sub-path)`, `Expected 9, got ${renderTest.btnCount}`);
assert(renderTest.btnsPerSubpath === 3, `3 buttons per sub-path`, `${renderTest.btnsPerSubpath} per sub-path`);

// ═══ 2. BUTTON TOOLTIPS ═══
group('2. Sub-path button tooltips');
const tooltipTest = await page.evaluate(async () => {
  let c = document.getElementById('__sp2');
  if (!c) { c = document.createElement('div'); c.id = '__sp2'; document.body.appendChild(c); }
  c.innerHTML = '';
  const SG = window._scanGrid;
  SG.create('__sp2', '__sp2', [
    { key: 'keep', label: 'Keep', flex: 1, type: 'path' },
    { key: 'delete', label: 'Will Delete', flex: 2, type: 'paths' },
  ]);
  SG.addRow('__sp2', {
    keep: 'C:\\test.txt',
    delete: ['C:\\test (1).txt'],
  });
  await new Promise(r => setTimeout(r, 100));

  const btns = [...c.querySelectorAll('.sg-subpath-actions button')];
  const titles = btns.map(b => b.title);
  SG.clear('__sp2');
  return titles;
});
assert(tooltipTest.includes('Delete this file (Recycle Bin)'), 'Trash tooltip ✓', `Missing trash tooltip`);
assert(tooltipTest.includes('Open file in VS Code'), 'Open file tooltip ✓', `Missing file tooltip`);
assert(tooltipTest.includes('Open containing folder'), 'Open folder tooltip ✓', `Missing folder tooltip`);

// ═══ 3. SUBPATH TITLE (full path on hover) ═══
group('3. Sub-path title attribute');
const titleTest = await page.evaluate(async () => {
  let c = document.getElementById('__sp3');
  if (!c) { c = document.createElement('div'); c.id = '__sp3'; document.body.appendChild(c); }
  c.innerHTML = '';
  const SG = window._scanGrid;
  SG.create('__sp3', '__sp3', [
    { key: 'keep', label: 'Keep', flex: 1, type: 'path' },
    { key: 'delete', label: 'Will Delete', flex: 2, type: 'paths' },
  ]);
  SG.addRow('__sp3', {
    keep: 'C:\\a.txt',
    delete: ['C:\\very\\long\\path\\to\\file (1).txt'],
  });
  await new Promise(r => setTimeout(r, 100));

  const sub = c.querySelector('.sg-subpath');
  const result = sub?.title;
  SG.clear('__sp3');
  return result;
});
assert(titleTest === 'C:\\very\\long\\path\\to\\file (1).txt', `Title: full path ✓`, `Wrong: "${titleTest}"`);

// ═══ 4. TRASH SUBPATH REMOVES ENTRY (not whole row) ═══
group('4. Trash sub-path removes only that entry');
const trashTest = await page.evaluate(async () => {
  let c = document.getElementById('__sp4');
  if (!c) { c = document.createElement('div'); c.id = '__sp4'; document.body.appendChild(c); }
  c.innerHTML = '';
  const SG = window._scanGrid;

  // Mock TrashQ
  const trashCalls = [];
  const origTQ = window.TrashQ;
  window.TrashQ = { enqueue: (paths) => trashCalls.push(...paths) };

  SG.create('__sp4', '__sp4', [
    { key: 'keep', label: 'Keep', flex: 1, type: 'path' },
    { key: 'delete', label: 'Will Delete', flex: 2, type: 'paths' },
    { key: 'size', label: 'Size', width: 80, type: 'size' },
  ]);
  SG.addRow('__sp4', {
    keep: 'C:\\main.pdf',
    delete: ['C:\\main (1).pdf', 'C:\\main (2).pdf', 'C:\\main (3).pdf'],
    size: 1000,
  });
  await new Promise(r => setTimeout(r, 100));

  const subsBefore = c.querySelectorAll('.sg-subpath').length;
  const rowsBefore = SG.rowCount('__sp4');

  // Click trash on first sub-path
  const firstTrash = c.querySelector('.sg-subpath-actions .sg-trash-btn');
  firstTrash?.click();
  await new Promise(r => setTimeout(r, 150));

  // Sub-path should have keep-flash class (animating out)
  const subsAfter = c.querySelectorAll('.sg-subpath:not(.keep-flash)').length;
  const rowsAfter = SG.rowCount('__sp4');

  window.TrashQ = origTQ;
  SG.clear('__sp4');

  return { subsBefore, rowsBefore, subsAfter, rowsAfter, trashCalls };
});
assert(trashTest.subsBefore === 3, `Before: ${trashTest.subsBefore} sub-paths`, 'Wrong');
assert(trashTest.subsAfter === 2, `After: ${trashTest.subsAfter} sub-paths (1 removed)`, `Expected 2, got ${trashTest.subsAfter}`);
assert(trashTest.rowsAfter === 1, `Row still exists (${trashTest.rowsAfter})`, `Row removed unexpectedly`);
assert(trashTest.trashCalls.length === 1, `TrashQ called with 1 path`, `Called with ${trashTest.trashCalls.length}`);
assert(trashTest.trashCalls[0] === 'C:\\main (1).pdf', `Correct path trashed`, `Wrong: ${trashTest.trashCalls[0]}`);

// ═══ 5. CSS CLASSES EXIST ═══
group('5. CSS styling');
const cssTest = await page.evaluate(async () => {
  const src = await (await fetch('/css/dashboard.css')).text();
  return {
    hasXxs: src.includes('.btn-xxs'),
    hasSubpath: src.includes('.sg-subpath'),
    hasSubpathText: src.includes('.sg-subpath-text'),
    hasSubpathActions: src.includes('.sg-subpath-actions'),
    hasHoverReveal: src.includes('.sg-subpath:hover .btn-xxs'),
    hasOpacity0: src.includes('opacity: 0') || src.includes('opacity:0'),
  };
});
assert(cssTest.hasXxs, 'btn-xxs class defined', 'MISSING');
assert(cssTest.hasSubpath, 'sg-subpath layout defined', 'MISSING');
assert(cssTest.hasSubpathText, 'sg-subpath-text defined', 'MISSING');
assert(cssTest.hasSubpathActions, 'sg-subpath-actions defined', 'MISSING');
assert(cssTest.hasHoverReveal, 'Hover reveals buttons', 'MISSING');
assert(cssTest.hasOpacity0, 'Buttons hidden by default (opacity: 0)', 'MISSING');

// ═══ 6. NO PAGE ERRORS ═══
group('6. Zero Errors');
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
