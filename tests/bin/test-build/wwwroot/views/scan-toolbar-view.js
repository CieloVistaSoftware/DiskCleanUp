import { ErrLog } from '/js/error-logger.js';

export class ScanToolbarView {
    constructor(config, callbacks = {}) {
        this._config = config;
        this._callbacks = callbacks;
        this._rendered = false;
        this._els = {}; // name → element reference
    }
    // ── Initial render ────────────────────────────────────────
    mount() {
        try {
            const { section, tableId, specialty } = this._config;
            const container = document.getElementById(`toolbar-${section}`);
            if (!container)
                return;
            container.className = 'toolbar';
            const filterBar = document.createElement('div');
            filterBar.id = `sf-${section}`;
            filterBar.className = 'scan-filter-bar';
            container.appendChild(filterBar);
            this._els.scan = this._btn('btn', `🔍 Scan`, () => {
                try {
                    this._callbacks.onScan?.();
                } catch (err) {
                    ErrLog.log('[scan-toolbar-view.js]', err?.message || String(err), err?.stack || null, 'SCAN_TOOLBAR_VIEW_ERROR');
                }
            });
            this._els.scan.dataset.action = 'scan';
            this._els.scan.dataset.section = section;
            this._els.cancel = this._btn('btn muted', `✖ Cancel`, () => {
                try {
                    this._callbacks.onCancel?.();
                } catch (err) {
                    ErrLog.log('[scan-toolbar-view.js]', err?.message || String(err), err?.stack || null, 'SCAN_TOOLBAR_VIEW_ERROR');
                }
            });
            this._els.cancel.dataset.action = 'cancel';
            this._els.cancel.dataset.section = section;
            this._els.deleteSelected = this._btn('btn danger', '🗑 Delete Selected', () => {
                try {
                    this._callbacks.onDeleteSelected?.();
                } catch (err) {
                    ErrLog.log('[scan-toolbar-view.js]', err?.message || String(err), err?.stack || null, 'SCAN_TOOLBAR_VIEW_ERROR');
                }
            });
            this._els.deleteSelected.dataset.action = 'trash-selected';
            this._els.deleteSelected.dataset.grid = section;
            this._els.deleteSelected.dataset.table = tableId;
            this._els.keepSelected = this._btn('btn-keep', '🔒 Keep Selected', () => {
                try {
                    this._callbacks.onKeepSelected?.();
                } catch (err) {
                    ErrLog.log('[scan-toolbar-view.js]', err?.message || String(err), err?.stack || null, 'SCAN_TOOLBAR_VIEW_ERROR');
                }
            });
            this._els.keepSelected.dataset.gridSection = section;
            this._els.keepSelected.disabled = true;
            if (specialty.includes('delete-all-copies')) {
                this._els.deleteAllCopies = this._btn('btn danger hidden', '🗑 Delete All Copies', () => {
                    try {
                        this._callbacks.onDeleteAllCopies?.();
                    } catch (err) {
                        ErrLog.log('[scan-toolbar-view.js]', err?.message || String(err), err?.stack || null, 'SCAN_TOOLBAR_VIEW_ERROR');
                    }
                });
                this._els.deleteAllCopies.id = `imgDeleteAllBtn-${section}`;
                this._els.deleteAllCopies.dataset.action = 'trash-all-copies';
            }
            if (specialty.includes('apply-all')) {
                this._els.applyAll = this._btn('btn danger', '⚡ Apply All (Delete Copies)', () => {
                    try {
                        this._callbacks.onApplyAll?.();
                    } catch (err) {
                        ErrLog.log('[scan-toolbar-view.js]', err?.message || String(err), err?.stack || null, 'SCAN_TOOLBAR_VIEW_ERROR');
                    }
                });
                this._els.applyAll.dataset.action = 'apply-smart-dedup';
            }
            if (specialty.includes('html-utilities')) {
                this._els.utilities = this._btn('btn muted', '🧰 UTILITIES', () => {
                    try {
                        const items = this._els.utilityItems || [];
                        const anyVisible = items.some((btn) => !btn.classList.contains('hidden'));
                        items.forEach((btn) => btn.classList.toggle('hidden', anyVisible));
                    } catch (err) {
                        ErrLog.log('[scan-toolbar-view.js]', err?.message || String(err), err?.stack || null, 'SCAN_TOOLBAR_VIEW_ERROR');
                    }
                });
                this._els.utilities.title = 'Show utility actions';
                const utilityDefs = [
                    ['extract-svg', 'Extract SVG From HTML'],
                    ['extract-css', 'Extract CSS To .css'],
                    ['extract-js', 'Extract JS To .js'],
                    ['inline-asset-report', 'Inline Asset Report'],
                    ['convert-data-uri-images', 'Convert Data URI Images'],
                    ['remove-dead-tags', 'Remove Dead Tags'],
                    ['normalize-paths', 'Normalize Paths'],
                    ['find-broken-links', 'Find Broken Links'],
                    ['a11y-quick-fix', 'Accessibility Quick Fix'],
                    ['format-html', 'Minify + Pretty Format'],
                    ['split-multi-svg', 'Split Multi-SVG HTML'],
                    ['extract-icons-symbols', 'Extract Icons/Symbols'],
                    ['fingerprint-diff', 'HTML Fingerprint/Diff'],
                ];
                this._els.utilityItems = utilityDefs.map(([key, label]) => {
                    const btn = this._btn('btn hidden', `🧩 ${label}`, () => {
                        try {
                            this._callbacks.onHtmlUtility?.(key);
                        } catch (err) {
                            ErrLog.log('[scan-toolbar-view.js]', err?.message || String(err), err?.stack || null, 'SCAN_TOOLBAR_VIEW_ERROR');
                        }
                    });
                    btn.dataset.action = 'run-html-utility';
                    btn.dataset.utility = key;
                    btn.dataset.section = section;
                    btn.title = label;
                    return btn;
                });
            }
            if (specialty.includes('white-bg')) {
                let _whiteBgOn = false;
                this._els.whiteBg = this._btn('btn muted', '⬜ White BG', () => {
                    try {
                        _whiteBgOn = !_whiteBgOn;
                        const resultId = section === 'duplicates' ? 'dupResult'
                            : section === 'images' ? 'imageResult'
                                : `${section}Result`;
                        const cont = document.getElementById(resultId);
                        if (!cont)
                            return;
                        cont.querySelectorAll('.dup-thumb, .img-card img')
                            .forEach(img => { img.style.background = _whiteBgOn ? 'white' : ''; });
                        this._els.whiteBg.textContent = _whiteBgOn ? '⬛ Dark BG' : '⬜ White BG';
                        this._els.whiteBg.classList.toggle('active', _whiteBgOn);
                    } catch (err) {
                        ErrLog.log('[scan-toolbar-view.js]', err?.message || String(err), err?.stack || null, 'SCAN_TOOLBAR_VIEW_ERROR');
                    }
                });
                this._els.whiteBg.title = 'Toggle white background on all images';
            }
            this._els.loadMore = document.createElement('button');
            this._els.loadMore.className = 'btn load-more-btn-tb';
            this._els.loadMore.id = `loadMore-${section}`;
            this._els.loadMore.disabled = true;
            const dot = document.createElement('span');
            dot.className = 'lm-dot red';
            this._els.loadMore.appendChild(dot);
            this._els.loadMore.appendChild(document.createTextNode(' Load More Results'));
            if (specialty.includes('full-view')) {
                this._els.fullView = this._btn('btn muted', '🔎 Full View', () => {
                    try {
                        this._callbacks.onFullView?.();
                    } catch (err) {
                        ErrLog.log('[scan-toolbar-view.js]', err?.message || String(err), err?.stack || null, 'SCAN_TOOLBAR_VIEW_ERROR');
                    }
                });
            }
            this._els.trace = this._btn('btn muted', '📜 Trace', () => {
                try {
                    const tag = section.toUpperCase().replace(/-/g, '_');
                    window.open(`/trace-viewer.html?filter=${encodeURIComponent(tag)}`, '_blank');
                } catch (err) {
                    ErrLog.log('[scan-toolbar-view.js]', err?.message || String(err), err?.stack || null, 'SCAN_TOOLBAR_VIEW_ERROR');
                }
            });
            this._els.trace.title = `Open trace log filtered to ${section}`;
            // Unified command dropdown for all scan sections.
            const commandMenu = document.createElement('select');
            commandMenu.className = 'filter-select';
            commandMenu.id = `commandMenu-${section}`;
            const defs = [
                { value: '', label: 'Commands...', tip: 'Choose a command for this section' },
                { value: 'scan', label: 'Scan', tip: 'Start scan for this section' },
                { value: 'cancel', label: 'Cancel', tip: 'Cancel the running scan' },
                { value: 'delete-selected', label: 'Delete Selected', tip: 'Delete selected rows to Recycle Bin' },
                { value: 'keep-selected', label: 'Keep Selected', tip: 'Keep selected rows for future scans' },
                { value: 'load-more', label: 'Load More Results', tip: 'Load more cached rows if available' },
                { value: 'trace', label: 'Open Trace', tip: 'Open trace logs for this section' },
            ];
            if (this._els.deleteAllCopies)
                defs.push({ value: 'delete-all-copies', label: 'Delete All Copies', tip: 'Delete all duplicate copies in this section' });
            if (this._els.applyAll)
                defs.push({ value: 'apply-all', label: 'Apply All', tip: 'Apply all queued cleanup actions' });
            if (this._els.fullView)
                defs.push({ value: 'full-view', label: 'Full View', tip: 'Open full page view for this section' });
            if (specialty.includes('html-utilities')) {
                defs.push({ value: 'extract-svg', label: 'HTML Utility: Extract SVG', tip: 'Extract SVG assets from selected HTML files' }, { value: 'extract-css', label: 'HTML Utility: Extract CSS', tip: 'Extract inline CSS to stylesheet files' }, { value: 'extract-js', label: 'HTML Utility: Extract JS', tip: 'Extract inline JS to script files' });
            }
            for (const d of defs) {
                const opt = document.createElement('option');
                opt.value = d.value;
                opt.textContent = d.label;
                opt.title = d.tip;
                commandMenu.appendChild(opt);
            }
            const updateTip = () => {
                const selected = commandMenu.selectedOptions?.[0];
                commandMenu.title = selected?.title || 'Choose a command for this section';
            };
            commandMenu.addEventListener('change', () => {
                try {
                    const v = commandMenu.value;
                    switch (v) {
                        case 'scan':
                            this._callbacks.onScan?.();
                            break;
                        case 'cancel':
                            this._callbacks.onCancel?.();
                            break;
                        case 'delete-selected':
                            this._callbacks.onDeleteSelected?.();
                            break;
                        case 'keep-selected':
                            this._callbacks.onKeepSelected?.();
                            break;
                        case 'load-more':
                            this._els.loadMore?.click();
                            break;
                        case 'trace':
                            this._els.trace?.click();
                            break;
                        case 'delete-all-copies':
                            this._callbacks.onDeleteAllCopies?.();
                            break;
                        case 'apply-all':
                            this._callbacks.onApplyAll?.();
                            break;
                        case 'full-view':
                            this._callbacks.onFullView?.();
                            break;
                        case 'extract-svg':
                            this._callbacks.onHtmlUtility?.('extract-svg');
                            break;
                        case 'extract-css':
                            this._callbacks.onHtmlUtility?.('extract-css');
                            break;
                        case 'extract-js':
                            this._callbacks.onHtmlUtility?.('extract-js');
                            break;
                    }
                    commandMenu.value = '';
                    updateTip();
                } catch (err) {
                    ErrLog.log('[scan-toolbar-view.js]', err?.message || String(err), err?.stack || null, 'SCAN_TOOLBAR_VIEW_ERROR');
                }
            });
            commandMenu.addEventListener('mouseenter', updateTip);
            commandMenu.addEventListener('focus', updateTip);
            commandMenu.addEventListener('mousemove', updateTip);
            this._els.commandMenu = commandMenu;
            updateTip();
            // Keep buttons in DOM for existing callbacks/state wiring, but hide UI.
            const hide = (el) => { if (el)
                el.style.display = 'none'; };
            hide(this._els.scan);
            hide(this._els.cancel);
            hide(this._els.deleteSelected);
            hide(this._els.keepSelected);
            hide(this._els.deleteAllCopies);
            hide(this._els.applyAll);
            hide(this._els.utilities);
            if (this._els.utilityItems?.length)
                for (const btn of this._els.utilityItems)
                    hide(btn);
            hide(this._els.whiteBg);
            hide(this._els.loadMore);
            hide(this._els.fullView);
            hide(this._els.trace);
            container.appendChild(this._els.commandMenu);
            container.appendChild(this._els.scan);
            container.appendChild(this._els.cancel);
            container.appendChild(this._els.deleteSelected);
            container.appendChild(this._els.keepSelected);
            if (this._els.deleteAllCopies)
                container.appendChild(this._els.deleteAllCopies);
            if (this._els.applyAll)
                container.appendChild(this._els.applyAll);
            if (this._els.utilities)
                container.appendChild(this._els.utilities);
            if (this._els.utilityItems?.length)
                for (const btn of this._els.utilityItems)
                    container.appendChild(btn);
            if (this._els.whiteBg)
                container.appendChild(this._els.whiteBg);
            container.appendChild(this._els.loadMore);
            if (this._els.fullView)
                container.appendChild(this._els.fullView);
            container.appendChild(this._els.trace);
            this._rendered = true;
            return;
            const order = [
                'scan', 'cancel', 'deleteSelected',
                'keepSelected', 'deleteAllCopies', 'applyAll',
                'utilities', 'whiteBg', 'loadMore', 'fullView', 'trace',
            ];
            for (const key of order) {
                const el = this._els[key];
                if (el)
                    container.appendChild(el);
            }
            if (this._els.utilityItems?.length) {
                for (const btn of this._els.utilityItems)
                    container.appendChild(btn);
            }
            this._rendered = true;
        } catch (err) {
            ErrLog.log('[scan-toolbar-view.js]', err?.message || String(err), err?.stack || null, 'SCAN_TOOLBAR_VIEW_ERROR');
        }
    }
    // ── State-driven update ───────────────────────────────────
    update(state) {
        try {
            if (!this._rendered)
                return;
            const { scanning, hasRows, hasSelection } = state;
            const e = this._els;
            this._setDisabled(e.scan, scanning);
            this._setDisabled(e.cancel, !scanning);
            this._setDisabled(e.deleteSelected, scanning || !hasSelection);
            this._setDisabled(e.keepSelected, scanning || !hasSelection);
            if (e.deleteAllCopies)
                this._setDisabled(e.deleteAllCopies, scanning || !hasRows);
            if (e.applyAll)
                this._setDisabled(e.applyAll, scanning || !hasRows);
            if (e.utilities)
                this._setDisabled(e.utilities, scanning);
            if (e.utilityItems?.length) {
                for (const btn of e.utilityItems)
                    this._setDisabled(btn, scanning || !hasSelection);
            }
            if (e.commandMenu) {
                const byValue = (v) => [...e.commandMenu.options].find((o) => o.value === v);
                const scan = byValue('scan');
                const cancel = byValue('cancel');
                const del = byValue('delete-selected');
                const keep = byValue('keep-selected');
                const more = byValue('load-more');
                if (scan)
                    scan.disabled = !!scanning;
                if (cancel)
                    cancel.disabled = !scanning;
                if (del)
                    del.disabled = !!scanning || !hasSelection;
                if (keep)
                    keep.disabled = !!scanning || !hasSelection;
                if (more)
                    more.disabled = !!e.loadMore?.disabled;
            }
        } catch (err) {
            ErrLog.log('[scan-toolbar-view.js]', err?.message || String(err), err?.stack || null, 'SCAN_TOOLBAR_VIEW_ERROR');
        }
    }
    exposeDeleteAllAsLegacyId() {
        try {
            const el = this._els.deleteAllCopies;
            if (el && this._config.section === 'images') {
                el.id = 'imgDeleteAllBtn';
            }
        } catch (err) {
            ErrLog.log('[scan-toolbar-view.js]', err?.message || String(err), err?.stack || null, 'SCAN_TOOLBAR_VIEW_ERROR');
        }
    }
    // ── Helpers ───────────────────────────────────────────────
    _btn(className, text, handler) {
        try {
            const btn = document.createElement('button');
            btn.className = className;
            btn.textContent = text;
            btn.addEventListener('click', handler);
            return btn;
        } catch (err) {
            ErrLog.log('[scan-toolbar-view.js]', err?.message || String(err), err?.stack || null, 'SCAN_TOOLBAR_VIEW_ERROR');
        }
    }
    _setDisabled(el, disabled) {
        try {
            if (!el)
                return;
            el.disabled = !!disabled;
        } catch (err) {
            ErrLog.log('[scan-toolbar-view.js]', err?.message || String(err), err?.stack || null, 'SCAN_TOOLBAR_VIEW_ERROR');
        }
    }
}
//# sourceMappingURL=scan-toolbar-view.js.map