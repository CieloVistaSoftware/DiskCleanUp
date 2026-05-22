/**
 * SectionVM Tests — section-vm.js visibility gating and flush batching
 *
 * Issue #7: _flush() abort when hidden is never tested. Also covers:
 *   - Full render when _fullRenderPending=true (ignores visibility)
 *   - _scheduleFlush deduplication (only one RAF scheduled per cycle)
 *   - Dirty key batching accumulates across onScanEvent calls
 *   - onScanEvent: new result added, result_update updates existing entry
 *   - visible setter triggers full render when tab becomes visible with data
 *   - reset() clears data and calls view.clear()
 *   - loadAndBind() triggers full render after loading
 *
 * Strategy: strip ES import/export, expose SectionVM on window, inject into
 * Playwright/Chromium page. Override requestAnimationFrame with setTimeout(cb,0)
 * for deterministic timing. Create vm + mock view instances inside page.evaluate().
 *
 * Run:  node tests/section-vm-tests.mjs
 * Does NOT require the .NET service to be running.
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT    = path.join(__dirname, '..');
const SVMPATH = path.join(ROOT, 'DiskCleanUp.Service', 'wwwroot', 'viewmodels', 'section-vm.js');

let browser, page;
let passed = 0, failed = 0;
const pageErrors = [];

function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.error(`  ❌ ${msg}`); failed++; }
function assert(c, p, f) { if (c) pass(p); else fail(f); }
function group(n) { console.log(`\n── ${n} ──`); }
const sleep = (ms) => page.evaluate((ms) => new Promise(r => setTimeout(r, ms)), ms);

console.log('\n═══ SectionVM Tests (section-vm.js) ═══\n');

// ── Transform section-vm.js ───────────────────────────────────────────────────
let svmCode = fs.readFileSync(SVMPATH, 'utf8');

svmCode = svmCode.replace(/^import\s+.*?from\s+['"][^'"]+['"];?\s*$/gm, '');
svmCode = svmCode.replace(/^export\s+(async\s+)?(function|const|let|var|class)\s+/gm, '$1$2 ');
// Class declarations don't auto-become window properties — expose explicitly
svmCode += '\nwindow.SectionVM = SectionVM;';

const STUBS = `
/* ── Dependency stubs ── */
const ErrLog = { log() {}, warn() {}, error() {}, crumb() {} };
/* ── End stubs ── */
`;
svmCode = STUBS + svmCode;

// ── Playwright setup ──────────────────────────────────────────────────────────
try {
    browser = await chromium.launch({ headless: true });
    page    = await browser.newPage();
    page.on('pageerror', err => pageErrors.push(err.message));
} catch (e) {
    console.error(`Launch failed: ${e.message}\nRun: npx playwright install chromium`);
    process.exit(1);
}

await page.setContent(`<!DOCTYPE html><html><body></body></html>`);

// Override RAF before injection so SectionVM uses deterministic mock
await page.evaluate(() => {
    window.requestAnimationFrame  = (cb) => setTimeout(cb, 0);
    window.cancelAnimationFrame   = (id) => clearTimeout(id);
    // Fetch mock (queue-based, used by _readAllPages)
    window._fetchQueue = [];
    window.fetch = async (url) => {
        const mock = window._fetchQueue.shift();
        if (!mock) throw new Error('Unexpected fetch: ' + url);
        if (mock.networkError) throw new Error(mock.networkError);
        return { ok: mock.ok !== false, json: async () => mock.data };
    };
    // Mock model shared across tests
    window._model = {
        section: 'test',
        keyField: 'hash',
        parse(row) {
            const src = (row && row.data) ? row.data : row;
            if (!src || !src.hash) return null;
            return { hash: src.hash, files: src.files || [] };
        },
        allCopyPaths: null,
    };
});

const injectErr = await page.addScriptTag({ content: svmCode, type: 'text/javascript' })
    .then(() => null)
    .catch(e => e.message);

assert(!injectErr, 'section-vm.js injected without syntax errors', `Injection error: ${injectErr}`);

// ═══ 1. CLASS AVAILABLE ═══
group('1. SectionVM class accessible');

const classOk = await page.evaluate(() => typeof window.SectionVM === 'function');
assert(classOk, 'window.SectionVM is a constructor function', 'SectionVM not on window');

if (!classOk) { await browser.close(); process.exit(1); }

// Helper — create a fresh vm + mock view, bind them, store as window._vm / window._view
async function freshVm(opts = {}) {
    await page.evaluate((opts) => {
        window._view = {
            rendered: 0,
            batched: [],
            cleared: 0,
            render(data)              { this.rendered++; },
            renderBatch(data, m, keys) { this.batched.push([...keys]); },
            clear()                   { this.cleared++; },
        };
        window._vm = new SectionVM(window._model);
        window._vm.bindView(window._view);
        if (opts.visible !== undefined) window._vm._visible = opts.visible;
    }, opts);
}

// ═══ 2. VISIBILITY GATE ═══
group('2. _flush abort — hidden + no fullRenderPending → view never called');

await freshVm({ visible: false });
await page.evaluate(() => {
    window._vm._dirtyKeys.add('k1');
    window._vm._scheduleFlush();
});
await sleep(20);

const gate1 = await page.evaluate(() => ({ rendered: window._view.rendered, batched: window._view.batched.length }));
assert(gate1.rendered === 0, `hidden vm: render() NOT called (got ${gate1.rendered})`,       `render should not fire`);
assert(gate1.batched  === 0, `hidden vm: renderBatch() NOT called (got ${gate1.batched})`,   `renderBatch should not fire`);

// ═══ 3. FULL RENDER IGNORES VISIBILITY ═══
group('3. _fullRenderPending=true fires render() even when hidden');

await freshVm({ visible: false });
await page.evaluate(() => {
    window._vm.data.set('k1', { hash: 'k1', files: [] });
    window._vm._fullRenderPending = true;
    window._vm._scheduleFlush();
});
await sleep(20);

const fullRender = await page.evaluate(() => window._view.rendered);
assert(fullRender === 1, `fullRenderPending: render() called once (got ${fullRender})`, `Expected render() to fire`);

// ═══ 4. _scheduleFlush DEDUPLICATION ═══
group('4. _scheduleFlush deduplication — 3 calls produce only 1 RAF callback');

await freshVm({ visible: true });
// Check _rafId synchronously before setTimeout(cb,0) can fire
const rafIdSet = await page.evaluate(() => {
    window._vm._dirtyKeys.add('k1');
    window._vm._scheduleFlush();
    const afterFirst = window._vm._rafId !== null;
    window._vm._scheduleFlush();
    window._vm._scheduleFlush();
    return afterFirst;
});
assert(rafIdSet, '_rafId is set after first scheduleFlush (dedup guard active)', '_rafId should be non-null');

await sleep(20);

const batches = await page.evaluate(() => window._view.batched.length);
assert(batches === 1, `3 scheduleFlush calls → 1 renderBatch (got ${batches})`, `Expected 1 batch call`);

// ═══ 5. DIRTY KEY BATCHING ═══
group('5. Dirty keys accumulate and flush together in one renderBatch call');

await freshVm({ visible: true });
await page.evaluate(() => {
    window._vm._dirtyKeys.add('alpha');
    window._vm._dirtyKeys.add('beta');
    window._vm._dirtyKeys.add('gamma');
    window._vm._scheduleFlush();
});
await sleep(20);

const batchKeys = await page.evaluate(() => window._view.batched[0] || []);
assert(batchKeys.length === 3, `3 dirty keys delivered in one batch (got ${batchKeys.length})`, `Expected 3 keys`);
assert(
    batchKeys.includes('alpha') && batchKeys.includes('beta') && batchKeys.includes('gamma'),
    `batch contains alpha, beta, gamma`,
    `Keys: ${batchKeys.join(', ')}`
);

// ═══ 6. onScanEvent — new result ═══
group('6. onScanEvent(result) — adds group to data, marks dirty, schedules flush');

await freshVm({ visible: true });
// Read _dirtyKeys synchronously within the same call as onScanEvent (before setTimeout fires)
const scanResult = await page.evaluate(() => {
    window._vm.onScanEvent({ type: 'result', hash: 'abc', files: [{ path: '/a/file.txt' }] });
    return {
        hasEntry:  window._vm.data.has('abc'),
        isDirty:   window._vm._dirtyKeys.has('abc'),
        fileCount: window._vm.data.get('abc')?.files?.length ?? -1,
    };
});
assert(scanResult.hasEntry,        `onScanEvent(result): 'abc' added to data map`,    `data.has('abc') should be true`);
assert(scanResult.isDirty,         `onScanEvent(result): 'abc' in _dirtyKeys`,        `_dirtyKeys missing 'abc'`);
assert(scanResult.fileCount === 1, `onScanEvent(result): 1 file in group (got ${scanResult.fileCount})`, `Expected 1`);

await sleep(20);
const batchAfterScan = await page.evaluate(() => window._view.batched.length);
assert(batchAfterScan === 1, `onScanEvent triggers renderBatch (got ${batchAfterScan} calls)`, `Expected 1 batch`);

// ═══ 7. onScanEvent — result_update ═══
group('7. onScanEvent(result_update) — updates files on existing group');

await freshVm({ visible: true });
await page.evaluate(() => {
    window._vm.data.set('abc', { hash: 'abc', files: [{ path: '/a' }], _seq: 1 });
    window._vm.onScanEvent({
        type: 'result_update',
        hash: 'abc',
        files: [{ path: '/a' }, { path: '/b' }, { path: '/c' }],
    });
});

const updated = await page.evaluate(() => window._vm.data.get('abc')?.files?.length ?? -1);
assert(updated === 3, `result_update: files updated to 3 (got ${updated})`, `Expected 3 files after update`);

// ═══ 8. visible SETTER — triggers full render with existing data ═══
group('8. visible setter — becoming visible with existing data triggers full render');

await freshVm({ visible: false });
await page.evaluate(() => {
    window._vm.data.set('k1', { hash: 'k1', files: [] });
    window._vm.data.set('k2', { hash: 'k2', files: [] });
    window._vm.visible = true; // setter
});
await sleep(20);

const renderedOnShow = await page.evaluate(() => window._view.rendered);
assert(renderedOnShow === 1, `becoming visible triggers render() (got ${renderedOnShow})`, `Expected render() on visibility change`);

// ═══ 9. reset() ═══
group('9. reset() — clears data, stops scanning, calls view.clear()');

await freshVm({ visible: true });
await page.evaluate(() => {
    window._vm.data.set('k1', { hash: 'k1', files: [] });
    window._vm.data.set('k2', { hash: 'k2', files: [] });
    window._vm._scanning = true;
    window._vm._groupSeq = 5;
    window._vm.reset();
});

const resetState = await page.evaluate(() => ({
    dataSize:  window._vm.data.size,
    scanning:  window._vm._scanning,
    groupSeq:  window._vm._groupSeq,
    cleared:   window._view.cleared,
}));
assert(resetState.dataSize === 0,   `reset: data cleared (size=${resetState.dataSize})`,   `data should be empty`);
assert(!resetState.scanning,        `reset: _scanning = false`,                            `_scanning should be false`);
assert(resetState.groupSeq === 0,   `reset: _groupSeq = 0 (got ${resetState.groupSeq})`,  `_groupSeq should reset to 0`);
assert(resetState.cleared === 1,    `reset: view.clear() called once (got ${resetState.cleared})`, `Expected view.clear()`);

// ═══ 10. loadAndBind() — load + full render ═══
group('10. loadAndBind() — fetches data then calls render()');

await page.evaluate(() => {
    window._fetchQueue = [
        { data: { rows: [{ hash: 'x1', files: [] }, { hash: 'x2', files: [] }], nextOffset: null } }
    ];
});
await freshVm({ visible: true });
await page.evaluate(async () => { await window._vm.loadAndBind(); });
await sleep(20);

const loadBindState = await page.evaluate(() => ({
    dataSize: window._vm.data.size,
    rendered: window._view.rendered,
}));
assert(loadBindState.dataSize === 2, `loadAndBind: 2 groups in data (got ${loadBindState.dataSize})`, `Expected 2`);
assert(loadBindState.rendered >= 1,  `loadAndBind: render() called at least once (got ${loadBindState.rendered})`, `Expected render()`);

// ── Teardown ──────────────────────────────────────────────────────────────────
if (pageErrors.length) {
    console.log(`\nPage errors (${pageErrors.length}):`);
    pageErrors.forEach(e => console.error('  ' + e));
}

await browser.close();
console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`);
process.exit(failed > 0 ? 1 : 0);
