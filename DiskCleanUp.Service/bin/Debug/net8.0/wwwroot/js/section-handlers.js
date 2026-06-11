import { registerHandler } from "./event-queue.js";
import { SB, _set, _folder, _getVal } from "./status-bar.js";
import { removeSkeletons } from "./table-utils.js";
import { fmt } from "./ui-utils.js";
import { escHtml } from "/lib/wb-core/utils/format.js";
import { resetPaging } from "./page-loader.js";
import * as SG from "./scan-grid.js";
import * as SF from "./scan-filter.js";
import { ErrLog } from "./error-logger.js";
try {
  let _registerStandardSection = function(config) {
    const {
      section,
      containerId,
      columns,
      doneMsg,
      mapRow,
      progressMap = (msg) => ({ files: msg.files, results: msg.results, folder: msg.folder }),
      trackResults = false
    } = config;
    registerHandler(section, (msg) => {
      switch (msg.type) {
        case "started":
          resetPaging(section);
          window._updateLoadMoreBtn?.(section);
          SB.begin(section, msg.root);
          SG.showSkeleton(section, containerId, columns);
          SF.reset(section);
          window._setSectionStatus?.(section, "scanning");
          window._scanToolbarVMs?.[section]?.scanStarted();
          break;
        case "progress":
          SB.progress(section, progressMap(msg));
          break;
        case "done":
          SG.removeSkeleton(section);
          SB.done(section, doneMsg(msg));
          SF.rebuild(section);
          window._setSectionStatus?.(section, "done");
          window._scanToolbarVMs?.[section]?.scanDone();
          break;
        case "error":
          SB.error(section, msg.message);
          window._setSectionStatus?.(section, "error");
          window._scanToolbarVMs?.[section]?.scanDone();
          break;
        case "result":
          SG.removeSkeleton(section);
          SG.create(section, containerId, columns);
          SG.addRow(section, mapRow(msg));
          if (trackResults) {
            _set(
              section,
              "results",
              (parseInt(_getVal(section, "results").replace(/,/g, "")) || 0) + 1 + ""
            );
          }
          break;
      }
    });
  }, _applyImgColumns = function() {
    const grid = document.getElementById("imageResult");
    if (grid) grid.style.setProperty("--img-cols", String(_imgColumns));
  }, _wireImgFilter = function() {
    const filterBar = document.getElementById("sf-images");
    if (!filterBar || filterBar.querySelector(".img-filter-input")) return;
    const fi = document.createElement("input");
    fi.type = "text";
    fi.placeholder = "Filter by path\u2026";
    fi.className = "img-filter-input";
    fi.style.cssText = "margin-left:8px;width:220px;padding:2px 6px;font-size:.85rem;";
    fi.addEventListener("input", () => {
      const q = (fi.value || "").toLowerCase();
      document.querySelectorAll("#imageResult .img-group2").forEach((grp) => {
        const paths = [...grp.querySelectorAll(".img-path-cell")].map((p) => (p.textContent || "").toLowerCase());
        grp.style.display = !q || paths.some((p) => p.includes(q)) ? "" : "none";
      });
      _updateImgDeleteSelected();
    });
    filterBar.appendChild(fi);
    const selAllBtn = document.createElement("button");
    selAllBtn.textContent = "☑ Select All";
    selAllBtn.className = "btn muted";
    selAllBtn.style.cssText = "margin-left:6px;font-size:.8rem;padding:2px 10px;";
    selAllBtn.addEventListener("click", () => {
      const sec = document.getElementById("section-images");
      if (!sec) return;
      const chks = Array.from(sec.querySelectorAll(".img-card2-chk"))
        .filter(c => c.closest(".img-group2")?.style.display !== "none");
      const allChecked = chks.length > 0 && chks.every(c => c.checked);
      chks.forEach(c => { c.checked = !allChecked; });
      selAllBtn.textContent = allChecked ? "☑ Select All" : "☐ Deselect All";
      _updateImgDeleteSelected();
    });
    filterBar.appendChild(selAllBtn);
    _applyImgColumns();
  }, _updateImgDeleteSelected = function() {
    const sec = document.getElementById("section-images");
    if (!sec) return;
    const checked = Array.from(sec.querySelectorAll(".img-card2-chk:checked"))
      .filter(c => c.closest(".img-group2")?.style.display !== "none").length;
    const delSelBtn = Array.from(sec.querySelectorAll("button")).find(b => b.textContent?.includes("Delete Selected"));
    if (delSelBtn) delSelBtn.disabled = checked === 0;
  }, _wireImgSelectDelete = function() {
    const sec = document.getElementById("section-images");
    if (!sec) return;
    _updateImgDeleteSelected();
    const delSelBtn = Array.from(sec.querySelectorAll("button")).find(b => b.textContent?.includes("Delete Selected"));
    if (delSelBtn && !delSelBtn.dataset.imgWired) {
      delSelBtn.dataset.imgWired = "1";
      delSelBtn.addEventListener("click", async () => {
        const cards = Array.from(sec.querySelectorAll(".img-card2-chk:checked"))
          .filter(chk => chk.closest(".img-group2")?.style.display !== "none")
          .map(chk => chk.closest(".img-card2")).filter(Boolean);
        if (!cards.length) return;
        const paths = cards.map(c => c.dataset.path || "").filter(Boolean);
        try {
          await fetch("/api/trash", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths }) });
          cards.forEach(c => { c.style.transition = "opacity .25s"; c.style.opacity = "0"; setTimeout(() => c.remove(), 260); });
          _updateImgDeleteSelected();
        } catch(e) {}
      });
    }
    // Select All is wired in _wireImgFilter alongside the filter input
  }, _buildImgCard = function(fp, isOriginal, groupEl) {
    const card = document.createElement("div");
    card.className = `img-card2 ${isOriginal ? "img-card2-keep" : "img-card2-copy"}`;
    card.dataset.path = fp;
    const chk = document.createElement("input");
    chk.type = "checkbox"; chk.className = "img-card2-chk";
    chk.addEventListener("change", _updateImgDeleteSelected);
    card.appendChild(chk);
    const img = document.createElement("img");
    img.src = `/api/file?path=${encodeURIComponent(fp)}`;
    img.loading = "lazy";
    img.alt = "";
    img.className = "img-card2-img";
    img.onerror = () => {
      img.classList.add("img-broken");
      const ph = document.createElement("div");
      ph.className = "img-card2-404";
      ph.innerHTML = `<span class="img-404-icon">\u{1F5D1}</span><span class="img-404-msg">File not found</span><span class="img-404-path">${escHtml(fp)}</span>`;
      img.replaceWith(ph);
      const grpReason = card.closest(".img-group2")?.querySelector(".img-reason-auto");
      if (grpReason && !grpReason.dataset.stale) {
        grpReason.dataset.stale = "1";
        grpReason.innerHTML = `<span class="img-reason-desc">⚠ One or more files no longer exist on disk — scan cache is stale.</span><span class="img-reason-rec"> → Run a fresh Scan to clear this group.</span>`;
      }
    };
    card.appendChild(img);
    const filename = fp.replace(/.*[\\/]/, "");
    const body = document.createElement("div");
    body.className = "img-card2-body";
    body.innerHTML = `<div class="img-card2-label ${isOriginal ? "img-label-original" : "img-label-copy"}">${isOriginal ? "\u2713 Original" : "\u2298 Copy"}</div><div class="img-card2-name" title="${escHtml(fp)}">${escHtml(filename)}</div><div class="img-card2-size">\u2026</div>`;
    fetch(`/api/file?path=${encodeURIComponent(fp)}`, { method: "HEAD" })
      .then(r => {
        const bytes = parseInt(r.headers.get("content-length") || "0", 10);
        const sizeEl = body.querySelector(".img-card2-size");
        if (sizeEl) sizeEl.textContent = bytes >= 1048576 ? `${(bytes/1048576).toFixed(1)} MB` : bytes >= 1024 ? `${(bytes/1024).toFixed(0)} KB` : `${bytes} B`;
      }).catch(() => { const s = body.querySelector(".img-card2-size"); if (s) s.textContent = ""; });
    card.appendChild(body);
    const foot = document.createElement("div");
    foot.className = "img-card2-foot";
    const keepBtn = document.createElement("button");
    keepBtn.className = "img-keep-btn"; keepBtn.textContent = "\uD83D\uDD12 Keep"; keepBtn.title = "Mark as keep \u2014 prevents deletion";
    keepBtn.addEventListener("click", () => {
      const kept = card.dataset.kept === "1";
      card.dataset.kept = kept ? "0" : "1";
      keepBtn.textContent = kept ? "\uD83D\uDD12 Keep" : "\u2705 Kept";
      keepBtn.classList.toggle("img-keep-active", !kept);
      delBtn.disabled = !kept;
      delBtn.title = !kept ? "Unlock Keep first to delete" : "";
    });
    foot.appendChild(keepBtn);
    const delBtn = document.createElement("button");
    delBtn.className = "dup-delete-one-btn";
    delBtn.textContent = "\u{1F5D1} Delete";
    delBtn.addEventListener("click", () => {
      if (card.dataset.kept === "1") return;
      delBtn.disabled = true;
      delBtn.textContent = "\u23F3";
      fetch("/api/trash", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: [fp] }) }).then(() => {
        fetch("/api/cache/images/remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: [fp] }) }).catch(() => {
        });
        groupEl.querySelector(`.img-path-cell[title="${fp.replace(/"/g, '\\"')}"]`)?.remove();
        card.style.transition = "opacity .25s";
        card.style.opacity = "0";
        setTimeout(() => {
          card.remove();
          if (!groupEl.querySelectorAll(".img-card2-copy").length) {
            groupEl.style.transition = "opacity .25s";
            groupEl.style.opacity = "0";
            setTimeout(() => groupEl.remove(), 260);
          }
        }, 260);
      }).catch(() => {
        delBtn.disabled = false;
        delBtn.textContent = "\u{1F5D1} Delete";
      });
    });
    foot.appendChild(delBtn);
    const vscBtn = document.createElement("button");
    vscBtn.className = "dup-open-btn";
    vscBtn.textContent = "</>";
    vscBtn.title = "Open in VS Code";
    vscBtn.addEventListener("click", () => fetch("/api/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: fp }) }).catch(() => {
    }));
    foot.appendChild(vscBtn);
    card.appendChild(foot);
    return card;
  };
  const COL = {
    check: { key: "check", width: 36, type: "checkbox" },
    delBtn: { key: "delBtn", width: 36, type: "delBtn" },
    keepBtn: { key: "keepBtn", label: "Keep", width: 72, type: "keepBtn" },
    path: { key: "path", label: "File", flex: 3, minWidth: 150, type: "path" },
    keep: { key: "keep", label: "Keep (newest)", flex: 2, minWidth: 120, type: "path" },
    delPaths: { key: "delete", label: "Will Delete", flex: 3, minWidth: 150, type: "paths" },
    size: { key: "size", label: "Size", width: 90, type: "size" },
    modified: { key: "modified", label: "Modified", width: 140, type: "text" },
    ext: { key: "ext", label: "Ext", width: 90, type: "text" },
    project: { key: "project", label: "Project", flex: 1, minWidth: 100, type: "text" },
    dirName: { key: "dirName", label: "Folder Name", width: 140, type: "badge" },
    files: { key: "fileCount", label: "Files", width: 70, type: "text" },
    open: { key: "open", label: "", width: 60, type: "open" }
  };
  _registerStandardSection({
    section: "stale",
    containerId: "staleResult",
    columns: [COL.check, COL.delBtn, COL.keepBtn, COL.path, COL.size, COL.modified, COL.open],
    doneMsg: (msg) => `Done \u2014 ${msg.results} stale files`,
    mapRow: (msg) => ({ path: msg.path, size: msg.size, modified: msg.modified || "" })
  });
  _registerStandardSection({
    section: "large",
    containerId: "largeResult",
    columns: [COL.check, COL.delBtn, COL.keepBtn, COL.path, COL.size, COL.open],
    doneMsg: (msg) => `Done \u2014 ${msg.results} large files`,
    mapRow: (msg) => ({ path: msg.path, size: msg.size })
  });
  _registerStandardSection({
    section: "node-modules",
    containerId: "nmResult",
    columns: [COL.check, COL.delBtn, COL.keepBtn, { key: "path", label: "Path", flex: 3, minWidth: 150, type: "path" }, COL.size, COL.open],
    doneMsg: (msg) => `Done \u2014 ${msg.results} found`,
    progressMap: (msg) => ({ results: msg.results, folder: msg.folder }),
    mapRow: (msg) => ({ path: msg.path, size: msg.size }),
    trackResults: true
  });
  _registerStandardSection({
    section: "dev-cache",
    containerId: "devCacheResult",
    columns: [
      COL.check,
      COL.delBtn,
      COL.keepBtn,
      { key: "folderName", label: "Cache Type", width: 180, type: "badge" },
      { key: "path", label: "Path", flex: 3, minWidth: 150, type: "path" },
      COL.size,
      COL.open
    ],
    doneMsg: (msg) => `Done \u2014 ${msg.results} dev cache folder(s) found`,
    progressMap: (msg) => ({ results: msg.results, folder: msg.folder }),
    mapRow: (msg) => ({ path: msg.path, size: msg.size, folderName: msg.folderName }),
    trackResults: true
  });
  _registerStandardSection({
    section: "empty",
    containerId: "emptyResult",
    columns: [COL.check, COL.delBtn, COL.keepBtn, { key: "path", label: "Path", flex: 3, minWidth: 200, type: "path" }, COL.open],
    doneMsg: (msg) => `Done \u2014 ${msg.results} empty folders`,
    progressMap: (msg) => ({ files: msg.scanned, results: msg.results, folder: msg.folder }),
    mapRow: (msg) => ({ path: msg.path })
  });
  _registerStandardSection({
    section: "venvs",
    containerId: "venvResult",
    columns: [COL.check, COL.delBtn, COL.keepBtn, { key: "path", label: "Venv Path", flex: 2, minWidth: 150, type: "path" }, COL.project, COL.size, COL.open],
    doneMsg: (msg) => `Done \u2014 ${msg.results} venvs`,
    progressMap: (msg) => ({ results: msg.results, folder: msg.folder }),
    mapRow: (msg) => ({ path: msg.path, project: msg.project || "", size: msg.size }),
    trackResults: true
  });
  _registerStandardSection({
    section: "backups",
    containerId: "backupsResult",
    columns: [COL.check, COL.delBtn, COL.keepBtn, COL.dirName, { key: "path", label: "Path", flex: 2, minWidth: 150, type: "path" }, COL.files, COL.size, COL.open],
    doneMsg: (msg) => `Done \u2014 ${msg.results} backup folders (${fmt(msg.totalBytes)} total)`,
    progressMap: (msg) => ({ files: msg.scanned, results: msg.results, folder: msg.folder }),
    mapRow: (msg) => ({
      path: msg.path,
      dirName: msg.dirName || "",
      fileCount: (msg.fileCount || 0).toLocaleString(),
      size: msg.size
    }),
    trackResults: true
  });
  _registerStandardSection({
    section: "tiny-files",
    containerId: "tinyResult",
    columns: [COL.check, COL.delBtn, COL.keepBtn, COL.path, COL.size, COL.modified, COL.open],
    doneMsg: (msg) => `Done \u2014 ${msg.results} tiny files`,
    mapRow: (msg) => ({ path: msg.path, size: msg.size, modified: msg.modified || "" })
  });
  _registerStandardSection({
    section: "html-files",
    containerId: "htmlResult",
    columns: [COL.check, COL.delBtn, COL.keepBtn, COL.path, COL.size, COL.modified, COL.open],
    doneMsg: (msg) => `Done \u2014 ${msg.results} HTML files`,
    mapRow: (msg) => ({ path: msg.path, size: msg.size, modified: msg.modified || "" })
  });
  _registerStandardSection({
    section: "css-files",
    containerId: "cssResult",
    columns: [COL.check, COL.delBtn, COL.keepBtn, COL.path, COL.size, COL.modified, COL.open],
    doneMsg: (msg) => `Done \u2014 ${msg.results} CSS files`,
    mapRow: (msg) => ({ path: msg.path, size: msg.size, modified: msg.modified || "" })
  });
  _registerStandardSection({
    section: "ext-search",
    containerId: "extResult",
    columns: [COL.check, COL.delBtn, COL.keepBtn, COL.path, COL.ext, COL.size, COL.modified, COL.open],
    doneMsg: (msg) => `Done \u2014 ${msg.results} matching files`,
    mapRow: (msg) => ({
      path: msg.path,
      ext: msg.ext || "",
      size: msg.size,
      modified: msg.modified || ""
    })
  });
  window._smartData = [];
  registerHandler("smart-dedup", (msg) => {
    if (msg.type === "started") {
      window._smartData = [];
      resetPaging("smart-dedup");
      window._updateLoadMoreBtn?.("smart-dedup");
      SB.begin("smart-dedup", msg.root);
      window._scanToolbarVMs?.["smart-dedup"]?.scanStarted();
      SG.showSkeleton("smart-dedup", "smartResult", [COL.keep, COL.delPaths, COL.size]);
      SF.reset("smart-dedup");
      return;
    }
    if (msg.type === "progress") {
      SB.progress("smart-dedup", { files: msg.files, results: msg.results, folder: msg.folder });
      return;
    }
    if (msg.type === "done") {
      SG.removeSkeleton("smart-dedup");
      SB.done("smart-dedup", `Done \u2014 ${msg.results} groups`);
      SF.rebuild("smart-dedup");
      window._scanToolbarVMs?.["smart-dedup"]?.scanDone();
      return;
    }
    if (msg.type === "error") {
      SB.error("smart-dedup", msg.message);
      window._scanToolbarVMs?.["smart-dedup"]?.scanDone();
      return;
    }
    if (msg.type === "result") {
      window._smartData.push(msg);
      SG.removeSkeleton("smart-dedup");
      SG.create("smart-dedup", "smartResult", [COL.keep, COL.delPaths, COL.size]);
      SG.addRow("smart-dedup", {
        keep: msg.keep,
        delete: Array.isArray(msg.delete) ? msg.delete : [],
        size: msg.size,
        path: msg.keep
        // for filter tracking
      });
      _set("smart-dedup", "results", window._smartData.length.toLocaleString());
    }
  });
  window._imageGroups = {};
  let _imgColumns = parseInt(localStorage.getItem("dcu_img_cols") || "3", 10) || 3;
  function _explainDuplicates(files) {
    const norm = (p) => p.replace(/\\/g, "/").toLowerCase();
    const parts = files.map(norm);
    const dirs  = parts.map(p => p.replace(/\/[^/]*$/, ""));
    const names = parts.map(p => p.replace(/.*\//, ""));
    const sameDir        = dirs.every(d => d === dirs[0]);
    const sameName       = names.every(n => n === names[0]);
    const allInDownloads = parts.every(p => p.includes("/downloads/"));
    const someDownloads  = !allInDownloads && parts.some(p => p.includes("/downloads/"));
    const hasVsCode  = parts.some(p => p.includes(".vscode") || p.includes("vscode-") || p.includes("/extensions/"));
    const hasGit     = parts.some(p => p.includes("/.git/") || p.includes("/worktrees/"));
    const hasBuild   = parts.some(p => /dist\/|build\/|out\/|bin\/|\.next\/|node_modules\//.test(p));
    const hasBackup  = parts.some(p => /backup|archive|old|bak|copy|clone/.test(p));
    const hasTest    = parts.some(p => /test|sample|demo|example|fixture/.test(p));
    const sharedRoot = dirs.reduce((a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return a.slice(0, i); }, dirs[0] || "");
    const differentProjects = dirs.some(d => d !== dirs[0]) && sharedRoot.split("/").length < 4;
    if (sameDir && !sameName)  return "📁 Same folder, different names — renamed or duplicate version of the same image. → Keep the one with the more descriptive filename.";
    if (sameDir &&  sameName)  return "📁 Exact duplicate in the same folder. → Safe to delete either copy.";
    if (hasVsCode)             return "🔌 VS Code extension copies — same asset across multiple extensions. → Safe to delete; VS Code reinstalls assets automatically.";
    if (hasGit)                return "🌿 Git worktree copies — file present in multiple worktrees. → Check if worktrees are still active before deleting.";
    if (hasBuild)              return "📦 Build artifact — source file duplicated into a build folder. → Delete the build copy; it regenerates on next build.";
    if (hasBackup)             return "💾 Backup copy — file was archived or backed up. → Keep the original, delete the backup if no longer needed.";
    if (hasTest)               return "🧪 Test/sample data — file in test or sample directories. → Safe to delete if tests pass without it.";
    if (someDownloads)         return "📥 Downloaded copy — one file in Downloads, one installed elsewhere. → Keep the installed copy, delete the Downloads version.";
    if (allInDownloads)        return "📥 Both copies in Downloads — downloaded twice or from different sources. → Keep the most recent, delete the older one.";
    if (differentProjects)     return "📂 Cross-project asset — same image reused across projects. → Keep both unless you are consolidating projects.";
    return "🔁 Identical content at different paths. → Review both locations and delete whichever is less relevant.";
  }

  window._wireImgSection = () => { _wireImgFilter(); _wireImgSelectDelete(); };
  registerHandler("images", (msg) => {
    if (msg.type === "started") {
      window._imageGroups = {};
      resetPaging("images");
      window._updateLoadMoreBtn?.("images");
      SB.begin("images", msg.root);
      window._scanToolbarVMs?.["images"]?.scanStarted();
      const delBtn = document.getElementById("imgDeleteAllBtn");
      if (delBtn) {
        delBtn.classList.add("hidden");
        delBtn.disabled = false;
        delBtn.textContent = "\u{1F5D1} Delete All Copies";
      }
      setTimeout(_wireImgFilter, 50);
      const c = document.getElementById("imageResult");
      if (c) c.innerHTML = '<div class="skel-grid">' + Array.from({ length: 6 }, () => '<div class="skel-card"></div>').join("") + "</div>";
      return;
    }
    if (msg.type === "progress") {
      _folder("images", msg.folder || "");
      return;
    }
    if (msg.type === "done") {
      removeSkeletons("imageResult");
      SB.done("images", `Done \u2014 ${msg.results} exact duplicate groups`);
      localStorage.setItem("dcu_img_scan_ts", String(Date.now()));
      window._scanToolbarVMs?.["images"]?.scanDone();
      const delBtn = document.getElementById("imgDeleteAllBtn");
      if (delBtn && msg.results > 0) delBtn.classList.remove("hidden");
      setTimeout(() => { _wireImgFilter(); _wireImgSelectDelete(); }, 100);
      return;
    }
    if (msg.type === "error") {
      SB.error("images", msg.message);
      window._scanToolbarVMs?.["images"]?.scanDone();
      return;
    }
    if (msg.type === "result" || msg.type === "result_update") {
      const files = Array.isArray(msg.files) ? msg.files : [];
      window._imageGroups[msg.hash] = files;
      const container = document.getElementById("imageResult");
      if (!container) return;
      container.querySelector(".skel-grid")?.remove();
      container.querySelector(`[data-img-hash="${msg.hash}"]`)?.remove();
      const group = document.createElement("div");
      group.className = "img-group2";
      group.dataset.imgHash = msg.hash;
      const groupName = (files[0] || "").replace(/.*[\\/]/, "");
      const legend = document.createElement("div"); legend.className = "img-group2-legend";
      legend.textContent = groupName;
      group.appendChild(legend);
      const issueBtn = document.createElement("button");
      issueBtn.className = "btn muted img-group-issue-btn";
      issueBtn.textContent = "📋 Issue";
      issueBtn.title = "File a GitHub issue for this duplicate group";
      issueBtn.addEventListener("click", () => {
        const desc = reasonEl?.querySelector(".img-reason-auto")?.textContent || autoReason;
        const title = `Dup Images: ${groupName} — ${desc.split("→")[0].trim().replace(/^[^\w]+/, "").slice(0, 60)}`;
        const body = [
          `## Duplicate Image Group: \`${groupName}\``,
          ``,
          `**Auto-detected reason:** ${desc}`,
          ``,
          `### File paths`,
          ...files.map(f => `- \`${f}\``),
          ``,
          `### Details`,
          `_Add your observations here…_`,
          ``,
          `---`,
          `*Filed from DiskCleanUp Dup Images*`,
        ].join("\n");
        const params = new URLSearchParams({ title, body, labels: "project:diskcleanup,dup-images" });
        window.open(`https://github.com/CieloVistaSoftware/DiskCleanUp/issues/new?${params}`, "_blank");
      });
      group.appendChild(issueBtn);
      const reasonEl = document.createElement("div"); reasonEl.className = "img-group2-reason";
      const autoReason = _explainDuplicates(files);
      const savedLabel = localStorage.getItem(`img-label-${msg.hash}`) || "";
      const displayText = savedLabel || autoReason;
      const [desc, rec] = displayText.includes("→") ? displayText.split(" → ") : [displayText, ""];
      reasonEl.innerHTML = `<span class="img-reason-auto" contenteditable="true" title="Click to edit"><span class="img-reason-desc">${escHtml(desc)}</span>${rec ? `<span class="img-reason-rec"> → ${escHtml(rec)}</span>` : ""}</span>`;
      const editableSpan = reasonEl.querySelector(".img-reason-auto");
      editableSpan?.addEventListener("blur", () => {
        localStorage.setItem(`img-label-${msg.hash}`, editableSpan.textContent || "");
      });
      editableSpan?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); editableSpan.blur(); }
      });
      group.appendChild(reasonEl);
      const pathRow = document.createElement("div");
      pathRow.className = "dup-path-row";
      files.forEach((fp) => {
        const cell = document.createElement("div");
        cell.className = "dup-path-cell img-path-cell";
        cell.title = fp;
        cell.textContent = fp;
        cell.style.cursor = "pointer";
        cell.addEventListener("click", () => {
          const folder = fp.replace(/[\\/][^\\/]*$/, "");
          fetch("/api/open-folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: folder }) }).catch(() => {
          });
        });
        pathRow.appendChild(cell);
      });
      group.appendChild(pathRow);
      const cardsRow = document.createElement("div");
      cardsRow.className = "img-cards-row";
      files.forEach((fp, i) => {
        try { cardsRow.appendChild(_buildImgCard(fp, i === 0, group)); }
        catch(e) { ErrLog.log("[images]", `_buildImgCard failed for ${fp}: ${e.message}`, null, "IMG_CARD_FAIL"); }
      });
      group.appendChild(cardsRow);
      container.appendChild(group);
      const n = Object.keys(window._imageGroups).length;
      _set("images", "results", n.toLocaleString());
      _set("images", "rows", n.toLocaleString());
      _applyImgColumns();
    }
  });
} catch (ex) {
  ErrLog.log("[SECTION_HANDLERS]", ex.message, ex.stack, "UNHANDLED_ERROR");
}
