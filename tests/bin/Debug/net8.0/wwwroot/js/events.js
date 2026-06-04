import { startScan, cancelScan, trashSelected, applySmartDedup, deleteNMSelected, deleteEmpty, trashAllImageCopies } from "./actions.js";
import { selectAllTable, showSection } from "./ui-utils.js";
import { loadSavings, exportSavings, newSession } from "./savings.js";
import { saveSettings } from "./settings.js";
import { DuplicatesSection } from "../sections/duplicates.js";
import * as SG from "./scan-grid.js";
import { apiFetch } from "./ui-utils.js";
import { ErrLog } from "./error-logger.js";
function _wireFolderChoices(input, listId = "folderChoicesList") {
  if (!input || input.dataset.folderChoicesWired) return;
  const list = document.getElementById(listId);
  if (!list) return;
  input.dataset.folderChoicesWired = "1";
  let timer = null;
  const refresh = async () => {
    try {
      const current = (input.value || "").trim();
      const res = await apiFetch(`/api/folder-choices?path=${encodeURIComponent(current)}`);
      const choices = Array.isArray(res?.choices) ? res.choices : [];
      list.innerHTML = "";
      for (const p of choices) {
        const opt = document.createElement("option");
        opt.value = p;
        list.appendChild(opt);
      }
    } catch (e) {
      ErrLog.log("[EVENTS]", e.message, e.stack, "CAUGHT_ERROR");
    }
  };
  input.addEventListener("focus", refresh);
  input.addEventListener("input", () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(refresh, 120);
  });
}
const _resultContainerOf = (section) => ({
  "duplicates": "dupResult",
  "smart-dedup": "smartResult",
  "stale": "staleResult",
  "large": "largeResult",
  "node-modules": "nmResult",
  "empty": "emptyResult",
  "venvs": "venvResult",
  "images": "imageResult",
  "backups": "backupsResult",
  "tiny-files": "tinyResult",
  "html-files": "htmlResult",
  "css-files": "cssResult",
  "ext-search": "extResult"
})[section] || `${section}Result`;
function _selectAll(el, val) {
  const grid = el.dataset.grid;
  if (grid) {
    SG.selectAll(grid, val);
    return;
  }
  selectAllTable(el.dataset.table, val);
}
function _trashSelectedGrid(el) {
  const grid = el.dataset.grid;
  if (grid) {
    let paths = SG.getChecked(grid);
    if (!paths.length) {
      const container = document.getElementById(_resultContainerOf(grid));
      if (container) {
        paths = [...container.querySelectorAll("input[type=checkbox]:checked[data-path]")].map((cb) => cb.dataset.path).filter(Boolean);
      }
    }
    if (!paths.length) {
      alert("Select files first.");
      return;
    }
    trashSelected(null, paths);
    return;
  }
  trashSelected(el.dataset.table);
}
const ACTIONS = {
  "scan": (el) => startScan(el.dataset.section),
  "cancel": (el) => cancelScan(el.dataset.section),
  "select-all": (el) => _selectAll(el, true),
  "select-none": (el) => _selectAll(el, false),
  "trash-selected": (el) => _trashSelectedGrid(el),
  "trash-all-copies": () => DuplicatesSection.deleteAllCopies(),
  "trash-all-image-copies": () => trashAllImageCopies(),
  "apply-smart-dedup": () => applySmartDedup(),
  "delete-nm-selected": () => deleteNMSelected(),
  "delete-empty": () => deleteEmpty(),
  "load-savings": () => loadSavings(),
  "export-savings": () => exportSavings(),
  "new-session": () => newSession(),
  "save-settings": () => saveSettings(),
  "trash-ext-all": () => {
    const paths = [...document.querySelectorAll("#sg-body-ext-search .sg-row")].map((r) => r.dataset.path).filter(Boolean);
    if (!paths.length) {
      alert("No matching files to delete.");
      return;
    }
    trashSelected(null, paths);
  }
};
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const handler = ACTIONS[el.dataset.action];
  if (handler) {
    e.preventDefault();
    handler(el);
  }
});
document.addEventListener("change", (e) => {
  const menu = e.target.closest("#extCommandMenu");
  if (!menu) return;
  const value = menu.value;
  switch (value) {
    case "scan":
      startScan("ext-search");
      break;
    case "cancel":
      cancelScan("ext-search");
      break;
    case "delete-selected":
      _trashSelectedGrid({ dataset: { grid: "ext-search", table: "extSearchTable" } });
      break;
    case "keep-selected":
      window.keepSelected?.("extSearchTable");
      break;
    case "delete-all":
      ACTIONS["trash-ext-all"]();
      break;
    case "add-issue": {
      const input = document.getElementById("extSearchInput");
      const rootIn = document.getElementById("extSearchRootInput");
      const ext = input?.value?.trim() || "(unknown)";
      const root = rootIn?.value?.trim() || "(global root)";
      const rows = document.querySelectorAll("#extResult .sg-row");
      const paths = Array.from(rows).slice(0, 20).map((r) => r.dataset.path).filter(Boolean);
      const total = rows.length;
      const title = `[ext-search] Found ${total} file(s) matching .${ext}`;
      const body = [
        `## Extension Finder Results`,
        ``,
        `**Extension:** \`.${ext}\``,
        `**Root:** \`${root}\``,
        `**Total matches:** ${total}`,
        ``,
        `### Sample paths (first ${paths.length})`,
        ...paths.map((p) => `- \`${p}\``),
        total > paths.length ? `- \u2026 and ${total - paths.length} more` : "",
        ``,
        `---`,
        `*Filed from DiskCleanUp Extension Finder*`
      ].filter((l) => l !== void 0).join("\n");
      const params = new URLSearchParams({ title, body, labels: "project:diskcleanup" });
      window.open(`https://github.com/CieloVistaSoftware/DiskCleanUp/issues/new?${params}`, "_blank");
      break;
    }
  }
  menu.value = "";
  const selected = menu.selectedOptions?.[0];
  menu.title = selected?.title || "Choose a command for Extension Finder";
});
document.addEventListener("mouseover", (e) => {
  const menu = e.target.closest("#extCommandMenu");
  if (!menu) return;
  const selected = menu.selectedOptions?.[0];
  menu.title = selected?.title || "Choose a command for Extension Finder";
});
document.getElementById("mainNav")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-section]");
  if (!btn) return;
  showSection(btn.dataset.section, btn);
});
async function _initExtRoot() {
  const input = document.getElementById("extSearchRootInput");
  if (!input) return;
  _wireFolderChoices(input);
  const saved = localStorage.getItem("dcu_ext_search_root");
  if (saved) {
    input.value = saved;
    return;
  }
  try {
    const cfg = await apiFetch("/api/config");
    const root = cfg?.root || "";
    if (root) {
      input.value = root;
      localStorage.setItem("dcu_ext_search_root", root);
    }
  } catch (e) {
    ErrLog.log("[EVENTS]", e.message, e.stack, "CAUGHT_ERROR");
  }
}
_initExtRoot();
document.getElementById("extSearchRootInput")?.addEventListener("change", (e) => {
  const input = e.target;
  const root = (input?.value || "").trim();
  if (root) localStorage.setItem("dcu_ext_search_root", root);
  else localStorage.removeItem("dcu_ext_search_root");
  const extQ = document.getElementById("extSearchInput")?.value.trim().replace(/^\.+/, "");
  if (root && extQ) startScan("ext-search");
});
document.getElementById("extSearchPickFolderBtn")?.addEventListener("click", async () => {
  try {
    const res = await apiFetch("/api/pick-folder", { method: "POST" }, { timeout: 12e4 });
    if (!res?.ok || !res?.path) return;
    const input = document.getElementById("extSearchRootInput");
    if (input) input.value = res.path;
    localStorage.setItem("dcu_ext_search_root", res.path);
    const extQ = document.getElementById("extSearchInput")?.value.trim().replace(/^\.+/, "");
    if (extQ) startScan("ext-search");
  } catch (e) {
    ErrLog.log("[EVENTS]", e.message, e.stack, "CAUGHT_ERROR");
  }
});
let _extSearchDebounce = null;
document.addEventListener("input", (e) => {
  const el = e.target.closest('[data-action="filter-duplicates"]');
  if (el) DuplicatesSection.filter(el.value);
  const extInput = e.target.closest("#extSearchInput");
  if (extInput) {
    const hint = document.getElementById("extSearchHint");
    const q = extInput.value.trim().replace(/^\.+/, "");
    if (hint) hint.textContent = q ? `Searching for extension fragment: ${q}` : "Scans automatically as you type";
    if (_extSearchDebounce) window.clearTimeout(_extSearchDebounce);
    if (!q) return;
    _extSearchDebounce = window.setTimeout(() => startScan("ext-search"), 250);
  }
});
export {
  ACTIONS
};
