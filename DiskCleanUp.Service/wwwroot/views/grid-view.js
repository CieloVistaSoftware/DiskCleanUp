var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { fmt } from "../js/ui-utils.js";
import { ErrLog } from "../js/error-logger.js";
const MAX_ROWS_PER_GROUP = 20;
const MAX_RENDERED = 200;
const GROUPS_PER_FRAME = 20;
const _IMG_EXTS = /* @__PURE__ */ new Set([".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico"]);
const _VID_EXTS = /* @__PURE__ */ new Set([".mp4", ".webm", ".mov", ".avi", ".mkv"]);
const _TXT_EXTS = /* @__PURE__ */ new Set([
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".css",
  ".html",
  ".htm",
  ".json",
  ".xml",
  ".md",
  ".txt",
  ".cs",
  ".py",
  ".ps1",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".sh",
  ".bat",
  ".cmd",
  ".sql",
  ".csv"
]);
const _lazyObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const el = entry.target;
    _lazyObserver.unobserve(el);
    if (el.dataset.lazySrc) el.src = el.dataset.lazySrc;
  }
}, { rootMargin: "200px 0px", threshold: 0 });
function _extOf(path) {
  const m = String(path).match(/\.[^.\\/]+$/);
  return m ? m[0].toLowerCase() : "";
}
function _wastedBytes(group) {
  const files = group?.files;
  if (!Array.isArray(files) || files.length < 2) return 0;
  return (files.length - 1) * (files[0]?.size || 0);
}
class GridView {
  /**
   * @param containerId — DOM id of the result container (e.g. 'dupResult')
   * @param callbacks   — { onDeleteGroup(hash,paths,btn), onLoadPreview(el), onMarkChanged(count) }
   */
  constructor(containerId, callbacks = {}) {
    __publicField(this, "_containerId");
    __publicField(this, "_callbacks");
    __publicField(this, "_rendered");
    __publicField(this, "_domRows");
    __publicField(this, "_renderedCount");
    __publicField(this, "_overflowKeys");
    __publicField(this, "_pendingKeys");
    __publicField(this, "_rafId");
    __publicField(this, "_model");
    __publicField(this, "_data");
    __publicField(this, "_marked");
    this._containerId = containerId;
    this._callbacks = callbacks;
    this._rendered = false;
    this._domRows = /* @__PURE__ */ new Map();
    this._renderedCount = 0;
    this._overflowKeys = [];
    this._pendingKeys = [];
    this._rafId = null;
    this._model = null;
    this._data = null;
    this._marked = /* @__PURE__ */ new Set();
  }
  // ── Public API ────────────────────────────────────────────
  render(data, model, opts = {}) {
    try {
      this._model = model;
      this._data = data;
      if (opts.incremental && opts.key) {
        this._renderIncremental(opts.key);
        return;
      }
      this._fullRender(data, model);
    } catch (e) {
      ErrLog.log("[grid-view]", e?.message || String(e), e?.stack || null, "RENDER_ERROR");
    }
  }
  renderBatch(data, model, keys) {
    try {
      this._model = model;
      this._data = data;
      if (!this._rendered) this._ensureContainer();
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
            existing.all.forEach((el) => el.remove());
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
        els.all.forEach((el) => frag.appendChild(el));
        this._renderedCount++;
        added++;
      }
      if (frag.childNodes.length) list.appendChild(frag);
      if (this._overflowKeys.length) this._updateOverflowBanner();
      window._T?.("VIEW", `batch: +${added} new, ${updated} patched, ${this._renderedCount} total`);
    } catch (e) {
      ErrLog.log("[grid-view]", e?.message || String(e), e?.stack || null, "RENDER_BATCH_ERROR");
    }
  }
  clear() {
    this._cancelRaf();
    this._removeOverflowBanner();
    const container = document.getElementById(this._containerId);
    if (container) container.innerHTML = "";
    this._domRows.clear();
    this._renderedCount = 0;
    this._overflowKeys.length = 0;
    this._pendingKeys.length = 0;
    this._rendered = false;
    this._marked.clear();
  }
  /** Returns all paths currently marked for deletion. */
  getMarkedPaths() {
    return [...this._marked];
  }
  /** Clear all marked states (call after successful delete). */
  clearMarked() {
    this._marked.clear();
    document.querySelectorAll(`#${this._containerId} .dup-marked`).forEach((el) => {
      el.classList.remove("dup-marked");
      const btn = el.querySelector(".dup-mark-btn");
      if (btn) {
        btn.textContent = "Select";
        btn.classList.remove("active");
      }
    });
    this._callbacks.onMarkChanged?.(0);
  }
  // ── Full render ───────────────────────────────────────────
  _fullRender(data, model) {
    this._cancelRaf();
    this._domRows.clear();
    this._rendered = false;
    this._renderedCount = 0;
    this._overflowKeys.length = 0;
    this._pendingKeys.length = 0;
    this._marked.clear();
    this._removeOverflowBanner();
    this._ensureContainer();
    if (data.size === 0) {
      const list = document.getElementById(this._listId());
      if (list) list.innerHTML = '<div class="empty-msg">No results</div>';
      return;
    }
    const sortedKeys = [...data.keys()].sort(
      (a, b) => _wastedBytes(data.get(b)) - _wastedBytes(data.get(a))
    );
    for (const key of sortedKeys) {
      this._pendingKeys.push(key);
    }
    this._rafId = requestAnimationFrame(() => this._rafLoop());
  }
  // ── Incremental render (live scan) ────────────────────────
  _renderIncremental(key) {
    if (!this._rendered) {
      this._ensureContainer();
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
  }
  // ── RAF loop — batched DOM insertion ──────────────────────
  _rafLoop() {
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
      els.all.forEach((el) => frag.appendChild(el));
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
  }
  // ── Build DOM for one group ───────────────────────────────
  _buildGroupEls(key, group) {
    const model = this._model;
    const files = [...group.files || []].sort((a, b) => {
      const nameA = (a.path || "").replace(/.*[\\/]/, "");
      const nameB = (b.path || "").replace(/.*[\\/]/, "");
      return nameA.length - nameB.length || nameA.localeCompare(nameB);
    });
    const seq = group._seq || 0;
    const safeKey = this._esc(key);
    const wasted = _wastedBytes(group);
    const sep = document.createElement("div");
    sep.className = "dup-sep";
    sep.dataset.group = safeKey;
    sep.dataset.hash = key;
    sep.innerHTML = `
      <span class="dup-sep-label">
        \u{1F4CB} Group ${seq} &mdash; ${files.length} identical files
        &nbsp;\xB7&nbsp;<span class="accent-text">${fmt(files[0]?.size || 0)}</span> each
        &nbsp;\xB7&nbsp;<span class="dup-wasted">${fmt(wasted)} wasted</span>
      </span>
      <span class="dup-smart-keep">
        Keep:&nbsp;<button class="dup-keep-smart" data-strategy="newest" title="Mark all except newest modified">Newest</button
        ><button class="dup-keep-smart" data-strategy="oldest" title="Mark all except oldest modified">Oldest</button
        ><button class="dup-keep-smart" data-strategy="shortest" title="Mark all except shortest path">Shortest</button>
      </span>
      <button class="btn danger dup-trash-btn" data-trash-key="${safeKey}">\u{1F5D1} Delete Copies</button>`;
    const trashBtn = sep.querySelector(".dup-trash-btn");
    trashBtn.addEventListener("click", () => {
      const paths = model.copyPaths(group);
      this._callbacks.onDeleteGroup?.(key, paths, trashBtn);
    });
    sep.querySelectorAll(".dup-keep-smart").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._applySmartKeep(key, files, btn.dataset.strategy || "shortest");
      });
    });
    const cardsWrap = document.createElement("div");
    cardsWrap.className = "dup-cards-wrap";
    cardsWrap.dataset.group = safeKey;
    const pathRow = document.createElement("div");
    pathRow.className = "dup-path-row";
    files.slice(0, Math.min(files.length, MAX_ROWS_PER_GROUP)).forEach((f) => {
      const cell = document.createElement("div");
      cell.className = "dup-path-cell";
      cell.title = f.path || "";
      cell.textContent = f.path || "";
      pathRow.appendChild(cell);
    });
    cardsWrap.appendChild(pathRow);
    const cards = [];
    const visibleCount = Math.min(files.length, MAX_ROWS_PER_GROUP);
    const hiddenCount = files.length - visibleCount;
    for (let i = 0; i < visibleCount; i++) {
      const card = this._buildFileCard(files[i], i === 0, safeKey);
      cards.push(card);
      cardsWrap.appendChild(card);
    }
    if (hiddenCount > 0) {
      const expander = document.createElement("div");
      expander.className = "dup-card-expander";
      expander.textContent = `\u25B6 Show all ${files.length} files (${hiddenCount} more)`;
      expander.addEventListener("click", () => {
        for (let i = visibleCount; i < files.length; i++) {
          const card = this._buildFileCard(files[i], false, safeKey);
          cards.push(card);
          cardsWrap.insertBefore(card, expander);
        }
        expander.remove();
      }, { once: true });
      cardsWrap.appendChild(expander);
    }
    const all = [sep, cardsWrap];
    return { sep, cardsWrap, cards, all };
  }
  _buildFileCard(file, isKeep, safeGroupKey) {
    const path = file.path || "";
    const safePath = this._esc(path);
    const ext = _extOf(path);
    const filename = path.replace(/.*[\\/]/, "") || path;
    const dir = path.replace(/[\\/][^\\/]*$/, "") || "";
    const card = document.createElement("div");
    card.className = `dup-card ${isKeep ? "dup-card-keep" : "dup-card-copy"} live-row`;
    card.dataset.group = safeGroupKey;
    card.dataset.path = path;
    const previewEl = document.createElement("div");
    previewEl.className = "dup-card-preview";
    previewEl.dataset.previewPath = path;
    if (_IMG_EXTS.has(ext)) {
      const img = document.createElement("img");
      img.className = "dup-card-img";
      img.alt = "";
      img.dataset.lazySrc = `/api/file?path=${encodeURIComponent(path)}`;
      img.onload = () => img.classList.add("loaded");
      img.onerror = () => {
        img.style.display = "none";
        previewEl.classList.add("dup-preview-broken");
        previewEl.textContent = "(unavailable)";
      };
      _lazyObserver.observe(img);
      previewEl.appendChild(img);
    } else if (_VID_EXTS.has(ext)) {
      const vid = document.createElement("video");
      vid.className = "dup-card-img";
      vid.muted = true;
      vid.preload = "none";
      vid.playsInline = true;
      vid.dataset.lazySrc = `/api/file?path=${encodeURIComponent(path)}`;
      vid.addEventListener("loadeddata", () => {
        vid.currentTime = 0.5;
        vid.classList.add("loaded");
      }, { once: true });
      _lazyObserver.observe(vid);
      previewEl.appendChild(vid);
    } else {
      previewEl.classList.add("dup-preview-text");
      previewEl.textContent = "Loading\u2026";
      fetch(`/api/file?path=${encodeURIComponent(path)}`).then((r) => r.text()).then((text) => {
        const lines = text.split("\n").slice(0, 60).join("\n");
        const pre = document.createElement("pre");
        pre.className = "dup-file-content";
        pre.textContent = lines;
        previewEl.textContent = "";
        previewEl.appendChild(pre);
      }).catch(() => {
        previewEl.textContent = "(could not read file)";
      });
    }
    const body = document.createElement("div");
    body.className = "dup-card-body";
    body.innerHTML = `
      <div class="dup-card-filename" title="${safePath}">${this._esc(filename)}</div>
      <div class="dup-card-meta">${fmt(file.size || 0)}&nbsp;\xB7&nbsp;${this._esc(file.modified || "")}</div>`;
    const foot = document.createElement("div");
    foot.className = "dup-card-foot";
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "dup-delete-one-btn";
    deleteBtn.textContent = "\u{1F5D1} Delete";
    deleteBtn.title = "Send to Recycle Bin";
    deleteBtn.addEventListener("click", () => {
      deleteBtn.disabled = true;
      deleteBtn.textContent = "\u27F3";
      this._marked.delete(path);
      this._callbacks.onMarkChanged?.(this._marked.size);
      fetch("/api/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: [path] })
      }).then(() => {
        const groupRow = card.closest(".dup-row");
        if (groupRow) {
          groupRow.style.transition = "opacity .25s";
          groupRow.style.opacity = "0";
          setTimeout(() => groupRow.remove(), 260);
        } else {
          card.style.opacity = "0";
          setTimeout(() => card.remove(), 260);
        }
      }).catch(() => {
        deleteBtn.disabled = false;
        deleteBtn.textContent = "\u{1F5D1} Delete";
      });
    });
    foot.appendChild(deleteBtn);
    card.appendChild(previewEl);
    card.appendChild(body);
    card.appendChild(foot);
    return card;
  }
  // ── Smart keep — bulk-mark all except the chosen file ─────────
  _applySmartKeep(key, files, strategy) {
    let keepIdx = 0;
    if (strategy === "newest") {
      let latest = "";
      files.forEach((f, i) => {
        const m = f.modified || "";
        if (m > latest) {
          latest = m;
          keepIdx = i;
        }
      });
    } else if (strategy === "oldest") {
      let earliest = "\uFFFF";
      files.forEach((f, i) => {
        const m = f.modified || "";
        if (m && m < earliest) {
          earliest = m;
          keepIdx = i;
        }
      });
    } else {
      let minLen = Infinity;
      files.forEach((f, i) => {
        const len = (f.path || "").length;
        if (len < minLen) {
          minLen = len;
          keepIdx = i;
        }
      });
    }
    const keepPath = files[keepIdx]?.path || "";
    const groupEls = this._domRows.get(key);
    if (!groupEls) return;
    groupEls.cards.forEach((card) => {
      const cardPath = card.dataset.path || "";
      const markBtn = card.querySelector(".dup-mark-btn");
      if (cardPath === keepPath || !markBtn) {
        card.classList.remove("dup-marked");
        this._marked.delete(cardPath);
        if (markBtn) {
          markBtn.textContent = "Select";
          markBtn.classList.remove("active");
        }
      } else {
        card.classList.add("dup-marked");
        this._marked.add(cardPath);
        markBtn.textContent = "\u21A9 Deselect";
        markBtn.classList.add("active");
      }
    });
    this._callbacks.onMarkChanged?.(this._marked.size);
  }
  // ── Patch existing group ──────────────────────────────────
  _patchGroup(list, key) {
    const existing = this._domRows.get(key);
    if (existing) {
      existing.all.forEach((el) => el.remove());
    }
    const group = this._data.get(key);
    if (!group) {
      this._domRows.delete(key);
      return;
    }
    const els = this._buildGroupEls(key, group);
    this._domRows.set(key, els);
    const frag = document.createDocumentFragment();
    els.all.forEach((el) => frag.appendChild(el));
    list.appendChild(frag);
  }
  // ── Container ─────────────────────────────────────────────
  _ensureContainer() {
    if (this._rendered && document.getElementById(this._listId())) return;
    const container = document.getElementById(this._containerId);
    if (!container) return;
    container.innerHTML = `<div id="${this._listId()}" class="dup-list"></div>`;
    this._rendered = true;
  }
  _listId() {
    return this._containerId + "_list";
  }
  // ── Overflow banner ───────────────────────────────────────
  _updateOverflowBanner() {
    const listEl = document.getElementById(this._listId());
    if (!listEl) return;
    let banner = document.getElementById(this._containerId + "_overflow");
    if (this._overflowKeys.length === 0) {
      if (banner) banner.remove();
      return;
    }
    if (!banner) {
      banner = document.createElement("div");
      banner.id = this._containerId + "_overflow";
      banner.className = "dup-overflow-banner";
      banner.innerHTML = `
        <span id="${this._containerId}_overflowCount"></span>
        <button class="btn" id="${this._containerId}_showMore">Show 200 More</button>`;
      banner.querySelector(`#${this._containerId}_showMore`).addEventListener("click", () => this._showMore());
      listEl.after(banner);
    }
    document.getElementById(this._containerId + "_overflowCount").textContent = `${this._overflowKeys.length} more groups (${this._renderedCount} shown)`;
  }
  _removeOverflowBanner() {
    const banner = document.getElementById(this._containerId + "_overflow");
    if (banner) banner.remove();
  }
  _showMore() {
    const batch = this._overflowKeys.splice(0, MAX_RENDERED);
    this._pendingKeys.push(...batch);
    const list = document.getElementById(this._listId());
    if (list) list.innerHTML = "";
    this._domRows.clear();
    this._renderedCount = 0;
    this._rafId = requestAnimationFrame(() => this._rafLoop());
    this._updateOverflowBanner();
  }
  // ── Filter ────────────────────────────────────────────────
  filter(val) {
    const lower = val.toLowerCase();
    this._domRows.forEach(({ sep, cardsWrap, cards }) => {
      let hit = false;
      cards.forEach((card) => {
        const match = (card.dataset.path || "").toLowerCase().includes(lower) || (card.textContent || "").toLowerCase().includes(lower);
        card.classList.toggle("hidden", !match);
        if (match) hit = true;
      });
      if (sep) sep.classList.toggle("hidden", !hit);
      if (cardsWrap) cardsWrap.classList.toggle("hidden", !hit);
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
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
}
export {
  GridView
};
