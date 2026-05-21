/**
 * Chip Filter Tests — scan-grid.js legend chip toggle behavior
 *
 * Issue #446: file-type chips were display-only. Fix in scan-grid.ts adds
 * _activeExts (Set), click handlers in _rebuildLegend, filter check in
 * applyFilter, and .active CSS sync via _syncLegendActive.
 *
 * Strategy: read compiled scan-grid.js, strip ES import/export syntax, inject
 * stubs for dependencies, then inject into a real Playwright/Chromium page.
 * Top-level function declarations become window globals automatically.
 * Tests call window.create/addRow/applyFilter directly — no reimplementation.
 *
 * Run:  node tests/chip-filter-tests.mjs
 * Does NOT require the .NET service to be running.
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs   from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT   = path.join(__dirname, '..');
const SGPATH = path.join(ROOT, 'DiskCleanUp.Service', 'wwwroot', 'js', 'scan-grid.js');

let browser, page;
let passed = 0, failed = 0;
const pageErrors = [];

function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.error(`  ❌ ${msg}`); failed++; }
function assert(c, p, f) { if (c) pass(p); else fail(f); }
function group(n) { console.log(`\n── ${n} ──`); }

console.log('\n═══ Chip Filter Tests (scan-grid.js) ═══\n');

// ── Transform scan-grid.js ────────────────────────────────────────────────────
// Strip ES module syntax so it runs as a plain <script type="text/javascript">.
// Top-level function declarations auto-become window globals in a non-module script.

let sgCode = fs.readFileSync(SGPATH, 'utf8');

// Remove import lines
sgCode = sgCode.replace(/^import\s+.*?from\s+['"][^'"]+['"];?\s*$/gm, '');
// Remove 'export ' keyword prefix from declarations
sgCode = sgCode.replace(/^export\s+(function|const|let|var)\s+/gm, '$1 ');

// Stub out the stripped imports at the top
const STUBS = `
/* ── Dependency stubs ──────────────────────────────────────── */
function colorFor(e) { return '#888888'; }
function bgFor(e)    { return '#333333'; }
function extOf(p)    {
    const m = String(p || '').match(/\\.[^./\\\\]+$/);
    return m ? m[0] : '';
}
function dot(e)      { return '<span>●</span>'; }
function fmtBytes(n) { return n + ' B'; }
function _esc(s)     { return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
const SF = {
    register()    {},
    trackExt()    {},
    getMode()     { return 'all'; },
    getIncluded() { return null; },
    getExcluded() { return new Set(); },
    getFilter()   { return { text: '', mode: 'all' }; },
};
function crumb() {}
const ErrLog = {
    crumb() {},
    log()   {},
    warn()  {},
    error() {},
};
/* ── End stubs ──────────────────────────────────────────────── */
`;

sgCode = STUBS + sgCode;

// ── Playwright setup ──────────────────────────────────────────────────────────

try {
    browser = await chromium.launch({ headless: true });
    page    = await browser.newPage();
    page.on('pageerror', err => pageErrors.push(err.message));
} catch (e) {
    console.error(`Launch failed: ${e.message}\nRun: npx playwright install chromium`);
    process.exit(1);
}

await page.setContent(`<!DOCTYPE html>
<html><body>
<div id="grid-stale"></div>
<div id="sf-status-stale"></div>
<input id="sf-text-stale" value="">
</body></html>`);

const injectErr = await page.addScriptTag({ content: sgCode, type: 'text/javascript' })
    .then(() => null)
    .catch(e => e.message);

assert(!injectErr, 'scan-grid.js injected without syntax errors', `Injection error: ${injectErr}`);

// All exported functions are now window globals
const apiAvailable = await page.evaluate(() =>
    typeof create === 'function' && typeof applyFilter === 'function');
assert(apiAvailable, 'create() and applyFilter() are global functions', 'API functions not accessible as globals');

if (!apiAvailable) {
    await browser.close();
    console.error('\nFatal: cannot proceed\n');
    process.exit(1);
}

// ═══ 1. PUBLIC API ═══
group('1. Public API accessible');
const hasAddRow = await page.evaluate(() => typeof addRow === 'function');
assert(hasAddRow, 'addRow() exported', 'addRow not a function');

// ═══ 2. GRID + ROWS ═══
group('2. Grid creation and row insertion');

await page.evaluate(async () => {
    create('stale', 'grid-stale', [
        { key: 'check', width: 28, type: 'checkbox' },
        { key: 'path',  label: 'Path', flex: 1, type: 'path' },
        { key: 'size',  label: 'Size', width: 80, type: 'size' },
    ]);
    addRow('stale', { path: 'C:\\data\\report.js',  size: 1000 });
    addRow('stale', { path: 'C:\\data\\styles.css', size: 500  });
    addRow('stale', { path: 'C:\\data\\readme.md',  size: 300  });
    await new Promise(r => setTimeout(r, 100)); // microtask flush
});

const rowCount = await page.evaluate(() =>
    document.querySelectorAll('#grid-stale .sg-row.live-row').length);
assert(rowCount === 3, `3 rows inserted (got ${rowCount})`, `Expected 3, got ${rowCount}`);

// ═══ 3. LEGEND CHIPS ═══
group('3. Legend chips with data-ext + cursor:pointer');

await page.waitForFunction(() =>
    document.querySelectorAll('#grid-stale .sg-legend-chip').length >= 3,
    { timeout: 3000 }).catch(() => {});

const chipInfo = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('#grid-stale .sg-legend-chip')];
    return {
        count:           chips.length,
        allHaveDataExt:  chips.every(c => c.dataset.ext && c.dataset.ext.startsWith('.')),
        allAreClickable: chips.every(c => c.style.cursor === 'pointer'),
        exts:            chips.map(c => c.dataset.ext),
    };
});
assert(chipInfo.count >= 3,      `≥3 chips in legend (got ${chipInfo.count})`, `Expected ≥3, got ${chipInfo.count}`);
assert(chipInfo.allHaveDataExt,  `All chips have data-ext (.js .css .md found: ${chipInfo.exts.join(',')})`, 'Some chips missing data-ext');
assert(chipInfo.allAreClickable, 'All chips have cursor:pointer', 'Some chips missing cursor:pointer');

// ═══ 4. CHIP CLICK FILTERS ROWS ═══
group('4. Clicking .js chip hides .css and .md rows');

const clickResult = await page.evaluate(() => {
    const chips  = [...document.querySelectorAll('#grid-stale .sg-legend-chip')];
    const jsChip = chips.find(c => c.dataset.ext === '.js');
    if (!jsChip) { return { error: `No .js chip. Chips: ${chips.map(c=>c.dataset.ext).join(', ')}` }; }

    jsChip.click();

    const rows = [...document.querySelectorAll('#grid-stale .sg-row.live-row')];
    return {
        visibleCount: rows.filter(r => r.style.display !== 'none').length,
        hiddenCount:  rows.filter(r => r.style.display  === 'none').length,
        chipActive:   jsChip.classList.contains('active'),
    };
});

assert(!clickResult.error,           `No error clicking .js chip`,                clickResult.error || '');
assert(clickResult.visibleCount === 1, `1 row visible after .js filter (got ${clickResult.visibleCount})`, `Expected 1, got ${clickResult.visibleCount}`);
assert(clickResult.hiddenCount  === 2, `2 rows hidden after .js filter (got ${clickResult.hiddenCount})`,  `Expected 2, got ${clickResult.hiddenCount}`);
assert(clickResult.chipActive,         '.js chip gains .active CSS class',          '.js chip missing .active');

// ═══ 5. CLEAR BUTTON ═══
group('5. Clear button restores all rows and resets chip state');

const clearResult = await page.evaluate(() => {
    const clearBtn = document.querySelector('#grid-stale .sg-legend-clear');
    if (!clearBtn) { return { error: 'No .sg-legend-clear button found' }; }

    clearBtn.click();

    const rows  = [...document.querySelectorAll('#grid-stale .sg-row.live-row')];
    const chips = [...document.querySelectorAll('#grid-stale .sg-legend-chip')];
    return {
        clearBtnExists:  true,
        visibleAfter:    rows.filter(r => r.style.display !== 'none').length,
        anyChipActive:   chips.some(c => c.classList.contains('active')),
    };
});

assert(!clearResult.error,            'Clear button (.sg-legend-clear) found',      clearResult.error || '');
assert(clearResult.visibleAfter === 3, `All 3 rows restored after clear (got ${clearResult.visibleAfter})`, `Expected 3, got ${clearResult.visibleAfter}`);
assert(!clearResult.anyChipActive,    'No chips remain .active after clear',         'Some chips still .active');

// ═══ 6. SECOND CLICK DESELECTS (TOGGLE OFF) ═══
group('6. Second click on active chip deselects and shows all rows');

const toggleResult = await page.evaluate(() => {
    const chips   = [...document.querySelectorAll('#grid-stale .sg-legend-chip')];
    const cssChip = chips.find(c => c.dataset.ext === '.css');
    if (!cssChip) { return { error: 'No .css chip' }; }

    cssChip.click(); // select
    cssChip.click(); // deselect

    const rows = [...document.querySelectorAll('#grid-stale .sg-row.live-row')];
    return {
        visibleCount: rows.filter(r => r.style.display !== 'none').length,
        chipActive:   cssChip.classList.contains('active'),
    };
});

assert(!toggleResult.error,             'Toggle test ran cleanly',                toggleResult.error || '');
assert(toggleResult.visibleCount === 3, `All 3 rows visible after toggle-off (got ${toggleResult.visibleCount})`, `Expected 3, got ${toggleResult.visibleCount}`);
assert(!toggleResult.chipActive,        '.css chip inactive after second click',   '.css chip still .active');

// ═══ 7. NO PAGE ERRORS ═══
group('7. No browser console errors during test run');
if (pageErrors.length > 0) {
    fail(`${pageErrors.length} page error(s): ${pageErrors.slice(0, 3).join(' | ')}`);
} else {
    pass('No page errors');
}

// ── Summary ───────────────────────────────────────────────────────────────────

await browser.close();
console.log('');
if (failed > 0) {
    console.error(`Chip filter tests FAILED — ${failed} check(s) failed, ${passed} passed`);
    process.exit(1);
} else {
    console.log(`All ${passed} checks passed ✅`);
}
