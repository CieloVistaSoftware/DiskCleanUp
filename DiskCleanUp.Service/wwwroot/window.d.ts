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
    applyFilter?:   (section: string) => void;
    getChecked?:    (section: string) => string[];
    create?:        (section: string, containerId?: string, columns?: unknown[], opts?: unknown) => unknown;
    removeByPaths?: (paths: string[]) => void;
    removeByPath?:  (path: string, section?: string) => number;
    rowCount?:      (section: string) => number;
    hasRows?:       (section: string) => boolean;
    selectAll?:     (section: string, val: boolean) => void;
    addRow?:        (section: string, data: unknown) => void;
    clear?:         (section: string) => void;
    showSkeleton?:  (section: string, containerId: string, columns: unknown[]) => void;
    removeSkeleton?:(section: string) => void;
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
  _extColor?: ((ext: string) => string) | Record<string, string>;
  _extBg?:    ((ext: string) => string) | Record<string, string>;
  _extDot?:   ((ext: string) => string) | Record<string, string>;
  _extOf?:    ((path: string) => string) | Record<string, string>;

  // ── Breadcrumb trail (breadcrumb.ts) ──────────────────────────────────
  _crumbs?: { dump: (n?: number) => string; recent: (n?: number) => unknown[]; crumb: (module: string, fn: string, detail?: unknown) => void; flush: () => void };

  // ── Page loader (page-loader.ts) ──────────────────────────────────────
  _pageLoader?: unknown;

  // ── Trash queue (trash-queue.ts) ──────────────────────────────────────
  TrashQ?: {
    enqueue: (paths: string[], callback?: () => void) => void;
  };

  // ── Keep list (keep-list.ts) ──────────────────────────────────────────
  keepPaths?:              ((paths: string[]) => Promise<void>) | string[];
  _keepListClearAll?:      () => void;
  _keepListRemoveChecked?: () => void;

  // ── Recycle bin (recycle-bin.ts) ──────────────────────────────────────
  loadRecycleBin?:   () => void;
  filterRecycleBin?: () => void;
  rbSelectAll?:      () => void;
  rbSelectNone?:     () => void;
  restoreSelected?:  () => void;

  // ── Docs Audit (docs-audit.ts) ───────────────────────────────────────
  loadDocsAudit?: () => Promise<void>;

  // ── Savings (savings.ts) ──────────────────────────────────────────────
  filterSavings?:           () => void;
  savingsSelectAll?:        () => void;
  savingsSelectNone?:       () => void;
  restoreSavingsSelected?:  () => void;
  auditBinStatus?:          () => void;

  // ── UI Utils (ui-utils.ts) ────────────────────────────────────────────
  showSection?:     (id: string, btn?: HTMLElement | null) => void;
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
  _trashSelected?:            (tableId: string, directPaths?: string[]) => void;
  _deleteAllCopies?:          (section: string) => void;
  _applySmartDedup?:          () => Promise<void>;

  // ── Section status tracker (init.ts) ────────────────────────────────────
  _setSectionStatus?: (section: string, status: string) => void;

  // ── WebSocket internals (event-queue.ts / websocket.ts) ──────────────────
  _eventQueue?:       unknown;
  _processingQueue?:  boolean;
  _runDiagnostics?:   () => void;

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
