// ═══════════════════════════════════════════════════════════════════════════
//  EVENT DELEGATION — replaces all inline onclick/oninput handlers
//  Uses data-action attributes on buttons + single document listener.
//  Routes grid-based sections through scan-grid.js, tables through ui-utils.
// ═══════════════════════════════════════════════════════════════════════════
import { startScan, cancelScan, trashSelected, applySmartDedup, deleteNMSelected, deleteEmpty, trashAllImageCopies } from './actions.js';
import { selectAllTable, showSection } from './ui-utils.js';
import { loadSavings, exportSavings, newSession } from './savings.js';
import { saveSettings } from './settings.js';
import { DuplicatesSection } from '../sections/duplicates.js';
import * as SG from './scan-grid.js';
import { apiFetch } from './ui-utils.js';
function _wireFolderChoices(input, listId = 'folderChoicesList') {
    if (!input || input.dataset.folderChoicesWired)
        return;
    const list = document.getElementById(listId);
    if (!list)
        return;
    input.dataset.folderChoicesWired = '1';
    let timer = null;
    const refresh = async () => {
        try {
            const current = (input.value || '').trim();
            const res = await apiFetch(`/api/folder-choices?path=${encodeURIComponent(current)}`);
            const choices = Array.isArray(res?.choices) ? res.choices : [];
            list.innerHTML = '';
            for (const p of choices) {
                const opt = document.createElement('option');
                opt.value = p;
                list.appendChild(opt);
            }
        }
        catch { }
    };
    input.addEventListener('focus', refresh);
    input.addEventListener('input', () => {
        if (timer)
            window.clearTimeout(timer);
        timer = window.setTimeout(refresh, 120);
    });
}
// ── Section → result container id ──────────────────────────────────────
// Used to fall back to raw DOM checkbox queries for sections that use
// custom renderers (grid-view.js) instead of scan-grid.js.
const _resultContainerOf = (section) => ({
    'duplicates': 'dupResult',
    'smart-dedup': 'smartResult',
    'stale': 'staleResult',
    'large': 'largeResult',
    'node-modules': 'nmResult',
    'empty': 'emptyResult',
    'venvs': 'venvResult',
    'images': 'imageResult',
    'backups': 'backupsResult',
    'tiny-files': 'tinyResult',
    'html-files': 'htmlResult',
    'css-files': 'cssResult',
    'ext-search': 'extResult',
})[section] || `${section}Result`;
// ── Grid-aware select / trash ────────────────────────────────────────────
function _selectAll(el, val) {
    const grid = el.dataset.grid;
    if (grid) {
        SG.selectAll(grid, val);
        return;
    }
    selectAllTable(el.dataset.table, val);
}
function _trashSelectedGrid(el) {
    const grid = el.dataset.grid;
    if (grid) {
        // scan-grid sections (all except duplicates which uses grid-view.js)
        let paths = SG.getChecked(grid);
        // Fallback: section uses a custom renderer — query checkboxes directly from DOM
        if (!paths.length) {
            const container = document.getElementById(_resultContainerOf(grid));
            if (container) {
                paths = [...container.querySelectorAll('input[type=checkbox]:checked[data-path]')]
                    .map(cb => cb.dataset.path).filter(Boolean);
            }
        }
        if (!paths.length) {
            alert('Select files first.');
            return;
        }
        trashSelected(null, paths);
        return;
    }
    trashSelected(el.dataset.table);
}
// ── Action dispatch map ──────────────────────────────────────────────────
const ACTIONS = {
    'scan': (el) => startScan(el.dataset.section),
    'cancel': (el) => cancelScan(el.dataset.section),
    'select-all': (el) => _selectAll(el, true),
    'select-none': (el) => _selectAll(el, false),
    'trash-selected': (el) => _trashSelectedGrid(el),
    'trash-all-copies': () => DuplicatesSection.deleteAllCopies(),
    'trash-all-image-copies': () => trashAllImageCopies(),
    'apply-smart-dedup': () => applySmartDedup(),
    'delete-nm-selected': () => deleteNMSelected(),
    'delete-empty': () => deleteEmpty(),
    'load-savings': () => loadSavings(),
    'export-savings': () => exportSavings(),
    'new-session': () => newSession(),
    'save-settings': () => saveSettings(),
    'trash-ext-all': () => {
        const paths = [...document.querySelectorAll('#sg-body-ext-search .sg-row')]
            .map((r) => r.dataset.path)
            .filter(Boolean);
        if (!paths.length) {
            alert('No matching files to delete.');
            return;
        }
        trashSelected(null, paths);
    },
};
// ── Click delegation on document ─────────────────────────────────────────
document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el)
        return;
    const handler = ACTIONS[el.dataset.action];
    if (handler) {
        e.preventDefault();
        handler(el);
    }
});
// ── Change delegation (dropdown commands) ────────────────────────────────
document.addEventListener('change', (e) => {
    const menu = e.target.closest('#extCommandMenu');
    if (!menu)
        return;
    const value = menu.value;
    switch (value) {
        case 'scan':
            startScan('ext-search');
            break;
        case 'cancel':
            cancelScan('ext-search');
            break;
        case 'delete-selected':
            _trashSelectedGrid({ dataset: { grid: 'ext-search', table: 'extSearchTable' } });
            break;
        case 'keep-selected':
            window.keepSelected?.('extSearchTable');
            break;
        case 'delete-all':
            ACTIONS['trash-ext-all']();
            break;
    }
    menu.value = '';
    const selected = menu.selectedOptions?.[0];
    menu.title = selected?.title || 'Choose a command for Extension Finder';
});
document.addEventListener('mouseover', (e) => {
    const menu = e.target.closest('#extCommandMenu');
    if (!menu)
        return;
    const selected = menu.selectedOptions?.[0];
    menu.title = selected?.title || 'Choose a command for Extension Finder';
});
// ── Nav section switching ────────────────────────────────────────────────
document.getElementById('mainNav')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-section]');
    if (!btn)
        return;
    showSection(btn.dataset.section, btn);
});
document.getElementById('sectionMenu')?.addEventListener('change', (e) => {
    const select = e.target;
    const section = select?.value;
    if (!section)
        return;
    showSection(section);
});
// ── Extension Finder root initialization + picker ────────────────────────
async function _initExtRoot() {
    const input = document.getElementById('extSearchRootInput');
    if (!input)
        return;
    _wireFolderChoices(input);
    const saved = localStorage.getItem('dcu_ext_search_root');
    if (saved) {
        input.value = saved;
        return;
    }
    try {
        const cfg = await apiFetch('/api/config');
        const root = cfg?.root || '';
        if (root) {
            input.value = root;
            localStorage.setItem('dcu_ext_search_root', root);
        }
    }
    catch { }
}
_initExtRoot();
document.getElementById('extSearchRootInput')?.addEventListener('change', (e) => {
    const input = e.target;
    const root = (input?.value || '').trim();
    if (root)
        localStorage.setItem('dcu_ext_search_root', root);
    else
        localStorage.removeItem('dcu_ext_search_root');
});
document.getElementById('extSearchPickFolderBtn')?.addEventListener('click', async () => {
    try {
        const res = await apiFetch('/api/pick-folder', { method: 'POST' }, { timeout: 120000 });
        if (!res?.ok || !res?.path)
            return;
        const input = document.getElementById('extSearchRootInput');
        if (input)
            input.value = res.path;
        localStorage.setItem('dcu_ext_search_root', res.path);
    }
    catch { }
});
// ── Input delegation (filter) ────────────────────────────────────────────
let _extSearchDebounce = null;
document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-action="filter-duplicates"]');
    if (el)
        DuplicatesSection.filter(el.value);
    const extInput = e.target.closest('#extSearchInput');
    if (extInput) {
        const hint = document.getElementById('extSearchHint');
        const q = extInput.value.trim().replace(/^\.+/, '');
        if (hint)
            hint.textContent = q ? `Searching for extension fragment: ${q}` : 'Scans automatically as you type';
        if (_extSearchDebounce)
            window.clearTimeout(_extSearchDebounce);
        if (!q)
            return;
        _extSearchDebounce = window.setTimeout(() => startScan('ext-search'), 250);
    }
});
export { ACTIONS };
//# sourceMappingURL=events.js.map