// @ts-nocheck
// This viewmodel is authored in JS-style class syntax and currently relies on
// JSDoc contracts instead of explicit TS field declarations. Disable strict
// checks in this file until the full typed migration is completed.
import { ErrLog } from '../js/error-logger.js';
// ═══════════════════════════════════════════════════════════════════════════
//  SCAN TOOLBAR VIEWMODEL — owns toolbar state, notifies View on change.
//
//  State it owns:
//    scanning     — true while a scan is running
//    hasRows      — true when grid has ≥1 row
//    hasSelection — true when ≥1 row is checked
//
//  Knows nothing about: DOM, HTML, CSS, APIs, WebSockets.
// ═══════════════════════════════════════════════════════════════════════════

export class ScanToolbarVM {

  /** @param {import('../models/scan-toolbar-model.js').ScanToolbarConfig} config */
  constructor(config) {
    this.config       = config;
    this._view        = null;

    // State
    this.scanning     = false;
    this.hasRows      = false;
    this.hasSelection = false;
  }

  // ── View binding ──────────────────────────────────────────

  /** @param {import('../views/scan-toolbar-view.js').ScanToolbarView} view */
  bindView(view) {
    this._view = view;
    this._notify();
  }

  // ── State transitions (called by section controllers) ─────

  /** Call when scan starts. Disables Scan, enables Cancel. */
  scanStarted() {
    this.scanning     = true;
    this.hasRows      = false;
    this.hasSelection = false;
    this._notify();
  }

  /** Call when scan finishes or is cancelled. Re-enables Scan. */
  scanDone() {
    this.scanning = false;
    this._notify();
  }

  /**
   * Call whenever the row count or selection count changes.
   * @param {number} rowCount       — total visible rows in grid
   * @param {number} selectedCount  — checked rows
   */
  rowsChanged(rowCount, selectedCount = 0) {
    this.hasRows      = rowCount > 0;
    this.hasSelection = selectedCount > 0;
    this._notify();
  }

  // ── Internal ──────────────────────────────────────────────

  _notify() {
    if (!this._view) return;
    this._view.update({
      scanning:     this.scanning,
      hasRows:      this.hasRows,
      hasSelection: this.hasSelection,
    });
  }

  /** Derive enabled/disabled state for every button from current state. */
  getButtonStates() {
    const { scanning, hasRows, hasSelection } = this;
    return {
      scan:             !scanning,
      cancel:           scanning,
      selectAll:        !scanning && hasRows,
      selectNone:       !scanning && hasRows,
      deleteSelected:   !scanning && hasSelection,
      keepSelected:     !scanning && hasSelection,
      loadMore:         false,             // managed separately by page-loader
      deleteAllCopies:  !scanning && hasRows,
      applyAll:         !scanning && hasRows,
      fullView:         true,              // always enabled
    };
  }
}
