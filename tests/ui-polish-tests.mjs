/**
 * UI Polish Tests — Headers, Tooltips, Descriptions, Layout Version
 * Tests: Actions column label, Modified width, section descriptions,
 *        localStorage version cache-bust, button tooltips
 *
 * Run:  node tests/ui-polish-tests.mjs
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

console.log('\n═══ UI Polish Tests ═══\n');

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

// ═══ 1. SECTION DESCRIPTIONS EXIST ═══
group('1. Section Descriptions');
const sections = [
  'duplicates', 'smart-dedup', 'stale', 'large', 'node-modules',
  'venvs', 'empty', 'images', 'backups', 'tiny-files', 'html-files', 'css-files'
];
for (const sec of sections) {
  const desc = await page.evaluate(s => {
    const el = document.querySelector(`#section-${s} .section-desc`);
    return el ? el.textContent.trim() : null;
  }, sec);
  assert(desc && desc.length > 20, `${sec}: description present (${desc?.length} chars)`,
    `${sec}: description MISSING or too short`);
}

// ═══ 2. DESCRIPTIONS HAVE "Scan" MENTION ═══
group('2. Descriptions Mention Scan');
for (const sec of sections) {
  const hasScan = await page.evaluate(s => {
    const el = document.querySelector(`#section-${s} .section-desc`);
    return el ? el.textContent.includes('Scan') : false;
  }, sec);
  assert(hasScan, `${sec}: mentions "Scan"`, `${sec}: no "Scan" in description`);
}

// ═══ 3. DESCRIPTION STYLING ═══
group('3. Description CSS');
const descStyle = await page.evaluate(() => {
  const el = document.querySelector('.section-desc');
  if (!el) return null;
  const s = getComputedStyle(el);
  return { fontSize: s.fontSize, color: s.color, marginBottom: s.marginBottom };
});
assert(descStyle !== null, 'section-desc element found', 'No .section-desc elements');
assert(descStyle?.fontSize === '12px', `Font size: ${descStyle?.fontSize}`, `Wrong size: ${descStyle?.fontSize}`);

// ═══ 4. ACTIONS COLUMN HAS LABEL "Actions" ═══
group('4. Actions Column Header');
const actionsLabel = await page.evaluate(async () => {
  let c = document.getElementById('__al'); if (!c) { c = document.createElement('div'); c.id = '__al'; document.body.appendChild(c); }
  c.innerHTML = '';
  const SG = window._scanGrid;
  SG.create('__al', '__al', [
    { key: 'path', label: 'File', flex: 1, type: 'path' },
    { key: 'size', label: 'Size', width: 90, type: 'size' },
  ]);
  SG.addRow('__al', { path: 'C:\\test.txt', size: 100 });
  await new Promise(r => setTimeout(r, 100));

  // Get all header labels
  const headers = [...c.querySelectorAll('.sg-hcell')];
  const labels = headers.map(h => h.textContent.replace(/[⇕▲▼]/g, '').trim());
  SG.clear('__al');
  return labels;
});
assert(actionsLabel.includes('Actions'), `Actions header found: [${actionsLabel.join(', ')}]`,
  `Actions header MISSING: [${actionsLabel.join(', ')}]`);

// ═══ 5. MODIFIED COLUMN WIDTH = 140 ═══
group('5. Modified Column Width');
const modWidth = await page.evaluate(async () => {
  const r = await fetch('/js/section-handlers.js');
  const src = await r.text();
  const match = src.match(/modified.*?width:\s*(\d+)/);
  return match ? parseInt(match[1]) : null;
});
assert(modWidth === 140, `Modified width: ${modWidth}px`, `Expected 140, got ${modWidth}`);

// ═══ 6. MODIFIED HEADER READABLE (not truncated) ═══
group('6. Modified Header Readable');
const modTest = await page.evaluate(async () => {
  let c = document.getElementById('__mh'); if (!c) { c = document.createElement('div'); c.id = '__mh'; document.body.appendChild(c); }
  c.innerHTML = '';
  const SG = window._scanGrid;
  SG.create('__mh', '__mh', [
    { key: 'check', width: 56, type: 'checkbox' },
    { key: 'path', label: 'File', flex: 3, minWidth: 150, type: 'path' },
    { key: 'size', label: 'Size', width: 90, type: 'size' },
    { key: 'modified', label: 'Modified', width: 140, type: 'text' },
  ]);
  SG.addRow('__mh', { path: 'C:\\test.txt', size: 100, modified: '2025-01-15' });
  await new Promise(r => setTimeout(r, 100));

  const headers = [...c.querySelectorAll('.sg-hcell')];
  const modHeader = headers.find(h => h.title === 'Modified');
  const result = {
    text: modHeader?.textContent?.replace(/[⇕▲▼]/g, '').trim(),
    title: modHeader?.title,
    width: modHeader ? modHeader.getBoundingClientRect().width : 0,
  };
  SG.clear('__mh');
  return result;
});
assert(modTest.text === 'Modified', `Header text: "${modTest.text}"`, `Truncated to: "${modTest.text}"`);
assert(modTest.title === 'Modified', `Title tooltip: "${modTest.title}"`, `Wrong title: "${modTest.title}"`);
assert(modTest.width >= 100, `Width: ${modTest.width}px (≥100)`, `Too narrow: ${modTest.width}px`);

// ═══ 7. BUTTON TOOLTIPS ON ROW ACTIONS ═══
group('7. Row Action Tooltips');
const tooltips = await page.evaluate(async () => {
  let c = document.getElementById('__tt'); if (!c) { c = document.createElement('div'); c.id = '__tt'; document.body.appendChild(c); }
  c.innerHTML = '';
  const SG = window._scanGrid;
  SG.create('__tt', '__tt', [{ key: 'path', label: 'F', flex: 1, type: 'path' }]);
  SG.addRow('__tt', { path: 'C:\\test.txt' });
  await new Promise(r => setTimeout(r, 100));

  const btns = [...c.querySelectorAll('.sg-actions button')];
  const titles = btns.map(b => b.title).filter(Boolean);
  SG.clear('__tt');
  return titles;
});
assert(tooltips.includes('Delete (Recycle Bin)'), `Trash tooltip: ✓`, `Trash tooltip MISSING`);
assert(tooltips.includes('Open file in VS Code'), `Open file tooltip: ✓`, `Open file tooltip MISSING`);
assert(tooltips.includes('Open containing folder'), `Open folder tooltip: ✓`, `Open folder tooltip MISSING`);
assert(tooltips.length === 3, `3 tooltips on 3 buttons`, `${tooltips.length} tooltips`);

// ═══ 8. ALL HEADER CELLS HAVE TITLE ATTRS ═══
group('8. Header Title Attributes');
const headerTitles = await page.evaluate(async () => {
  let c = document.getElementById('__ht2'); if (!c) { c = document.createElement('div'); c.id = '__ht2'; document.body.appendChild(c); }
  c.innerHTML = '';
  const SG = window._scanGrid;
  SG.create('__ht2', '__ht2', [
    { key: 'check', width: 56, type: 'checkbox' },
    { key: 'path', label: 'File', flex: 3, type: 'path' },
    { key: 'size', label: 'Size', width: 90, type: 'size' },
    { key: 'modified', label: 'Modified', width: 140, type: 'text' },
  ]);
  const headers = [...c.querySelectorAll('.sg-hcell')];
  // Every header with a label should have a matching title attr
  const results = headers.map(h => ({
    label: h.textContent.replace(/[⇕▲▼]/g, '').trim(),
    title: h.title,
    match: h.title === (h.textContent.replace(/[⇕▲▼]/g, '').trim() || h.title),
  }));
  SG.clear('__ht2');
  return results;
});
const allMatch = headerTitles.every(h => h.match);
assert(allMatch, `All ${headerTitles.length} headers have matching titles`,
  `Mismatched: ${headerTitles.filter(h => !h.match).map(h => `"${h.label}" vs "${h.title}"`).join(', ')}`);

// ═══ 9. LAYOUT VERSION CACHE BUST ═══
group('9. Layout Version Cache');
const verTest = await page.evaluate(async () => {
  const r = await fetch('/js/scan-grid.js');
  const src = await r.text();
  const hasVer = src.includes('_LAYOUT_VER');
  const hasClear = src.includes('sg_widths_');
  return { hasVer, hasClear };
});
assert(verTest.hasVer, '_LAYOUT_VER constant exists', '_LAYOUT_VER MISSING');
assert(verTest.hasClear, 'Stale width cleanup logic present', 'Width cleanup MISSING');

// ═══ 10. CSS FILES NAV BUTTON EXISTS ═══
group('10. CSS Files Section');
assert(await page.evaluate(() => !!document.querySelector('#section-css-files .section-desc')),
  'CSS Files has description', 'CSS Files description MISSING');

// ═══ 11. DESCRIPTION CODE TAGS STYLED ═══
group('11. Code Tags in Descriptions');
const codeStyle = await page.evaluate(() => {
  const code = document.querySelector('.section-desc code');
  if (!code) return null;
  const s = getComputedStyle(code);
  return { bg: s.backgroundColor, borderRadius: s.borderRadius };
});
assert(codeStyle !== null, 'Code tags exist in descriptions', 'No code tags found');
assert(codeStyle?.borderRadius === '3px', `Code border-radius: ${codeStyle?.borderRadius}`, 'Wrong radius');

// ═══ 12. NO PAGE ERRORS ═══
group('12. Zero Errors');
assert(pageErrors.length === 0, 'No page errors from all changes',
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
