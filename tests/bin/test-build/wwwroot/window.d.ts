/**
 * Global Window augmentation for DiskCleanUp frontend.
 * Declares all window.* properties used across js/, views/, sections/, etc.
 * This file is picked up automatically by TypeScript via tsconfig include globs.
 */

interface Window {
  // ── Trace / debug ─────────────────────────────────────────────────────
  _T?: (tag: string, msg: string) => void;

  // ── WebSocket ──────────────────────────────────────────────────────────
  _wsSend?: (msg: object | string) => void;

  // ── Scan filter module (scan-filter.ts) ───────────────────────────────
  _scanFilter?: {
    register:    (section: string, opts?: Record<string, unknown>) => void;
    reset:       (section: string) => void;
    trackExt:    (section: string, path: string) => void;
    rebuild:     (section: string) => void;
    apply:       (section: string) => void;
    getExcluded: (section: string) => Set<string>;
    getIncluded: (section: string) => string;
    getMode:     (section: string) => string;
  };

  // ── Scan grid module (scan-grid.ts) ───────────────────────────────────
  _scanGrid?: {
    applyFilter?: (section: string) => void;
    getChecked?:  (section: string) => string[];
    create?:      (section: string, opts?: unknown) => unknown;
    removeByPaths?: (section: string, paths: string[]) => void;
  };

  // ── Domain data ────────────────────────────────────────────────────────
  _smartData?:   unknown[];
  _imageGroups?: Record<string, string[]>;

  // ── Server metrics (CPU / memory) ─────────────────────────────────────
  _memPct?: number;
  _cpuPct?: number;

  // ── UI helpers ─────────────────────────────────────────────────────────
  _updateLoadMoreBtn?: (section: string) => void;
  _scanToolbarVMs?:    Record<string, unknown>;

  // ── Status bar (status-bar.ts) ────────────────────────────────────────
  SB?: {
    begin:    (section: string, root?: string) => void;
    progress: (section: string, data: Record<string, unknown>) => void;
    done:     (section: string, label?: string) => void;
    error:    (section: string, msg?: string) => void;
  };

  // ── Data store (data-store.ts) ────────────────────────────────────────
  _DataStore?: unknown;

  // ── Extension color maps (ext-colors.ts) ──────────────────────────────
  _extColor?: Record<string, string>;
  _extBg?:    Record<string, string>;
  _extDot?:   Record<string, string>;
  _extOf?:    Record<string, string>;

  // ── Breadcrumb trail (breadcrumb.ts) ──────────────────────────────────
  _crumbs?: unknown[];

  // ── Page loader (page-loader.ts) ──────────────────────────────────────
  _pageLoader?: unknown;

  // ── Trash queue (trash-queue.ts) ──────────────────────────────────────
  TrashQ?: {
    enqueue: (paths: string[], callback?: () => void) => void;
  };

  // ── Keep list (keep-list.ts) ──────────────────────────────────────────
  keepPaths?:              string[];
  _keepListClearAll?:      () => void;
  _keepListRemoveChecked?: () => void;

  // ── Recycle bin (recycle-bin.ts) ──────────────────────────────────────
  loadRecycleBin?:   () => void;
  filterRecycleBin?: () => void;
  rbSelectAll?:      () => void;
  rbSelectNone?:     () => void;
  restoreSelected?:  () => void;

  // ── Savings (savings.ts) ──────────────────────────────────────────────
  filterSavings?:           () => void;
  savingsSelectAll?:        () => void;
  savingsSelectNone?:       () => void;
  restoreSavingsSelected?:  () => void;

  // ── UI Utils (ui-utils.ts) ────────────────────────────────────────────
  showSection?:     (id: string) => void;
  selectAllTable?:  (tableId: string, checked: boolean) => void;
  filterTable?:     (tableId: string, query: string) => void;
  fmt?:             (bytes: number) => string;

  // ── Task manager (task-manager.ts) ────────────────────────────────────
  _taskMgr?: unknown;

  // ── GC / metrics ──────────────────────────────────────────────────────
  _manualGC?: () => void;

  // ── Action functions exposed from actions.ts / init.ts ────────────────
  openInVSCode?:              (path: string) => void;
  openFileInVSCode?:          (path: string) => void;   // alias for openInVSCode
  trashGroup?:                (btn: HTMLElement, hash: string, paths: string[]) => void;
  trashImage?:                (path: string) => Promise<void>;
  _extractSvgFromSelectedHtml?: () => Promise<void>;
  _runHtmlUtility?:           (utility: string) => Promise<void>;
  keepSelected?:              (tableId: string) => void;
  _selectAll?:                (tableId: string) => void;
  _selectNone?:               (tableId: string) => void;
  _trashSelected?:            (tableId: string) => void;
  _deleteAllCopies?:          (section: string) => void;
  _applySmartDedup?:          () => Promise<void>;

  // ── WB Core ────────────────────────────────────────────────────────────
  WB?: Record<string, unknown> & { scan?: (el: Element) => void };

  // ── Third-party libs loaded via <script> ───────────────────────────────
  marked?: {
    parse:      (src: string) => string | Promise<string>;
    setOptions: (opts: Record<string, unknown>) => void;
    Renderer:   new () => Record<string, unknown>;
  };

  // ── Legacy browser prefix ──────────────────────────────────────────────
  webkitAudioContext?: typeof AudioContext;
}
