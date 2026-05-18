/**
 * Frontend Module & Function Tests — Playwright
 *
 * Comprehensive coverage of all JS modules, API endpoints, DOM structure,
 * event flow, breadcrumb system, scan grid, page loader, websocket,
 * actions, section handlers, and trace system.
 *
 * Run:  node tests/frontend-tests.mjs
 * Requires: dotnet run at http://localhost:5000
 */

import { chromium } from 'playwright';

const BASE = 'http://localhost:5000';
let browser, page;
let passed = 0, failed = 0, skipped = 0;
const pageErrors = [];
const consoleErrors = [];

function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.error(`  ❌ ${msg}`); failed++; }
function skip(msg) { console.log(`  ⏭️  ${msg}`); skipped++; }
function assert(c, p, f) { if (c) pass(p); else fail(f); }
function group(n) { console.log(`\n── ${n} ──`); }

// Helper: fetch from WITHIN the browser (avoids Node IPv6 issues)
async function apiFetch(path, opts = {}) {
  return page.evaluate(async ([url, o]) => {
    const r = await fetch(url, o);
    const text = await r.text();
    try { return { ok: r.ok, status: r.status, data: JSON.parse(text) }; }
    catch { return { ok: r.ok, status: r.status, data: text }; }
  }, [`${path}`, opts]);
}

console.log('\n═══ DiskCleanUp Frontend Test Suite ═══\n');

try {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
  page.on('pageerror', err => { pageErrors.push(err.message); });
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
} catch (e) {
  console.error(`Launch failed: ${e.message}\nRun: npx playwright install chromium`);
  process.exit(1);
}

// ═══ 1. PAGE LOAD ═══
group('1. Page Load');
try {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  pass('Page loaded (networkidle)');
} catch (e) {
  fail(`Page load failed: ${e.message}`);
  await browser.close(); process.exit(1);
}
await page.waitForTimeout(3000);

// ═══ 2. ZERO JS ERRORS ═══
group('2. Zero JS Errors');
const modErrs = consoleErrors.filter(e =>
  /Failed to load|SyntaxError|Unexpected token|Cannot find|is not defined/i.test(e));
assert(modErrs.length === 0, 'No module load errors',
  `Module errors:\n${modErrs.map(e => `    ${e}`).join('\n')}`);
assert(pageErrors.length === 0, 'No uncaught page errors',
  `Page errors:\n${pageErrors.map(e => `    ${e}`).join('\n')}`);

// ═══ 3. CORE GLOBALS ═══
group('3. Core Globals');
const globs = {
  'window._T': 'Trace fn', 'window._scanGrid': 'ScanGrid',
  'window._pageLoader': 'PageLoader', 'window._crumbs': 'Breadcrumbs',
  'window.TrashQ': 'TrashQ', 'window.openInVSCode': 'openInVSCode',
  'window._wsSend': 'wsSend', 'window._scanFilter': 'ScanFilter',
  'window._updateLoadMoreBtn': 'LoadMore updater',
};
for (const [expr, label] of Object.entries(globs)) {
  const ok = await page.evaluate(e => { try { return eval(e) !== undefined; } catch { return false; } }, expr);
  assert(ok, `${label} exists`, `${label} (${expr}) UNDEFINED`);
}

// ═══ 4. BREADCRUMB SYSTEM ═══
group('4. Breadcrumb System');
const cs = await page.evaluate(() => {
  const c = window._crumbs;
  return c ? { dump: typeof c.dump, recent: typeof c.recent, crumb: typeof c.crumb, flush: typeof c.flush } : null;
});
assert(cs !== null, '_crumbs exists', '_crumbs null');
if (cs) {
  for (const [k, v] of Object.entries(cs)) assert(v === 'function', `${k}() is fn`, `${k}() missing`);
}

const ct = await page.evaluate(() => {
  window._crumbs.crumb('test', 'hello', { foo: 'bar' });
  return window._crumbs.recent(1)[0] || null;
});
assert(ct?.module === 'test' && ct?.fn === 'hello', 'drop+retrieve works', `failed: ${JSON.stringify(ct)}`);

const icc = await page.evaluate(() => window._crumbs.recent(200).filter(c => c.module === 'init').length);
assert(icc > 0, `${icc} init breadcrumbs`, 'No init breadcrumbs');

const dStr = await page.evaluate(() => window._crumbs.dump(5));
assert(typeof dStr === 'string' && dStr.length > 0, 'dump() returns string', 'dump() bad');

const oflow = await page.evaluate(() => {
  for (let i = 0; i < 250; i++) window._crumbs.crumb('overflow', `fn${i}`);
  return window._crumbs.recent(200).length;
});
assert(oflow === 200, 'Ring buffer caps at 200', `Ring buffer: ${oflow}`);

// ═══ 5. TRACE SYSTEM ═══
group('5. Trace System');
assert(await page.evaluate(() => typeof window._T === 'function'), '_T is fn', '_T not fn');

let tr = await apiFetch('/api/trace');
const initLines = (tr.data?.lines || []).filter(l => l.includes('[INIT]'));
assert(initLines.length > 0, `${initLines.length} INIT trace lines`, 'No INIT in trace');

await page.evaluate(() => window._crumbs.flush());
await page.waitForTimeout(1500);
tr = await apiFetch('/api/trace');
const wfL = (tr.data?.lines || []).filter(l => l.includes('[WF:'));
assert(wfL.length > 0, `${wfL.length} WF: lines in trace`, 'No WF: lines after flush');

const cacheL = (tr.data?.lines || []).filter(l => l.includes('[CACHE]'));
assert(cacheL.length > 0, `${cacheL.length} CACHE trace lines`, 'No CACHE lines');

// ═══ 6. SCAN GRID API ═══
group('6. Scan Grid API');
for (const fn of ['create','addRow','clear','getChecked','selectAll','applyFilter','showSkeleton','removeSkeleton']) {
  assert(await page.evaluate(f => typeof window._scanGrid?.[f] === 'function', fn),
    `scanGrid.${fn}()`, `scanGrid.${fn}() MISSING`);
}

// Functional: create + addRow + DOM verify
await page.evaluate(() => {
  let c = document.getElementById('__tc'); if (!c) { c = document.createElement('div'); c.id = '__tc'; document.body.appendChild(c); }
  c.innerHTML = '';
  window._scanGrid.create('__t', '__tc', [
    { key: 'check', width: 28, type: 'checkbox' },
    { key: 'path', label: 'File', flex: 1, type: 'path' },
    { key: 'size', label: 'Size', width: 80, type: 'size' },
  ]);
  window._scanGrid.addRow('__t', { path: 'C:\\test\\f1.txt', size: 1234 });
  window._scanGrid.addRow('__t', { path: 'C:\\test\\f2.log', size: 5678 });
  window._scanGrid.addRow('__t', { path: 'C:\\test\\f3.js', size: 9012 });
});
await page.waitForTimeout(100);
const rc = await page.evaluate(() => document.querySelectorAll('#sg-body-__t .sg-row').length);
assert(rc === 3, `Grid: ${rc} rows`, `Expected 3, got ${rc}`);

// selectAll + getChecked
const chk = await page.evaluate(() => { window._scanGrid.selectAll('__t', true); return window._scanGrid.getChecked('__t').length; });
assert(chk === 3, `selectAll+getChecked: ${chk}`, `Wrong checked: ${chk}`);

// clear
await page.evaluate(() => window._scanGrid.clear('__t'));
await page.waitForTimeout(50);
assert(await page.evaluate(() => document.querySelectorAll('#sg-body-__t .sg-row').length) === 0,
  'clear() removed all', 'Rows remain after clear');

// ═══ 7. PAGE LOADER API ═══
group('7. Page Loader API');
for (const fn of ['loadPage','hasMore','resetPaging','loadedCount']) {
  assert(await page.evaluate(f => typeof window._pageLoader?.[f] === 'function', fn),
    `pageLoader.${fn}()`, `pageLoader.${fn}() MISSING`);
}
const plTest = await page.evaluate(async () => {
  const r = await window._pageLoader.loadPage('__nope__');
  return { arr: Array.isArray(r.rows), num: typeof r.loaded === 'number' };
});
assert(plTest.arr && plTest.num, 'loadPage returns {rows[],loaded}', 'loadPage shape wrong');
assert(await page.evaluate(() => typeof window._pageLoader.loadedCount('x') === 'number'),
  'loadedCount returns number', 'loadedCount wrong type');

// ═══ 8. API ENDPOINTS ═══
group('8. API Endpoints');
for (const [p, l] of [['/api/config','Config'],['/api/session','Session'],['/api/savings','Savings'],
  ['/api/errors','Errors'],['/api/trace','Trace'],['/api/debug','Debug'],
  ['/api/metrics','Metrics'],['/api/keep-list','KeepList'],['/api/fixes','Fixes']]) {
  const r = await apiFetch(p);
  assert(r.ok, `GET ${l} → ${r.status}`, `GET ${l} → ${r.status}`);
}

// POST /api/trace
const trPost = await page.evaluate(async () => {
  const r = await fetch('/api/trace', { method: 'POST', headers: {'Content-Type':'text/plain'}, body: '+999ms [TEST] api trace post' });
  return r.ok;
});
assert(trPost, 'POST /api/trace works', 'POST /api/trace failed');

// POST /api/debug
const dbPost = await page.evaluate(async () => {
  const r = await fetch('/api/debug', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify([{ts:0,module:'test',fn:'t',detail:null}]) });
  return r.ok;
});
assert(dbPost, 'POST /api/debug works', 'POST /api/debug failed');

// DELETE /api/debug
const dbDel = await page.evaluate(async () => {
  const r = await fetch('/api/debug', { method: 'DELETE' }); return r.ok;
});
assert(dbDel, 'DELETE /api/debug works', 'DELETE /api/debug failed');

// Verify reset
const dbAfter = await apiFetch('/api/debug');
assert(dbAfter.data?.count === 0, 'Debug reset count=0', `Debug after reset: ${dbAfter.data?.count}`);

// Cache endpoint
const cacheR = await apiFetch('/api/cache/stale');
assert([200,204,404].includes(cacheR.status), `GET /api/cache/stale → ${cacheR.status}`, `Unexpected: ${cacheR.status}`);

// ═══ 9. NAV TABS & SECTIONS ═══
group('9. Nav Tabs & Sections');
const allSec = ['duplicates','smart-dedup','stale','large','node-modules','empty','venvs','images','backups','tiny-files','html-files','savings'];
for (const s of allSec) {
  assert(await page.evaluate(s => !!document.getElementById(`section-${s}`), s),
    `#section-${s}`, `#section-${s} MISSING`);
}
const tabBtns = await page.evaluate(() =>
  [...document.querySelectorAll('nav button[data-section]')].map(b => b.dataset.section));
for (const s of tabBtns.slice(0, 6)) {
  await page.click(`nav button[data-section="${s}"]`);
  await page.waitForTimeout(50);
  assert(await page.evaluate(s => document.getElementById(`section-${s}`)?.classList.contains('active-section'), s),
    `Tab "${s}" activates`, `Tab "${s}" failed`);
}

// ═══ 10. STATUS BARS ═══
group('10. Status Bars');
for (const s of allSec.filter(s => s !== 'savings')) {
  assert(await page.evaluate(s => !!document.getElementById(`sb-${s}`), s),
    `#sb-${s}`, `#sb-${s} MISSING`);
}

// ═══ 11. SCAN BUTTONS ═══
group('11. Scan Buttons');
const sbc = await page.evaluate(() => document.querySelectorAll('button[data-action="scan"]').length);
assert(sbc >= 10, `${sbc} scan buttons`, `Only ${sbc}`);

// ═══ 12. WEBSOCKET ═══
group('12. WebSocket');
try {
  await page.waitForFunction(() => document.getElementById('connStatus')?.className === 'connected', { timeout: 10000 });
  pass('WebSocket connected');
} catch { fail('WebSocket never connected'); }
assert(await page.evaluate(() => typeof window._wsSend === 'function'), '_wsSend() exists', '_wsSend() missing');

// ═══ 13. FREEZE DETECTOR ═══
group('13. Freeze Detector');
await page.waitForTimeout(3000);
// hbN is inside a closure — check for HB trace lines instead
const hbTr = await apiFetch('/api/trace');
const hbLines = (hbTr.data?.lines || []).filter(l => l.includes('[HB]'));
assert(hbLines.length > 0, `Heartbeat ticking (${hbLines.length} HB lines)`, 'No HB lines in trace');

// ═══ 14. EVENT QUEUE ═══
group('14. Event Queue');
assert(await page.evaluate(() => typeof window._eventQueueDepth === 'number'), 'eqDepth accessible', 'eqDepth missing');
assert(await page.evaluate(() => typeof window._eventQueueDraining === 'boolean'), 'eqDraining accessible', 'eqDraining missing');

// ═══ 15. ACTIONS MODULE ═══
group('15. Actions');
for (const fn of ['trashGroup', 'trashImage']) {
  assert(await page.evaluate(f => typeof window[f] === 'function', fn), `window.${fn}()`, `${fn}() MISSING`);
}
assert(await page.evaluate(() => typeof window.TrashQ?.enqueue === 'function'), 'TrashQ.enqueue()', 'TrashQ.enqueue MISSING');

// ═══ 16. SCAN FILTER ═══
group('16. Scan Filter');
for (const fn of ['register','getMode','getIncluded','getExcluded','trackExt','rebuild']) {
  assert(await page.evaluate(f => typeof window._scanFilter?.[f] === 'function', fn),
    `scanFilter.${fn}()`, `scanFilter.${fn}() MISSING`);
}

// ═══ 17. EXT COLORS ═══
group('17. Ext Colors Integration');
const ecTest = await page.evaluate(() => {
  try {
    let c = document.getElementById('__ec'); if (!c) { c = document.createElement('div'); c.id = '__ec'; document.body.appendChild(c); }
    c.innerHTML = '';
    window._scanGrid.create('__ec', '__ec', [{ key: 'path', label: 'F', flex: 1, type: 'path' }]);
    window._scanGrid.addRow('__ec', { path: 'x.js' });
    window._scanGrid.addRow('__ec', { path: 'x.css' });
    return true;
  } catch (e) { return e.message; }
});
assert(ecTest === true, 'ext-colors works through grid', `ext-colors: ${ecTest}`);

// ═══ 18. KEEP LIST ═══
group('18. Keep List');
assert(await page.evaluate(() => typeof window.keepPaths === 'function'), 'keepPaths()', 'keepPaths MISSING');

// ═══ 19. SAVINGS ═══
group('19. Savings');
assert(await page.evaluate(() => !!document.getElementById('section-savings')), 'Savings section', 'Missing');

// ═══ 20. METRICS ═══
group('20. Metrics');
assert(await page.evaluate(() => !!document.getElementById('cpuCanvas')), 'CPU canvas', 'Missing');
assert(await page.evaluate(() => !!document.getElementById('memCanvas')), 'Mem canvas', 'Missing');

// ═══ 21. LOAD MORE BUTTONS ═══
group('21. Load More Buttons');
const lmC = await page.evaluate(() => document.querySelectorAll('[id^="loadMore-"]').length);
assert(lmC >= 5, `${lmC} Load More buttons`, `Only ${lmC}`);

// ═══ 22. UI UTILS ═══
group('22. UI Utils');
assert(await page.evaluate(() => document.querySelector('nav button.active') !== null), 'Active tab set', 'No active tab');

// ═══ 23. COLUMN RESIZE HANDLES ═══
group('23. Column Controls');
const hasGrid = await page.evaluate(() => !!document.querySelector('.sg-header'));
if (hasGrid) {
  assert(await page.evaluate(() => !!document.querySelector('.sg-header .sg-resize-handle')),
    'Resize handles present', 'No resize handles');
} else { skip('No grids — skip resize test'); }

// ═══ 24. RECYCLE BIN ═══
group('24. Recycle Bin');
assert(await page.evaluate(() => !!document.getElementById('recycleBinBtn')),
  'recycleBinBtn exists', 'recycleBinBtn missing');
assert(await page.evaluate(() => !!document.getElementById('recycleBinPanel')),
  'recycleBinPanel exists', 'recycleBinPanel missing');

// ═══ 25. SETTINGS ═══
group('25. Settings');
assert(await page.evaluate(() => !!document.getElementById('section-settings')),
  'section-settings exists', 'section-settings missing');
assert(await page.evaluate(() => !!document.querySelector('button[data-section="settings"]')),
  'Settings tab button exists', 'Settings tab missing');

// ═══ 26. ERROR LOGGER ═══
group('26. Error Logger');
// ErrLog is ES module export, not on window. Check /api/errors endpoint works and error-logger.js loaded (no page errors = it loaded)
assert(await page.evaluate(async () => { const r = await fetch('/api/errors'); return r.ok; }),
  'Error logger API works', 'Error logger API failed');
// Verify no JS errors proves error-logger.js module loaded successfully
assert(pageErrors.length === 0, 'error-logger.js loaded (no page errors)', 'Page errors exist');

// ═══ 27. TRACE VIEWER ═══
group('27. Trace Viewer');
const tv = await browser.newPage();
try {
  await tv.goto(`${BASE}/trace-viewer.html`, { waitUntil: 'domcontentloaded', timeout: 5000 });
  pass('trace-viewer.html loads');
  assert(await tv.evaluate(() => !!document.getElementById('log')), '#log element', '#log missing');
} catch (e) { fail(`Trace viewer: ${e.message}`); }
await tv.close();

// ═══ 28. SCAN GRID SORT ═══
group('28. Grid Sort');
const sortOk = await page.evaluate(async () => {
  let c = document.getElementById('__sc'); if (!c) { c = document.createElement('div'); c.id = '__sc'; document.body.appendChild(c); }
  c.innerHTML = '';
  const SG = window._scanGrid;
  SG.create('__s', '__sc', [{ key: 'path', label: 'F', flex: 1, type: 'path' }, { key: 'size', label: 'S', width: 80, type: 'size' }]);
  SG.addRow('__s', { path: 'b.txt', size: 200 });
  SG.addRow('__s', { path: 'a.txt', size: 100 });
  SG.addRow('__s', { path: 'c.txt', size: 300 });
  await new Promise(r => setTimeout(r, 50));
  const hdr = c.querySelector('.sg-header .sg-hcell:nth-child(3)');
  if (hdr) hdr.click();
  await new Promise(r => setTimeout(r, 50));
  return c.querySelectorAll('.sg-body .sg-row').length === 3;
});
assert(sortOk, 'Sort: 3 rows after click', 'Sort failed');

// ═══ 29. SKELETON ═══
group('29. Skeleton');
const sk = await page.evaluate(() => {
  let c = document.getElementById('__skc'); if (!c) { c = document.createElement('div'); c.id = '__skc'; document.body.appendChild(c); }
  c.innerHTML = '';
  const SG = window._scanGrid;
  SG.showSkeleton('__sk', '__skc', [{ key: 'path', label: 'F', flex: 1, type: 'path' }]);
  const n = c.querySelectorAll('.sg-skel-row').length;
  SG.removeSkeleton('__sk');
  return { before: n, after: c.querySelectorAll('.sg-skel-row').length };
});
assert(sk.before === 5, `showSkeleton: ${sk.before}`, `Wrong: ${sk.before}`);
assert(sk.after === 0, 'removeSkeleton clears', `${sk.after} left`);

// ═══ 30. BREADCRUMB→TRACE INTEGRATION ═══
group('30. Breadcrumb→Trace');
const tag = `t_${Date.now()}`;
await page.evaluate(t => { window._crumbs.crumb('integ', t, { m: 1 }); window._crumbs.flush(); }, tag);
await page.waitForTimeout(1500);
const tr2 = await apiFetch('/api/trace');
assert((tr2.data?.lines || []).some(l => l.includes(tag)),
  'Breadcrumb found in trace', 'Breadcrumb NOT in trace after flush');

// ═══ 31. JS FILE SERVING ═══
group('31. JS Files Serve');
const jsFiles = ['breadcrumb.js','error-logger.js','metrics.js','event-queue.js','column-controls.js',
  'status-bar.js','table-utils.js','ui-utils.js','savings.js','settings.js','trash-queue.js',
  'websocket.js','actions.js','ext-colors.js','scan-filter.js','scan-grid.js','section-handlers.js',
  'events.js','keep-list.js','recycle-bin.js','init.js','page-loader.js'];
for (const f of jsFiles) {
  const r = await page.evaluate(async u => { const r = await fetch(u); return r.status; }, `/js/${f}`);
  assert(r === 200, `${f} → 200`, `${f} → ${r}`);
}

// ═══ 32. SECTION MODULE FILES ═══
group('32. Section Files');
const dupJs = await page.evaluate(async () => { const r = await fetch('/sections/duplicates.js'); return r.status; });
assert(dupJs === 200, 'duplicates.js → 200', `duplicates.js → ${dupJs}`);

// ═══ 33. WB-CORE LIB ═══
group('33. WB-Core');
for (const f of ['/lib/wb-core/utils/pubsub.js', '/lib/wb-core/utils/format.js']) {
  const s = await page.evaluate(async u => { const r = await fetch(u); return r.status; }, f);
  assert(s === 200, `${f} → 200`, `${f} → ${s}`);
}

// ═══ 34. CONN STATUS BADGE ═══
group('34. Conn Badge');
const cb = await page.evaluate(() => { const e = document.getElementById('connStatus'); return e ? e.className : null; });
assert(cb === 'connected', 'Badge shows connected', `Badge: ${cb}`);

// ═══ 35. GRID MEMORY (100 rows add/clear) ═══
group('35. Grid Memory');
const mm = await page.evaluate(async () => {
  let c = document.getElementById('__mc'); if (!c) { c = document.createElement('div'); c.id = '__mc'; document.body.appendChild(c); }
  c.innerHTML = '';
  const SG = window._scanGrid;
  SG.create('__m', '__mc', [{ key: 'path', label: 'F', flex: 1, type: 'path' }, { key: 'size', label: 'S', width: 80, type: 'size' }]);
  for (let i = 0; i < 100; i++) SG.addRow('__m', { path: `C:\\f${i}.txt`, size: i * 100 });
  await new Promise(r => setTimeout(r, 100));
  const b = document.querySelectorAll('#sg-body-__m .sg-row').length;
  SG.clear('__m');
  await new Promise(r => setTimeout(r, 50));
  return { b, a: document.querySelectorAll('#sg-body-__m .sg-row').length };
});
assert(mm.b === 100, `100 rows added`, `Got ${mm.b}`);
assert(mm.a === 0, '100 rows cleared', `${mm.a} remain`);

// ═══ RESULTS ═══
console.log('\n═══════════════════════════════════════');
console.log(`  PASSED:  ${passed}`);
console.log(`  FAILED:  ${failed}`);
console.log(`  SKIPPED: ${skipped}`);
console.log(`  TOTAL:   ${passed + failed + skipped}`);
const pct = ((passed / (passed + failed)) * 100).toFixed(1);
console.log(`  PASS RATE: ${pct}%`);
console.log('═══════════════════════════════════════\n');

await browser.close();
process.exit(failed > 0 ? 1 : 0);
