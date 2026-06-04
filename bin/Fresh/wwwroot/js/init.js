// ── Open file in VS Code from frontend ───────────────────────────────────
window.openInVSCode = function(path) {
  fetch('/api/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  }).catch(() => {});
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
import './actions.js?v=2';
import './ext-colors.js';
import './scan-filter.js';
import './scan-grid.js';
import './section-handlers.js';
import './events.js?v=2';
import './keep-list.js';
import './recycle-bin.js?v=2';
import './task-manager.js?v=2';

import { wsConnect }               from './websocket.js';
import { registerHandler }         from './event-queue.js';
import { registerSectionModule, restoreActiveTab } from './ui-utils.js';
import { loadSettings }            from './settings.js';
import { updateTotalSaved, loadSavings } from './savings.js?v=2';
import { apiFetch }                from './ui-utils.js';
import { pushEvent, pushEventSync } from './event-queue.js';
import { _set, _folder }           from './status-bar.js';
import { loadPage, hasMore, resetPaging, getCacheAge } from './page-loader.js?v=2';
import { DuplicatesSection }       from '../sections/duplicates.js';
import { StaleSection }            from '../sections/stale-unified.js';
import { LargeSection }            from '../sections/large-unified.js';
import { NodeModulesSection }      from '../sections/node-modules-unified.js';
import { initKeepList }             from './keep-list.js';
import { crumb }                    from './breadcrumb.js';
import { loadTasks }                from './task-manager.js?v=2';

const _T = window._T || ((tag, msg) => console.log(`[${tag}] ${msg}`));
_T('INIT', 'all imports resolved');

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

  // Fetch keep-list ONCE so we can filter out kept files from cache
  let keepSet = new Set();
  try {
    const kl = await apiFetch('/api/keep-list', {}, { timeout: 10000 });
    if (kl?.paths?.length) {
      keepSet = new Set(kl.paths.map(p => p.toLowerCase()));
      _T('CACHE', `keep-list loaded: ${keepSet.size} paths`);
    }
  } catch { /* proceed without filtering */ }

  const STALE_THRESHOLD = 1440; // 24 hours in minutes
  const sections = ['duplicates','smart-dedup','stale','large','node-modules','venvs','empty','images','backups','tiny-files','html-files','css-files'];
  for (const section of sections) {
    try {
      _T('CACHE', `loadPage(${section})`);
      const { rows, loaded } = await loadPage(section);
      _T('CACHE', `${section}: ${rows.length} rows`);
      if (!rows.length) continue;

      // Stale cache check — auto-clear if older than 24h
      const ageMin = getCacheAge(section);
      if (ageMin != null && ageMin > STALE_THRESHOLD) {
        _T('CACHE', `${section}: STALE (${ageMin.toFixed(0)}m old) — clearing`);
        fetch(`/api/cache/${section}`, { method: 'DELETE' }).catch(() => {});
        resetPaging(section);
        continue;
      }

      // SYNC delivery: all addRow calls accumulate in DocumentFragment,
      // microtask flushes ALL rows in ONE appendChild after this loop.
      // This eliminates the 1s freezes from RAF-batched individual appends.
      let resultCount = 0;
      let skippedKept = 0;
      rows.forEach(evt => {
        if (evt.type === 'started' || evt.type === 'progress' || evt.type === 'done') return;
        // Filter out kept files so they never reappear in restored results
        const d = evt.data || {};
        const p = d.path || d.keep || '';
        if (p && keepSet.has(p.toLowerCase())) { skippedKept++; return; }
        pushEventSync(section, evt.type, d);
        resultCount++;
      });
      if (skippedKept) _T('CACHE', `${section}: filtered out ${skippedKept} kept files`);

      if (resultCount > 0) {
        // Rebuild scan-filter dropdown � trackExt ran during addRow but
        // the 'done' event (which calls SF.rebuild) is skipped on restore
        const SF = window._scanFilter;
        if (SF?.rebuild) SF.rebuild(section);

        const bar = document.getElementById(`sb-${section}`);
        if (bar) bar.className = 'section-sb done';
        _set(section, 'status', '♻ Restored');
        _set(section, 'time', '—');

        const more = hasMore(section);
        const moreLabel = more ? ' · more available' : '';
        // Show human-readable cache age
        let ageLabel = '';
        if (ageMin != null) {
          if (ageMin < 60) ageLabel = ` · ${Math.round(ageMin)}m ago`;
          else if (ageMin < 1440) ageLabel = ` · ${(ageMin / 60).toFixed(1)}h ago`;
          else ageLabel = ` · ${(ageMin / 1440).toFixed(1)}d ago`;
        }
        _folder(section, `Restored · ${resultCount} results${moreLabel}${ageLabel}`);

        // Update toolbar Load More button state
        _updateLoadMoreBtn(section);

        // Show Delete All Copies button for images when restored
        if (section === 'images' && resultCount > 0) {
          const delBtn = document.getElementById('imgDeleteAllBtn');
          if (delBtn) delBtn.style.display = '';
        }
      }
    } catch (e) { _T('CACHE', `${section}: error ${e.message}`); }
  }
  crumb('init', 'restoreCache:done');
  _T('CACHE', 'restoreCachedResults DONE');
}

// ── Toolbar Load More button management ──────────────────────────────────
// Each section has a static button #loadMore-{section} in the toolbar.
// We enable/disable it and toggle the green/red dot based on hasMore().

function _updateLoadMoreBtn(section) {
  const btn = document.getElementById(`loadMore-${section}`);
  if (!btn) return;
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

// Wire up click handlers for all static Load More buttons
function _wireLoadMoreButtons() {
  const sections = ['duplicates','smart-dedup','stale','large','node-modules','venvs','empty','images','backups','tiny-files','html-files','css-files'];
  for (const section of sections) {
    const btn = document.getElementById(`loadMore-${section}`);
    if (!btn) continue;
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      btn.classList.add('loading');
      const dot = btn.querySelector('.lm-dot');
      // Keep the dot, update text
      btn.textContent = '';
      if (dot) btn.appendChild(dot);
      btn.appendChild(document.createTextNode(' Loading\u2026'));

      const { rows } = await loadPage(section);
      let added = 0;
      rows.forEach(evt => {
        if (evt.type === 'started' || evt.type === 'progress' || evt.type === 'done') return;
        pushEvent(section, evt.type, evt.data || {});
        added++;
      });
      _updateLoadMoreBtn(section);
    });
  }
}

// Expose update function so other modules (actions.js) can refresh the button
window._updateLoadMoreBtn = _updateLoadMoreBtn;

// Kick everything off
crumb('init', 'boot');
_T('INIT', 'wireLoadMoreButtons');
_wireLoadMoreButtons();
_T('INIT', 'restoreActiveTab');
restoreActiveTab();
_T('INIT', 'restoreCachedResults (async)');
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

// Prime session badge silently
apiFetch('/api/session', {}, { timeout: 20000 }).then(s => {
  _T('INIT', 'session badge loaded');
  const b = document.getElementById('sessionBadge');
  if (b && s?.label) b.textContent = String.fromCodePoint(0x1F4CB) + ' ' + s.label;
}).catch(() => {});
