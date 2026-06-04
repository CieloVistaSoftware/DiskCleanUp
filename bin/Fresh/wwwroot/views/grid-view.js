// ═══════════════════════════════════════════════════════════════════════════
//  GRID VIEW — Pure DOM renderer for section data
//
//  Takes:  data (Map) + model (column defs) → outputs DOM.
//  Owns:   DOM lifecycle, RAF batching, expanders, overflow banner.
//  Knows nothing about: JSONL, APIs, WebSockets, deletion logic.
//
//  Rendering modes:
//    render()       — full rebuild from data Map (after load/mutation)
//    render({incremental, key}) — append/update one group (live scan)
//    clear()        — wipe DOM
// ═══════════════════════════════════════════════════════════════════════════

import { fmt } from '../js/ui-utils.js';

const MAX_ROWS_PER_GROUP = 20;
const MAX_RENDERED       = 200;
const GROUPS_PER_FRAME   = 20;

export class GridView {

  /**
   * @param {string} containerId — DOM id of the result container (e.g. 'dupResult')
   * @param {object} callbacks   — { onDeleteGroup(hash, paths), onDeleteAllCopies() }
   */
  constructor(containerId, callbacks = {}) {
    this._containerId = containerId;
    this._callbacks   = callbacks;
    this._rendered    = false;
    this._domRows     = new Map();   // key → { sep, preview, fileRows }
    this._renderedCount = 0;
    this._overflowKeys  = [];
    this._pendingKeys   = [];
    this._rafId         = null;
    this._model         = null;
    this._data          = null;
  }

  // ── Public API ────────────────────────────────────────────

  /**
   * Render data into DOM using model column definitions.
   *
   * @param {Map}    data    — key → record
   * @param {object} model   — Model with columns[], grouped, keyField
   * @param {object} [opts]  — { incremental: bool, key: string }
   */
  render(data, model, opts = {}) {
    this._model = model;
    this._data  = data;

    if (opts.incremental && opts.key) {
      this._renderIncremental(opts.key);
      return;
    }

    // Full render — rebuild everything
    this._fullRender(data, model);
  }

  /**
   * Batch render — process multiple dirty keys in ONE DOM operation.
   * Called by ViewModel's RAF flush. Collapses 1000s of events/sec
   * into ~60 renders/sec max.
   *
   * @param {Map}      data  — full data Map
   * @param {object}   model — Model definition
   * @param {string[]} keys  — dirty keys to add/update
   */
  renderBatch(data, model, keys) {
    this._model = model;
    this._data  = data;

    if (!this._rendered) this._ensureContainer(model);

    const list = document.getElementById(this._listId());
    if (!list) return;

    const frag    = document.createDocumentFragment();
    let   added   = 0;
    let   updated = 0;

    for (const key of keys) {
      const group = data.get(key);

      // Key was deleted from data (e.g. group reduced to ≤1 file)
      if (!group) {
        const existing = this._domRows.get(key);
        if (existing) {
          existing.all.forEach(el => el.remove());
          this._domRows.delete(key);
          this._renderedCount--;
        }
        continue;
      }

      // Already rendered → patch in place
      if (this._domRows.has(key)) {
        this._patchGroup(list, key);
        updated++;
        continue;
      }

      // At cap → overflow
      if (this._renderedCount >= MAX_RENDERED) {
        this._overflowKeys.push(key);
        continue;
      }

      // New group → build and append
      const els = this._buildGroupEls(key, group);
      this._domRows.set(key, els);
      els.all.forEach(el => frag.appendChild(el));
      this._renderedCount++;
      added++;
    }

    if (frag.childNodes.length) list.appendChild(frag);
    if (this._overflowKeys.length) this._updateOverflowBanner();

    window._T?.('VIEW', `batch: +${added} new, ${updated} patched, ${this._renderedCount} total`);
  }

  /** Wipe all DOM content and reset state */
  clear() {
    this._cancelRaf();
    this._removeOverflowBanner();
    const container = document.getElementById(this._containerId);
    if (container) container.innerHTML = '';
    this._domRows.clear();
    this._renderedCount = 0;
    this._overflowKeys.length  = 0;
    this._pendingKeys.length   = 0;
    this._rendered = false;
  }

  // ── Full render ───────────────────────────────────────────

  _fullRender(data, model) {
    this._cancelRaf();
    this._domRows.clear();
    this._renderedCount = 0;
    this._overflowKeys.length = 0;
    this._pendingKeys.length  = 0;

    // Always remove stale overflow banner before rebuilding
    this._removeOverflowBanner();

    this._ensureContainer(model);

    if (data.size === 0) {
      const list = document.getElementById(this._listId());
      if (list) list.innerHTML = '<div class="empty-msg">No results</div>';
      return;
    }

    // Queue all keys for RAF-batched rendering
    for (const key of data.keys()) {
      this._pendingKeys.push(key);
    }

    this._rafId = requestAnimationFrame(() => this._rafLoop());
  }

  // ── Incremental render (live scan) ────────────────────────

  _renderIncremental(key) {
    if (!this._rendered) {
      this._ensureContainer(this._model);
    }

    // If already rendered, patch it
    if (this._domRows.has(key)) {
      const list = document.getElementById(this._listId());
      if (list) this._patchGroup(list, key);
      return;
    }

    // If at cap, overflow
    if (this._renderedCount >= MAX_RENDERED) {
      this._overflowKeys.push(key);
      this._updateOverflowBanner();
      return;
    }

    // Queue for next RAF
    this._pendingKeys.push(key);
    if (this._rafId === null) {
      this._rafId = requestAnimationFrame(() => this._rafLoop());
    }
  }

  // ── RAF loop — batched DOM insertion ──────────────────────

  _rafLoop() {
    this._rafId = null;
    const list = document.getElementById(this._listId());
    if (!list) { this._pendingKeys.length = 0; return; }

    // Cap check
    if (this._renderedCount >= MAX_RENDERED) {
      while (this._pendingKeys.length) {
        this._overflowKeys.push(this._pendingKeys.shift());
      }
      this._updateOverflowBanner();
      return;
    }

    const room  = MAX_RENDERED - this._renderedCount;
    const count = Math.min(this._pendingKeys.length, GROUPS_PER_FRAME, room);
    const frag  = document.createDocumentFragment();

    for (let i = 0; i < count; i++) {
      const key   = this._pendingKeys.shift();
      const group = this._data.get(key);
      if (!group) continue;

      const els = this._buildGroupEls(key, group);
      this._domRows.set(key, els);
      els.all.forEach(el => frag.appendChild(el));
      this._renderedCount++;
    }

    if (frag.childNodes.length) list.appendChild(frag);

    // Overflow leftover
    if (this._renderedCount >= MAX_RENDERED && this._pendingKeys.length) {
      while (this._pendingKeys.length) {
        this._overflowKeys.push(this._pendingKeys.shift());
      }
      this._updateOverflowBanner();
      return;
    }

    if (this._pendingKeys.length) {
      this._rafId = requestAnimationFrame(() => this._rafLoop());
    }
  }

  // ── Build DOM for one group ───────────────────────────────

  _buildGroupEls(key, group) {
    const model    = this._model;
    const files    = group.files || [];
    const seq      = group._seq || 0;
    const safeKey  = this._esc(key);

    // Group separator
    const sep = document.createElement('div');
    sep.className = 'dup-sep';
    sep.dataset.group = safeKey;
    sep.dataset.hash  = key;
    sep.innerHTML = `
      <span class="dup-sep-label">
        \ud83d\udccb Group ${seq} &mdash; ${files.length} identical files
        &nbsp;\u00b7&nbsp;
        <span class="accent-text">${fmt(files[0]?.size || 0)}</span> each
      </span>
      <button class="btn danger dup-trash-btn" data-trash-key="${safeKey}">
        \ud83d\uddd1 Delete Copies
      </button>`;

    // Wire delete button
    const btn = sep.querySelector('.dup-trash-btn');
    btn.addEventListener('click', () => {
      const paths = model.copyPaths(group);
      this._callbacks.onDeleteGroup?.(key, paths, btn);
    });

    // Preview placeholder (click-to-load)
    const preview = document.createElement('div');
    preview.className = 'dup-preview dup-preview-pending';
    preview.dataset.previewPath = files[0]?.path || '';
    preview.textContent = '\ud83d\udd0d Click to preview';
    preview.style.cursor = 'pointer';
    preview.addEventListener('click', () => {
      if (preview.classList.contains('dup-preview-pending')) {
        preview.classList.remove('dup-preview-pending');
        preview.style.cursor = 'default';
        preview.textContent = 'Loading preview\u2026';
        this._callbacks.onLoadPreview?.(preview);
      }
    }, { once: true });

    const fileRows = [];
    const all      = [sep, preview];
    const visibleCount = Math.min(files.length, MAX_ROWS_PER_GROUP);
    const hiddenCount  = files.length - visibleCount;

    for (let i = 0; i < visibleCount; i++) {
      const row = this._buildFileRow(files[i], i === 0, safeKey);
      fileRows.push(row);
      all.push(row);
    }

    // Expander for large groups
    if (hiddenCount > 0) {
      const expander = document.createElement('div');
      expander.className = 'dup-row dup-expander';
      expander.style.gridColumn = '1 / -1';
      expander.style.cursor = 'pointer';
      expander.style.padding = '6px 12px';
      expander.style.color = '#58a6ff';
      expander.textContent = `\u25b6 Show all ${files.length} files (${hiddenCount} hidden)`;
      expander.addEventListener('click', () => {
        const frag = document.createDocumentFragment();
        for (let i = visibleCount; i < files.length; i++) {
          const row = this._buildFileRow(files[i], false, safeKey);
          fileRows.push(row);
          frag.appendChild(row);
        }
        expander.replaceWith(frag);
      }, { once: true });
      all.push(expander);
    }

    return { sep, preview, fileRows, all };
  }

  _buildFileRow(file, isKeep, safeGroupKey) {
    const safePath = this._esc(file.path || '');
    const row = document.createElement('div');
    row.className = `dup-row ${isKeep ? 'dup-keep' : 'dup-copy'} live-row`;
    row.dataset.group = safeGroupKey;
    row.innerHTML = `
      <div class="dup-cell">${isKeep ? '' : `<input type="checkbox" data-path="${safePath}">`}</div>
      <div class="dup-cell">
        ${isKeep
          ? `<span class="badge green">\u2705 Keep</span>`
          : `<span class="badge red">\ud83d\uddd1 Copy</span>`}
      </div>
      <div class="dup-cell dup-path">${safePath}</div>
      <div class="dup-cell">${fmt(file.size || 0)}</div>
      <div class="dup-cell">${this._esc(file.modified || '')}</div>`;
    return row;
  }

  // ── Patch existing group (update in place) ────────────────

  _patchGroup(list, key) {
    const existing = this._domRows.get(key);
    if (existing) {
      existing.all.forEach(el => el.remove());
    }

    const group = this._data.get(key);
    if (!group) {
      this._domRows.delete(key);
      return;
    }

    const els  = this._buildGroupEls(key, group);
    this._domRows.set(key, els);
    const frag = document.createDocumentFragment();
    els.all.forEach(el => frag.appendChild(el));
    list.appendChild(frag);
  }

  // ── Container + header ────────────────────────────────────

  _ensureContainer(model) {
    if (this._rendered && document.getElementById(this._listId())) return;

    const container = document.getElementById(this._containerId);
    if (!container) return;

    const headerCells = model.columns.map(c =>
      `<div>${this._esc(c.label)}</div>`
    ).join('');

    container.innerHTML = `
      <div class="dup-header">${headerCells}</div>
      <div id="${this._listId()}"></div>`;

    this._rendered = true;
  }

  _listId() {
    return this._containerId + '_list';
  }

  // ── Overflow banner ───────────────────────────────────────

  _updateOverflowBanner() {
    const listEl = document.getElementById(this._listId());
    if (!listEl) return;

    let banner = document.getElementById(this._containerId + '_overflow');
    if (this._overflowKeys.length === 0) {
      if (banner) banner.remove();
      return;
    }

    if (!banner) {
      banner = document.createElement('div');
      banner.id = this._containerId + '_overflow';
      banner.className = 'dup-overflow-banner';
      banner.innerHTML = `
        <span id="${this._containerId}_overflowCount"></span>
        <button class="btn" id="${this._containerId}_showMore">Show 200 More</button>`;
      banner.querySelector(`#${this._containerId}_showMore`)
        .addEventListener('click', () => this._showMore());
      listEl.after(banner);
    }

    document.getElementById(this._containerId + '_overflowCount').textContent =
      `${this._overflowKeys.length} more groups (${this._renderedCount} shown)`;
  }

  /** Remove the overflow banner from DOM if it exists */
  _removeOverflowBanner() {
    const banner = document.getElementById(this._containerId + '_overflow');
    if (banner) banner.remove();
  }

  _showMore() {
    const batch = this._overflowKeys.splice(0, MAX_RENDERED);
    this._pendingKeys.push(...batch);

    // Clear current DOM and re-render
    const list = document.getElementById(this._listId());
    if (list) list.innerHTML = '';
    this._domRows.clear();
    this._renderedCount = 0;

    this._rafId = requestAnimationFrame(() => this._rafLoop());
    this._updateOverflowBanner();
  }

  // ── Filter (text search across visible rows) ──────────────

  filter(val) {
    const lower = val.toLowerCase();
    this._domRows.forEach(({ sep, preview, fileRows }) => {
      let hit = false;
      fileRows.forEach(row => {
        const match = row.textContent.toLowerCase().includes(lower);
        row.classList.toggle('hidden', !match);
        if (match) hit = true;
      });
      if (sep) sep.classList.toggle('hidden', !hit);
      if (preview) preview.classList.toggle('hidden', !hit);
    });
  }

  // ── Helpers ───────────────────────────────────────────────

  _cancelRaf() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
