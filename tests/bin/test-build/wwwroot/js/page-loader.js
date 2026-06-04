import { crumb } from './breadcrumb.js';
import { ErrLog } from './error-logger.js';

// Per-section state: tracks the next byte offset for paging
const _offsets = {}; // section → nextOffset (null = no more data)
const _loaded = {}; // section → total rows loaded so far
const _cachedAt = {}; // section → Date when cache file was last written
const _resumeOffsets = {}; // section → byte position at EOF (for live-scan resume)

/**
 * Load the next 40KB page of cached results for a section.
 * Returns { rows: [...], loaded: totalSoFar }
 * When no more data exists, returns { rows: [], loaded: totalSoFar }
 */
export async function loadPage(section) {
    // Already exhausted
    if (_offsets[section] === null && _offsets[section] !== undefined) {
        return { rows: [], loaded: _loaded[section] || 0 };
    }
    const offset = _offsets[section] || 0;
    crumb('page', 'loadPage', { section, offset });
    const url = offset
        ? `/api/cache/${section}?offset=${offset}`
        : `/api/cache/${section}`;
    try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
            _offsets[section] = null;
            return { rows: [], loaded: _loaded[section] || 0 };
        }
        const data = await res.json();
        const rows = data.rows || [];
        // Update paging state
        _offsets[section] = data.nextOffset ?? null;
        _loaded[section] = (_loaded[section] || 0) + rows.length;
        if (data.cachedAt && !_cachedAt[section])
            _cachedAt[section] = new Date(data.cachedAt);
        // Always track the actual byte position (even at EOF) so live-scan can resume
        if (data.resumeOffset != null)
            _resumeOffsets[section] = data.resumeOffset;
        crumb('page', 'loaded', { section, rows: rows.length, total: _loaded[section], more: _offsets[section] != null });
        return { rows, loaded: _loaded[section] };
    }
    catch (err) {
        ErrLog.log('[page-loader.js]', err?.message || String(err), err?.stack || null, 'PAGE_LOADER_ERROR');
        _offsets[section] = null;
        return { rows: [], loaded: _loaded[section] || 0 };
    }
}

/**
 * Returns true if the section has more pages to load.
 */
export function hasMore(section) {
    return _offsets[section] != null;
}

/**
 * Reset paging state for a section (e.g., when a new scan starts).
 */
export function resetPaging(section) {
    delete _offsets[section];
    delete _loaded[section];
    delete _cachedAt[section];
    delete _resumeOffsets[section];
}

/**
 * Resume reading from the last known byte position after hitting EOF.
 * During a live scan, the cache file keeps growing. When _fetchBatch
 * hits EOF, _offsets is set to null (exhausted). This function restores
 * the offset so the next loadPage call reads from where we left off.
 */
export function resumeFromEof(section) {
    if (_offsets[section] === null && _resumeOffsets[section] != null) {
        _offsets[section] = _resumeOffsets[section];
    }
}

/**
 * Get cache age in minutes for a section. Returns null if unknown.
 */
export function getCacheAge(section) {
    const ts = _cachedAt[section];
    if (!ts)
        return null;
    return (Date.now() - ts.getTime()) / 60000;
}

/**
 * Get how many rows have been loaded so far for a section.
 */
export function loadedCount(section) {
    return _loaded[section] || 0;
}

// Expose to non-module scripts (e.g., duplicates.js IIFE)
window._pageLoader = { loadPage, hasMore, resetPaging, resumeFromEof, loadedCount, getCacheAge };
//# sourceMappingURL=page-loader.js.map