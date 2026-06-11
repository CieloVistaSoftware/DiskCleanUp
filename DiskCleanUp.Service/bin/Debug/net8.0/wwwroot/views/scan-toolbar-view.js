var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
class ScanToolbarView {
  // els keys that must never be re-enabled
  constructor(config, callbacks = {}) {
    __publicField(this, "_config");
    __publicField(this, "_callbacks");
    __publicField(this, "_rendered");
    __publicField(this, "_els");
    __publicField(this, "_permanentlyGrayed");
    this._config = config;
    this._callbacks = callbacks;
    this._rendered = false;
    this._els = {};
    this._permanentlyGrayed = /* @__PURE__ */ new Set();
  }
  // ── Initial render ────────────────────────────────────────
  mount() {
    const { section, tableId, specialty } = this._config;
    const container = document.getElementById(`toolbar-${section}`);
    if (!container) return;
    container.className = "toolbar";
    container.dataset.section = section;
    const filterBar = document.createElement("div");
    filterBar.id = `sf-${section}`;
    filterBar.className = "scan-filter-bar";
    container.appendChild(filterBar);
    this._els.scan = this._btn("btn", `\u{1F50D} Scan`, () => this._callbacks.onScan?.());
    this._els.scan.dataset.action = "scan";
    this._els.scan.dataset.section = section;
    this._els.cancel = this._btn("btn muted", `\u2716 Cancel`, () => this._callbacks.onCancel?.());
    this._els.cancel.dataset.action = "cancel";
    this._els.cancel.dataset.section = section;
    this._els.deleteSelected = this._btn("btn danger", "\u{1F5D1} Delete Selected", () => this._callbacks.onDeleteSelected?.());
    this._els.deleteSelected.dataset.action = "trash-selected";
    this._els.deleteSelected.dataset.grid = section;
    this._els.deleteSelected.dataset.table = tableId;
    this._els.keepSelected = this._btn("btn-keep", "\u{1F512} Keep Selected", () => this._callbacks.onKeepSelected?.());
    this._els.keepSelected.dataset.gridSection = section;
    this._els.keepSelected.disabled = true;
    const has = (key) => specialty.includes(key);
    const _grayed = (elKey, btn, reason) => {
      btn.disabled = true;
      btn.title = `Not available for ${section} \u2014 ${reason}`;
      btn.style.display = "none";
      this._permanentlyGrayed.add(elKey);
    };
    this._els.deleteAllCopies = this._btn("btn danger hidden", "\u{1F5D1} Delete All Copies", () => this._callbacks.onDeleteAllCopies?.());
    this._els.deleteAllCopies.id = `imgDeleteAllBtn-${section}`;
    this._els.deleteAllCopies.dataset.action = "trash-all-copies";
    if (!has("delete-all-copies")) _grayed("deleteAllCopies", this._els.deleteAllCopies, "only on Duplicates and Dup Images");
    this._els.applyAll = this._btn("btn danger", "\u26A1 Apply All", () => this._callbacks.onApplyAll?.());
    this._els.applyAll.dataset.action = "apply-smart-dedup";
    if (!has("apply-all")) _grayed("applyAll", this._els.applyAll, "only on Smart Dedup");
    this._els.deleteAllDevCache = this._btn("btn danger", "\u{1F5D1} Delete All Caches", () => this._callbacks.onDeleteAllDevCache?.());
    this._els.deleteAllDevCache.dataset.action = "delete-all-dev-cache";
    if (!has("delete-all-dev-cache")) _grayed("deleteAllDevCache", this._els.deleteAllDevCache, "only on Dev Caches");
    this._els.utilities = this._btn("btn muted", "\u{1F9F0} Utilities", () => {
      if (!has("html-utilities")) return;
      const items = this._els.utilityItems || [];
      const anyVisible = items.some((btn) => !btn.classList.contains("hidden"));
      items.forEach((btn) => btn.classList.toggle("hidden", anyVisible));
    });
    if (has("html-utilities")) {
      this._els.utilities.title = "Show utility actions for HTML files";
      const utilityDefs = [
        ["extract-svg", "Extract SVG From HTML"],
        ["extract-css", "Extract CSS To .css"],
        ["extract-js", "Extract JS To .js"],
        ["inline-asset-report", "Inline Asset Report"],
        ["convert-data-uri-images", "Convert Data URI Images"],
        ["remove-dead-tags", "Remove Dead Tags"],
        ["normalize-paths", "Normalize Paths"],
        ["find-broken-links", "Find Broken Links"],
        ["a11y-quick-fix", "Accessibility Quick Fix"],
        ["format-html", "Minify + Pretty Format"],
        ["split-multi-svg", "Split Multi-SVG HTML"],
        ["extract-icons-symbols", "Extract Icons/Symbols"],
        ["fingerprint-diff", "HTML Fingerprint/Diff"]
      ];
      this._els.utilityItems = utilityDefs.map(([key, label]) => {
        const btn = this._btn("btn hidden", `\u{1F9E9} ${label}`, () => this._callbacks.onHtmlUtility?.(key));
        btn.dataset.action = "run-html-utility";
        btn.dataset.utility = key;
        btn.dataset.section = section;
        btn.title = label;
        return btn;
      });
    } else {
      _grayed("utilities", this._els.utilities, "only on HTML Files");
    }
    this._els.cssMergeAnalyze = this._btn("btn muted btn-css-merge-analyze", "\u{1F52C} Analyze Merge", () => this._callbacks.onCssMergeAnalyze?.());
    if (has("css-merge-analyze")) {
      this._els.cssMergeAnalyze.title = "Dry-run CSS merge analysis \u2014 no files are modified";
      const excludeInput = document.createElement("input");
      excludeInput.type = "text";
      excludeInput.className = "css-merge-exclude-input";
      excludeInput.placeholder = "Exclude folders (e.g. _sass,vendor,lib)";
      excludeInput.value = "_sass,node_modules,vendor,lib,dist,bower_components,bootstrap,font-awesome";
      excludeInput.title = "Comma-separated folder name patterns to exclude from merge analysis";
      excludeInput.style.cssText = "font-size:11px;padding:3px 7px;border-radius:4px;border:1px solid var(--border,#444);background:var(--surface,#1e1e1e);color:var(--fg,#eee);width:260px;margin-left:4px";
      this._els.mergeExcludeInput = excludeInput;
    } else {
      _grayed("cssMergeAnalyze", this._els.cssMergeAnalyze, "only on CSS Files");
    }

    const _imagesSections = /* @__PURE__ */ new Set(["duplicates", "smart-dedup", "images", "dup-images", "stale", "large", "backups", "tiny-files"]);
    let _whiteBgOn = false;
    this._els.whiteBg = this._btn("btn muted", "\u2B1C White BG", () => {
      _whiteBgOn = !_whiteBgOn;
      const resultId = section === "duplicates" ? "dupResult" : section === "images" ? "imageResult" : `${section}Result`;
      const cont = document.getElementById(resultId);
      if (!cont) return;
      cont.querySelectorAll(".dup-thumb, .img-card img, .sg-thumb, .img-card2-img, .img-card2").forEach((img) => {
        img.style.background = _whiteBgOn ? "white" : "";
      });
      this._els.whiteBg.textContent = _whiteBgOn ? "\u2B1B Dark BG" : "\u2B1C White BG";
      this._els.whiteBg.classList.toggle("active", _whiteBgOn);
    });
    if (_imagesSections.has(section)) {
      this._els.whiteBg.title = "Toggle white background on all images in this section";
    } else {
      _grayed("whiteBg", this._els.whiteBg, "no images in this section");
    }
    this._els.loadMore = document.createElement("button");
    this._els.loadMore.className = "btn load-more-btn-tb";
    this._els.loadMore.id = `loadMore-${section}`;
    this._els.loadMore.disabled = true;
    const dot = document.createElement("span");
    dot.className = "lm-dot red";
    this._els.loadMore.appendChild(dot);
    this._els.loadMore.appendChild(document.createTextNode(" Load More Results"));
    this._els.fullView = this._btn("btn muted", "\u{1F50E} Full View", () => this._callbacks.onFullView?.());
    if (!has("full-view")) _grayed("fullView", this._els.fullView, "only on Tiny Files");
    this._els.cancel.disabled = true;
    this._els.trace = this._btn("btn muted", "\u{1F4DC} Trace", () => {
      const tag = section.toUpperCase().replace(/-/g, "_");
      window.open(`/trace-viewer.html?filter=${encodeURIComponent(tag)}`, "_blank");
    });
    this._els.trace.title = `Open trace log filtered to ${section}`;
    container.appendChild(this._els.scan);
    container.appendChild(this._els.cancel);
    container.appendChild(this._els.deleteSelected);
    container.appendChild(this._els.keepSelected);
    container.appendChild(this._els.deleteAllCopies);
    container.appendChild(this._els.applyAll);
    container.appendChild(this._els.deleteAllDevCache);
    container.appendChild(this._els.utilities);
    if (this._els.utilityItems?.length) for (const btn of this._els.utilityItems) container.appendChild(btn);
    container.appendChild(this._els.whiteBg);
    container.appendChild(this._els.cssMergeAnalyze);
    if (this._els.mergeExcludeInput) container.appendChild(this._els.mergeExcludeInput);
    container.appendChild(this._els.loadMore);
    container.appendChild(this._els.fullView);
    container.appendChild(this._els.trace);
    this._rendered = true;
  }
  // ── State-driven update ───────────────────────────────────
  update(state) {
    if (!this._rendered) return;
    const { scanning, hasRows, hasSelection } = state;
    const e = this._els;
    this._setDisabled(e.scan, scanning);
    this._setDisabled(e.cancel, !scanning);
    this._setDisabled(e.deleteSelected, scanning);
    this._setDisabled(e.keepSelected, scanning);
    this._setDisabled(e.deleteAllCopies, scanning || !hasRows, "deleteAllCopies");
    this._setDisabled(e.applyAll, scanning || !hasRows, "applyAll");
    this._setDisabled(e.deleteAllDevCache, scanning || !hasRows, "deleteAllDevCache");
    this._setDisabled(e.utilities, scanning, "utilities");
    if (e.utilityItems?.length) {
      for (const btn of e.utilityItems) this._setDisabled(btn, scanning || !hasSelection);
    }
    if (e.commandMenu) {
      const byValue = (v) => [...e.commandMenu.options].find((o) => o.value === v);
      const scan = byValue("scan");
      const cancel = byValue("cancel");
      const del = byValue("delete-selected");
      const keep = byValue("keep-selected");
      const more = byValue("load-more");
      if (scan) scan.disabled = !!scanning;
      if (cancel) cancel.disabled = !scanning;
      if (del) del.disabled = !!scanning || !hasSelection;
      if (keep) keep.disabled = !!scanning || !hasSelection;
      if (more) more.disabled = !!e.loadMore?.disabled;
    }
  }
  exposeDeleteAllAsLegacyId() {
    const el = this._els.deleteAllCopies;
    if (el && this._config.section === "images") {
      el.id = "imgDeleteAllBtn";
    }
  }
  // ── Helpers ───────────────────────────────────────────────
  _btn(className, text, handler) {
    const btn = document.createElement("button");
    btn.className = className;
    btn.textContent = text;
    btn.addEventListener("click", handler);
    return btn;
  }
  _setDisabled(el, disabled, elKey) {
    if (!el) return;
    if (elKey && this._permanentlyGrayed.has(elKey)) return;
    el.disabled = !!disabled;
  }
}
export {
  ScanToolbarView
};
