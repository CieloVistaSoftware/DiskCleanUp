// ── Open file in VS Code from frontend ───────────────────────────────────
window.openInVSCode = function (path) {
    fetch('/api/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
    }).catch(() => { });
};
// ═══════════════════════════════════════════════════════════════════════════
//  INIT — startup sequence
//  Import order matters: dependencies must be imported before dependents.
// ═══════════════════════════════════════════════════════════════════════════
// All ES imports are hoisted — they execute before any code below
import './breadcrumb.js';
import './error-logger.js';
import './metrics.js';
import './event-queue.js';
import './column-controls.js?v=2';
import './status-bar.js';
import './table-utils.js?v=2';
import './ui-utils.js';
import './savings.js?v=2';
import './settings.js';
import './trash-queue.js';
import './websocket.js';
import { startScan, cancelScan } from './actions.js?v=2';
import './ext-colors.js';
import './scan-filter.js';
import './scan-grid.js';
import './section-handlers.js';
import './events.js?v=2';
import './keep-list.js';
import './recycle-bin.js?v=2';
import './task-manager.js?v=2';
import { wsConnect } from './websocket.js';
import { registerHandler } from './event-queue.js';
import { registerSectionModule, restoreActiveTab } from './ui-utils.js';
import { loadSettings } from './settings.js';
import { updateTotalSaved } from './savings.js?v=2';
import { apiFetch } from './ui-utils.js';
import { pushEvent, pushEventSync } from './event-queue.js';
import { _set, _folder } from './status-bar.js';
import { loadPage, hasMore, resetPaging, getCacheAge } from './page-loader.js?v=2';
import { DuplicatesSection } from '../sections/duplicates.js';
import { SCAN_TOOLBAR_CONFIGS } from '../models/scan-toolbar-model.js?v=4';
import { ScanToolbarVM } from '../viewmodels/scan-toolbar-vm.js?v=4';
import { ScanToolbarView } from '../views/scan-toolbar-view.js?v=4';
// stale-unified, large-unified, node-modules-unified disabled — crash on top-level DOM access before DOM ready
// section-handlers.js handles these sections instead
import { initKeepList } from './keep-list.js';
import { crumb } from './breadcrumb.js';
import { loadTasks } from './task-manager.js?v=2';
// import { initAiPanel }              from './ai-panel.js'; // file does not exist
const _T = window._T || ((tag, msg) => console.log(`[${tag}] ${msg}`));
_T('INIT', 'all imports resolved');

// ── Diagnostic function for connection troubleshooting ──────────────────
window._runDiagnostics = async function() {
  const results = {
    timestamp: new Date().toISOString(),
    checks: [],
    summary: ''
  };

  console.log('🔍 DiskCleanUp Diagnostics Starting...\n');

  // Check 1: HTTP endpoint
  const currentPort = parseInt(location.port || '5100', 10);
  console.log(`Current port: localhost:${currentPort}`);
  
  let httpOk = false;
  let httpStatus = 'unknown';
  try {
    const r = await fetch('/api/service/info', { signal: AbortSignal.timeout(4000) });
    httpOk = r.ok;
    httpStatus = `${r.status} ${r.statusText}`;
    const json = await r.json();
    results.checks.push({
      name: 'HTTP Service Endpoint',
      status: 'PASS',
      detail: `${httpStatus} | Uptime: ${json.uptime}`
    });
    console.log('✅ HTTP Service Endpoint: PASS\n   Detail:', json);
  } catch (e) {
    httpStatus = String(e.message);
    results.checks.push({
      name: 'HTTP Service Endpoint',
      status: 'FAIL',
      detail: httpStatus
    });
    console.log('❌ HTTP Service Endpoint: FAIL\n   Error:', httpStatus);
  }

  // Check 2: WebSocket connection status
  const wsStatus = window._ws ? `ReadyState: ${window._ws.readyState} (0=connecting, 1=open, 2=closing, 3=closed)` : 'No connection object';
  const wsConnected = window._ws?.readyState === WebSocket.OPEN;
  results.checks.push({
    name: 'WebSocket Connection',
    status: wsConnected ? 'PASS' : 'CONNECTING/FAILED',
    detail: wsStatus
  });
  console.log(`${wsConnected ? '✅' : '⏳'} WebSocket Connection: ${wsStatus}\n`);

  // Check 3: Alternate port
  const altPort = currentPort === 5100 ? 5000 : 5100;
  let altPortOk = false;
  try {
    const r = await fetch(`http://localhost:${altPort}/api/service/info`, 
                          { signal: AbortSignal.timeout(3000) });
    altPortOk = r.ok;
    results.checks.push({
      name: `Alternate Port (${altPort})`,
      status: 'REACHABLE',
      detail: `Service running on wrong port? Try http://localhost:${altPort}`
    });
    console.log(`⚠️  Alternate Port ${altPort}: REACHABLE (possible port mismatch)\n`);
  } catch (e) {
    results.checks.push({
      name: `Alternate Port (${altPort})`,
      status: 'UNREACHABLE',
      detail: 'Both ports unavailable'
    });
    console.log(`✅ Alternate Port ${altPort}: UNREACHABLE (correct)\n`);
  }

  // Check 4: Event queue
  const eventQueueInfo = window._eventQueue ? 
    { 
      size: window._eventQueue.length || 0,
      isProcessing: window._processingQueue ? true : false 
    } : 
    { size: 'unknown', isProcessing: 'unknown' };
  
  results.checks.push({
    name: 'Event Queue',
    status: 'INFO',
    detail: `Queue length: ${eventQueueInfo.size}, Processing: ${eventQueueInfo.isProcessing}`
  });
  console.log(`📊 Event Queue: ${JSON.stringify(eventQueueInfo)}\n`);

  // Check 5: Page connectivity
  const isOnline = navigator.onLine;
  results.checks.push({
    name: 'Browser Connectivity',
    status: isOnline ? 'ONLINE' : 'OFFLINE',
    detail: isOnline ? 'Browser can reach network' : 'Browser is offline'
  });
  console.log(`${isOnline ? '✅' : '❌'} Browser Connectivity: ${isOnline ? 'ONLINE' : 'OFFLINE'}\n`);

  // Summary
  const passCount = results.checks.filter(c => c.status === 'PASS' || c.status === 'ONLINE').length;
  const failCount = results.checks.filter(c => c.status === 'FAIL' || c.status === 'OFFLINE').length;
  
  if (passCount === results.checks.length) {
    results.summary = '✅ All checks passed!';
  } else if (failCount > 0) {
    results.summary = `❌ ${failCount} check(s) failed`;
  } else {
    results.summary = '⏳ Connection in progress (auto-reconnecting)';
  }

  console.log('════════════════════════════════════════');
  console.log(results.summary);
  console.log('════════════════════════════════════════\n');
  
  // Show results in alert
  const alertText = [
    '🔍 DiskCleanUp Diagnostics Results',
    '',
    ...results.checks.map(c => `${c.name}: ${c.status}`),
    '',
    results.summary,
    '',
    'Full details in browser console (F12)'
  ].join('\n');
  
  alert(alertText);
  
  return results;
};

// ── Register DuplicatesSection ──────────────────────────────────────────
registerHandler('duplicates', DuplicatesSection.onEvent);
registerSectionModule('duplicates', DuplicatesSection);
registerSectionModule('tasks', { onShow: loadTasks });
// ── Cache restore (paged, 40KB rule) ─────────────────────────────────────
// Backend sends 40KB chunks. We load the first page, render it,
// and show a "Load More" button if there's more data. The .NET
// heap never holds more than 40KB; the browser DOM handles the rest.
async function restoreCachedResults() {
    crumb('init', 'restoreCache:start');
    _T('CACHE', 'restoreCachedResults START');
    // Cache restore is intentionally disabled to prevent stale UI state
    // and avoid cache-related regressions during active development.
    crumb('init', 'restoreCache:disabled');
    _T('CACHE', 'restoreCachedResults DISABLED');
    return;
    // Fetch keep-list ONCE so we can filter out kept files from cache
    let keepSet = new Set();
    try {
        const kl = await apiFetch('/api/keep-list', {}, { timeout: 10000 });
        if (kl?.paths?.length) {
            keepSet = new Set(kl.paths.map(p => p.toLowerCase()));
            _T('CACHE', `keep-list loaded: ${keepSet.size} paths`);
        }
    }
    catch { /* proceed without filtering */ }
    const STALE_THRESHOLD = 1440; // 24 hours in minutes
    const sections = ['duplicates', 'smart-dedup', 'stale', 'large', 'node-modules', 'venvs', 'empty', 'images', 'backups', 'tiny-files', 'html-files', 'css-files', 'ext-search'];
    for (const section of sections) {
        try {
            _T('CACHE', `loadPage(${section})`);
            const { rows, loaded } = await loadPage(section);
            _T('CACHE', `${section}: ${rows.length} rows`);
            if (!rows.length)
                continue;
            // Stale cache check — auto-clear if older than 24h
            const ageMin = getCacheAge(section);
            if (ageMin != null && ageMin > STALE_THRESHOLD) {
                _T('CACHE', `${section}: STALE (${ageMin.toFixed(0)}m old) — clearing`);
                fetch(`/api/cache/${section}`, { method: 'DELETE' }).catch(() => { });
                resetPaging(section);
                continue;
            }
            // SYNC delivery in chunks: yield every 200 rows so the WS onopen
            // and other callbacks can fire between batches. Without yielding,
            // large files (stale 1MB, tiny-files 728KB) freeze the main thread
            // for seconds, starving the WebSocket handshake.
            let resultCount = 0;
            let skippedKept = 0;
            const CHUNK = 200;
            for (let i = 0; i < rows.length; i++) {
                const evt = rows[i];
                if (evt.type === 'started' || evt.type === 'progress' || evt.type === 'done')
                    continue;
                const d = evt.data || {};
                const p = d.path || d.keep || '';
                if (p && keepSet.has(p.toLowerCase())) {
                    skippedKept++;
                    continue;
                }
                pushEventSync(section, evt.type, d);
                resultCount++;
                // Yield every CHUNK rows so the event loop stays responsive
                if (resultCount % CHUNK === 0)
                    await new Promise(r => setTimeout(r, 0));
            }
            if (skippedKept)
                _T('CACHE', `${section}: filtered out ${skippedKept} kept files`);
            if (resultCount > 0) {
                // Rebuild scan-filter dropdown � trackExt ran during addRow but
                // the 'done' event (which calls SF.rebuild) is skipped on restore
                const SF = window._scanFilter;
                if (SF?.rebuild)
                    SF.rebuild(section);
                const bar = document.getElementById(`sb-${section}`);
                if (bar)
                    bar.className = 'section-sb done';
                _set(section, 'status', '♻ Restored');
                _set(section, 'time', '—');
                const more = hasMore(section);
                const moreLabel = more ? ' · more available' : '';
                // Show human-readable cache age
                let ageLabel = '';
                if (ageMin != null) {
                    if (ageMin < 60)
                        ageLabel = ` · ${Math.round(ageMin)}m ago`;
                    else if (ageMin < 1440)
                        ageLabel = ` · ${(ageMin / 60).toFixed(1)}h ago`;
                    else
                        ageLabel = ` · ${(ageMin / 1440).toFixed(1)}d ago`;
                }
                _folder(section, `Restored · ${resultCount} results${moreLabel}${ageLabel}`);
                // Update toolbar Load More button state
                _updateLoadMoreBtn(section);
                // Show Delete All Copies button for images when restored
                if (section === 'images' && resultCount > 0) {
                    const delBtn = document.getElementById('imgDeleteAllBtn');
                    if (delBtn)
                        delBtn.style.display = '';
                }
            }
        }
        catch (e) {
            _T('CACHE', `${section}: error ${e.message}`);
        }
        // Yield to event loop between sections so WS onopen / other callbacks
        // aren't starved by large synchronous pushEventSync batches.
        await new Promise(r => setTimeout(r, 0));
    }
    crumb('init', 'restoreCache:done');
    _T('CACHE', 'restoreCachedResults DONE');
}
// ── Toolbar Load More button management ──────────────────────────────────
// Each section has a static button #loadMore-{section} in the toolbar.
// We enable/disable it and toggle the green/red dot based on hasMore().
function _updateLoadMoreBtn(section) {
    const btn = document.getElementById(`loadMore-${section}`);
    if (!btn)
        return;
    const dot = btn.querySelector('.lm-dot');
    const more = hasMore(section);
    btn.disabled = !more;
    btn.classList.remove('loading');
    if (dot) {
        dot.classList.toggle('green', more);
        dot.classList.toggle('red', !more);
    }
    btn.textContent = '';
    btn.appendChild(dot || _makeDot(more));
    btn.appendChild(document.createTextNode(' Load More Results'));
}
function _makeDot(isGreen) {
    const dot = document.createElement('span');
    dot.className = `lm-dot ${isGreen ? 'green' : 'red'}`;
    return dot;
}
// ─────────────────────────────────────────────────────────────────────────
// Section scan status tracker
// Tracks the current scan state for each section (idle, scanning, done, error)
const _sectionStatusMap = new Map();

window._setSectionStatus = (section, status) => {
    const validStatuses = ['idle', 'scanning', 'done', 'error'];
    if (!validStatuses.includes(status)) return;
    _sectionStatusMap.set(section, status);
    _updateNavButtonStatus(section);
};

function _updateNavButtonStatus(section) {
    const btn = document.querySelector(`button[data-section="${section}"]`);
    if (!btn) return;
    const light = btn.querySelector('.btn-status-light');
    if (!light) return;
    
    const status = _sectionStatusMap.get(section) || 'idle';
    light.className = `btn-status-light status-${status}`;
}

// Wire up click handlers for all static Load More buttons
function _wireLoadMoreButtons() {
    const sections = ['duplicates', 'smart-dedup', 'stale', 'large', 'node-modules', 'venvs', 'empty', 'images', 'backups', 'tiny-files', 'html-files', 'css-files', 'ext-search'];
    for (const section of sections) {
        const btn = document.getElementById(`loadMore-${section}`);
        if (!btn)
            continue;
        btn.addEventListener('click', async () => {
            if (btn.disabled)
                return;
            btn.disabled = true;
            btn.classList.add('loading');
            const dot = btn.querySelector('.lm-dot');
            // Keep the dot, update text
            btn.textContent = '';
            if (dot)
                btn.appendChild(dot);
            btn.appendChild(document.createTextNode(' Loading\u2026'));
            const { rows } = await loadPage(section);
            let added = 0;
            rows.forEach(evt => {
                if (evt.type === 'started' || evt.type === 'progress' || evt.type === 'done')
                    return;
                pushEvent(section, evt.type, evt.data || {});
                added++;
            });
            _updateLoadMoreBtn(section);
        });
    }
}
// Expose update function so other modules (actions.js) can refresh the button
window._updateLoadMoreBtn = _updateLoadMoreBtn;
// ── Scan Toolbars — mount MCD toolbar for every scan section ─────────────
// ONE-TIME-ONE-PLACE: ScanToolbarView owns all toolbar HTML.
// SCAN_TOOLBAR_CONFIGS is the single source of truth for what each section has.
const _toolbarVMs = {};
function _mountScanToolbars() {
    for (const config of SCAN_TOOLBAR_CONFIGS) {
        const vm = new ScanToolbarVM(config);
        const view = new ScanToolbarView(config, {
            onScan: () => startScan(config.section),
            onCancel: () => cancelScan(config.section),
            onSelectAll: () => window._selectAll?.(config.tableId),
            onSelectNone: () => window._selectNone?.(config.tableId),
            onDeleteSelected: () => window._trashSelected?.(config.tableId),
            onKeepSelected: () => window.keepSelected?.(config.tableId),
            onDeleteAllCopies: () => window._deleteAllCopies?.(config.section),
            onApplyAll: () => window._applySmartDedup?.(),
            onHtmlUtility: (utility) => window._runHtmlUtility?.(utility),
            onFullView: () => window.open('/tinyfiles-render.html', '_blank'),
        });
        vm.bindView(view);
        view.mount();
        // Images: expose legacy #imgDeleteAllBtn ID for existing action handlers
        if (config.section === 'images')
            view.exposeDeleteAllAsLegacyId();
        _toolbarVMs[config.section] = vm;
    }
}
// Expose so section controllers can drive toolbar state
window._scanToolbarVMs = _toolbarVMs;
async function _copyTextToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    }
    catch {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        }
        catch {
            return false;
        }
    }
}
function _buildGithubChatSnapshot() {
    const conn = document.getElementById('connStatus');
    const root = document.getElementById('rootDisplay');
    const saved = document.getElementById('totalSaved');
    const queued = document.getElementById('queueBadge');
    const kept = document.getElementById('keepCountBadge');
    const threadVal = document.getElementById('threadVal');
    const uptimeVal = document.getElementById('uptimeVal');
    const lines = [
        'DiskCleanUp Dashboard Snapshot',
        `Time: ${new Date().toISOString()}`,
        `URL: ${location.href}`,
        `Connection: ${(conn?.textContent || '').trim()} [${conn?.className || 'unknown'}]`,
        `Root: ${(root?.textContent || '').trim()}`,
        `Saved: ${(saved?.textContent || '').trim() || '(n/a)'}`,
        `Queued: ${(queued?.textContent || '').trim() || '(n/a)'}`,
        `Kept: ${(kept?.textContent || '').trim() || '0'}`,
        `Threads: ${(threadVal?.textContent || '').trim() || '(n/a)'}`,
        `Uptime: ${(uptimeVal?.textContent || '').trim() || '(n/a)'}`,
    ];
    return lines.join('\n');
}
function _wireGithubChatCopyButton() {
    const btn = document.getElementById('copyGithubChatBtn');
    if (!btn)
        return;
    btn.addEventListener('click', async () => {
        const original = btn.textContent || '📋 Copy for Chat';
        btn.disabled = true;
        const snapshot = _buildGithubChatSnapshot();
        const ok = await _copyTextToClipboard(snapshot);
        btn.textContent = ok ? '👍 Copied' : '🚫 Copy failed';
        setTimeout(() => {
            btn.textContent = original;
            btn.disabled = false;
        }, 1400);
    });
}
function _ensureLegacyNavButtons() {
    const nav = document.getElementById('mainNav');
    if (!nav)
        return;
    if (nav.querySelector('button[data-section]'))
        return;
    const menu = document.getElementById('sectionMenu');
    if (!menu)
        return;
    const proxy = document.createElement('div');
    proxy.id = 'legacyNavProxy';
    proxy.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:8px';
    for (const opt of Array.from(menu.options)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.section = opt.value;
        btn.className = 'btn muted btn-xs';
        
        // Add status light
        const light = document.createElement('span');
        light.className = 'btn-status-light status-idle';
        light.title = 'Scan status: idle';
        btn.appendChild(light);
        
        // Add text
        const text = document.createElement('span');
        text.textContent = opt.text;
        btn.appendChild(text);
        
        btn.addEventListener('click', () => window.showSection?.(opt.value, btn));
        proxy.appendChild(btn);
        
        // Initialize status for this section
        _sectionStatusMap.set(opt.value, 'idle');
    }
    nav.appendChild(proxy);
}
// Kick everything off
try {
    crumb('init', 'boot');
    _T('INIT', 'wireLoadMoreButtons');
    _wireLoadMoreButtons();
    _T('INIT', 'mountScanToolbars');
    _mountScanToolbars();
    _T('INIT', 'wireGithubChatCopyButton');
    _wireGithubChatCopyButton();
    _T('INIT', 'ensureLegacyNavButtons');
    _ensureLegacyNavButtons();
    _T('INIT', 'restoreActiveTab');
    restoreActiveTab();
    _T('INIT', 'restoreCachedResults');
    restoreCachedResults();
    crumb('init', 'wsConnect');
    _T('INIT', 'wsConnect');
    wsConnect();
    _T('INIT', 'loadSettings');
    loadSettings();
    _T('INIT', 'initKeepList');
    initKeepList();
    _T('INIT', 'updateTotalSaved');
    updateTotalSaved();
    crumb('init', 'boot:done');
    _T('INIT', 'sync done - main thread free');
}
catch (e) {
    console.error('[INIT] boot failed:', e);
}
// Prime session badge silently
apiFetch('/api/session', {}, { timeout: 20000 }).then(s => {
    _T('INIT', 'session badge loaded');
    const b = document.getElementById('sessionBadge');
    if (b && s?.label)
        b.textContent = String.fromCodePoint(0x1F4CB) + ' ' + s.label;
}).catch(() => { });
//# sourceMappingURL=init.js.map