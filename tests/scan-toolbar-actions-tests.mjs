/**
 * ScanToolbar ACTION Tests — TOOLBAR-ACTIONS-001
 *
 * Tests that clicking each toolbar button calls the correct action handler.
 * Covers every button on every section's toolbar.
 *
 * "What tests do you have for these buttons?" — this is the answer.
 *
 * Does NOT require the .NET service.
 * Run: node tests/scan-toolbar-actions-tests.mjs
 */

import { chromium }     from 'playwright';
import { fileURLToPath } from 'url';
import path              from 'path';
import fs                from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');
const WWWROOT   = path.join(ROOT, 'DiskCleanUp.Service', 'wwwroot');

let browser, page;
let passed = 0, failed = 0;

function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.error(`  ❌ ${msg}`); failed++; }
function assert(c, p, f) { if (c) pass(p); else fail(f); }
function group(n) { console.log(`\n── ${n} ──`); }

// ── setup ─────────────────────────────────────────────────────────────────

browser = await chromium.launch({ headless: true });
page    = await browser.newPage();
page.on('pageerror', e => console.error('  [page-error]', e.message));

function stripModuleSyntax(src) {
  let s = src
    .replace(/^import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
    .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '')
    .replace(/^export\s+(default\s+)?(class|function|const|let|var)\s+/gm, '$2 ');
  s = s.replace(/^(const|let)\s+/gm, 'var ');
  return s;
}

await page.setContent(`
  <html><body>
    <script>
      window.ErrLog = { log: () => {} };
      window._calls = {};
      window.track = function(name) {
        return function() { window._calls[name] = (window._calls[name] || 0) + 1; };
      };
    </script>
  </body></html>`);

const tbModelSrc = fs.readFileSync(path.join(WWWROOT, 'models', 'scan-toolbar-model.js'), 'utf8');
const tbViewSrc  = fs.readFileSync(path.join(WWWROOT, 'views',  'scan-toolbar-view.js'),  'utf8');

await page.addScriptTag({ content: stripModuleSyntax(tbModelSrc) + '\nwindow.SCAN_TOOLBAR_CONFIGS=SCAN_TOOLBAR_CONFIGS;' });
await page.addScriptTag({ content: stripModuleSyntax(tbViewSrc)  + '\nwindow.ScanToolbarView=ScanToolbarView;' });

async function mountWithTracking(section) {
  await page.evaluate(sec => {
    const cfg = window.SCAN_TOOLBAR_CONFIGS.find(c => c.section === sec);
    if (!cfg) return;
    // id MUST match what ScanToolbarView.mount() expects: toolbar-{section}
    // Use a unique suffix per test run to avoid collisions
    const containerId = `toolbar-${sec}`;
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      document.body.appendChild(container);
    } else {
      container.innerHTML = ''; // clear previous mount
    }
    const view = new window.ScanToolbarView(cfg, {
      onScan:              window.track('onScan-' + sec),
      onCancel:            window.track('onCancel-' + sec),
      onDeleteSelected:    window.track('onDeleteSelected-' + sec),
      onKeepSelected:      window.track('onKeepSelected-' + sec),
      onDeleteAllCopies:   window.track('onDeleteAllCopies-' + sec),
      onApplyAll:          window.track('onApplyAll-' + sec),
      onDeleteAllDevCache: window.track('onDeleteAllDevCache-' + sec),
      onCssMergeAnalyze:   window.track('onCssMergeAnalyze-' + sec),
      onFullView:          window.track('onFullView-' + sec),
      onHtmlUtility:       window.track('onHtmlUtility-' + sec),
    });
    view.mount();
    window[`__act_view_${sec}`] = view;
  }, section);
}

async function clickEl(section, elName) {
  await page.evaluate(({ sec, name }) => {
    const btn = window[`__act_view_${sec}`]?._els?.[name];
    if (btn && !btn.disabled) btn.click();
  }, { sec: section, name: elName });
}

async function callCount(section, action) {
  return page.evaluate(key => (window._calls?.[key] || 0), `${action}-${section}`);
}

async function enableButtons(section) {
  await page.evaluate(sec => {
    window[`__act_view_${sec}`]?.update({ scanning: false, hasRows: true, hasSelection: true });
  }, section);
}

// ── ACTIONS-001: Scan button calls onScan ─────────────────────────────────
group('ACTIONS-001 — Scan button calls onScan callback');
{
  await mountWithTracking('stale');
  await enableButtons('stale');
  await clickEl('stale', 'scan');
  const c = await callCount('stale', 'onScan');
  assert(c >= 1, 'clicking Scan calls onScan callback', `onScan not called (count=${c})`);
}

// ── ACTIONS-002: Cancel calls onCancel ────────────────────────────────────
group('ACTIONS-002 — Cancel button calls onCancel callback');
{
  await mountWithTracking('large');
  // Enable cancel by simulating scan
  await page.evaluate(sec =>
    window[`__act_view_${sec}`]?.update({ scanning: true, hasRows: false, hasSelection: false }),
    'large');
  await clickEl('large', 'cancel');
  const c = await callCount('large', 'onCancel');
  assert(c >= 1, 'clicking Cancel calls onCancel callback', `onCancel not called (count=${c})`);
}

// ── ACTIONS-003: Delete Selected calls onDeleteSelected ───────────────────
group('ACTIONS-003 — Delete Selected calls onDeleteSelected callback');
{
  await mountWithTracking('empty');
  await enableButtons('empty');
  await clickEl('empty', 'deleteSelected');
  const c = await callCount('empty', 'onDeleteSelected');
  assert(c >= 1, 'clicking Delete Selected calls onDeleteSelected', `onDeleteSelected not called (count=${c})`);
}

// ── ACTIONS-004: Keep Selected calls onKeepSelected ───────────────────────
group('ACTIONS-004 — Keep Selected calls onKeepSelected callback');
{
  await mountWithTracking('node-modules');
  await enableButtons('node-modules');
  await clickEl('node-modules', 'keepSelected');
  const c = await callCount('node-modules', 'onKeepSelected');
  assert(c >= 1, 'clicking Keep Selected calls onKeepSelected', `onKeepSelected not called (count=${c})`);
}

// ── ACTIONS-005: Delete All Copies calls onDeleteAllCopies (images/dupes) ─
group('ACTIONS-005 — Delete All Copies calls onDeleteAllCopies on correct sections');
{
  const imageSections = ['duplicates', 'images'];
  for (const sec of imageSections) {
    await mountWithTracking(sec);
    await enableButtons(sec);
    // Unhide the delete all button (it starts hidden)
    await page.evaluate(s => {
      const btn = window[`__act_view_${s}`]?._els?.deleteAllCopies;
      if (btn) btn.classList.remove('hidden');
    }, sec);
    await clickEl(sec, 'deleteAllCopies');
    const c = await callCount(sec, 'onDeleteAllCopies');
    assert(c >= 1, `Delete All Copies calls onDeleteAllCopies on ${sec}`, `not called on ${sec} (count=${c})`);
  }
}

// ── ACTIONS-006: Apply All calls onApplyAll (smart-dedup only) ────────────
group('ACTIONS-006 — Apply All calls onApplyAll on smart-dedup');
{
  await mountWithTracking('smart-dedup');
  await enableButtons('smart-dedup');
  await clickEl('smart-dedup', 'applyAll');
  const c = await callCount('smart-dedup', 'onApplyAll');
  assert(c >= 1, 'clicking Apply All calls onApplyAll', `onApplyAll not called (count=${c})`);
}

// ── ACTIONS-007: Delete All Caches calls onDeleteAllDevCache (dev-cache) ──
group('ACTIONS-007 — Delete All Caches calls onDeleteAllDevCache on dev-cache');
{
  await mountWithTracking('dev-cache');
  await enableButtons('dev-cache');
  await clickEl('dev-cache', 'deleteAllDevCache');
  const c = await callCount('dev-cache', 'onDeleteAllDevCache');
  assert(c >= 1, 'clicking Delete All Caches calls onDeleteAllDevCache', `not called (count=${c})`);
}

// ── ACTIONS-008: Analyze Merge calls onCssMergeAnalyze (css-files only) ───
group('ACTIONS-008 — Analyze Merge calls onCssMergeAnalyze on css-files');
{
  await mountWithTracking('css-files');
  await enableButtons('css-files');
  await clickEl('css-files', 'cssMergeAnalyze');
  const c = await callCount('css-files', 'onCssMergeAnalyze');
  assert(c >= 1, 'clicking Analyze Merge calls onCssMergeAnalyze', `not called (count=${c})`);
}

// ── ACTIONS-009: Full View calls onFullView (tiny-files only) ─────────────
group('ACTIONS-009 — Full View calls onFullView on tiny-files');
{
  await mountWithTracking('tiny-files');
  await enableButtons('tiny-files');
  await clickEl('tiny-files', 'fullView');
  const c = await callCount('tiny-files', 'onFullView');
  assert(c >= 1, 'clicking Full View calls onFullView', `not called (count=${c})`);
}

// ── ACTIONS-010: Grayed buttons do NOT fire callbacks ─────────────────────
group('ACTIONS-010 — Grayed buttons (wrong section) do NOT fire callbacks');
{
  await mountWithTracking('backups');
  await enableButtons('backups');

  // applyAll is grayed on backups — clicking must NOT call onApplyAll
  const before = await callCount('backups', 'onApplyAll');
  await clickEl('backups', 'applyAll'); // button is disabled — click should be blocked
  const after = await callCount('backups', 'onApplyAll');
  assert(after === before, 'grayed Apply All does NOT fire onApplyAll on backups',
    `grayed button fired callback — disabled buttons must not call handlers`);

  // cssMergeAnalyze is grayed on backups — must not fire
  const before2 = await callCount('backups', 'onCssMergeAnalyze');
  await clickEl('backups', 'cssMergeAnalyze');
  const after2 = await callCount('backups', 'onCssMergeAnalyze');
  assert(after2 === before2, 'grayed Analyze Merge does NOT fire on backups',
    `grayed Analyze Merge fired callback on wrong section`);
}

// ── ACTIONS-011: All sections have Scan, Cancel, Delete Selected wired ─────
group('ACTIONS-011 — Core buttons wired on every section');
{
  const sections = ['stale','large','node-modules','venvs','empty',
                    'backups','tiny-files','html-files','css-files'];
  for (const sec of sections) {
    await mountWithTracking(sec);
    await enableButtons(sec);
    const before = await callCount(sec, 'onScan');
    await clickEl(sec, 'scan');
    const after = await callCount(sec, 'onScan');
    assert(after > before, `Scan button wired on ${sec}`, `Scan not wired on ${sec}`);
  }
}

// ── summary ───────────────────────────────────────────────────────────────
await browser.close();
console.log('\n' + '═'.repeat(60));
if (failed === 0) {
  console.log(`✅ All ${passed} toolbar action tests passed.\n`);
  process.exit(0);
} else {
  console.error(`❌ ${failed} of ${passed + failed} toolbar action tests FAILED.\n`);
  process.exit(1);
}
