// ═══════════════════════════════════════════════════════════════════════════
//  SCAN TOOLBAR VIEW — pure DOM renderer for the MCD scan toolbar.
//
//  Renders into: <div id="toolbar-{section}"></div>
//  Knows nothing about: JSONL, APIs, WebSockets, scan logic.
//
//  ONE-TIME-ONE-PLACE: the MCD toolbar HTML lives here and only here.
//  Specialty buttons are added via the config.specialty array.
// ═══════════════════════════════════════════════════════════════════════════
import { ErrLog } from '../js/error-logger.js';
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
        this._els.scan = this._btn('btn', `🔍 Scan`, () => this._callbacks.onScan?.());
        this._els.scan.dataset.action = 'scan';
        this._els.scan.dataset.section = section;
        this._els.cancel = this._btn('btn muted', `✖ Cancel`, () => this._callbacks.onCancel?.());
        this._els.cancel.dataset.action = 'cancel';
        this._els.cancel.dataset.section = section;
        this._els.deleteSelected = this._btn('btn danger', '🗑 Delete Selected', () => this._callbacks.onDeleteSelected?.());
        this._els.deleteSelected.dataset.action = 'trash-selected';
        this._els.deleteSelected.dataset.grid = section;
        this._els.deleteSelected.dataset.table = tableId;
        this._els.keepSelected = this._btn('btn-keep', '🔒 Keep Selected', () => this._callbacks.onKeepSelected?.());
        this._els.keepSelected.dataset.gridSection = section;
        this._els.keepSelected.disabled = true;
        if (specialty.includes('delete-all-copies')) {
            this._els.deleteAllCopies = this._btn('btn danger hidden', '🗑 Delete All Copies', () => this._callbacks.onDeleteAllCopies?.());
            this._els.deleteAllCopies.id = `imgDeleteAllBtn-${section}`;
            this._els.deleteAllCopies.dataset.action = 'trash-all-copies';
        }
        if (specialty.includes('apply-all')) {
            this._els.applyAll = this._btn('btn danger', '⚡ Apply All (Delete Copies)', () => this._callbacks.onApplyAll?.());
            this._els.applyAll.dataset.action = 'apply-smart-dedup';
        }
        if (specialty.includes('html-utilities')) {
            this._els.utilities = this._btn('btn muted', '🧰 UTILITIES', () => {
                const items = this._els.utilityItems || [];
                const anyVisible = items.some((btn) => !btn.classList.contains('hidden'));
                items.forEach((btn) => btn.classList.toggle('hidden', anyVisible));
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
                const btn = this._btn('btn hidden', `🧩 ${label}`, () => this._callbacks.onHtmlUtility?.(key));
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
                _whiteBgOn = !_whiteBgOn;
                const resultId = section === 'duplicates' ? 'dupResult'
                    : section === 'images' ? 'imageResult'
                        : `${section}Result`;
                const cont = document.getElementById(resultId);
                if (!cont)
                    return;
                cont.querySelectorAll('.dup-thumb, .img-card img, .sg-thumb')
                    .forEach(img => { img.style.background = _whiteBgOn ? 'white' : ''; });
                this._els.whiteBg.textContent = _whiteBgOn ? '⬛ Dark BG' : '⬜ White BG';
                this._els.whiteBg.classList.toggle('active', _whiteBgOn);
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
            this._els.fullView = this._btn('btn muted', '🔎 Full View', () => this._callbacks.onFullView?.());
        }
        this._els.trace = this._btn('btn muted', '📜 Trace', () => {
            const tag = section.toUpperCase().replace(/-/g, '_');
            window.open(`/trace-viewer.html?filter=${encodeURIComponent(tag)}`, '_blank');
        });
        this._els.trace.title = `Open trace log filtered to ${section}`;
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
        } catch (e) {
            ErrLog.log('[scan-toolbar-view]', e?.message || String(e), e?.stack || null, 'MOUNT_ERROR');
        }
    }
    // ── State-driven update ───────────────────────────────────
    update(state) {
        if (!this._rendered)
            return;
        try {
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
        } catch (e) {
            ErrLog.log('[scan-toolbar-view]', e?.message || String(e), e?.stack || null, 'UPDATE_ERROR');
        }
    }
    exposeDeleteAllAsLegacyId() {
        const el = this._els.deleteAllCopies;
        if (el && this._config.section === 'images') {
            el.id = 'imgDeleteAllBtn';
        }
    }
    // ── Helpers ───────────────────────────────────────────────
    _btn(className, text, handler) {
        const btn = document.createElement('button');
        btn.className = className;
        btn.textContent = text;
        btn.addEventListener('click', handler);
        return btn;
    }
    _setDisabled(el, disabled) {
        if (!el)
            return;
        el.disabled = !!disabled;
    }
}
//# sourceMappingURL=scan-toolbar-view.js.map