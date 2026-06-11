window.openInVSCode = function(path) {
  fetch("/api/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path })
  }).catch(() => {
  });
};
import "./breadcrumb.js";
import "./error-logger.js";
import "./metrics.js";
import "./event-queue.js";
import "./column-controls.js?v=2";
import "./status-bar.js";
import "./table-utils.js?v=2";
import "./ui-utils.js";
import "./savings.js?v=2";
import "./settings.js";
import "./trash-queue.js";
import "./websocket.js";
import { startScan, cancelScan } from "./actions.js?v=2";
import "./ext-colors.js";
import "./scan-filter.js";
import "./scan-grid.js";
import "./section-handlers.js";
import "./events.js?v=2";
import "./keep-list.js";
import "./recycle-bin.js?v=2";
import "./task-manager.js?v=2";
import { wsConnect } from "./websocket.js";
import { registerHandler } from "./event-queue.js";
import { registerSectionModule, restoreActiveTab } from "./ui-utils.js";
import { loadSettings } from "./settings.js";
import { updateTotalSaved } from "./savings.js?v=2";
import { apiFetch } from "./ui-utils.js";
import { pushEvent, pushEventSync } from "./event-queue.js";
import { _set, _folder } from "./status-bar.js";
import { loadPage, hasMore, resetPaging, getCacheAge } from "./page-loader.js?v=2";
import { DuplicatesSection } from "../sections/duplicates.js";
import { SCAN_TOOLBAR_CONFIGS } from "../models/scan-toolbar-model.js?v=4";
import { ScanToolbarVM } from "../viewmodels/scan-toolbar-vm.js?v=4";
import { ScanToolbarView } from "../views/scan-toolbar-view.js?v=4";
import { initKeepList } from "./keep-list.js";
import { crumb } from "./breadcrumb.js";
import { loadTasks } from "./task-manager.js?v=2";
const _T = window._T || ((tag, msg) => console.log(`[${tag}] ${msg}`));
_T("INIT", "all imports resolved");
registerHandler("duplicates", DuplicatesSection.onEvent);
registerSectionModule("duplicates", DuplicatesSection);
registerSectionModule("tasks", { onShow: loadTasks });
async function restoreCachedResults() {
  crumb("init", "restoreCache:start");
  _T("CACHE", "restoreCachedResults START");
  let keepSet = /* @__PURE__ */ new Set();
  try {
    const kl = await apiFetch("/api/keep-list", {}, { timeout: 1e4 });
    if (kl?.paths?.length) {
      keepSet = new Set(kl.paths.map((p) => p.toLowerCase()));
      _T("CACHE", `keep-list loaded: ${keepSet.size} paths`);
    }
  } catch {
  }
  const STALE_THRESHOLD = 1440;
  const sections = ["duplicates", "smart-dedup", "stale", "large", "node-modules", "venvs", "empty", "images", "backups", "tiny-files", "html-files", "css-files", "ext-search"];
  for (const section of sections) {
    try {
      _T("CACHE", `loadPage(${section})`);
      const { rows, loaded } = await loadPage(section);
      _T("CACHE", `${section}: ${rows.length} rows`);
      if (!rows.length) continue;
      const ageMin = getCacheAge(section);
      if (ageMin != null && ageMin > STALE_THRESHOLD) {
        _T("CACHE", `${section}: STALE (${ageMin.toFixed(0)}m old) \u2014 clearing`);
        fetch(`/api/cache/${section}`, { method: "DELETE" }).catch(() => {
        });
        resetPaging(section);
        continue;
      }
      let resultCount = 0;
      let skippedKept = 0;
      const CHUNK = 200;
      for (let i = 0; i < rows.length; i++) {
        const evt = rows[i];
        if (evt.type === "started" || evt.type === "progress" || evt.type === "done") continue;
        const d = evt.data || {};
        const p = d.path || d.keep || "";
        if (p && keepSet.has(p.toLowerCase())) {
          skippedKept++;
          continue;
        }
        pushEventSync(section, evt.type, d);
        resultCount++;
        if (resultCount % CHUNK === 0) await new Promise((r) => setTimeout(r, 0));
      }
      if (skippedKept) _T("CACHE", `${section}: filtered out ${skippedKept} kept files`);
      if (resultCount > 0) {
        const SF = window._scanFilter;
        if (SF?.reset) SF.reset(section);
        if (SF?.rebuild) SF.rebuild(section);
        const bar = document.getElementById(`sb-${section}`);
        if (bar) bar.className = "section-sb done";
        _sectionStatusMap.set(section, "done");
        _updateNavButtonStatus(section);
        _set(section, "status", "\u267B Restored");
        _set(section, "time", "\u2014");
        const more = hasMore(section);
        const moreLabel = more ? " \xB7 more available" : "";
        let ageLabel = "";
        if (ageMin != null) {
          if (ageMin < 60) ageLabel = ` \xB7 ${Math.round(ageMin)}m ago`;
          else if (ageMin < 1440) ageLabel = ` \xB7 ${(ageMin / 60).toFixed(1)}h ago`;
          else ageLabel = ` \xB7 ${(ageMin / 1440).toFixed(1)}d ago`;
        }
        _folder(section, `Restored \xB7 ${resultCount} results${moreLabel}${ageLabel}`);
        _updateLoadMoreBtn(section);
        if (section === "images" && resultCount > 0) {
          const delBtn = document.getElementById("imgDeleteAllBtn");
          if (delBtn) delBtn.style.display = "";
          setTimeout(() => window._wireImgSection?.(), 150);
          const imgDelBtn = document.getElementById("imgDeleteAllBtn") || document.querySelector('[data-action="trash-all-copies"]');
          if (imgDelBtn) { imgDelBtn.classList.remove("hidden"); imgDelBtn.style.display = ""; }
        }
      }
    } catch (e) {
      _T("CACHE", `${section}: error ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  crumb("init", "restoreCache:done");
  _T("CACHE", "restoreCachedResults DONE");
}
function _updateLoadMoreBtn(section) {
  const btn = document.getElementById(`loadMore-${section}`);
  if (!btn) return;
  const dot = btn.querySelector(".lm-dot");
  const more = hasMore(section);
  btn.disabled = !more;
  btn.classList.remove("loading");
  if (dot) {
    dot.classList.toggle("green", more);
    dot.classList.toggle("red", !more);
  }
  btn.textContent = "";
  btn.appendChild(dot || _makeDot(more));
  btn.appendChild(document.createTextNode(" Load More Results"));
}
function _makeDot(isGreen) {
  const dot = document.createElement("span");
  dot.className = `lm-dot ${isGreen ? "green" : "red"}`;
  return dot;
}
async function _restoreSectionIfEmpty(section) {
  if (_sectionStatusMap.get(section) !== "done") return;
  if ((window._scanGrid?.rowCount?.(section) ?? 0) > 0) return;
  _T("CACHE", `onShow restore: ${section}`);
  try {
    const { rows } = await loadPage(section);
    if (!rows.length) return;
    let count = 0;
    for (const evt of rows) {
      if (evt.type === "started" || evt.type === "progress" || evt.type === "done") continue;
      pushEventSync(section, evt.type, evt.data || {});
      count++;
      if (count % 200 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    if (count > 0) {
      window._scanFilter?.rebuild?.(section);
      _folder(section, `Restored \xB7 ${count} results`);
      _updateLoadMoreBtn(section);
    }
    _T("CACHE", `onShow restore: ${section} \u2192 ${count} rows`);
  } catch (e) {
    _T("CACHE", `onShow restore error: ${section}: ${e.message}`);
  }
}
window._restoreSectionIfEmpty = _restoreSectionIfEmpty;
async function _autoScanIfEmpty(section) {
  await _restoreSectionIfEmpty(section);
  const status = _sectionStatusMap.get(section) ?? "idle";
  if (status === "scanning" || status === "done") return;
  if ((window._scanGrid?.rowCount?.(section) ?? 0) > 0) return;
  setTimeout(() => {
    _T("AUTO-SCAN", `auto-scanning ${section}`);
    window.startScan?.(section);
  }, 300);
}
window._autoScanIfEmpty = _autoScanIfEmpty;
const _sectionStatusMap = /* @__PURE__ */ new Map();
window._setSectionStatus = (section, status) => {
  const validStatuses = ["idle", "scanning", "done", "error"];
  if (!validStatuses.includes(status)) return;
  _sectionStatusMap.set(section, status);
  _updateNavButtonStatus(section);
};
function _updateNavButtonStatus(section) {
  const btn = document.querySelector(`button[data-section="${section}"]`);
  if (!btn) return;
  const light = btn.querySelector(".btn-status-light");
  if (!light) return;
  const status = _sectionStatusMap.get(section) || "idle";
  light.className = `btn-status-light status-${status}`;
}
function _wireLoadMoreButtons() {
  const sections = ["duplicates", "smart-dedup", "stale", "large", "node-modules", "venvs", "empty", "images", "backups", "tiny-files", "html-files", "css-files", "ext-search"];
  for (const section of sections) {
    const btn = document.getElementById(`loadMore-${section}`);
    if (!btn) continue;
    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      btn.classList.add("loading");
      const dot = btn.querySelector(".lm-dot");
      btn.textContent = "";
      if (dot) btn.appendChild(dot);
      btn.appendChild(document.createTextNode(" Loading\u2026"));
      const { rows } = await loadPage(section);
      let added = 0;
      rows.forEach((evt) => {
        if (evt.type === "started" || evt.type === "progress" || evt.type === "done") return;
        pushEvent(section, evt.type, evt.data || {});
        added++;
      });
      _updateLoadMoreBtn(section);
    });
  }
}
window._updateLoadMoreBtn = _updateLoadMoreBtn;
const _toolbarVMs = {};
function _mountScanToolbars() {
  for (const config of SCAN_TOOLBAR_CONFIGS) {
    const vm = new ScanToolbarVM(config);
    const view = new ScanToolbarView(config, {
      onScan: () => startScan(config.section),
      onCancel: () => cancelScan(config.section),
      onSelectAll: () => window._selectAll?.(config.tableId),
      onSelectNone: () => window._selectNone?.(config.tableId),
      onDeleteSelected: () => {
        if (config.section === "images") {
          const sec = document.getElementById("section-images");
          if (!sec) return;
          const cards = Array.from(sec.querySelectorAll(".img-card2-chk:checked"))
            .filter(c => c.closest(".img-group2")?.style.display !== "none")
            .map(c => c.closest(".img-card2")).filter(Boolean);
          if (!cards.length) return;
          const paths = cards.map(c => c.dataset.path || "").filter(Boolean);
          fetch("/api/trash", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths }) })
            .then(() => {
              cards.forEach(c => { c.style.transition = "opacity .25s"; c.style.opacity = "0"; setTimeout(() => c.remove(), 260); });
              _showImgUndoBar(paths);
            })
            .catch(() => {});
          return;
        }
        const sgPaths = window._scanGrid?.getChecked?.(config.section) ?? [];
        if (sgPaths.length) {
          window._scanGrid.removeByPaths(sgPaths);
          window._trashSelected?.(null, sgPaths, config.section);
        } else {
          window._trashSelected?.(config.tableId, void 0, config.section);
        }
      },
      onKeepSelected: () => window.keepSelected?.(config.tableId),
      onDeleteAllCopies: () => window._deleteAllCopies?.(config.section),
      onApplyAll: () => window._applySmartDedup?.(),
      onDeleteAllDevCache: () => window._deleteAllDevCaches?.(),
      onHtmlUtility: (utility) => window._runHtmlUtility?.(utility),
      onCssMergeAnalyze: () => window._runCssMergeAnalyze?.(config.section),
      onFullView: () => window.open("/tinyfiles-render.html", "_blank")
    });
    vm.bindView(view);
    view.mount();
    if (config.section === "images") view.exposeDeleteAllAsLegacyId();
    _toolbarVMs[config.section] = vm;
  }
}
window._scanToolbarVMs = _toolbarVMs;
async function _copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
function _buildGithubChatSnapshot() {
  const conn = document.getElementById("connStatus");
  const root = document.getElementById("rootDisplay");
  const saved = document.getElementById("totalSaved");
  const queued = document.getElementById("queueBadge");
  const kept = document.getElementById("keepCountBadge");
  const threadVal = document.getElementById("threadVal");
  const uptimeVal = document.getElementById("uptimeVal");
  const lines = [
    "DiskCleanUp Dashboard Snapshot",
    `Time: ${(/* @__PURE__ */ new Date()).toISOString()}`,
    `URL: ${location.href}`,
    `Connection: ${(conn?.textContent || "").trim()} [${conn?.className || "unknown"}]`,
    `Root: ${(root?.textContent || "").trim()}`,
    `Saved: ${(saved?.textContent || "").trim() || "(n/a)"}`,
    `Queued: ${(queued?.textContent || "").trim() || "(n/a)"}`,
    `Kept: ${(kept?.textContent || "").trim() || "0"}`,
    `Threads: ${(threadVal?.textContent || "").trim() || "(n/a)"}`,
    `Uptime: ${(uptimeVal?.textContent || "").trim() || "(n/a)"}`
  ];
  return lines.join("\n");
}
function _wireGithubChatCopyButton() {
  const btn = document.getElementById("copyGithubChatBtn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const original = btn.textContent || "\u{1F4CB} Copy for Chat";
    btn.disabled = true;
    const snapshot = _buildGithubChatSnapshot();
    const ok = await _copyTextToClipboard(snapshot);
    btn.textContent = ok ? "\u{1F44D} Copied" : "\u{1F6AB} Copy failed";
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, 1400);
  });
}
const SCAN_SECTIONS = [
  "duplicates",
  "smart-dedup",
  "stale",
  "large",
  "node-modules",
  "venvs",
  "empty",
  "images",
  "backups",
  "tiny-files",
  "html-files",
  "css-files",
  "ext-search"
];
async function _startBackgroundScans() {
  await new Promise((r) => setTimeout(r, 2e3));
  for (const section of SCAN_SECTIONS) {
    if (_sectionStatusMap.get(section) === "done") continue;
    _T("BG_SCAN", `auto-starting ${section}`);
    startScan(section);
    await new Promise((resolve) => {
      const CHECK_INTERVAL = 1e3;
      const MAX_WAIT = 5 * 60 * 1e3;
      let waited = 0;
      const timer = setInterval(() => {
        waited += CHECK_INTERVAL;
        const status = _sectionStatusMap.get(section);
        if (status === "done" || status === "error" || waited >= MAX_WAIT) {
          clearInterval(timer);
          resolve();
        }
      }, CHECK_INTERVAL);
    });
  }
  _T("BG_SCAN", "all background scans complete");
}
try {
  crumb("init", "boot");
  _T("INIT", "wireLoadMoreButtons");
  _wireLoadMoreButtons();
  _T("INIT", "mountScanToolbars");
  _mountScanToolbars();
  _T("INIT", "wireGithubChatCopyButton");
  _wireGithubChatCopyButton();
  _T("INIT", "initNavButtons");
  for (const btn of Array.from(document.querySelectorAll("nav button[data-section]"))) {
    _sectionStatusMap.set(btn.dataset.section, "idle");
  }
  _T("INIT", "restoreActiveTab");
  restoreActiveTab();
  _T("INIT", "restoreCachedResults");
  restoreCachedResults().then(() => _startBackgroundScans());
  crumb("init", "wsConnect");
  _T("INIT", "wsConnect");
  wsConnect();
  _T("INIT", "loadSettings");
  loadSettings();
  _T("INIT", "initKeepList");
  initKeepList();
  _T("INIT", "updateTotalSaved");
  updateTotalSaved();
  crumb("init", "boot:done");
  _T("INIT", "sync done - main thread free");
} catch (e) {
  console.error("[INIT] boot failed:", e);
}
function _showImgUndoBar(deletedPaths) {
  const existing = document.getElementById("img-undo-bar");
  if (existing) existing.remove();
  const bar = document.createElement("div");
  bar.id = "img-undo-bar";
  bar.style.cssText = "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:10000;background:#1a2a3a;border:1px solid #58a6ff;border-radius:8px;padding:10px 18px;display:flex;align-items:center;gap:14px;box-shadow:0 8px 32px rgba(0,0,0,.7);min-width:320px";
  bar.innerHTML = `<span style="font-size:13px;color:#58a6ff;font-weight:600">\u{1F5D1} ${deletedPaths.length} image${deletedPaths.length !== 1 ? "s" : ""} deleted</span><span style="font-size:12px;color:var(--muted,#888)">Files are in Recycle Bin</span><span style="flex:1"></span><button id="img-undo-btn" style="background:#58a6ff;color:#000;border:none;padding:5px 16px;border-radius:4px;font-size:12px;font-weight:700;cursor:pointer">↩ Undo</button><button id="img-undo-dismiss" style="background:none;border:none;color:var(--muted,#888);cursor:pointer;font-size:16px;line-height:1">✕</button>`;
  document.body.appendChild(bar);
  const timer = setTimeout(() => bar.remove(), 30000);
  document.getElementById("img-undo-dismiss").addEventListener("click", () => { clearTimeout(timer); bar.remove(); });
  document.getElementById("img-undo-btn").addEventListener("click", async () => {
    const btn = document.getElementById("img-undo-btn");
    btn.disabled = true; btn.textContent = "⟳ Restoring…";
    try {
      const binRes = await fetch("/api/recycle-bin").then(r => r.json());
      const binItems = binRes.items || [];
      const toRestore = binItems
        .filter(item => deletedPaths.some(p => item.OriginalPath?.toLowerCase() === p.toLowerCase() || item.originalPath?.toLowerCase() === p.toLowerCase()))
        .map(item => item.RecyclePath || item.recyclePath);
      if (!toRestore.length) { btn.textContent = "✗ Not found"; return; }
      const res = await fetch("/api/recycle-bin/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ Items: toRestore }) }).then(r => r.json());
      clearTimeout(timer); bar.remove();
      if (res.restored > 0) {
        window.startScan?.("images");
        setTimeout(() => {
          const lowerPaths = deletedPaths.map(p => p.toLowerCase());
          const cells = Array.from(document.querySelectorAll("#imageResult .img-path-cell"));
          const matches = cells.filter(c => lowerPaths.includes((c.textContent || "").trim().toLowerCase()));
          if (matches.length) {
            const lastGroup = matches[matches.length - 1].closest(".img-group2");
            if (lastGroup) {
              lastGroup.scrollIntoView({ behavior: "smooth", block: "center" });
              lastGroup.classList.add("img-restored-flash");
              setTimeout(() => lastGroup.classList.remove("img-restored-flash"), 10000);
            }
          }
        }, 3500);
      }
    } catch(e) { btn.disabled = false; btn.textContent = "↩ Undo"; }
  });
}
document.addEventListener("contextmenu", (e) => {
  const btn = e.target?.closest("button");
  if (!btn) return;
  e.preventDefault();
  const existing = document.getElementById("btn-ctx-menu");
  if (existing) existing.remove();
  const menu = document.createElement("div");
  menu.id = "btn-ctx-menu";
  menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;background:var(--panel,#1e1e1e);border:1px solid var(--border,#333);border-radius:6px;padding:4px 0;z-index:99999;min-width:180px;box-shadow:0 4px 16px rgba(0,0,0,.5)`;
  const item = document.createElement("div");
  item.textContent = "↗ Open in new window";
  item.style.cssText = "padding:7px 14px;font-size:13px;cursor:pointer;color:var(--text,#eee)";
  item.addEventListener("mouseenter", () => item.style.background = "var(--hover,#2a2a2a)");
  item.addEventListener("mouseleave", () => item.style.background = "");
  item.addEventListener("click", () => { menu.remove(); btn.click(); });
  menu.appendChild(item);
  document.body.appendChild(menu);
  const dismiss = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener("click", dismiss); } };
  setTimeout(() => document.addEventListener("click", dismiss), 0);
});
apiFetch("/api/session", {}, { timeout: 2e4 }).then((s) => {
  _T("INIT", "session badge loaded");
  const b = document.getElementById("sessionBadge");
  if (b && s?.label) b.textContent = String.fromCodePoint(128203) + " " + s.label;
}).catch(() => {
});
