import { fmtBytes } from "/lib/wb-core/utils/format.js";
import { apiFetch as coreApiFetch } from "/lib/wb-core/utils/api-fetch.js";
import { ErrLog } from "./error-logger.js";
const fmt = fmtBytes;
coreApiFetch.setErrorHandler((type, message, detail) => {
  ErrLog.log("[api]", message, detail, type);
});
const apiFetch = coreApiFetch;
function filterTable(id, val) {
  const tbl = document.getElementById(id);
  if (!tbl) return;
  tbl.querySelectorAll("tbody tr").forEach((tr) => {
    tr.classList.toggle("hidden", !tr.textContent.toLowerCase().includes(val.toLowerCase()));
  });
}
const _tableToGrid = {
  staleTable: "sg-body-stale",
  largeTable: "sg-body-large",
  tinyTable: "sg-body-tiny-files",
  htmlTable: "sg-body-html-files",
  backupsTable: "sg-body-backups",
  nmTable: "sg-body-node-modules",
  emptyTable: "sg-body-empty",
  venvTable: "sg-body-venvs",
  smartTable: "sg-body-smart-dedup"
};
function _findContainer(id) {
  return document.getElementById(id) || document.getElementById(_tableToGrid[id] || "");
}
function selectAllTable(id, val) {
  const el = _findContainer(id);
  if (!el) return;
  el.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    if (val) {
      const row = cb.closest(".sg-row, tr");
      if (row?.style.display === "none") return;
    }
    cb.checked = val;
  });
}
function getCheckedPaths(tableId) {
  const el = _findContainer(tableId);
  if (!el) return [];
  return [...el.querySelectorAll("input[type=checkbox]:checked")].map((cb) => cb.dataset.path).filter(Boolean);
}
let _activeSection = "duplicates";
const _sectionModules = {};
function registerSectionModule(name, mod) {
  _sectionModules[name] = mod;
}
function showSection(name, btn) {
  if (_activeSection !== name && _sectionModules[_activeSection]?.onHide)
    _sectionModules[_activeSection].onHide();
  document.querySelectorAll("[id^=section-]").forEach((s) => s.classList.remove("active-section"));
  document.querySelectorAll("nav button").forEach((b) => b.classList.remove("active"));
  document.getElementById("section-" + name)?.classList.add("active-section");
  if (btn) btn.classList.add("active");
  else {
    const navBtn = document.querySelector(`nav button[data-section="${name}"]`);
    if (navBtn) navBtn.classList.add("active");
  }
  _activeSection = name;
  try {
    localStorage.setItem("dcu_active_tab", name);
  } catch (ex) {
    ErrLog.log("[UI_UTILS]", ex.message, ex.stack, "CAUGHT_ERROR");
  }
  if (_sectionModules[name]?.onShow) _sectionModules[name].onShow();
  window._autoScanIfEmpty?.(name);
}
function restoreActiveTab() {
  try {
    const saved = localStorage.getItem("dcu_active_tab");
    if (saved && document.getElementById("section-" + saved)) {
      showSection(saved);
      return;
    }
  } catch (ex) {
    ErrLog.log("[UI_UTILS]", ex.message, ex.stack, "CAUGHT_ERROR");
  }
  showSection("duplicates");
}
async function openFileInVSCode(path) {
  try {
    await apiFetch("/api/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path })
    });
  } catch (e) {
    ErrLog.log("[open]", `Failed to open ${path}: ${e.message}`, e);
  }
}
window.showSection = showSection;
window.selectAllTable = selectAllTable;
window.filterTable = filterTable;
window.fmt = fmt;
window.openFileInVSCode = openFileInVSCode;
export {
  apiFetch,
  filterTable,
  fmt,
  getCheckedPaths,
  openFileInVSCode,
  registerSectionModule,
  restoreActiveTab,
  selectAllTable,
  showSection
};
