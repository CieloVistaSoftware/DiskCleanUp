/**
 * Grid Action Button Tests — ACTIONS-001
 * Tests that ALL scan grids have working action buttons:
 *   🗑️ Trash (Recycle Bin), 📄 Open File, 📂 Open Folder, 🔒 Keep
 *
 * Run:  node tests/grid-actions-tests.mjs
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

console.log('\n═══ Grid Action Button Tests (ACTIONS-001) ═══\n');

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

// ═══════════════════════════════════════════════════════════════════════════
//  TEST: Action buttons exist on every scan grid section
// ═══════════════════════════════════════════════════════════════════════════

const GRID_SECTIONS = [
  'stale', 'large', 'node-modules', 'venvs', 'empty',
  'backups', 'tiny-files', 'html-files', 'css-files', 'smart-dedup'
];

group('1. Action Buttons Present in All Grid Sections');

for (const section of GRID_SECTIONS) {
  const result = await page.evaluate(async (sec) => {
    // Create a temp container
    let c = document.getElementById(`__test_${sec}`);
    if (!c) { c = document.createElement('div'); c.id = `__test_${sec}`; document.body.appendChild(c); }
    c.innerHTML = '';

    const SG = window._scanGrid;
    if (!SG) return { error: 'window._scanGrid not found' };

    // Create grid with standard columns
    const cols = [
      { key: 'check', width: 56, type: 'checkbox' },
      { key: 'path', label: 'File', flex: 3, minWidth: 150, type: 'path' },
      { key: 'size', label: 'Size', width: 90, type: 'size' },
    ];
    SG.create(sec, `__test_${sec}`, cols);
    SG.addRow(sec, { path: `C:\\test\\${sec}\\sample.txt`, size: 1024 });
    await new Promise(r => setTimeout(r, 50));

    const body = document.getElementById(`sg-body-${sec}`);
    if (!body) return { error: `sg-body-${sec} not found` };

    const rows = body.querySelectorAll('.sg-row');
    const trashBtns = body.querySelectorAll('.sg-trash-btn');
    const allBtns = body.querySelectorAll('.sg-actions button');
    const keepBtns = body.querySelectorAll('.btn-keep');

    return {
      rows: rows.length,
      trashBtns: trashBtns.length,
      actionBtns: allBtns.length,
      keepBtns: keepBtns.length,
    };
  }, section);

  if (result.error) {
    fail(`${section}: ${result.error}`);
  } else {
    assert(result.rows >= 1, `${section}: ${result.rows} row(s) created`, `${section}: no rows`);
    assert(result.trashBtns >= 1, `${section}: 🗑 trash button present`, `${section}: ❌ NO trash button`);
    assert(result.actionBtns >= 3, `${section}: 3 action buttons (got ${result.actionBtns})`, `${section}: ❌ only ${result.actionBtns} action buttons`);
    assert(result.keepBtns >= 1, `${section}: 🔒 keep button present`, `${section}: ❌ NO keep button`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  TEST: Click handlers are actually bound (not null/undefined)
// ═══════════════════════════════════════════════════════════════════════════

group('2. Click Handlers Bound');

const handlerResult = await page.evaluate(async () => {
  const SG = window._scanGrid;
  let c = document.getElementById('__test_handlers');
  if (!c) { c = document.createElement('div'); c.id = '__test_handlers'; document.body.appendChild(c); }
  c.innerHTML = '';

  SG.create('__test_handlers', '__test_handlers', [
    { key: 'check', width: 56, type: 'checkbox' },
    { key: 'path', label: 'File', flex: 3, minWidth: 150, type: 'path' },
    { key: 'size', label: 'Size', width: 90, type: 'size' },
  ]);
  SG.addRow('__test_handlers', { path: 'C:\\test\\handler-test.txt', size: 512 });
  await new Promise(r => setTimeout(r, 50));

  const body = document.getElementById('sg-body-__test_handlers');
  const btns = body.querySelectorAll('.sg-actions button');
  const keepBtn = body.querySelector('.btn-keep');

  const results = [];
  btns.forEach((b, i) => {
    results.push({
      index: i,
      title: b.title,
      hasOnclick: typeof b.onclick === 'function',
      text: b.textContent.trim(),
    });
  });

  return {
    actionButtons: results,
    keepHasOnclick: keepBtn ? typeof keepBtn.onclick === 'function' : false,
  };
});

for (const btn of handlerResult.actionButtons) {
  assert(btn.hasOnclick, `Action btn[${btn.index}] "${btn.title}" has onclick handler`, `Action btn[${btn.index}] "${btn.title}" ❌ NO onclick`);
}
assert(handlerResult.keepHasOnclick, '🔒 Keep button has onclick handler', '🔒 Keep button ❌ NO onclick');

// ═══════════════════════════════════════════════════════════════════════════
//  TEST: Trash button calls /api/trash endpoint
// ═══════════════════════════════════════════════════════════════════════════

group('3. Trash Button Fires API Call');

const trashApiResult = await page.evaluate(async () => {
  return new Promise(async (resolve) => {
    const SG = window._scanGrid;
    let c = document.getElementById('__test_trash_api');
    if (!c) { c = document.createElement('div'); c.id = '__test_trash_api'; document.body.appendChild(c); }
    c.innerHTML = '';

    SG.create('__test_trash_api', '__test_trash_api', [
      { key: 'check', width: 56, type: 'checkbox' },
      { key: 'path', label: 'File', flex: 3, minWidth: 150, type: 'path' },
    ]);
    SG.addRow('__test_trash_api', { path: 'C:\\NONEXISTENT\\test-trash-api.txt', size: 0 });
    await new Promise(r => setTimeout(r, 50));

    // Intercept fetch to track the API call
    let apiCalled = false;
    let apiPath = '';
    const origFetch = window.fetch;
    window.fetch = function(url, opts) {
      if (typeof url === 'string' && url.includes('/api/trash')) {
        apiCalled = true;
        try { apiPath = JSON.parse(opts?.body || '{}').paths?.[0] || ''; } catch {}
      }
      return origFetch.apply(this, arguments);
    };

    // Click the trash button
    const trashBtn = c.querySelector('.sg-trash-btn');
    if (trashBtn) trashBtn.click();
    await new Promise(r => setTimeout(r, 300));

    window.fetch = origFetch;
    resolve({ apiCalled, apiPath, trashBtnFound: !!trashBtn });
  });
});

assert(trashApiResult.trashBtnFound, 'Trash button found', 'Trash button not found');
assert(trashApiResult.apiCalled, '/api/trash was called', '/api/trash was NOT called');
assert(trashApiResult.apiPath.includes('test-trash-api'), `Correct path sent: ${trashApiResult.apiPath}`, `Wrong path: ${trashApiResult.apiPath}`);

// ═══════════════════════════════════════════════════════════════════════════
//  TEST: Open Folder button calls /api/open-folder
// ═══════════════════════════════════════════════════════════════════════════

group('4. Open Folder Button Fires API Call');

const folderApiResult = await page.evaluate(async () => {
  return new Promise(async (resolve) => {
    const SG = window._scanGrid;
    let c = document.getElementById('__test_folder_api');
    if (!c) { c = document.createElement('div'); c.id = '__test_folder_api'; document.body.appendChild(c); }
    c.innerHTML = '';

    SG.create('__test_folder_api', '__test_folder_api', [
      { key: 'check', width: 56, type: 'checkbox' },
      { key: 'path', label: 'File', flex: 3, minWidth: 150, type: 'path' },
    ]);
    SG.addRow('__test_folder_api', { path: 'C:\\TestFolder\\subfolder\\file.txt', size: 0 });
    await new Promise(r => setTimeout(r, 50));

    let apiCalled = false;
    let apiPath = '';
    const origFetch = window.fetch;
    window.fetch = function(url, opts) {
      if (typeof url === 'string' && url.includes('/api/open-folder')) {
        apiCalled = true;
        try { apiPath = JSON.parse(opts?.body || '{}').path || ''; } catch {}
      }
      return origFetch.apply(this, arguments);
    };

    // Click the folder button (3rd action button)
    const btns = c.querySelectorAll('.sg-actions button');
    const folderBtn = btns[2]; // trash=0, file=1, folder=2
    if (folderBtn) folderBtn.click();
    await new Promise(r => setTimeout(r, 300));

    window.fetch = origFetch;
    resolve({ apiCalled, apiPath, folderBtnFound: !!folderBtn });
  });
});

assert(folderApiResult.folderBtnFound, 'Folder button found', 'Folder button not found');
assert(folderApiResult.apiCalled, '/api/open-folder was called', '/api/open-folder was NOT called');
assert(folderApiResult.apiPath.includes('TestFolder\\subfolder'), `Correct folder sent: ${folderApiResult.apiPath}`, `Wrong folder: ${folderApiResult.apiPath}`);

// ═══════════════════════════════════════════════════════════════════════════
//  TEST: Keep button calls /api/keep-list/add and removes row
// ═══════════════════════════════════════════════════════════════════════════

group('5. Keep Button Removes Row from Grid');

const keepResult = await page.evaluate(async () => {
  return new Promise(async (resolve) => {
    const SG = window._scanGrid;
    let c = document.getElementById('__test_keep');
    if (!c) { c = document.createElement('div'); c.id = '__test_keep'; document.body.appendChild(c); }
    c.innerHTML = '';

    SG.create('__test_keep', '__test_keep', [
      { key: 'check', width: 56, type: 'checkbox' },
      { key: 'path', label: 'File', flex: 3, minWidth: 150, type: 'path' },
    ]);
    SG.addRow('__test_keep', { path: 'C:\\KeepTest\\file-to-keep.txt', size: 100 });
    SG.addRow('__test_keep', { path: 'C:\\KeepTest\\file-to-stay.txt', size: 200 });
    await new Promise(r => setTimeout(r, 50));

    const body = document.getElementById('sg-body-__test_keep');
    const beforeCount = body.querySelectorAll('.sg-row').length;

    let keepApiCalled = false;
    const origFetch = window.fetch;
    window.fetch = function(url, opts) {
      if (typeof url === 'string' && url.includes('/api/keep-list/add')) {
        keepApiCalled = true;
      }
      return origFetch.apply(this, arguments);
    };

    // Click keep on first row
    const keepBtn = body.querySelector('.btn-keep');
    if (keepBtn) keepBtn.click();
    await new Promise(r => setTimeout(r, 600)); // wait for flash animation

    window.fetch = origFetch;
    const afterCount = body.querySelectorAll('.sg-row:not(.keep-flash)').length;
    resolve({ beforeCount, afterCount, keepApiCalled, keepBtnFound: !!keepBtn });
  });
});

assert(keepResult.keepBtnFound, 'Keep button found', 'Keep button not found');
assert(keepResult.keepApiCalled, '/api/keep-list/add was called', '/api/keep-list/add was NOT called');
assert(keepResult.afterCount < keepResult.beforeCount, `Row removed: ${keepResult.beforeCount} → ${keepResult.afterCount}`, `Row NOT removed: still ${keepResult.afterCount}`);

// ═══════════════════════════════════════════════════════════════════════════
//  TEST: Select All / None works
// ═══════════════════════════════════════════════════════════════════════════

group('6. Select All / None');

const selectResult = await page.evaluate(async () => {
  const SG = window._scanGrid;
  let c = document.getElementById('__test_select');
  if (!c) { c = document.createElement('div'); c.id = '__test_select'; document.body.appendChild(c); }
  c.innerHTML = '';

  SG.create('__test_select', '__test_select', [
    { key: 'check', width: 56, type: 'checkbox' },
    { key: 'path', label: 'File', flex: 3, minWidth: 150, type: 'path' },
  ]);
  for (let i = 0; i < 5; i++) {
    SG.addRow('__test_select', { path: `C:\\test\\file${i}.txt`, size: i * 100 });
  }
  await new Promise(r => setTimeout(r, 50));

  // Select all
  SG.selectAll('__test_select', true);
  const allChecked = SG.getChecked('__test_select').length;

  // Select none
  SG.selectAll('__test_select', false);
  const noneChecked = SG.getChecked('__test_select').length;

  return { totalRows: 5, allChecked, noneChecked };
});

assert(selectResult.allChecked === 5, `Select All: ${selectResult.allChecked}/5 checked`, `Select All: only ${selectResult.allChecked}/5`);
assert(selectResult.noneChecked === 0, `Select None: ${selectResult.noneChecked} checked`, `Select None: ${selectResult.noneChecked} still checked`);

// ═══════════════════════════════════════════════════════════════════════════
//  TEST: Backend API endpoints respond
// ═══════════════════════════════════════════════════════════════════════════

group('7. Backend API Endpoints');

const endpoints = [
  { method: 'POST', url: '/api/trash', body: { paths: [] } },
  { method: 'POST', url: '/api/open-folder', body: { path: 'C:\\Windows' } },
  { method: 'POST', url: '/api/open', body: { path: 'C:\\Windows\\notepad.exe' } },
  { method: 'GET',  url: '/api/keep-list' },
];

for (const ep of endpoints) {
  try {
    const opts = { method: ep.method };
    if (ep.body) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(ep.body);
    }
    const res = await page.evaluate(async (o) => {
      const r = await fetch(o.url, o.opts);
      return { status: r.status, ok: r.ok };
    }, { url: BASE + ep.url, opts });
    assert(res.ok, `${ep.method} ${ep.url} → ${res.status}`, `${ep.method} ${ep.url} → ${res.status} FAILED`);
  } catch (e) {
    fail(`${ep.method} ${ep.url} → ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  TEST: Page errors
// ═══════════════════════════════════════════════════════════════════════════

group('8. Page Errors');
if (pageErrors.length === 0) {
  pass('No JavaScript page errors');
} else {
  pageErrors.forEach(e => fail(`Page error: ${e}`));
}

// ═══════════════════════════════════════════════════════════════════════════
//  CLEANUP + RESULTS
// ═══════════════════════════════════════════════════════════════════════════

// Remove test containers
await page.evaluate(() => {
  document.querySelectorAll('[id^="__test_"]').forEach(el => el.remove());
});

await browser.close();

console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`);
process.exit(failed > 0 ? 1 : 0);
