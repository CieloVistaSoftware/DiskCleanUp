import { SB } from "../js/status-bar.js";
import { DuplicatesModel } from "../models/duplicates-model.js";
import { SectionVM } from "../viewmodels/section-vm.js";
import { GridView } from "../views/grid-view.js";
import { ErrLog } from "../js/error-logger.js";
const _imgExts = /* @__PURE__ */ new Set([".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico"]);
const _codeExts = /* @__PURE__ */ new Set([
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
function _extOf(path) {
  const m = String(path).match(/\.[^.\\/]+$/);
  return m ? m[0].toLowerCase() : "";
}
const DuplicatesSection = (() => {
  const vm = new SectionVM(DuplicatesModel);
  const view = new GridView("dupResult", {
    onDeleteGroup: (hash, paths, btn) => deleteGroup(btn, hash, paths),
    onLoadPreview: (el) => _loadPreview(el),
    onMarkChanged: (count) => _updateMarkedBar(count)
  });
  vm.bindView(view);
  let _visible = true;
  let _allCopiesNuked = false;
  vm.visible = true;
  document.getElementById("dup-delete-marked-btn")?.addEventListener("click", () => deleteMarked());
  document.getElementById("dup-clear-marked-btn")?.addEventListener("click", () => {
    view.clearMarked();
    _updateMarkedBar(0);
  });
  function onShow() {
    window._T?.("DUP", `onShow data=${vm.size}`);
    _visible = true;
    vm.visible = true;
    if (vm.size === 0) {
      vm.loadAndBind().catch(
        (e) => window._T?.("DUP", `restore failed: ${e.message}`)
      );
    }
  }
  function onHide() {
    _visible = false;
    vm.visible = false;
  }
  function onEvent(msg) {
    switch (msg.type) {
      case "started":
        reset();
        vm.visible = true;
        vm.scanStarted();
        SB.begin("duplicates", msg.root);
        window._setSectionStatus?.("duplicates", "scanning");
        return;
      case "progress":
        SB.progress("duplicates", {
          files: msg.files,
          results: msg.results,
          folder: msg.folder
        });
        return;
      case "done":
        vm.scanDone();
        SB.done("duplicates", `Done \u2014 ${vm.size} dupe groups`);
        window._setSectionStatus?.("duplicates", "done");
        return;
      case "error":
        SB.error("duplicates", msg.message);
        window._setSectionStatus?.("duplicates", "error");
        return;
      case "result":
      case "result_update":
        if (_allCopiesNuked) return;
        vm.onScanEvent(msg);
        _updateRows();
        return;
    }
  }
  function reset() {
    _allCopiesNuked = false;
    vm.reset();
    _updateRows();
  }
  function _updateRows() {
    const el = document.getElementById("sbv-duplicates-rows");
    if (el) el.textContent = vm.size.toLocaleString();
  }
  async function deleteGroup(btn, hash, paths) {
    if (!Array.isArray(paths) || !paths.length) return;
    window._T?.("DEL", `deleteGroup: ${paths.length} paths`);
    if (btn) {
      btn.textContent = "\u23F3 deleting\u2026";
      btn.disabled = true;
    }
    const groupSep = document.querySelector(`.dup-sep[data-hash="${hash}"]`);
    const groupWrap = document.querySelector(`.dup-cards-wrap[data-group="${hash}"]`);
    if (groupSep) {
      groupSep.style.transition = "opacity .25s";
      groupSep.style.opacity = "0";
    }
    if (groupWrap) {
      groupWrap.style.transition = "opacity .25s";
      groupWrap.style.opacity = "0";
    }
    try {
      await fetch("/api/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths })
      });
      setTimeout(() => {
        groupSep?.remove();
        groupWrap?.remove();
      }, 260);
    } catch (e) {
      if (groupSep) {
        groupSep.style.opacity = "1";
      }
      if (groupWrap) {
        groupWrap.style.opacity = "1";
      }
      ErrLog.log("[DUPLICATES]", "Delete failed", e.message, "CAUGHT_ERROR");
      if (btn) {
        btn.textContent = "Delete Copies";
        btn.disabled = false;
      }
    }
  }
  async function deleteAllCopies() {
    const paths = DuplicatesModel.allCopyPaths(vm.data);
    if (!paths.length) {
      alert("No duplicate copies found.");
      return;
    }
    if (!confirm(`Delete ALL ${paths.length} duplicate cop${paths.length === 1 ? "y" : "ies"}?
Originals are safe. Files go to Recycle Bin.`)) return;
    window._T?.("DEL", `deleteAllCopies: ${paths.length} paths`);
    _allCopiesNuked = true;
    SB.progress("duplicates", { files: 0, results: 0, folder: "Deleting copies\u2026" });
    await vm.removeAllCopies();
    if (vm.size === 0) {
      fetch("/api/cache/duplicates", { method: "DELETE" }).catch(() => {
      });
    }
    SB.done("duplicates", `${vm.size} dupe groups`);
  }
  async function deleteMarked() {
    const paths = view.getMarkedPaths();
    if (!paths.length) return;
    if (!confirm(`Move ${paths.length} marked file${paths.length === 1 ? "" : "s"} to the Recycle Bin?

You can restore them later via right-click \u2192 Restore in Windows Explorer.`)) return;
    const btn = document.getElementById("dup-delete-marked-btn");
    if (btn) {
      btn.textContent = "\u23F3 Deleting\u2026";
      btn.disabled = true;
    }
    let result;
    try {
      result = await vm.removePaths(paths, { trash: true });
    } catch (e) {
      ErrLog.log("[DUPLICATES]", "deleteMarked failed", e.message, "CAUGHT_ERROR");
      if (btn) {
        btn.textContent = "\u{1F5D1} Delete Marked";
        btn.disabled = false;
      }
      alert("Delete failed: " + (e.message || e));
      return;
    }
    if (result && result.deleteResults) {
      const failed = result.deleteResults.filter((r) => !r.ok);
      if (failed.length > 0) {
        if (btn) {
          btn.textContent = "\u{1F5D1} Delete Marked";
          btn.disabled = false;
        }
        alert("Some files could not be deleted:\n" + failed.map((f) => `${f.path}: ${f.error || "Unknown error"}`).join("\n"));
        return;
      }
    }
    const count = paths.length;
    view.clearMarked();
    _updateMarkedBar(0);
    _showRecycleBinNotice(count);
  }
  function _updateMarkedBar(count) {
    const bar = document.getElementById("dup-marked-bar");
    const btnEl = document.getElementById("dup-delete-marked-btn");
    const countEl = document.getElementById("dup-marked-count");
    if (!bar) return;
    if (count === 0) {
      bar.classList.add("hidden");
    } else {
      bar.classList.remove("hidden");
      if (countEl) countEl.textContent = `${count} file${count === 1 ? "" : "s"} marked for deletion`;
      if (btnEl) btnEl.textContent = `\u{1F5D1} Delete Marked (${count})`;
    }
  }
  function _showRecycleBinNotice(count) {
    const notice = document.getElementById("dup-recycle-notice");
    if (!notice) return;
    notice.textContent = `\u2705 ${count} file${count === 1 ? "" : "s"} moved to Recycle Bin. Right-click \u2192 Restore in Windows Explorer to recover them.`;
    notice.classList.remove("hidden");
    setTimeout(() => notice.classList.add("hidden"), 8e3);
  }
  function filter(val) {
    view.filter(val);
  }
  async function _loadPreview(el) {
    const path = el.dataset.previewPath;
    if (!path) return;
    const ext = _extOf(path);
    if (_imgExts.has(ext)) {
      const img = document.createElement("img");
      img.className = "dup-thumb";
      if (ext === ".svg") img.classList.add("dup-thumb-svg");
      img.alt = path.split(/[\\/]/).pop();
      img.loading = "lazy";
      img.onerror = () => {
        img.remove();
        el.textContent = "(preview unavailable)";
      };
      img.src = `/api/file?path=${encodeURIComponent(path)}`;
      el.textContent = "";
      el.appendChild(img);
    } else if (_codeExts.has(ext)) {
      try {
        const r = await fetch(`/api/preview?path=${encodeURIComponent(path)}`);
        if (!r.ok) {
          el.textContent = "(preview unavailable)";
          return;
        }
        const data = await r.json();
        if (data.type === "text" && data.content) {
          const pre = document.createElement("pre");
          pre.className = "dup-code";
          const lines = data.content.split("\n").slice(0, 5);
          pre.textContent = lines.join("\n");
          if (data.content.split("\n").length > 5) pre.textContent += "\n\u2026";
          el.textContent = "";
          el.appendChild(pre);
        } else {
          el.textContent = "(binary file)";
        }
      } catch {
        el.textContent = "(preview failed)";
      }
    } else {
      el.textContent = `(.${ext.slice(1) || "?"} file)`;
    }
  }
  return {
    onEvent,
    onShow,
    onHide,
    reset,
    deleteGroup,
    deleteAllCopies,
    deleteMarked,
    filter,
    get size() {
      return vm.size;
    }
  };
})();
export {
  DuplicatesSection
};
