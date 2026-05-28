/**
 * Page Loader Tests — page-loader.js pagination logic
 *
 * Issue #8: no tests for 40KB paged loading, Load More, exhaustion,
 * error handling, resetPaging, resumeFromEof, getCacheAge.
 *
 * Strategy: strip ES import/export, inject into Playwright/Chromium page,
 * override window.fetch with a queue-based mock, drive loadPage() calls,
 * assert state via the window._pageLoader API.
 *
 * Run:  node tests/page-loader-tests.mjs
 * Does NOT require the .NET service to be running.
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT   = path.join(__dirname, '..');
const PLPATH = path.join(ROOT, 'DiskCleanUp.Service', 'wwwroot', 'js', 'page-loader.js');

let browser, page;
let passed = 0, failed = 0;
const pageErrors = [];

function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.error(`  ❌ ${msg}`); failed++; }
function assert(c, p, f) { if (c) pass(p); else fail(f); }
function group(n) { console.log(`\n── ${n} ──`); }

console.log('\n═══ Page Loader Tests (page-loader.js) ═══\n');

// ── Transform page-loader.js ─────────────────────────────────────────────────
let plCode = fs.readFileSync(PLPATH, 'utf8');

plCode = plCode.replace(/^import\s+.*?from\s+['"][^'"]+['"];?\s*$/gm, '');
plCode = plCode.replace(/^export\s+(async\s+)?(function|const|let|var)\s+/gm, '$1$2 ');

const STUBS = `
/* ── Dependency stubs ── */
function crumb() {}
/* ── End stubs ── */
`;
plCode = STUBS + plCode;

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

// Install queue-based fetch mock (tracks last URL, dequeues per call)
await page.evaluate(() => {
    window._fetchQueue = [];
    window._lastFetchUrl = null;
    window.fetch = async (url) => {
        window._lastFetchUrl = url;
        const mock = window._fetchQueue.shift();
        if (!mock) throw new Error('Unexpected fetch: ' + url);
        if (mock.networkError) throw new Error(mock.networkError);
        return {
            ok: mock.ok !== false,
            json: async () => mock.data,
        };
    };
});

const injectErr = await page.addScriptTag({ content: plCode, type: 'text/javascript' })
    .then(() => null)
    .catch(e => e.message);

assert(!injectErr, 'page-loader.js injected without syntax errors', `Injection error: ${injectErr}`);

// ═══ 1. PUBLIC API ═══
group('1. Public API accessible via window._pageLoader');

const apiOk = await page.evaluate(() =>
    typeof window._pageLoader === 'object' &&
    typeof window._pageLoader.loadPage      === 'function' &&
    typeof window._pageLoader.hasMore       === 'function' &&
    typeof window._pageLoader.resetPaging   === 'function' &&
    typeof window._pageLoader.resumeFromEof === 'function' &&
    typeof window._pageLoader.getCacheAge   === 'function' &&
    typeof window._pageLoader.loadedCount   === 'function'
);
assert(apiOk, 'window._pageLoader exposes all 6 API functions', '_pageLoader API incomplete or missing');

if (!apiOk) { await browser.close(); process.exit(1); }

// ═══ 2. FIRST PAGE LOAD ═══
group('2. First page load — no ?offset in URL, rows + loaded returned');

const iso1 = new Date().toISOString();
await page.evaluate((iso) => {
    window._pageLoader.resetPaging('s1');
    window._lastFetchUrl = null;
    window._fetchQueue = [
        { data: { rows: [{ id: 1 }, { id: 2 }], nextOffset: 200, cachedAt: iso } }
    ];
}, iso1);

const r1 = await page.evaluate(async () => window._pageLoader.loadPage('s1'));

assert(r1.rows.length === 2,  `loadPage returns 2 rows (got ${r1.rows.length})`,  `Expected 2 rows`);
assert(r1.loaded === 2,       `loaded count = 2 (got ${r1.loaded})`,              `Expected loaded=2`);

const urlHasNoOffset = await page.evaluate(() => !(window._lastFetchUrl || '').includes('offset='));
assert(urlHasNoOffset, 'first fetch URL has no ?offset param', `URL: ${await page.evaluate(() => window._lastFetchUrl)}`);

const hasMore1 = await page.evaluate(() => window._pageLoader.hasMore('s1'));
assert(hasMore1, 'hasMore() = true after first page (nextOffset=200)', 'hasMore should be true');

const age1 = await page.evaluate(() => window._pageLoader.getCacheAge('s1'));
assert(age1 !== null && age1 >= 0, `getCacheAge returns ≥0 minutes (got ${age1?.toFixed(3)})`, 'getCacheAge returned null');

// ═══ 3. LOAD MORE — SECOND PAGE ═══
group('3. Load More — second loadPage uses ?offset=200');

await page.evaluate(() => {
    window._lastFetchUrl = null;
    window._fetchQueue = [
        { data: { rows: [{ id: 3 }, { id: 4 }, { id: 5 }], nextOffset: null } }
    ];
});

const r2 = await page.evaluate(async () => window._pageLoader.loadPage('s1'));

assert(r2.rows.length === 3, `second page returns 3 rows (got ${r2.rows.length})`, `Expected 3`);
assert(r2.loaded === 5,      `cumulative loaded = 5 (got ${r2.loaded})`,           `Expected 5`);

const url2 = await page.evaluate(() => window._lastFetchUrl || '');
assert(url2.includes('offset=200'), `second fetch uses ?offset=200 (url: ${url2})`, `Missing offset in: ${url2}`);

const hasMore2 = await page.evaluate(() => window._pageLoader.hasMore('s1'));
assert(!hasMore2, 'hasMore() = false after last page (nextOffset null)', 'hasMore should be false');

// ═══ 4. EXHAUSTION — NO FETCH ON SUBSEQUENT CALL ═══
group('4. Exhausted section — subsequent loadPage skips fetch entirely');

await page.evaluate(() => { window._lastFetchUrl = null; window._fetchQueue = []; });

const r3 = await page.evaluate(async () => window._pageLoader.loadPage('s1'));

assert(r3.rows.length === 0, `exhausted loadPage returns 0 rows (got ${r3.rows.length})`, `Expected 0`);
assert(r3.loaded === 5,      `exhausted loadPage keeps loaded=5 (got ${r3.loaded})`,      `Expected 5`);

const noFetch = await page.evaluate(() => window._lastFetchUrl === null);
assert(noFetch, 'no fetch issued on exhausted section', 'Unexpected fetch on exhausted section');

// ═══ 5. HTTP ERROR ═══
group('5. HTTP error (res.ok=false) → empty rows, section exhausted');

await page.evaluate(() => {
    window._pageLoader.resetPaging('err1');
    window._fetchQueue = [{ ok: false, data: {} }];
});

const rErr = await page.evaluate(async () => window._pageLoader.loadPage('err1'));
assert(rErr.rows.length === 0, `HTTP error: 0 rows returned (got ${rErr.rows.length})`, `Expected 0`);

const exhaustedErr = await page.evaluate(() => !window._pageLoader.hasMore('err1'));
assert(exhaustedErr, 'section exhausted after HTTP error', 'should be exhausted after 4xx/5xx');

// ═══ 6. NETWORK ERROR ═══
group('6. Network error (fetch throws) → empty rows, section exhausted');

await page.evaluate(() => {
    window._pageLoader.resetPaging('net1');
    window._fetchQueue = [{ networkError: 'Connection refused' }];
});

const rNet = await page.evaluate(async () => window._pageLoader.loadPage('net1'));
assert(rNet.rows.length === 0, `network error: 0 rows returned (got ${rNet.rows.length})`, `Expected 0`);

const exhaustedNet = await page.evaluate(() => !window._pageLoader.hasMore('net1'));
assert(exhaustedNet, 'section exhausted after network error', 'should be exhausted after throw');

// ═══ 7. RESET PAGING ═══
group('7. resetPaging — clears all state, next load starts from offset 0');

await page.evaluate(() => {
    window._lastFetchUrl = null;
    window._fetchQueue = [
        { data: { rows: [{ id: 99 }], nextOffset: null } }
    ];
});

const rReset = await page.evaluate(async () => {
    window._pageLoader.resetPaging('s1');
    return window._pageLoader.loadPage('s1');
});

assert(rReset.rows.length === 1, `after reset: 1 row loaded (got ${rReset.rows.length})`, `Expected 1`);
assert(rReset.loaded === 1,      `after reset: loaded=1 (got ${rReset.loaded})`,           `Expected 1`);

const urlAfterReset = await page.evaluate(() => window._lastFetchUrl || '');
assert(!urlAfterReset.includes('offset='), `after reset: no ?offset in URL (url: ${urlAfterReset})`, `Should not have offset`);

// ═══ 8. RESUME FROM EOF (live-scan pattern) ═══
group('8. resumeFromEof — restores offset after exhaustion for live-scan');

await page.evaluate(() => {
    window._pageLoader.resetPaging('live1');
    window._fetchQueue = [
        { data: { rows: [{ id: 1 }], nextOffset: null, resumeOffset: 512 } }
    ];
});
await page.evaluate(async () => window._pageLoader.loadPage('live1'));

const noMoreBeforeResume = await page.evaluate(() => !window._pageLoader.hasMore('live1'));
assert(noMoreBeforeResume, 'hasMore=false before resumeFromEof', 'should be false pre-resume');

await page.evaluate(() => window._pageLoader.resumeFromEof('live1'));

const hasMoreAfterResume = await page.evaluate(() => window._pageLoader.hasMore('live1'));
assert(hasMoreAfterResume, 'hasMore=true after resumeFromEof', 'should be true post-resume');

await page.evaluate(() => {
    window._lastFetchUrl = null;
    window._fetchQueue = [{ data: { rows: [{ id: 2 }], nextOffset: null } }];
});
await page.evaluate(async () => window._pageLoader.loadPage('live1'));

const resumeUrl = await page.evaluate(() => window._lastFetchUrl || '');
assert(resumeUrl.includes('offset=512'), `resumed fetch uses resumeOffset=512 (url: ${resumeUrl})`, `Missing offset=512 in: ${resumeUrl}`);

// ═══ 9. loadedCount ═══
group('9. loadedCount — returns accumulated row count across pages');

const countS1 = await page.evaluate(() => window._pageLoader.loadedCount('s1'));
assert(countS1 === 1, `loadedCount('s1') = 1 (got ${countS1})`, `Expected 1 (after reset + 1 row reload)`);

const countUnknown = await page.evaluate(() => window._pageLoader.loadedCount('never-loaded'));
assert(countUnknown === 0, `loadedCount for unknown section = 0 (got ${countUnknown})`, `Expected 0`);

// ── Teardown ──────────────────────────────────────────────────────────────────
if (pageErrors.length) {
    console.log(`\nPage errors (${pageErrors.length}):`);
    pageErrors.forEach(e => console.error('  ' + e));
}

await browser.close();
console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`);
process.exit(failed > 0 ? 1 : 0);
