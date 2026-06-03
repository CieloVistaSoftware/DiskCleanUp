/**
 * ScanToolbarView Tests — TOOLBAR-001
 *
 * Tests every button state transition in scan-toolbar-view.js.
 * Would have caught:
 *   - "Delete Selected disabled on mount, never re-enabled" (the bug)
 *   - "Permanently-grayed buttons re-enabled after scan"
 *   - "Cancel enabled when it should be disabled"
 *   - "Apply All enabled on sections that don't have it"
 *
 * Strategy: load scan-toolbar-view.js + scan-toolbar-model.js into a
 * headless Chromium page, mount toolbars for each section, drive state
 * transitions, assert button disabled/enabled state.
 *
 * Does NOT require the .NET service.
 * Run: node tests/scan-toolbar-tests.mjs
 */

import { chromium }    from 'playwright';
import { fileURLToPath } from 'url';
import path             from 'path';
import fs               from 'fs';

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

// Inject dependencies as globals so ES-module imports resolve
const tbViewSrc = fs.readFileSync(
  path.join(WWWROOT, 'views', 'scan-toolbar-view.js'), 'utf8');
const tbModelSrc = fs.readFileSync(
  path.join(WWWROOT, 'models', 'scan-toolbar-model.js'), 'utf8');

// Load into a minimal DOM environment
await page.setContent(`
  <html><body>
    <div id="test-toolbar"></div>
    <script>
      // Stub ErrLog so toolbar JS doesn't crash
      window.ErrLog = { log: () => {} };
      window.startScan = () => {};
    </script>
  </body></html>`);

function stripModuleSyntax(src) {
  let s = src
    .replace(/^import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
    .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '')
    .replace(/^export\s+(default\s+)?(class|function|const|let|var)\s+/gm, '$2 ');
  // `const`/`let` at top level don't become window properties — replace with `var`
  s = s.replace(/^(const|let)\s+/gm, 'var ');
  return s;
}

// Inject as script tags with explicit window assignments so they're accessible
await page.addScriptTag({ content:
  stripModuleSyntax(tbModelSrc) +
  '\nwindow.SCAN_TOOLBAR_CONFIGS = SCAN_TOOLBAR_CONFIGS;' +
  '\nwindow.getToolbarConfig = getToolbarConfig;'
});
await page.addScriptTag({ content:
  stripModuleSyntax(tbViewSrc) +
  '\nwindow.ScanToolbarView = ScanToolbarView;'
});

// ── helpers ───────────────────────────────────────────────────────────────

async function mountToolbar(section) {
  const config = await page.evaluate(sec => {
    // SCAN_TOOLBAR_CONFIGS is a const — access via globalThis fallback
    const cfgs = window.SCAN_TOOLBAR_CONFIGS || globalThis.SCAN_TOOLBAR_CONFIGS;
    return cfgs ? cfgs.find(c => c.section === sec) : null;
  }, section);
  if (!config) throw new Error(`No config for section: ${section}`);

  const containerId = `toolbar-${section}`;
  await page.evaluate((id) => {
    const d = document.createElement('div');
    d.id = id;
    document.body.appendChild(d);
  }, containerId);

  await page.evaluate(cfg => {
    const view = new window.ScanToolbarView(cfg, {});
    view.mount();
    window[`__toolbar_${cfg.section}`] = view;
  }, config);

  return config;
}

async function callUpdate(section, state) {
  await page.evaluate(({ sec, state }) => {
    window[`__toolbar_${sec}`]?.update(state);
  }, { sec: section, state });
}

async function isDisabled(section, elName) {
  return page.evaluate(({ sec, name }) => {
    const view = window[`__toolbar_${sec}`];
    return view?._els?.[name]?.disabled ?? null;
  }, { sec: section, name: elName });
}

// ── TOOLBAR-001: Delete Selected must be enabled after scan ───────────────
group('TOOLBAR-001 — Delete Selected enabled after scan');
{
  await mountToolbar('stale');

  // Initial state: delete-selected should NOT be permanently disabled
  const initDisabled = await isDisabled('stale', 'deleteSelected');
  assert(initDisabled !== true,
    'deleteSelected is NOT disabled on mount (initial state)',
    `deleteSelected is disabled on mount — clicking it after scan will do nothing`);

  // After scan completes (not scanning, has rows)
  await callUpdate('stale', { scanning: false, hasRows: true, hasSelection: false });
  const afterScan = await isDisabled('stale', 'deleteSelected');
  assert(afterScan === false,
    'deleteSelected enabled after scan completes',
    `deleteSelected still disabled after scan — THIS WAS THE BUG`);

  // While scanning
  await callUpdate('stale', { scanning: true, hasRows: false, hasSelection: false });
  const duringScan = await isDisabled('stale', 'deleteSelected');
  assert(duringScan === true,
    'deleteSelected disabled DURING scan',
    `deleteSelected should be disabled while scan is running`);

  // After scan completes again
  await callUpdate('stale', { scanning: false, hasRows: true, hasSelection: false });
  const afterScan2 = await isDisabled('stale', 'deleteSelected');
  assert(afterScan2 === false,
    'deleteSelected re-enabled when scan finishes',
    `deleteSelected not re-enabled after scan ends`);
}

// ── TOOLBAR-002: Cancel only active during scan ────────────────────────────
group('TOOLBAR-002 — Cancel disabled when idle, enabled while scanning');
{
  await mountToolbar('large');

  const initCancel = await isDisabled('large', 'cancel');
  assert(initCancel === true,
    'cancel disabled on mount (idle)',
    `cancel should start disabled`);

  await callUpdate('large', { scanning: true, hasRows: false, hasSelection: false });
  const scanningCancel = await isDisabled('large', 'cancel');
  assert(scanningCancel === false,
    'cancel enabled while scanning',
    `cancel not enabled during scan`);

  await callUpdate('large', { scanning: false, hasRows: true, hasSelection: false });
  const idleCancel = await isDisabled('large', 'cancel');
  assert(idleCancel === true,
    'cancel disabled again after scan ends',
    `cancel not disabled after scan ends`);
}

// ── TOOLBAR-003: Permanently-grayed buttons NEVER re-enabled ──────────────
group('TOOLBAR-003 — Grayed specialty buttons stay disabled regardless of update()');
{
  await mountToolbar('stale'); // stale has no apply-all, no delete-all-dev-cache

  // Call update with every combination that could accidentally re-enable a grayed btn
  for (const scanning of [true, false]) {
    for (const hasRows of [true, false]) {
      await callUpdate('stale', { scanning, hasRows, hasSelection: true });
    }
  }

  const applyAllDisabled = await isDisabled('stale', 'applyAll');
  assert(applyAllDisabled === true,
    'applyAll stays disabled on stale section after all update() calls',
    `applyAll was re-enabled on stale section — grayed buttons must NEVER be re-enabled`);

  const devCacheDisabled = await isDisabled('stale', 'deleteAllDevCache');
  assert(devCacheDisabled === true,
    'deleteAllDevCache stays disabled on stale section',
    `deleteAllDevCache was re-enabled on stale section`);

  const cssMergeDisabled = await isDisabled('stale', 'cssMergeAnalyze');
  assert(cssMergeDisabled === true,
    'cssMergeAnalyze stays disabled on stale section',
    `cssMergeAnalyze was re-enabled on stale section`);
}

// ── TOOLBAR-004: Specialty buttons enabled on correct sections ─────────────
group('TOOLBAR-004 — Specialty buttons enabled on their own section');
{
  await mountToolbar('smart-dedup');
  await callUpdate('smart-dedup', { scanning: false, hasRows: true, hasSelection: false });

  const applyAllEnabled = await isDisabled('smart-dedup', 'applyAll');
  assert(applyAllEnabled === false,
    'applyAll enabled on smart-dedup section (its home section)',
    `applyAll should be enabled on smart-dedup`);

  await mountToolbar('dev-cache');
  await callUpdate('dev-cache', { scanning: false, hasRows: true, hasSelection: false });
  const devCacheEnabled = await isDisabled('dev-cache', 'deleteAllDevCache');
  assert(devCacheEnabled === false,
    'deleteAllDevCache enabled on dev-cache section',
    `deleteAllDevCache should be enabled on dev-cache`);
}

// ── TOOLBAR-005: Scan button — disabled while scanning ────────────────────
group('TOOLBAR-005 — Scan button disabled while scanning');
{
  await mountToolbar('node-modules');

  await callUpdate('node-modules', { scanning: true, hasRows: false, hasSelection: false });
  const scanDuring = await isDisabled('node-modules', 'scan');
  assert(scanDuring === true,
    'scan button disabled while scanning',
    `scan button should be disabled during a scan`);

  await callUpdate('node-modules', { scanning: false, hasRows: true, hasSelection: false });
  const scanAfter = await isDisabled('node-modules', 'scan');
  assert(scanAfter === false,
    'scan button re-enabled after scan',
    `scan button not re-enabled after scan ends`);
}

// ── TOOLBAR-006: All sections mount without error ─────────────────────────
group('TOOLBAR-006 — Every section mounts cleanly');
{
  const sections = [
    'duplicates','smart-dedup','stale','large','node-modules',
    'venvs','empty','images','backups','tiny-files',
    'html-files','css-files','dev-cache',
  ];
  for (const sec of sections) {
    try {
      await page.evaluate(sec => {
        const d = document.createElement('div');
        d.id = `toolbar-${sec}-test`;
        document.body.appendChild(d);
        const cfg = window.SCAN_TOOLBAR_CONFIGS.find(c => c.section === sec);
        if (!cfg) throw new Error(`No config for ${sec}`);
        const view = new window.ScanToolbarView({ ...cfg }, {});
        view.mount();
      }, sec);
      pass(`${sec} mounts without error`);
    } catch (e) {
      fail(`${sec} mount failed: ${e.message}`);
    }
  }
}

// ── summary ───────────────────────────────────────────────────────────────
await browser.close();
console.log('\n' + '═'.repeat(55));
if (failed === 0) {
  console.log(`✅ All ${passed} toolbar tests passed.\n`);
  process.exit(0);
} else {
  console.error(`❌ ${failed} of ${passed + failed} toolbar tests FAILED.\n`);
  process.exit(1);
}
