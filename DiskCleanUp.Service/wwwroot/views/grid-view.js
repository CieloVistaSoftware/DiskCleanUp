import { fmt } from '../js/ui-utils.js';
import { ErrLog } from '/js/error-logger.js';

const MAX_ROWS_PER_GROUP = 20;
const MAX_RENDERED = 200;
const GROUPS_PER_FRAME = 20;

const _IMG_EXTS = new Set(['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico']);
const _VID_EXTS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv']);
const _lazyObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        _lazyObserver.unobserve(el);
        try {
            if (el.dataset.lazySrc) el.src = el.dataset.lazySrc;
        } catch (err) {
            ErrLog.log('[grid-view.js]', err?.message || String(err), err?.stack || null, 'GRID_VIEW_ERROR');
        }
    }
}, { rootMargin: '200px 0px', threshold: 0 });

function _extOf(path) {
    try {
        const m = String(path).match(/\.[^.\\/]+$/);
        return m ? m[0].toLowerCase() : '';
    } catch (err) {
        ErrLog.log('[grid-view.js]', err?.message || String(err), err?.stack || null, 'GRID_VIEW_ERROR');
        return '';
    }
}

export class GridView {
    constructor(containerId, callbacks = {}) {
        this._containerId = containerId;
        this._callbacks = callbacks;
        this._rendered = false;
        this._domRows = new Map();
        this._renderedCount = 0;
        this._overflowKeys = [];
        this._pendingKeys = [];
        this._rafId = null;
        this._model = null;
        this._data = null;
    }

    render(data, model, opts = {}) {
        try {
            this._model = model;
            this._data = data;
            if (opts.incremental && opts.key) {
                this._renderIncremental(opts.key);
                return;
            }
            this._fullRender(data, model);
        } catch (err) {
            ErrLog.log('[grid-view.js]', err?.message || String(err), err?.stack || null, 'GRID_VIEW_ERROR');
        }
    }

    renderBatch(data, model, keys) {
        try {
            this._model = model;
            this._data = data;
            if (!this._rendered) this._ensureContainer(model);
            const list = document.getElementById(this._listId());
            if (!list) return;
            const frag = document.createDocumentFragment();
            let added = 0;
            let updated = 0;
            for (const key of keys) {
                const group = data.get(key);
                if (!group) {
                    const existing = this._domRows.get(key);
                    if (existing) {
                        existing.all.forEach(el => el.remove());
                        this._domRows.delete(key);
                        this._renderedCount--;
                    }
                    continue;
                }
                if (this._domRows.has(key)) {
                    this._patchGroup(list, key);
                    updated++;
                    continue;
                }
                if (this._renderedCount >= MAX_RENDERED) {
                    this._overflowKeys.push(key);
                    continue;
                }
                const els = this._buildGroupEls(key, group);
                this._domRows.set(key, els);
                els.all.forEach(el => frag.appendChild(el));
                this._renderedCount++;
                added++;
            }
            if (frag.childNodes.length) list.appendChild(frag);
            if (this._overflowKeys.length) this._updateOverflowBanner();
            window._T?.('VIEW', `batch: +${added} new, ${updated} patched, ${this._renderedCount} total`);
        } catch (err) {
            ErrLog.log('[grid-view.js]', err?.message || String(err), err?.stack || null, 'GRID_VIEW_ERROR');
        }
    }

    clear() {
        try {
            this._cancelRaf();
            this._removeOverflowBanner();
            const container = document.getElementById(this._containerId);
            if (container) container.innerHTML = '';
            this._domRows.clear();
            this._renderedCount = 0;
            this._overflowKeys.length = 0;
            this._pendingKeys.length = 0;
            this._rendered = false;
        } catch (err) {
            ErrLog.log('[grid-view.js]', err?.message || String(err), err?.stack || null, 'GRID_VIEW_ERROR');
        }
    }

    _fullRender(data, model) {
        try {
            this._cancelRaf();
            this._domRows.clear();
            this._renderedCount = 0;
            this._overflowKeys.length = 0;
            this._pendingKeys.length = 0;
            this._removeOverflowBanner();
            this._ensureContainer(model);
            if (data.size === 0) {
                const list = document.getElementById(this._listId());
                if (list) list.innerHTML = '<div class="empty-msg">No results</div>';
                return;
            }
            for (const key of data.keys()) {
                this._pendingKeys.push(key);
            }
            this._rafId = requestAnimationFrame(() => this._rafLoop());
        } catch (err) {
            ErrLog.log('[grid-view.js]', err?.message || String(err), err?.stack || null, 'GRID_VIEW_ERROR');
        }
    }

    _renderIncremental(key) {
        try {
            if (!this._rendered) {
                this._ensureContainer(this._model);
            }
            if (this._domRows.has(key)) {
                const list = document.getElementById(this._listId());
                if (list) this._patchGroup(list, key);
                return;
            }
            if (this._renderedCount >= MAX_RENDERED) {
                this._overflowKeys.push(key);
                this._updateOverflowBanner();
                return;
            }
            this._pendingKeys.push(key);
            if (this._rafId === null) {
                this._rafId = requestAnimationFrame(() => this._rafLoop());
            }
        } catch (err) {
            ErrLog.log('[grid-view.js]', err?.message || String(err), err?.stack || null, 'GRID_VIEW_ERROR');
        }
    }

    _rafLoop() {
        try {
            this._rafId = null;
            const list = document.getElementById(this._listId());
            if (!list) {
                this._pendingKeys.length = 0;
                return;
            }
            if (this._renderedCount >= MAX_RENDERED) {
                while (this._pendingKeys.length) {
                    this._overflowKeys.push(this._pendingKeys.shift());
                }
                this._updateOverflowBanner();
                return;
            }
            const room = MAX_RENDERED - this._renderedCount;
            const count = Math.min(this._pendingKeys.length, GROUPS_PER_FRAME, room);
            const frag = document.createDocumentFragment();
            for (let i = 0; i < count; i++) {
                const key = this._pendingKeys.shift();
                const group = this._data.get(key);
                if (!group) continue;
                const els = this._buildGroupEls(key, group);
                this._domRows.set(key, els);
                els.all.forEach(el => frag.appendChild(el));
                this._renderedCount++;
            }
            if (frag.childNodes.length) list.appendChild(frag);
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
        } catch (err) {
            ErrLog.log('[grid-view.js]', err?.message || String(err), err?.stack || null, 'GRID_VIEW_ERROR');
        }
    }

    _buildGroupEls(key, group) {
        try {
            const model = this._model;
            const files = group.files || [];
            const seq = group._seq || 0;
            const safeKey = this._esc(key);
            const sep = document.createElement('div');
            sep.className = 'dup-sep';
            sep.dataset.group = safeKey;
            sep.dataset.hash = key;
            sep.innerHTML = `
              <span class="dup-sep-label">
                \ud83d\udccb Group ${seq} &mdash; ${files.length} identical files
                &nbsp;\u00b7&nbsp;
                <span class="accent-text">${fmt(files[0]?.size || 0)}</span> each
              </span>
              <button class="btn danger dup-trash-btn" data-trash-key="${safeKey}">
                \ud83d\uddd1 Delete Copies
              </button>`;
            const btn = sep.querySelector('.dup-trash-btn');
            btn.addEventListener('click', () => {
                try {
                    const paths = model.copyPaths(group);
                    this._callbacks.onDeleteGroup?.(key, paths, btn);
                } catch (err) {
                    ErrLog.log('[grid-view.js]', err?.message || String(err), err?.stack || null, 'GRID_VIEW_ERROR');
                }
            });
            const firstPath = files[0]?.path || '';
            const firstExt = _extOf(firstPath);
            const preview = document.createElement('div');
            preview.className = 'dup-preview';
            preview.dataset.previewPath = firstPath;
            if (_IMG_EXTS.has(firstExt)) {
                const img = document.createElement('img');
                img.className = 'dup-thumb';
                img.alt = '';
                img.dataset.lazySrc = `/api/file?path=${encodeURIComponent(firstPath)}`;
                img.onload = () => img.classList.add('loaded');
                img.onerror = () => { img.style.display = 'none'; };
                _lazyObserver.observe(img);
                preview.appendChild(img);
            } else if (_VID_EXTS.has(firstExt)) {
                const vid = document.createElement('video');
                vid.className = 'dup-thumb dup-thumb-vid';
                vid.muted = true;
                vid.preload = 'none';
                vid.playsInline = true;
                vid.dataset.lazySrc = `/api/file?path=${encodeURIComponent(firstPath)}`;
                vid.addEventListener('loadeddata', () => {
                    vid.currentTime = 0.5;
                    vid.classList.add('loaded');
                }, { once: true });
                _lazyObserver.observe(vid);
                preview.appendChild(vid);
            } else {
                preview.classList.add('dup-preview-pending');
                preview.dataset.previewPath = firstPath;
                preview.textContent = '\ud83d\udd0d Click to preview';
                preview.style.cursor = 'pointer';
                preview.addEventListener('click', () => {
                    try {
                        if (preview.classList.contains('dup-preview-pending')) {
                            preview.classList.remove('dup-preview-pending');
                            preview.style.cursor = 'default';
                            preview.textContent = 'Loading\u2026';
                            this._callbacks.onLoadPreview?.(preview);
                        }
                    } catch (err) {
                        ErrLog.log('[grid-view.js]', err?.message || String(err), err?.stack || null, 'GRID_VIEW_ERROR');
                    }
                }, { once: true });
            }
            const fileRows = [];
            const all = [sep, preview];
            const visibleCount = Math.min(files.length, MAX_ROWS_PER_GROUP);
            const hiddenCount = files.length - visibleCount;
            for (let i = 0; i < visibleCount; i++) {
                const row = this._buildFileRow(files[i], i === 0, safeKey);
                fileRows.push(row);
                all.push(row);
            }
            if (hiddenCount > 0) {
                const expander = document.createElement('div');
                expander.className = 'dup-row dup-expander';
                expander.style.gridColumn = '1 / -1';
                expander.style.cursor = 'pointer';
                expander.style.padding = '6px 12px';
                expander.style.color = '#58a6ff';
                expander.textContent = `\u25b6 Show all ${files.length} files (${hiddenCount} hidden)`;
                expander.addEventListener('click', () => {
                    try {
                        const frag = document.createDocumentFragment();
                        for (let i = visibleCount; i < files.length; i++) {
                            const row = this._buildFileRow(files[i], false, safeKey);
                            fileRows.push(row);
                            frag.appendChild(row);
                        }
                        expander.replaceWith(frag);
                    } catch (err) {
                        ErrLog.log('[grid-view.js]', err?.message || String(err), err?.stack || null, 'GRID_VIEW_ERROR');
                    }
                }, { once: true });
                all.push(expander);
            }
            return { sep, preview, fileRows, all };
        } catch (err) {
            ErrLog.log('[grid-view.js]', err?.message || String(err), err?.stack || null, 'GRID_VIEW_ERROR');
            return { sep: null, preview: null, fileRows: [], all: [] };
        }
    }

    _listId() {
        return this._containerId + '_list';
    }

    _buildFileRow(file, isKeep, safeGroupKey) {
        try {
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
        } catch (err) {
            ErrLog.log('[grid-view.js]', err?.message || String(err), err?.stack || null, 'GRID_VIEW_ERROR');
            return document.createElement('div');
        }
    }

    _patchGroup(list, key) {
        try {
            const existing = this._domRows.get(key);
            if (existing) {
                existing.all.forEach(el => el.remove());
            }
            const group = this._data.get(key);
            if (!group) {
                this._domRows.delete(key);
                return;
            }
            const els = this._buildGroupEls(key, group);
            this._domRows.set(key, els);
            const frag = document.createDocumentFragment();
            els.all.forEach(el => frag.appendChild(el));
            list.appendChild(frag);
        } catch (err) {
            ErrLog.log('[grid-view.js]', err?.message || String(err), err?.stack || null, 'GRID_VIEW_ERROR');
        }
    }

    _ensureContainer(model) {
        try {
            if (this._rendered && document.getElementById(this._listId())) return;
            const container = document.getElementById(this._containerId);
            if (!container) return;
            const headerCells = model.columns.map((c) => {
                if (c.type === 'checkbox') {
                    return `<div><input type="checkbox" class="sg-select-all" title="Select all copies / none"></div>`;
                }
                return `<div>${this._esc(c.label)}</div>`;
            }).join('');
            container.innerHTML = `
              <div class="dup-header">${headerCells}</div>
              <div id="${this._listId()}"></div>`;
            const hCb = container.querySelector('.sg-select-all');
            const list = document.getElementById(this._listId());
            if (hCb && list) {
                hCb.addEventListener('change', () => {
                    try {
                        list.querySelectorAll('.dup-copy input[type=checkbox]')
                            .forEach(cb => { cb.checked = hCb.checked; });
                    } catch (err) {
                        ErrLog.log('[grid-view.js]', err?.message || String(err), err?.stack || null, 'GRID_VIEW_ERROR');
                    }
                });
                list.addEventListener('change', (ev) => {
                    try {
                        if (!ev.target.matches('input[type=checkbox]')) return;
                        const all = [...list.querySelectorAll('.dup-copy input[type=checkbox]')];
                        hCb.checked = all.length > 0 && all.every(cb => cb.checked);
                        hCb.indeterminate = !hCb.checked && all.some(cb => cb.checked);
                    } catch (err) {
                        ErrLog.log('[grid-view.js]', err?.message || String(err), err?.stack || null, 'GRID_VIEW_ERROR');
                    }
                });
            }
            this._rendered = true;
        } catch (err) {
            ErrLog.log('[grid-view.js]', err?.message || String(err), err?.stack || null, 'GRID_VIEW_ERROR');
        }
    }

    _updateOverflowBanner() {
        try {
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
                    .addEventListener('click', () => {
                        try {
                            this._showMore();
                        } catch (err) {
                            ErrLog.log('[grid-view.js]', err?.message || String(err), err?.stack || null, 'GRID_VIEW_ERROR');
                        }
                    });
                listEl.after(banner);
            }
            document.getElementById(this._containerId + '_overflowCount').textContent =
                `${this._overflowKeys.length} more groups (${this._renderedCount} shown)`;
        } catch (err) {
            ErrLog.log('[grid-view.js]', err?.message || String(err), err?.stack || null, 'GRID_VIEW_ERROR');
        }
    }

    _removeOverflowBanner() {
        try {
            const banner = document.getElementById(this._containerId + '_overflow');
            if (banner) banner.remove();
        } catch (err) {
            ErrLog.log('[grid-view.js]', err?.message || String(err), err?.stack || null, 'GRID_VIEW_ERROR');
        }
    }

    _showMore() {
        try {
            const batch = this._overflowKeys.splice(0, MAX_RENDERED);
            this._pendingKeys.push(...batch);
            const list = document.getElementById(this._listId());
            if (list) list.innerHTML = '';
            this._domRows.clear();
            this._renderedCount = 0;
            this._rafId = requestAnimationFrame(() => this._rafLoop());
            this._updateOverflowBanner();
        } catch (err) {
            ErrLog.log('[grid-view.js]', err?.message || String(err), err?.stack || null, 'GRID_VIEW_ERROR');
        }
    }

    _cancelRaf() {
        try {
            if (this._rafId !== null) {
                cancelAnimationFrame(this._rafId);
                this._rafId = null;
            }
        } catch (err) {
            ErrLog.log('[grid-view.js]', err?.message || String(err), err?.stack || null, 'GRID_VIEW_ERROR');
        }
    }

    _esc(s) {
        try {
            return String(s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        } catch (err) {
            ErrLog.log('[grid-view.js]', err?.message || String(err), err?.stack || null, 'GRID_VIEW_ERROR');
            return '';
        }
    }
}