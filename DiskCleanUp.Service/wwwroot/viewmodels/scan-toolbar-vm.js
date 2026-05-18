import { ErrLog } from '/js/error-logger.js';

export class ScanToolbarVM {
    /** @param {import('../models/scan-toolbar-model.js').ScanToolbarConfig} config */
    constructor(config) {
        this.config = config;
        this._view = null;
        // State
        this.scanning = false;
        this.hasRows = false;
        this.hasSelection = false;
    }
    // ── View binding ──────────────────────────────────────────
    /** @param {import('../views/scan-toolbar-view.js').ScanToolbarView} view */
    bindView(view) {
        try {
            this._view = view;
            this._notify();
        } catch (err) {
            ErrLog.log('[scan-toolbar-vm.js]', err?.message || String(err), err?.stack || null, 'SCAN_TOOLBAR_VM_ERROR');
        }
    }
    // ── State transitions (called by section controllers) ─────
    /** Call when scan starts. Disables Scan, enables Cancel. */
    scanStarted() {
        try {
            this.scanning = true;
            this.hasRows = false;
            this.hasSelection = false;
            this._notify();
        } catch (err) {
            ErrLog.log('[scan-toolbar-vm.js]', err?.message || String(err), err?.stack || null, 'SCAN_TOOLBAR_VM_ERROR');
        }
    }
    /** Call when scan finishes or is cancelled. Re-enables Scan. */
    scanDone() {
        try {
            this.scanning = false;
            this._notify();
        } catch (err) {
            ErrLog.log('[scan-toolbar-vm.js]', err?.message || String(err), err?.stack || null, 'SCAN_TOOLBAR_VM_ERROR');
        }
    }
    /**
     * Call whenever the row count or selection count changes.
     * @param {number} rowCount       — total visible rows in grid
     * @param {number} selectedCount  — checked rows
     */
    rowsChanged(rowCount, selectedCount = 0) {
        try {
            this.hasRows = rowCount > 0;
            this.hasSelection = selectedCount > 0;
            this._notify();
        } catch (err) {
            ErrLog.log('[scan-toolbar-vm.js]', err?.message || String(err), err?.stack || null, 'SCAN_TOOLBAR_VM_ERROR');
        }
    }
    // ── Internal ──────────────────────────────────────────────
    _notify() {
        try {
            if (!this._view)
                return;
            this._view.update({
                scanning: this.scanning,
                hasRows: this.hasRows,
                hasSelection: this.hasSelection,
            });
        } catch (err) {
            ErrLog.log('[scan-toolbar-vm.js]', err?.message || String(err), err?.stack || null, 'SCAN_TOOLBAR_VM_ERROR');
        }
    }
    /** Derive enabled/disabled state for every button from current state. */
    getButtonStates() {
        const { scanning, hasRows, hasSelection } = this;
        return {
            scan: !scanning,
            cancel: scanning,
            selectAll: !scanning && hasRows,
            selectNone: !scanning && hasRows,
            deleteSelected: !scanning && hasSelection,
            keepSelected: !scanning && hasSelection,
            loadMore: false, // managed separately by page-loader
            deleteAllCopies: !scanning && hasRows,
            applyAll: !scanning && hasRows,
            fullView: true, // always enabled
        };
    }
}
//# sourceMappingURL=scan-toolbar-vm.js.map