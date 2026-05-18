/**
 * Dynamically handle UI action errors: log, disable, show error/report ID.
 * @param {HTMLElement} el - The card/button element that triggered the action.
 * @param {Error|string} error - The error object or message.
 * @param {string} [context] - Optional context string for logging.
 * @param {string} [reportId] - Optional error/report ID to display.
 */
export function handleActionError(el, error, context = 'UI_ACTION', reportId = null) {
    const msg = typeof error === 'string' ? error : (error?.message || String(error));
    const stack = error?.stack || null;
    // Log error
    ErrLog.log(`[${context}]`, msg, stack, 'ACTION_ERROR');
    // Disable the element (button/card)
    if (el && typeof el.disabled !== 'undefined') {
        el.disabled = true;
        el.classList.add('error-disabled');
    } else if (el && el.classList) {
        el.classList.add('error-disabled');
    }
    // Show error/report ID if provided
    if (el && reportId) {
        let badge = el.querySelector('.error-report-id');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'error-report-id';
            badge.style.cssText = 'margin-left:8px;color:#f85149;font-size:0.9em;font-weight:bold;';
            el.appendChild(badge);
        }
        badge.textContent = `Error ID: ${reportId}`;
    }
    // Optionally, show a tooltip or alert
    if (el) {
        el.title = `Error: ${msg}${reportId ? ` (ID: ${reportId})` : ''}`;
    }
}
// ═══════════════════════════════════════════════════════════════════════════
//  UI UTILITIES — formatting, table helpers, section nav, fetch wrapper
//  Now powered by @cielovista/wb-core for fmt and apiFetch.
// ═══════════════════════════════════════════════════════════════════════════
import { fmtBytes } from '/lib/wb-core/utils/format.js';
import { apiFetch as coreApiFetch } from '/lib/wb-core/utils/api-fetch.js';
import { ErrLog } from '/js/error-logger.js';
// ── Format — re-export wb-core's formatter under the old name ────────────
export const fmt = fmtBytes;
// ── API Fetch — wire wb-core's apiFetch to our error logger ──────────────
coreApiFetch.setErrorHandler((type, message, detail) => {
    ErrLog.log('[api]', message, detail, type);
});
export const apiFetch = coreApiFetch;
// ── Table helpers (domain-specific, stay here) ───────────────────────────
export function filterTable(id, val) {
    const tbl = document.getElementById(id);
    if (!tbl)
        return;
    tbl.querySelectorAll('tbody tr').forEach(tr => {
        tr.classList.toggle('hidden', !tr.textContent.toLowerCase().includes(val.toLowerCase()));
    });
}
// Map old table IDs to grid body IDs for backward compat
const _tableToGrid = {
    staleTable: 'sg-body-stale', largeTable: 'sg-body-large',
    tinyTable: 'sg-body-tiny-files', htmlTable: 'sg-body-html-files',
    backupsTable: 'sg-body-backups', nmTable: 'sg-body-node-modules',
    emptyTable: 'sg-body-empty', venvTable: 'sg-body-venvs',
    smartTable: 'sg-body-smart-dedup',
};
function _findContainer(id) {
    return document.getElementById(id) || document.getElementById(_tableToGrid[id] || '');
}
export function selectAllTable(id, val) {
    const el = _findContainer(id);
    if (!el)
        return;
    el.querySelectorAll('input[type=checkbox]').forEach(cb => {
        // Only select visible rows
        if (val) {
            const row = cb.closest('.sg-row, tr');
            if (row?.style.display === 'none')
                return;
        }
        cb.checked = val;
    });
}
export function getCheckedPaths(tableId) {
    const el = _findContainer(tableId);
    if (!el)
        return [];
    return [...el.querySelectorAll('input[type=checkbox]:checked')]
        .map(cb => cb.dataset.path).filter(Boolean);
}
// ── Section module registry (onShow / onHide) ──────────────────────────────
let _activeSection = 'duplicates';
const _sectionModules = {};
export function registerSectionModule(name, mod) {
    _sectionModules[name] = mod;
}
export function showSection(name, btn) {
    if (_activeSection !== name && _sectionModules[_activeSection]?.onHide)
        _sectionModules[_activeSection].onHide();
    document.querySelectorAll('[id^=section-]').forEach(s => s.classList.remove('active-section'));
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.getElementById('section-' + name)?.classList.add('active-section');
    if (btn)
        btn.classList.add('active');
    else {
        // No btn passed — find and highlight the matching nav button
        const navBtn = document.querySelector(`nav button[data-section="${name}"]`);
        if (navBtn)
            navBtn.classList.add('active');
    }
    // Keep section dropdown synced with the active section.
    const sectionMenu = document.getElementById('sectionMenu');
    if (sectionMenu && sectionMenu.value !== name)
        sectionMenu.value = name;
    _activeSection = name;
    // Persist active tab so page refresh stays on this tab
    try {
        localStorage.setItem('dcu_active_tab', name);
    }
    catch (ex) {
        ErrLog.log('[UI_UTILS]', ex.message, ex.stack, 'CAUGHT_ERROR');
    }
    if (_sectionModules[name]?.onShow)
        _sectionModules[name].onShow();
}
// Restore last active tab on page load
export function restoreActiveTab() {
    try {
        const saved = localStorage.getItem('dcu_active_tab');
        if (saved && document.getElementById('section-' + saved)) {
            showSection(saved);
            return;
        }
    }
    catch (ex) {
        ErrLog.log('[UI_UTILS]', ex.message, ex.stack, 'CAUGHT_ERROR');
    }
    // Default to duplicates if nothing saved
    showSection('duplicates');
}
// ── Open file in VS Code via backend API ─────────────────────────────────
export async function openFileInVSCode(path) {
    try {
        await apiFetch('/api/open', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
    }
    catch (e) {
        ErrLog.log('[open]', `Failed to open ${path}: ${e.message}`, e);
    }
}
// Expose functions used by inline HTML onclick handlers
window.showSection = showSection;
window.selectAllTable = selectAllTable;
window.filterTable = filterTable;
window.fmt = fmt;
window.openFileInVSCode = openFileInVSCode;
//# sourceMappingURL=ui-utils.js.map