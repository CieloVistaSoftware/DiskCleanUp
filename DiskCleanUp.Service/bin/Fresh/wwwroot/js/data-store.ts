import { ErrLog } from './error-logger.js';
// ═══════════════════════════════════════════════════════════════════════════
//  DATA STORE — MVVM ViewModel layer
//
//  JSONL file is the single source of truth (Model).
//  DataStore reads the JSONL → builds in-memory Maps (ViewModel).
//  Sections bind DOM from the ViewModel (View).
//
//  ALL mutations go through the JSONL:
//    1. POST /api/cache/{section}/remove  → backend rewrites JSONL
//    2. DataStore.reload(section)         → re-reads JSONL into ViewModel
//    3. Section.rebind()                  → rebuilds DOM from ViewModel
//
//  During live scans, WS events still update ViewModel directly for
//  real-time feel. Backend writes to JSONL simultaneously. On any
//  mutation (delete etc), we re-read JSONL to get clean state.
// ═══════════════════════════════════════════════════════════════════════════

const _stores = {};  // section → { rows: [], loaded: bool, version: 0 }

// ── Read JSONL via paged API ────────────────────────────────
async function _readAll(section) {
  const rows = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const url = offset
      ? `/api/cache/${section}?offset=${offset}`
      : `/api/cache/${section}`;

    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) break;
      const data = await res.json();
      const page = data.rows || [];
      rows.push(...page);
      if (data.nextOffset != null) {
        offset = data.nextOffset;
      } else {
        hasMore = false;
      }
    } catch {
      break;
    }
  }

  return rows;
}

// ── Public API ──────────────────────────────────────────────

/**
 * Load all rows for a section from JSONL.
 * Returns the rows array. Caches in _stores.
 */
async function load(section) {
  window._T?.('STORE', `load(${section}) start`);
  const rows = await _readAll(section);
  const store = _stores[section] || { rows: [], loaded: false, version: 0 };
  store.rows    = rows;
  store.loaded  = true;
  store.version++;
  _stores[section] = store;
  window._T?.('STORE', `load(${section}) done: ${rows.length} rows, v${store.version}`);
  return rows;
}

/**
 * Remove paths from JSONL, optionally trash files.
 * After mutation, reloads from JSONL so ViewModel is clean.
 * Returns { removed, rows } — rows is the fresh data after reload.
 */
async function remove(section, paths, { trash = true } = {}) {
  if (!paths?.length) return { removed: 0, rows: getRows(section) };

  window._T?.('STORE', `remove(${section}) ${paths.length} paths, trash=${trash}`);

  try {
    const res = await fetch(`/api/cache/${section}/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths, trash })
    });
    const data = await res.json();
    window._T?.('STORE', `remove(${section}) server removed ${data.removed}`);
  } catch (e) {
    ErrLog.log('[DATA_STORE]', e.message, e.stack, 'CAUGHT_ERROR');
    window._T?.('STORE', `remove(${section}) API error: ${e.message}`);
  }

  // Re-read JSONL — the file is now the truth
  const rows = await load(section);
  return { removed: paths.length, rows };
}

/**
 * Clear all data for a section (e.g. new scan starting).
 */
function clear(section) {
  _stores[section] = { rows: [], loaded: false, version: 0 };
}

/**
 * Get current rows without fetching. Returns [] if not loaded.
 */
function getRows(section) {
  return _stores[section]?.rows || [];
}

/**
 * Get current version number (increments on every load/reload).
 */
function getVersion(section) {
  return _stores[section]?.version || 0;
}

/**
 * Whether data has been loaded for this section.
 */
function isLoaded(section) {
  return _stores[section]?.loaded || false;
}

export const DataStore = { load, remove, clear, getRows, getVersion, isLoaded };

// Expose globally for non-module code
window._DataStore = DataStore;
