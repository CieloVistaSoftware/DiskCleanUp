/**
 * Trash Button Per-Row Tests
 * Tests for: 🗑️ delete button on each grid row
 *
 * Run:  node tests/trash-button-tests.mjs
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

console.log('\n═══ Trash Button Per-Row Tests ═══\n');

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

// ═══ 1. TRASH BUTTON EXISTS ON ROWS ═══
group('1. Trash Button Present');
const trashTest = await page.evaluate(async () => {
  let c = document.getElementById('__tb'); if (!c) { c = document.createElement('div'); c.id = '__tb'; document.body.appendChild(c); }
  c.innerHTML = '';
  const SG = window._scanGrid;
  SG.create('__tb', '__tb', [
    { key: 'check', width: 56, type: 'checkbox' },
    { key: 'path', label: 'File', flex: 3, minWidth: 150, type: 'path' },
    { key: 'size', label: 'Size', width: 90, type: 'size' },
  ]);
  SG.addRow('__tb', { path: 'C:\\test\\file1.txt', size: 1024 });
  SG.addRow('__tb', { path: 'C:\\test\\file2.css', size: 2048 });
  SG.addRow('__tb', { path: 'C:\\test\\dir1', size: 4096 });
  await new Promise(r => setTimeout(r, 100));

  const rows = c.querySelectorAll('#sg-body-__tb .sg-row');
  const results = {
    rowCount: rows.length,
    trashBtns: c.querySelectorAll('.sg-trash-btn').length,
    firstTitle: c.querySelector('.sg-trash-btn')?.title,
    firstText: c.querySelector('.sg-trash-btn')?.textContent,
    hasClass: c.querySelector('.sg-trash-btn')?.classList.contains('btn-xs'),
  };

  SG.clear('__tb');
  return results;
});

assert(trashTest.rowCount === 3, `${trashTest.rowCount} rows created`, `Expected 3 rows`);
assert(trashTest.trashBtns === 3, `${trashTest.trashBtns} trash buttons (one per row)`, `Expected 3 trash buttons, got ${trashTest.trashBtns}`);
assert(trashTest.firstTitle === 'Delete (Recycle Bin)', `Title: "${trashTest.firstTitle}"`, `Wrong title: "${trashTest.firstTitle}"`);
assert(trashTest.firstText === '🗑', `Text: "${trashTest.firstText}"`, `Wrong text: "${trashTest.firstText}"`);
assert(trashTest.hasClass === true, 'Has btn-xs class', 'Missing btn-xs class');

// ═══ 2. TRASH BUTTON CLICK REMOVES ROW ═══
group('2. Trash Click Removes Row');
const removeTest = await page.evaluate(async () => {
  let c = document.getElementById('__tr'); if (!c) { c = document.createElement('div'); c.id = '__tr'; document.body.appendChild(c); }
  c.innerHTML = '';
  const SG = window._scanGrid;

  // Mock TrashQ to capture calls without actually deleting
  const trashCalls = [];
  const origTrashQ = window.TrashQ;
  window.TrashQ = { enqueue: (paths) => trashCalls.push(...paths) };

  SG.create('__tr', '__tr', [
    { key: 'path', label: 'File', flex: 1, type: 'path' },
    { key: 'size', label: 'Size', width: 80, type: 'size' },
  ]);
  SG.addRow('__tr', { path: 'C:\\del\\target.txt', size: 512 });
  SG.addRow('__tr', { path: 'C:\\del\\keep.txt', size: 1024 });
  await new Promise(r => setTimeout(r, 100));

  const before = c.querySelectorAll('#sg-body-__tr .sg-row').length;

  // Click trash on first row
  const trashBtn = c.querySelector('.sg-trash-btn');
  trashBtn?.click();
  await new Promise(r => setTimeout(r, 100));

  const after = SG.rowCount('__tr');

  // Restore original TrashQ
  window.TrashQ = origTrashQ;
  SG.clear('__tr');

  return { before, after, trashCalls };
});

assert(removeTest.before === 2, `Before: ${removeTest.before} rows`, `Expected 2 rows before`);
assert(removeTest.after === 1, `After: ${removeTest.after} row (one removed)`, `Expected 1 row after, got ${removeTest.after}`);
assert(removeTest.trashCalls.length === 1, `TrashQ.enqueue called with ${removeTest.trashCalls.length} path(s)`, `TrashQ not called correctly`);
assert(removeTest.trashCalls[0] === 'C:\\del\\target.txt', `Correct path: ${removeTest.trashCalls[0]}`, `Wrong path`);

// ═══ 3. CROSS-SECTION REMOVAL ═══
group('3. Cross-Section Removal');
const crossTest = await page.evaluate(async () => {
  let c1 = document.getElementById('__cx1'); if (!c1) { c1 = document.createElement('div'); c1.id = '__cx1'; document.body.appendChild(c1); }
  let c2 = document.getElementById('__cx2'); if (!c2) { c2 = document.createElement('div'); c2.id = '__cx2'; document.body.appendChild(c2); }
  c1.innerHTML = ''; c2.innerHTML = '';
  const SG = window._scanGrid;

  const origTrashQ = window.TrashQ;
  window.TrashQ = { enqueue: () => {} }; // no-op

  // Same file appears in two sections
  SG.create('__cx1', '__cx1', [{ key: 'path', label: 'F', flex: 1, type: 'path' }]);
  SG.create('__cx2', '__cx2', [{ key: 'path', label: 'F', flex: 1, type: 'path' }]);
  SG.addRow('__cx1', { path: 'C:\\shared\\file.txt' });
  SG.addRow('__cx2', { path: 'C:\\shared\\file.txt' });
  SG.addRow('__cx2', { path: 'C:\\shared\\other.txt' });
  await new Promise(r => setTimeout(r, 100));

  const before1 = SG.rowCount('__cx1');
  const before2 = SG.rowCount('__cx2');

  // Click trash on section 1's row — should also remove from section 2
  c1.querySelector('.sg-trash-btn')?.click();
  await new Promise(r => setTimeout(r, 100));

  const after1 = SG.rowCount('__cx1');
  const after2 = SG.rowCount('__cx2');

  window.TrashQ = origTrashQ;
  SG.clear('__cx1'); SG.clear('__cx2');

  return { before1, before2, after1, after2 };
});

assert(crossTest.before1 === 1, `Section 1 before: ${crossTest.before1}`, 'Wrong');
assert(crossTest.before2 === 2, `Section 2 before: ${crossTest.before2}`, 'Wrong');
assert(crossTest.after1 === 0, `Section 1 after: ${crossTest.after1} (removed)`, `Expected 0, got ${crossTest.after1}`);
assert(crossTest.after2 === 1, `Section 2 after: ${crossTest.after2} (cross-section removal)`, `Expected 1, got ${crossTest.after2}`);

// ═══ 4. ACTIONS COLUMN WIDTH ═══
group('4. Actions Column Width');
const widthTest = await page.evaluate(async () => {
  // Check source for the actionsCol width
  const r = await fetch('/js/scan-grid.js');
  const src = await r.text();
  const match = src.match(/actionsCol\s*=\s*\{[^}]*width:\s*(\d+)/);
  return match ? parseInt(match[1]) : null;
});
assert(widthTest === 120, `Actions column width: ${widthTest}px`, `Expected 120, got ${widthTest}`);

// ═══ 5. BUTTON ORDER (trash first) ═══
group('5. Button Order');
const orderTest = await page.evaluate(async () => {
  let c = document.getElementById('__bo'); if (!c) { c = document.createElement('div'); c.id = '__bo'; document.body.appendChild(c); }
  c.innerHTML = '';
  const SG = window._scanGrid;
  SG.create('__bo', '__bo', [{ key: 'path', label: 'F', flex: 1, type: 'path' }]);
  SG.addRow('__bo', { path: 'C:\\test\\f.txt' });
  await new Promise(r => setTimeout(r, 100));

  const actions = c.querySelector('.sg-actions');
  const btns = actions ? [...actions.querySelectorAll('button')] : [];
  const titles = btns.map(b => b.title);
  SG.clear('__bo');
  return titles;
});
assert(orderTest[0] === 'Delete (Recycle Bin)', `First button: trash`, `First: ${orderTest[0]}`);
assert(orderTest[1] === 'Open file in VS Code', `Second button: open file`, `Second: ${orderTest[1]}`);
assert(orderTest[2] === 'Open containing folder', `Third button: open folder`, `Third: ${orderTest[2]}`);

// ═══ 6. CSS TRASH HOVER STYLE ═══
group('6. CSS Styling');
const cssTest = await page.evaluate(async () => {
  const r = await fetch('/css/dashboard.css');
  const src = await r.text();
  return {
    hasTrashHover: src.includes('.sg-trash-btn:hover'),
    hasRedBg: src.includes('var(--red)') && src.includes('.sg-trash-btn'),
  };
});
assert(cssTest.hasTrashHover, 'sg-trash-btn:hover rule exists', 'Trash hover CSS MISSING');
assert(cssTest.hasRedBg, 'Red background on hover', 'Red hover MISSING');

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
