import { colorFor, bgFor, extOf, dot } from "./ext-colors.js";
import { fmtBytes, escHtml as _esc } from "/lib/wb-core/utils/format.js";
import * as SF from "./scan-filter.js";
import { crumb } from "./breadcrumb.js";
import { ErrLog } from "./error-logger.js";
const _grids = {};
const _PREVIEW_IMG_EXTS = /* @__PURE__ */ new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".ico"]);
const _PREVIEW_VID_EXTS = /* @__PURE__ */ new Set([".mp4", ".webm", ".mov", ".avi", ".mkv"]);
const _previewObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const el = entry.target;
    _previewObserver.unobserve(el);
    const src = el.dataset.lazySrc;
    if (!src) continue;
    if (el.tagName === "IMG") {
      el.src = src;
    } else if (el.tagName === "VIDEO") {
      el.src = src;
      el.currentTime = 0.5;
    }
  }
}, { rootMargin: "200px 0px", threshold: 0 });
function _isPreviewable(ext) {
  return _PREVIEW_IMG_EXTS.has(ext) || _PREVIEW_VID_EXTS.has(ext);
}
function _makeThumb(path, ext) {
  const url = `/api/file?path=${encodeURIComponent(path)}`;
  if (_PREVIEW_VID_EXTS.has(ext)) {
    const vid = document.createElement("video");
    vid.className = "sg-thumb sg-thumb-vid";
    vid.muted = true;
    vid.preload = "none";
    vid.playsInline = true;
    vid.dataset.lazySrc = url;
    vid.addEventListener("loadeddata", () => {
      vid.classList.add("loaded");
    }, { once: true });
    _previewObserver.observe(vid);
    return vid;
  }
  const img = document.createElement("img");
  img.className = "sg-thumb";
  img.alt = "";
  img.dataset.lazySrc = url;
  img.onload = () => {
    img.classList.add("loaded");
  };
  img.onerror = () => {
    img.style.display = "none";
  };
  _previewObserver.observe(img);
  return img;
}
const _LAYOUT_VER = 2;
try {
  if (localStorage.getItem("sg_layout_ver") !== String(_LAYOUT_VER)) {
    Object.keys(localStorage).filter((k) => k.startsWith("sg_widths_")).forEach((k) => localStorage.removeItem(k));
    localStorage.setItem("sg_layout_ver", String(_LAYOUT_VER));
  }
} catch (ex) {
  ErrLog.log("[SCAN_GRID]", ex.message, ex.stack, "CAUGHT_ERROR");
}
function create(section, containerId, columns, opts = {}) {
  if (opts.filterBar !== false) {
    const filterId = `sf-${section}`;
    if (document.getElementById(filterId)) {
      SF.register(section, {
        tableId: null,
        containerId: filterId,
        pathSelector: ".sg-path",
        gridBodyId: `sg-body-${section}`
      });
    }
  }
  if (_grids[section]?.body && _grids[section].body.parentElement) return;
  crumb("sg", "create", { section, cols: columns.length });
  const container = document.getElementById(containerId);
  if (!container) return;
  const lineNoCol = { key: "_lineNo", label: "#", width: 36, type: "lineNo" };
  const actionsCol = { key: "_actions", label: "Actions", width: 155, type: "actions" };
  const userCols = columns.filter((c) => c.type !== "open");
  const allColumns = [lineNoCol, ...userCols, actionsCol];
  const saved = _loadWidths(section);
  const cols = allColumns.map((c, i) => {
    const w = saved?.[i] ?? (c.flex ? `minmax(${c.minWidth || 80}px, ${c.flex}fr)` : `${c.width || 80}px`);
    return { ...c, _idx: i, _width: w };
  });
  const gridTemplate = cols.map((c) => {
    if (typeof c._width === "number") return `minmax(0, ${c._width}px)`;
    if (typeof c._width === "string" && c._width.endsWith("px")) return `minmax(0, ${c._width})`;
    return c.flex ? `minmax(0, ${c.flex}fr)` : `minmax(0, ${c._width})`;
  }).join(" ");
  container.innerHTML = "";
  const body = document.createElement("div");
  body.className = "sg-body";
  body.id = `sg-body-${section}`;
  const header = document.createElement("div");
  header.className = "sg-header";
  header.style.gridTemplateColumns = gridTemplate;
  header.dataset.section = section;
  cols.forEach((c, i) => {
    const cell = document.createElement("div");
    cell.className = "sg-hcell";
    cell.dataset.colIdx = String(i);
    if (c.type === "checkbox") {
      const hCb = document.createElement("input");
      hCb.type = "checkbox";
      hCb.title = "Select all / none";
      hCb.className = "sg-select-all";
      hCb.addEventListener("change", () => selectAll(section, hCb.checked));
      cell.appendChild(hCb);
      body.addEventListener("change", (ev) => {
        if (!ev.target.matches("input[type=checkbox]")) return;
        const all = [...body.querySelectorAll("input[type=checkbox]")];
        const shown = all.filter((cb) => cb.closest(".sg-row")?.style.display !== "none");
        hCb.checked = shown.length > 0 && shown.every((cb) => cb.checked);
        hCb.indeterminate = !hCb.checked && shown.some((cb) => cb.checked);
      });
    } else {
      cell.textContent = c.label || "";
      cell.title = c.label || "";
      if (c.type === "keepBtn") cell.classList.add("sg-keep-cell");
      if (c.type === "delBtn") cell.classList.add("sg-del-cell");
    }
    if (c.type !== "checkbox" && c.type !== "keepBtn" && c.type !== "delBtn" && c.type !== "lineNo" && c.type !== "actions") {
      cell.classList.add("sg-sortable");
      cell.addEventListener("click", (e) => {
        if (e.target.classList.contains("sg-resize-handle")) return;
        _sortColumn(section, i);
      });
    }
    if (i < cols.length - 1) {
      const handle = document.createElement("div");
      handle.className = "sg-resize-handle";
      handle.addEventListener("mousedown", (e) => _startResize(e, section, i));
      cell.appendChild(handle);
    }
    header.appendChild(cell);
  });
  const legend = document.createElement("div");
  legend.className = "sg-legend";
  legend.id = `sg-legend-${section}`;
  legend.style.display = "none";
  container.appendChild(legend);
  container.appendChild(header);
  container.appendChild(body);
  _grids[section] = {
    containerId,
    columns: cols,
    gridTemplate,
    body,
    header,
    legend,
    rows: [],
    sortCol: -1,
    sortDir: 0,
    _frag: null,
    _flushScheduled: false,
    _legendExts: /* @__PURE__ */ new Set(),
    _activeExts: /* @__PURE__ */ new Set(),
    // chip-filter: extensions user has toggled on
    lastClickRow: null
    // Filter registration moved to top of create() — runs even when grid
    // already exists from skeleton (FEAT-021 fix)
  };
}
function _buildPathCell(cell, col, data) {
  cell.classList.add("sg-path");
  const colPath = data[col.key] || "";
  const colExt = extOf(colPath);
  cell.title = colPath;
  if (_isPreviewable(colExt)) {
    cell.appendChild(_makeThumb(colPath, colExt));
  } else {
    cell.innerHTML = dot(colExt);
  }
  const span = document.createElement("span");
  span.className = "sg-path-text";
  span.style.color = colorFor(colExt) || "inherit";
  span.textContent = colPath;
  cell.appendChild(span);
}
function _buildSubpathCell(cell, arr, section, row) {
  cell.classList.add("sg-paths");
  arr.forEach((p) => {
    const e = extOf(p);
    const sub = document.createElement("div");
    sub.className = "sg-subpath";
    sub.title = p;
    const pathSpan = document.createElement("span");
    pathSpan.className = "sg-subpath-text";
    pathSpan.style.color = colorFor(e) || "inherit";
    pathSpan.innerHTML = dot(e) + _esc(p);
    sub.appendChild(pathSpan);
    const acts = document.createElement("span");
    acts.className = "sg-subpath-actions";
    const tb = document.createElement("button");
    tb.className = "btn muted btn-xxs sg-trash-btn";
    tb.textContent = "\u{1F5D1}";
    tb.title = "Delete this file (Recycle Bin)";
    tb.onclick = (ev) => {
      ev.stopPropagation();
      _trashSubPath(section, p, sub, row);
    };
    acts.appendChild(tb);
    const fb = document.createElement("button");
    fb.className = "btn muted btn-xxs";
    fb.textContent = "\u{1F4C4}";
    fb.title = "Open file in VS Code";
    fb.onclick = (ev) => {
      ev.stopPropagation();
      window.openInVSCode ? window.openInVSCode(p) : window.openFileInVSCode?.(p);
    };
    acts.appendChild(fb);
    const ob = document.createElement("button");
    ob.className = "btn muted btn-xxs";
    ob.textContent = "\u{1F4C2}";
    ob.title = "Open containing folder";
    ob.onclick = (ev) => {
      ev.stopPropagation();
      _openFolder(p, ob);
    };
    acts.appendChild(ob);
    sub.appendChild(acts);
    cell.appendChild(sub);
  });
}
async function _fileIssueForRow(path, section, row) {
  const sizeBytes = parseInt(row.dataset.size || "0", 10) || void 0;
  const modified = row.dataset.modified || void 0;
  try {
    const res = await fetch("/api/issue/file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, section, sizeBytes, modified })
    });
    const json = await res.json();
    if (!res.ok) {
      ErrLog.log("[sg]", `File-issue failed: ${json.detail || json.error || res.status}`, null, "FILE_ISSUE_FAIL");
      return;
    }
    const url = json.issueUrl || "";
    const toast = document.createElement("div");
    toast.style.cssText = "position:fixed;bottom:16px;right:16px;background:#2d333b;color:#cae8ff;border:1px solid #58a6ff;border-radius:4px;padding:8px 14px;font-size:12px;z-index:9999";
    toast.innerHTML = url ? `Issue filed: <a href="${url}" target="_blank" style="color:#58a6ff">${url}</a>` : "Issue filed.";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5e3);
  } catch (e) {
    ErrLog.log("[sg]", `File-issue error: ${e.message}`, null, "FILE_ISSUE_ERROR");
  }
}
function _buildActionsCell(cell, path, section, row) {
  cell.classList.add("sg-actions");
  const trashBtn = document.createElement("button");
  trashBtn.className = "btn muted btn-xs sg-trash-btn";
  trashBtn.textContent = "\u{1F5D1}";
  trashBtn.title = "Delete (Recycle Bin)";
  trashBtn.onclick = () => _trashRow(section, path, row);
  cell.appendChild(trashBtn);
  const fileBtn = document.createElement("button");
  fileBtn.className = "btn muted btn-xs";
  fileBtn.textContent = "\u{1F4C4}";
  fileBtn.title = "Open file in VS Code";
  fileBtn.onclick = () => {
    window.openInVSCode ? window.openInVSCode(path) : window.openFileInVSCode?.(path);
  };
  cell.appendChild(fileBtn);
  const folderBtn = document.createElement("button");
  folderBtn.className = "btn muted btn-xs";
  folderBtn.textContent = "\u{1F4C2}";
  folderBtn.title = "Open containing folder in Explorer";
  folderBtn.onclick = () => _openFolder(path, folderBtn);
  cell.appendChild(folderBtn);
  const vscBtn = document.createElement("button");
  vscBtn.className = "btn muted btn-xs btn-vscode";
  vscBtn.textContent = "</>";
  vscBtn.title = "Open containing folder in VS Code";
  vscBtn.onclick = () => _openFolderInVSCode(path, vscBtn);
  cell.appendChild(vscBtn);
  const issueBtn = document.createElement("button");
  issueBtn.className = "btn muted btn-xs btn-file-issue";
  issueBtn.textContent = "\u2691";
  issueBtn.title = "File a GitHub issue for this file";
  issueBtn.onclick = (ev) => {
    ev.stopPropagation();
    _fileIssueForRow(path, section, row);
  };
  cell.appendChild(issueBtn);
}
function _buildCell(col, data, path, rowNum, section, row) {
  const cell = document.createElement("div");
  cell.className = "sg-cell";
  switch (col.type) {
    case "lineNo": {
      cell.classList.add("sg-lineno");
      cell.textContent = rowNum;
      break;
    }
    case "checkbox": {
      cell.innerHTML = `<input type="checkbox" data-path="${_esc(path)}">`;
      break;
    }
    case "delBtn": {
      cell.classList.add("sg-del-cell");
      const db = document.createElement("button");
      db.className = "btn-del";
      db.textContent = "\u{1F5D1}";
      db.title = "Delete this file";
      db.onclick = () => window._trashSelected?.(null, [path]);
      cell.appendChild(db);
      break;
    }
    case "keepBtn": {
      cell.classList.add("sg-keep-cell");
      const kb = document.createElement("button");
      kb.className = "btn-keep";
      kb.textContent = "\u{1F512}";
      kb.title = "Keep \u2014 exclude from future scans";
      kb.onclick = () => window.keepPaths?.([path]);
      cell.appendChild(kb);
      break;
    }
    case "path": {
      _buildPathCell(cell, col, data);
      break;
    }
    case "size": {
      cell.textContent = fmtBytes(data[col.key] || 0);
      cell.dataset.sortVal = data[col.key] || 0;
      break;
    }
    case "paths": {
      _buildSubpathCell(cell, Array.isArray(data[col.key]) ? data[col.key] : [], section, row);
      break;
    }
    case "badge": {
      cell.innerHTML = `<span class="badge orange">${_esc(data[col.key] || "")}</span>`;
      break;
    }
    case "actions": {
      _buildActionsCell(cell, path, section, row);
      break;
    }
    case "open": {
      cell.classList.add("sg-actions");
      const btn = document.createElement("button");
      btn.className = "btn muted btn-xs";
      btn.textContent = "\u{1F4C4}";
      btn.title = "Open file";
      btn.onclick = () => {
        window.openInVSCode ? window.openInVSCode(path) : window.openFileInVSCode?.(path);
      };
      cell.appendChild(btn);
      break;
    }
    default: {
      cell.textContent = data[col.key] ?? "";
      break;
    }
  }
  return cell;
}
function _wireRowDblClick(row, path, section) {
  const inBrowser = (/* @__PURE__ */ new Set(["html-files", "css-files"])).has(section);
  row.addEventListener("dblclick", (e) => {
    if (e.target.closest("button") || e.target.closest("input")) return;
    fetch(inBrowser ? "/api/open-default" : "/api/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path })
    }).catch(() => {
    });
  });
  row.style.cursor = "pointer";
  row.title = row.title || `Double-click to open${inBrowser ? " in browser" : ""}`;
}
function _scheduleFlush(section, g) {
  if (!g._frag) g._frag = document.createDocumentFragment();
  g._frag.appendChild(g.rows[g.rows.length - 1]);
  if (g._flushScheduled) return;
  g._flushScheduled = true;
  queueMicrotask(() => {
    crumb("sg", "flush", { section, total: g.rows.length });
    if (g._frag) {
      g.body.appendChild(g._frag);
      g._frag = null;
    }
    g._flushScheduled = false;
    _updateRowCount(section, g);
    _rebuildLegend(section, g);
    if (g._activeExts.size > 0) requestAnimationFrame(() => applyFilter(section));
  });
}
function _trackExts(g, path, ext, data, section) {
  if (ext) {
    SF.trackExt(section, path);
    g._legendExts.add(ext);
  }
  g.columns.forEach((col) => {
    if (col.type === "paths") {
      (Array.isArray(data[col.key]) ? data[col.key] : []).forEach((p) => {
        const e = extOf(p);
        if (e) g._legendExts.add(e);
      });
    }
  });
}
function addRow(section, data) {
  const g = _grids[section];
  if (!g) return;
  const path = data.path || data.keep || "";
  const ext = extOf(path);
  const rowNum = g.rows.length + 1;
  const row = document.createElement("div");
  row.className = "sg-row live-row";
  row.style.gridTemplateColumns = g.header.style.gridTemplateColumns;
  if (ext) row.style.background = bgFor(ext);
  row.dataset.path = path;
  row.dataset.ext = ext;
  row.dataset.size = String(data.size || data.sizeBytes || 0);
  row.dataset.modified = data.modified || data.lastModified || "";
  g.columns.forEach((col) => row.appendChild(_buildCell(col, data, path, rowNum, section, row)));
  if (path) _wireRowDblClick(row, path, section);
  g.rows.push(row);
  if (rowNum % 50 === 0 || rowNum === 1) crumb("sg", "addRow", { section, row: rowNum });
  _scheduleFlush(section, g);
  _trackExts(g, path, ext, data, section);
}
function showSkeleton(section, containerId, columns) {
  create(section, containerId, columns, { filterBar: false });
  const g = _grids[section];
  if (!g) return;
  for (let i = 0; i < 5; i++) {
    const row = document.createElement("div");
    row.className = "sg-row sg-skel-row";
    row.style.gridTemplateColumns = g.header.style.gridTemplateColumns;
    g.columns.forEach(() => {
      const cell = document.createElement("div");
      cell.className = "sg-cell";
      cell.innerHTML = `<span class="skel-bar skel-w-${i % 6}"></span>`;
      row.appendChild(cell);
    });
    g.body.appendChild(row);
  }
}
function removeSkeleton(section) {
  const g = _grids[section];
  if (!g) return;
  g.body.querySelectorAll(".sg-skel-row").forEach((r) => r.remove());
}
function clear(section) {
  const g = _grids[section];
  if (!g) return;
  crumb("sg", "clear", { section });
  g.body.innerHTML = "";
  g.rows = [];
  g._frag = null;
  g._flushScheduled = false;
  g._legendExts.clear();
  if (g.legend) {
    g.legend.innerHTML = "";
    g.legend.style.display = "none";
  }
  _updateRowCount(section, g);
}
function getChecked(section) {
  const g = _grids[section];
  if (!g) return [];
  return [...g.body.querySelectorAll("input[type=checkbox]:checked")].map((cb) => cb.dataset.path).filter(Boolean);
}
function removeByPath(path, section) {
  let removed = 0;
  const sections = section ? [section] : Object.keys(_grids);
  for (const sec of sections) {
    const g = _grids[sec];
    if (!g) continue;
    const before = g.rows.length;
    g.rows = g.rows.filter((row) => {
      if (row.dataset.path === path) {
        row.classList.add("keep-flash");
        setTimeout(() => row.remove(), 400);
        return false;
      }
      return true;
    });
    const delta = before - g.rows.length;
    if (delta > 0) {
      removed += delta;
      _updateRowCount(sec, g);
    }
  }
  return removed;
}
function removeByPaths(paths) {
  if (!paths.length) return 0;
  const pathSet = new Set(paths.map((p) => p.toLowerCase()));
  let removed = 0;
  for (const sec of Object.keys(_grids)) {
    const g = _grids[sec];
    if (!g) continue;
    const before = g.rows.length;
    g.rows = g.rows.filter((row) => {
      if (pathSet.has((row.dataset.path || "").toLowerCase())) {
        row.classList.add("keep-flash");
        setTimeout(() => row.remove(), 400);
        return false;
      }
      return true;
    });
    const delta = before - g.rows.length;
    if (delta > 0) {
      removed += delta;
      _updateRowCount(sec, g);
    }
  }
  return removed;
}
function hasRows(section) {
  const g = _grids[section];
  return g ? g.rows.length > 0 : false;
}
function rowCount(section) {
  const g = _grids[section];
  return g ? g.rows.length : 0;
}
function selectAll(section, val) {
  const g = _grids[section];
  if (!g) return;
  g.body.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    if (val && cb.closest(".sg-row")?.style.display === "none") return;
    cb.checked = val;
  });
}
function applyFilter(section) {
  const g = _grids[section];
  if (!g) return;
  crumb("sg", "applyFilter", { section, rows: g.rows.length });
  const mode = SF.getMode(section);
  const included = SF.getIncluded(section);
  const excluded = SF.getExcluded(section);
  const textEl = document.getElementById(`sf-text-${section}`);
  const text = (textEl?.value || "").toLowerCase();
  let shown = 0;
  for (const row of g.rows) {
    const ext = row.dataset.ext || "";
    const path = row.dataset.path || "";
    let vis = true;
    if (text) {
      const extShorthand = _parseExtShorthand(text);
      if (extShorthand) {
        if (ext !== extShorthand) vis = false;
      } else {
        if (!path.toLowerCase().includes(text)) vis = false;
      }
    }
    if (vis && mode === "include" && included && ext !== included) vis = false;
    if (vis && mode === "exclude" && excluded.has(ext)) vis = false;
    if (vis && g._activeExts.size > 0 && !g._activeExts.has(ext)) vis = false;
    row.style.display = vis ? "" : "none";
    if (vis) shown++;
  }
  const statusEl = document.getElementById(`sf-status-${section}`);
  if (statusEl) {
    if (shown === g.rows.length) statusEl.textContent = `${g.rows.length.toLocaleString()} rows`;
    else statusEl.textContent = `Showing ${shown.toLocaleString()} of ${g.rows.length.toLocaleString()}`;
  }
  _rebuildLegendFiltered(section, g, shown < g.rows.length);
}
function _updateRowCount(section, g) {
  const el = document.getElementById(`sbv-${section}-rows`);
  if (el) el.textContent = g.rows.length.toLocaleString();
  const hasData = g.rows.length > 0;
  document.querySelectorAll(`[data-grid-section="${section}"]`).forEach((btn) => {
    btn.disabled = !hasData;
  });
}
function _rebuildLegendFiltered(section, g, anyFiltered) {
  if (!g.legend) return;
  if (!anyFiltered) {
    if (g._legendLastCount !== g._legendExts.size) _rebuildLegend(section, g);
    else _syncLegendActive(section, g);
    return;
  }
  const visExts = /* @__PURE__ */ new Set();
  for (const row of g.rows) {
    if (row.style.display !== "none") {
      const ext = row.dataset.ext;
      if (ext) visExts.add(ext);
    }
  }
  const sorted = [...visExts].sort();
  g._legendLastCount = -1;
  if (sorted.length === 0) {
    g.legend.style.display = "none";
    g.legend.innerHTML = "";
    return;
  }
  g.legend.style.display = "";
  g.legend.innerHTML = `<span class="sg-legend-label">File types (${sorted.length}):</span>` + sorted.map(
    (ext) => `<span class="sg-legend-chip" data-ext="${ext}" title="Click to filter" style="cursor:pointer">${dot(ext)}<span style="color:${colorFor(ext)}">${ext}</span></span>`
  ).join("") + `<button class="sg-legend-clear" title="Clear chip filters" style="display:none">\u2715 Clear</button>`;
  g.legend.querySelectorAll(".sg-legend-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const ext = chip.dataset.ext || "";
      if (g._activeExts.has(ext)) g._activeExts.delete(ext);
      else g._activeExts.add(ext);
      _syncLegendActive(section, g);
      applyFilter(section);
    });
  });
  const clearBtn = g.legend.querySelector(".sg-legend-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      g._activeExts.clear();
      _syncLegendActive(section, g);
      applyFilter(section);
    });
  }
  _syncLegendActive(section, g);
}
function _rebuildLegend(section, g) {
  if (!g.legend || g._legendExts.size === 0) return;
  const sorted = [...g._legendExts].sort();
  if (g._legendLastCount !== sorted.length) {
    g._legendLastCount = sorted.length;
    g.legend.style.display = "";
    g.legend.innerHTML = `<span class="sg-legend-label">File types (${sorted.length}):</span>` + sorted.map(
      (ext) => `<span class="sg-legend-chip" data-ext="${ext}" title="Click to filter" style="cursor:pointer">${dot(ext)}<span style="color:${colorFor(ext)}">${ext}</span></span>`
    ).join("") + `<button class="sg-legend-clear" title="Clear chip filters" style="display:none">\u2715 Clear</button>`;
    g.legend.querySelectorAll(".sg-legend-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const ext = chip.dataset.ext || "";
        if (g._activeExts.has(ext)) {
          g._activeExts.delete(ext);
        } else {
          g._activeExts.add(ext);
        }
        _syncLegendActive(section, g);
        requestAnimationFrame(() => applyFilter(section));
      });
    });
    const clearBtn = g.legend.querySelector(".sg-legend-clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        g._activeExts.clear();
        _syncLegendActive(section, g);
        requestAnimationFrame(() => applyFilter(section));
      });
    }
  }
  _syncLegendActive(section, g);
}
function _syncLegendActive(section, g) {
  if (!g.legend) return;
  g.legend.querySelectorAll(".sg-legend-chip").forEach((chip) => {
    const ext = chip.dataset.ext || "";
    chip.classList.toggle("active", g._activeExts.has(ext));
  });
  const clearBtn = g.legend.querySelector(".sg-legend-clear");
  if (clearBtn) clearBtn.style.display = g._activeExts.size > 0 ? "" : "none";
}
function _trashSubPath(section, path, subEl, row) {
  if (!path) return;
  crumb("sg", "trashSubPath", { section, path });
  subEl.classList.add("keep-flash");
  setTimeout(() => subEl.remove(), 400);
  if (window.TrashQ?.enqueue) {
    window.TrashQ.enqueue([path]);
  } else {
    fetch("/api/trash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: [path] })
    }).catch(() => {
    });
  }
  removeByPath(path);
}
function _btnFeedback(btn, ok) {
  if (!btn) return;
  const orig = btn.textContent;
  btn.textContent = ok ? "\u2713" : "\u2717";
  btn.style.opacity = ok ? "0.6" : "1";
  btn.style.color = ok ? "" : "#e74c3c";
  setTimeout(() => {
    btn.textContent = orig;
    btn.style.opacity = "";
    btn.style.color = "";
  }, 1200);
}
function _trashRow(section, path, row) {
  if (!path) return;
  crumb("sg", "trashRow", { section, path });
  removeByPath(path);
  if (window.TrashQ?.enqueue) {
    window.TrashQ.enqueue([path]);
  } else {
    fetch("/api/trash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: [path] })
    }).catch((e) => {
      ErrLog.log("[sg]", `Delete failed: ${e.message}`, e, "ACTION_FAIL");
    });
  }
  const cacheSections = [
    "stale",
    "large",
    "empty",
    "node-modules",
    "venvs",
    "backups",
    "tiny-files",
    "html-files",
    "css-files",
    "duplicates",
    "images"
  ];
  for (const sec of cacheSections) {
    fetch(`/api/cache/${sec}/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: [path], trash: false })
    }).catch(() => {
    });
  }
}
function _openFolderInVSCode(path, btn) {
  if (!path) return;
  const folder = path.replace(/[\\/][^\\/]+$/, "");
  fetch("/api/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: folder })
  }).then(() => _btnFeedback(btn ?? null, true)).catch((e) => {
    ErrLog.log("[sg]", `Open in VS Code failed: ${e.message}`, e, "ACTION_FAIL");
    _btnFeedback(btn ?? null, false);
  });
}
function _openFolder(path, btn) {
  if (!path) return;
  const folder = path.replace(/[\\/][^\\/]+$/, "");
  fetch("/api/open-folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: folder })
  }).then(() => _btnFeedback(btn ?? null, true)).catch((e) => {
    ErrLog.log("[sg]", `Open folder failed: ${e.message}`, e, "ACTION_FAIL");
    _btnFeedback(btn ?? null, false);
    window.openInVSCode?.(folder);
  });
}
let _resizeState = null;
function _startResize(e, section, colIdx) {
  e.preventDefault();
  e.stopPropagation();
  const g = _grids[section];
  if (!g) return;
  const handle = e.target;
  handle.classList.add("sg-dragging");
  const hCells = g.header.children;
  const widths = Array.from(hCells).map((c) => c.getBoundingClientRect().width);
  _resizeState = { section, colIdx, startX: e.clientX, widths: [...widths], handle };
  document.addEventListener("mousemove", _onResizeMove);
  document.addEventListener("mouseup", _onResizeEnd);
}
function _onResizeMove(e) {
  if (!_resizeState) return;
  const { section, colIdx, startX, widths } = _resizeState;
  const g = _grids[section];
  if (!g) return;
  const delta = e.clientX - startX;
  const newW = Math.max(50, widths[colIdx] + delta);
  const updated = [...widths];
  updated[colIdx] = newW;
  const template = updated.map((w) => `minmax(0, ${Math.round(w)}px)`).join(" ");
  g.header.style.gridTemplateColumns = template;
  for (const row of g.body.children) {
    row.style.gridTemplateColumns = template;
  }
}
function _onResizeEnd() {
  if (!_resizeState) return;
  const { section, handle } = _resizeState;
  handle.classList.remove("sg-dragging");
  const g = _grids[section];
  if (g) {
    const hCells = g.header.children;
    const widths = Array.from(hCells).map((c) => `${Math.round(c.getBoundingClientRect().width)}px`);
    _saveWidths(section, widths);
    const template = widths.map((w) => `minmax(0, ${w})`).join(" ");
    g.header.style.gridTemplateColumns = template;
    g.gridTemplate = template;
  }
  _resizeState = null;
  document.removeEventListener("mousemove", _onResizeMove);
  document.removeEventListener("mouseup", _onResizeEnd);
}
function _saveWidths(section, widths) {
}
function _loadWidths(section) {
  try {
    const raw = localStorage.getItem(`sg_widths_${section}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function _sortColumn(section, colIdx) {
  const g = _grids[section];
  if (!g) return;
  crumb("sg", "sort", { section, col: colIdx, rows: g.rows.length });
  if (g.sortCol === colIdx) {
    g.sortDir = g.sortDir === 1 ? -1 : g.sortDir === -1 ? 0 : 1;
  } else {
    g.sortCol = colIdx;
    g.sortDir = 1;
  }
  g.header.querySelectorAll(".sg-hcell").forEach((c, i) => {
    c.classList.remove("sg-sort-asc", "sg-sort-desc");
    if (i === colIdx) {
      if (g.sortDir === 1) c.classList.add("sg-sort-asc");
      else if (g.sortDir === -1) c.classList.add("sg-sort-desc");
    }
  });
  if (g.sortDir === 0) {
    g.rows.forEach((r) => g.body.appendChild(r));
    return;
  }
  const col = g.columns[colIdx];
  const sorted = [...g.rows].sort((a, b) => {
    const cellA = a.children[colIdx];
    const cellB = b.children[colIdx];
    let va, vb;
    if (col.type === "size") {
      va = parseFloat(cellA.dataset.sortVal) || 0;
      vb = parseFloat(cellB.dataset.sortVal) || 0;
    } else {
      va = (cellA.textContent || "").toLowerCase();
      vb = (cellB.textContent || "").toLowerCase();
    }
    if (va < vb) return -1 * g.sortDir;
    if (va > vb) return 1 * g.sortDir;
    return 0;
  });
  sorted.forEach((r) => g.body.appendChild(r));
}
function _parseExtShorthand(text) {
  if (!text) return "";
  const t = text.replace(/^\*/, "").toLowerCase();
  if (t && !t.includes("/") && !t.includes("\\") && !t.includes(" ")) {
    return t.startsWith(".") ? t : "." + t;
  }
  return "";
}
let _dragState = null;
let _ctxMenuEl = null;
let _ctxMenuSection = null;
function _visibleRows(body) {
  return [...body.querySelectorAll(".sg-row")].filter((r) => r.style.display !== "none");
}
function _rowsBetween(body, a, b) {
  const rows = _visibleRows(body);
  const ai = rows.indexOf(a), bi = rows.indexOf(b);
  if (ai < 0 || bi < 0) return [];
  const lo = Math.min(ai, bi), hi = Math.max(ai, bi);
  return rows.slice(lo, hi + 1);
}
function _ensureCtxMenu() {
  if (_ctxMenuEl) return _ctxMenuEl;
  const menu = document.createElement("div");
  menu.className = "sg-ctx-menu";
  menu.innerHTML = '<button data-action="select-all">&#9745; Select All</button><button data-action="deselect-all">&#9744; Deselect All</button><button data-action="invert">&#8597; Invert Selection</button>';
  document.body.appendChild(menu);
  menu.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || !_ctxMenuSection) {
      menu.style.display = "none";
      return;
    }
    const g = _grids[_ctxMenuSection];
    menu.style.display = "none";
    if (!g) return;
    const action = btn.dataset.action;
    const cbs = _visibleRows(g.body).map((r) => r.querySelector("input[type=checkbox]")).filter(Boolean);
    if (action === "select-all") {
      cbs.forEach((cb) => {
        if (!cb.checked) {
          cb.checked = true;
          cb.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    } else if (action === "deselect-all") {
      cbs.forEach((cb) => {
        if (cb.checked) {
          cb.checked = false;
          cb.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    } else if (action === "invert") {
      cbs.forEach((cb) => {
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
  });
  document.addEventListener("click", () => {
    if (_ctxMenuEl) _ctxMenuEl.style.display = "none";
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && _ctxMenuEl) _ctxMenuEl.style.display = "none";
  });
  _ctxMenuEl = menu;
  return menu;
}
function _initInteractions(section, body) {
  body.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const target = e.target;
    if (target.closest("button") || target.closest("input") || target.closest(".sg-resize-handle")) return;
    const row = target.closest(".sg-row");
    if (!row) return;
    const cb = row.querySelector("input[type=checkbox]");
    if (!cb) return;
    e.preventDefault();
    const g = _grids[section];
    if (e.shiftKey && g?.lastClickRow) {
      _rowsBetween(body, g.lastClickRow, row).forEach((r) => {
        const rcb = r.querySelector("input[type=checkbox]");
        if (rcb && !rcb.checked) {
          rcb.checked = true;
          rcb.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
      return;
    }
    const newChecked = !cb.checked;
    cb.checked = newChecked;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
    if (g) g.lastClickRow = row;
    if (e.ctrlKey || e.metaKey) return;
    _dragState = { body, startRow: row, lastRow: row, checked: newChecked };
  });
  body.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    _ctxMenuSection = section;
    const menu = _ensureCtxMenu();
    menu.style.left = `${Math.min(e.clientX, window.innerWidth - 180)}px`;
    menu.style.top = `${Math.min(e.clientY, window.innerHeight - 115)}px`;
    menu.style.display = "block";
  });
}
document.addEventListener("mousemove", (e) => {
  if (!_dragState) return;
  const row = e.target.closest?.(".sg-row");
  if (!row || !_dragState.body.contains(row)) return;
  if (row === _dragState.lastRow) return;
  _dragState.lastRow = row;
  _rowsBetween(_dragState.body, _dragState.startRow, row).forEach((r) => {
    const cb = r.querySelector("input[type=checkbox]");
    if (cb && cb.checked !== _dragState.checked) {
      cb.checked = _dragState.checked;
      cb.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
});
document.addEventListener("mouseup", () => {
  _dragState = null;
});
window._scanGrid = {
  create,
  addRow,
  showSkeleton,
  removeSkeleton,
  clear,
  getChecked,
  selectAll,
  applyFilter,
  removeByPath,
  removeByPaths,
  hasRows,
  rowCount
};
export {
  addRow,
  applyFilter,
  clear,
  create,
  getChecked,
  hasRows,
  removeByPath,
  removeByPaths,
  removeSkeleton,
  rowCount,
  selectAll,
  showSkeleton
};
