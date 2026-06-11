import { ErrLog } from '../js/error-logger.js';
// ═══════════════════════════════════════════════════════════════════════════
//  SECTION VIEWMODEL — JSONL ↔ Data Map ↔ View binding
//
//  Owns:  _data (Map), JSONL read/write via API, view notification.
//  Rule:  ALL mutations go through JSONL first, then re-read, then notify.
//         During live scans, WS events update _data directly for real-time
//         feel (backend writes JSONL simultaneously). Any user action
//         (delete) goes through the JSONL→reload→notify cycle.
//
//  PERF:  Scan events are BATCHED — dirty keys accumulate in _dirtyKeys,
//         flushed to View once per RAF frame. This collapses 1000s of
//         per-message renders into ~60/sec max.
// ═══════════════════════════════════════════════════════════════════════════

export class SectionVM {
  model: any;
  data: Map<string, any>;
  version: number;
  _view: any;
  _groupSeq: number;
  _scanning: boolean;
  _visible: boolean;
  _dirtyKeys: Set<string>;
  _rafId: number | null;
  _fullRenderPending: boolean;

  /**
   * @param {object} model — Model definition (e.g. DuplicatesModel)
   */
  constructor(model: any) {
    this.model      = model;
    this.data       = new Map();   // keyField → parsed record
    this.version    = 0;           // increments on every load/reload
    this._view      = null;        // bound View instance
    this._groupSeq  = 0;          // monotonic group counter for display ordering
    this._scanning  = false;      // true while scan is in progress
    this._visible   = false;      // tab visibility (set by controller)

    // ── Batching state ──
    this._dirtyKeys = new Set();  // keys changed since last flush
    this._rafId     = null;       // pending RAF for batch flush
    this._fullRenderPending = false; // full re-render queued
  }

  // ── View binding ──────────────────────────────────────────

  bindView(view) { this._view = view; }

  set visible(v) {
    const wasHidden = !this._visible && v;  // transition from false→true
    this._visible = v;
    
    if (wasHidden && this.data.size > 0) {
      // Tab became visible with existing data — force full render
      this._notifyFull();
    }
  }
  get visible()  { return this._visible; }

  // ── Batched notify — max once per RAF frame ───────────────

  /**
   * Schedule a view update. Dirty keys accumulate between frames.
   * One RAF callback flushes ALL accumulated keys in a single render.
   */
  _scheduleFlush() {
    if (this._rafId !== null) return;           // already scheduled
    this._rafId = requestAnimationFrame(() => this._flush());
  }

  _flush() {
    this._rafId = null;

    window._T?.('VM', `_flush: visible=${this._visible}, fullPending=${this._fullRenderPending}, dirtyKeys=${this._dirtyKeys.size}, dataSize=${this.data.size}`);

    if (!this._view) {
      window._T?.('VM', `_flush ABORT: no view`);
      return;
    }
    if (!this._visible && !this._fullRenderPending) {
      window._T?.('VM', `_flush ABORT: not visible and no fullRenderPending`);
      return; // skip if hidden
    }

    if (this._fullRenderPending) {
      this._fullRenderPending = false;
      this._dirtyKeys.clear();
      window._T?.('VM', `_flush FULL RENDER: ${this.data.size} groups`);
      this._view.render(this.data, this.model);
      return;
    }

    if (this._dirtyKeys.size === 0) {
      window._T?.('VM', `_flush SKIP: no dirty keys`);
      return;
    }

    const keys = [...this._dirtyKeys];
    this._dirtyKeys.clear();

    window._T?.('VM', `flush ${keys.length} dirty keys to view`);
    this._view.renderBatch(this.data, this.model, keys);
  }

  /** Immediate full render (used after JSONL reload) */
  _notifyFull() {
    this._fullRenderPending = true;
    this._scheduleFlush();
  }

  // ── JSONL → Data Map (read model, populate data) ──────────

  async load() {
    const section = this.model.section;
    window._T?.('VM', `load(${section}) start`);

    const rows = await this._readAllPages(section);
    this.data.clear();
    this._groupSeq = 0;

    for (const row of rows) {
      const parsed = this.model.parse(row);
      if (!parsed) continue;
      const key = parsed[this.model.keyField];
      this._groupSeq++;
      parsed._seq = this._groupSeq;
      this.data.set(key, parsed);
    }

    this.version++;
    window._T?.('VM', `load(${section}) done: ${this.data.size} groups, v${this.version}`);
    return this.data;
  }

  async loadAndBind() {
    await this.load();
    this._notifyFull();
    return this.data;
  }

  // ── Mutations (JSONL first, then reload, then notify) ─────

  async removePaths(paths, { trash = true } = {}) {
    const section = this.model.section;
    if (!paths?.length) return { removed: 0 };

    window._T?.('VM', `removePaths(${section}) ${paths.length} paths, trash=${trash}`);

    // During active scan: mutate data Map locally, skip JSONL reload.
    // JSONL is being written by scanner anyway; avoid fighting it.
    if (this._scanning) {
      window._T?.('VM', `removePaths — scan active, local-only delete`);
      // Fire-and-forget server delete (trash the files)
      fetch(`/api/cache/${section}/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths, trash })
      }).catch(e => window._T?.('VM', `remove API fire-forget error: ${e.message}`));

      // Remove from in-memory data
      const pathSet = new Set(paths);
      for (const [key, group] of this.data) {
        if (!group.files) continue;
        group.files = group.files.filter(f => !pathSet.has(f.path));
        if (group.files.length <= 1) {
          this.data.delete(key);
          this._dirtyKeys.delete(key);
        } else {
          this._dirtyKeys.add(key);
        }
      }
      this._notifyFull();
      return { removed: paths.length };
    }

    // Not scanning — full JSONL cycle
    try {
      const res = await fetch(`/api/cache/${section}/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths, trash })
      });
      const data = await res.json();
      window._T?.('VM', `removePaths(${section}) server removed ${data.removed}`);
    } catch (e) {
      ErrLog.log('[SECTION_VM]', e.message, e.stack, 'CAUGHT_ERROR');
      window._T?.('VM', `removePaths(${section}) API error: ${e.message}`);
    }

    await this.loadAndBind();
    return { removed: paths.length };
  }

  async removeAllCopies() {
    if (!this.model.allCopyPaths) return { removed: 0 };
    const paths = this.model.allCopyPaths(this.data);
    if (!paths.length) return { removed: 0 };
    return this.removePaths(paths, { trash: true });
  }

  // ── Live scan events (WS → data Map → batched flush) ──────

  /**
   * Handle a scan event from WebSocket.
   * Updates data Map directly. View update is DEFERRED to next RAF.
   */
  onScanEvent(msg) {
    const type = msg.type;

    if (type === 'result' || type === 'result_update') {
      const parsed = this.model.parse({ data: msg });
      if (!parsed) {
        window._T?.('VM', `onScanEvent: failed to parse ${type}`);
        return;
      }
      const key = parsed[this.model.keyField];

      if (type === 'result_update' && this.data.has(key)) {
        const existing = this.data.get(key);
        existing.files = parsed.files;
        window._T?.('VM', `onScanEvent: UPDATE ${key} now ${parsed.files.length} files`);
      } else {
        this._groupSeq++;
        parsed._seq = this._groupSeq;
        this.data.set(key, parsed);
        window._T?.('VM', `onScanEvent: ADD ${key} (seq=${this._groupSeq}, dataSize now=${this.data.size})`);
      }

      // Mark dirty — will flush on next RAF
      this._dirtyKeys.add(key);
      this._scheduleFlush();
      window._T?.('VM', `onScanEvent: marked ${key} dirty, scheduled flush (dirtyKeys.size=${this._dirtyKeys.size})`);
    }
  }

  /** Called by controller when scan starts */
  scanStarted() {
    this._scanning = true;
    window._T?.('VM', 'scan started — batching mode');
  }

  /** Called by controller when scan finishes */
  scanDone() {
    this._scanning = false;
    window._T?.('VM', `scan done — ${this.data.size} groups final`);
    // Final flush of any remaining dirty keys
    if (this._dirtyKeys.size > 0) this._scheduleFlush();
  }

  // ── Reset ─────────────────────────────────────────────────

  reset() {
    this._scanning = false;
    this._dirtyKeys.clear();
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._fullRenderPending = false;
    this.data.clear();
    this._groupSeq = 0;
    this.version++;
    if (this._view) this._view.clear();
  }

  // ── Helpers ───────────────────────────────────────────────

  get size() { return this.data.size; }

  async _readAllPages(section) {
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
}
