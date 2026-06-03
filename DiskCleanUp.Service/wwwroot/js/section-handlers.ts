// ═══════════════════════════════════════════════════════════════════════════
//  SECTION HANDLERS — registers all built-in scan section event handlers
//  NOW POWERED BY scan-grid.js (CSS Grid) + scan-filter.js + ext-colors.js
//
//  FACTORY PATTERN: Most scan sections follow the same lifecycle:
//    started → skeleton → progress → result (addRow) → done
//  The _registerStandardSection() factory handles this. Only sections
//  with unique behavior (smart-dedup, images, duplicates) are hand-written.
// ═══════════════════════════════════════════════════════════════════════════

import { registerHandler }                    from './event-queue.js';
import { registerSectionModule }              from './ui-utils.js';
import { SB, _set, _folder, _getVal }         from './status-bar.js';
import { removeSkeletons }                    from './table-utils.js';
import { fmt }                                from './ui-utils.js';
import { escHtml }                            from '/lib/wb-core/utils/format.js';
import { resetPaging }                        from './page-loader.js';
import { keepPaths }                          from './keep-list.js';
import * as SG                                from './scan-grid.js';
import * as SF                                from './scan-filter.js';
import { crumb }                              from './breadcrumb.js';
import { ErrLog } from './error-logger.js';

// ── Column definitions (shared across sections) ──────────────────────────
try {
  const COL = {
    check:    { key: 'check',    width: 36,  type: 'checkbox' },
    delBtn:   { key: 'delBtn',  width: 36,  type: 'delBtn'  },
    keepBtn:  { key: 'keepBtn', label: 'Keep', width: 72,  type: 'keepBtn' },
    path:     { key: 'path',     label: 'File',       flex: 3, minWidth: 150, type: 'path' },
    keep:     { key: 'keep',     label: 'Keep (newest)', flex: 2, minWidth: 120, type: 'path' },
    delPaths: { key: 'delete',   label: 'Will Delete', flex: 3, minWidth: 150, type: 'paths' },
    size:     { key: 'size',     label: 'Size',       width: 90,  type: 'size' },
    modified: { key: 'modified', label: 'Modified',   width: 140, type: 'text' },
    ext:      { key: 'ext',      label: 'Ext',        width: 90,  type: 'text' },
    project:  { key: 'project',  label: 'Project',    flex: 1, minWidth: 100, type: 'text' },
    dirName:  { key: 'dirName',  label: 'Folder Name', width: 140, type: 'badge' },
    files:    { key: 'fileCount', label: 'Files',     width: 70,  type: 'text' },
    open:     { key: 'open',     label: '',           width: 60,  type: 'open' },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  FACTORY — eliminates repeated started/progress/done/error/result
  //  boilerplate across standard scan sections.
  //
  //  Config shape:
  //    section:     string    — section name (e.g. 'stale')
  //    containerId: string    — DOM container id (e.g. 'staleResult')
  //    columns:     array     — column definitions for scan-grid
  //    doneMsg:     function  — (msg) => string for status bar done message
  //    mapRow:      function  — (msg) => object for scan-grid addRow data
  //    progressMap: function? — (msg) => object for SB.progress (optional)
  //    trackResults: boolean? — if true, manually increment results counter
  // ═══════════════════════════════════════════════════════════════════════════

  function _registerStandardSection(config) {
    const {
      section, containerId, columns,
      doneMsg, mapRow,
      progressMap = (msg) => ({ files: msg.files, results: msg.results, folder: msg.folder }),
      trackResults = false,
    } = config;

    registerHandler(section, (msg) => {
      switch (msg.type) {
        case 'started':
          resetPaging(section);
          window._updateLoadMoreBtn?.(section);
          SB.begin(section, msg.root);
          SG.showSkeleton(section, containerId, columns);
          SF.reset(section);
          window._setSectionStatus?.(section, 'scanning');
          window._scanToolbarVMs?.[section]?.scanStarted();
          break;

        case 'progress':
          SB.progress(section, progressMap(msg));
          break;

        case 'done':
          SG.removeSkeleton(section);
          SB.done(section, doneMsg(msg));
          SF.rebuild(section);
          window._setSectionStatus?.(section, 'done');
          window._scanToolbarVMs?.[section]?.scanDone();
          break;

        case 'error':
          SB.error(section, msg.message);
          window._setSectionStatus?.(section, 'error');
          window._scanToolbarVMs?.[section]?.scanDone();
          break;

        case 'result':
          SG.removeSkeleton(section);
          SG.create(section, containerId, columns);
          SG.addRow(section, mapRow(msg));
          if (trackResults) {
            _set(section, 'results',
              (parseInt(_getVal(section, 'results').replace(/,/g, '')) || 0) + 1 + '');
          }
          break;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  STANDARD SECTIONS — all use the factory
  // ═══════════════════════════════════════════════════════════════════════════

  // STALE
  _registerStandardSection({
    section: 'stale',
    containerId: 'staleResult',
    columns: [COL.check, COL.delBtn, COL.keepBtn, COL.path, COL.size, COL.modified, COL.open],
    doneMsg: (msg) => `Done — ${msg.results} stale files`,
    mapRow: (msg) => ({ path: msg.path, size: msg.size, modified: msg.modified || '' }),
  });

  // LARGE
  _registerStandardSection({
    section: 'large',
    containerId: 'largeResult',
    columns: [COL.check, COL.delBtn, COL.keepBtn, COL.path, COL.size, COL.open],
    doneMsg: (msg) => `Done — ${msg.results} large files`,
    mapRow: (msg) => ({ path: msg.path, size: msg.size }),
  });

  // NODE-MODULES
  _registerStandardSection({
    section: 'node-modules',
    containerId: 'nmResult',
    columns: [COL.check, COL.delBtn, COL.keepBtn, { key: 'path', label: 'Path', flex: 3, minWidth: 150, type: 'path' }, COL.size, COL.open],
    doneMsg: (msg) => `Done — ${msg.results} found`,
    progressMap: (msg) => ({ results: msg.results, folder: msg.folder }),
    mapRow: (msg) => ({ path: msg.path, size: msg.size }),
    trackResults: true,
  });

  // DEV CACHES (.vscode-test-web, .playwright, __pycache__, etc.)
  _registerStandardSection({
    section: 'dev-cache',
    containerId: 'devCacheResult',
    columns: [COL.check, COL.delBtn, COL.keepBtn,
      { key: 'folderName', label: 'Cache Type', width: 180, type: 'badge' },
      { key: 'path', label: 'Path', flex: 3, minWidth: 150, type: 'path' },
      COL.size, COL.open],
    doneMsg: (msg) => `Done — ${msg.results} dev cache folder(s) found`,
    progressMap: (msg) => ({ results: msg.results, folder: msg.folder }),
    mapRow: (msg) => ({ path: msg.path, size: msg.size, folderName: msg.folderName }),
    trackResults: true,
  });

  _registerStandardSection({
    section: 'empty',
    containerId: 'emptyResult',
    columns: [COL.check, COL.delBtn, COL.keepBtn, { key: 'path', label: 'Path', flex: 3, minWidth: 200, type: 'path' }, COL.open],
    doneMsg: (msg) => `Done — ${msg.results} empty folders`,
    progressMap: (msg) => ({ files: msg.scanned, results: msg.results, folder: msg.folder }),
    mapRow: (msg) => ({ path: msg.path }),
  });

  _registerStandardSection({
    section: 'venvs',
    containerId: 'venvResult',
    columns: [COL.check, COL.delBtn, COL.keepBtn, { key: 'path', label: 'Venv Path', flex: 2, minWidth: 150, type: 'path' }, COL.project, COL.size, COL.open],
    doneMsg: (msg) => `Done — ${msg.results} venvs`,
    progressMap: (msg) => ({ results: msg.results, folder: msg.folder }),
    mapRow: (msg) => ({ path: msg.path, project: msg.project || '', size: msg.size }),
    trackResults: true,
  });

  _registerStandardSection({
    section: 'backups',
    containerId: 'backupsResult',
    columns: [COL.check, COL.delBtn, COL.keepBtn, COL.dirName, { key: 'path', label: 'Path', flex: 2, minWidth: 150, type: 'path' }, COL.files, COL.size, COL.open],
    doneMsg: (msg) => `Done — ${msg.results} backup folders (${fmt(msg.totalBytes)} total)`,
    progressMap: (msg) => ({ files: msg.scanned, results: msg.results, folder: msg.folder }),
    mapRow: (msg) => ({
      path: msg.path,
      dirName: msg.dirName || '',
      fileCount: (msg.fileCount || 0).toLocaleString(),
      size: msg.size,
    }),
    trackResults: true,
  });

  _registerStandardSection({
    section: 'tiny-files',
    containerId: 'tinyResult',
    columns: [COL.check, COL.delBtn, COL.keepBtn, COL.path, COL.size, COL.modified, COL.open],
    doneMsg: (msg) => `Done — ${msg.results} tiny files`,
    mapRow: (msg) => ({ path: msg.path, size: msg.size, modified: msg.modified || '' }),
  });

  _registerStandardSection({
    section: 'html-files',
    containerId: 'htmlResult',
    columns: [COL.check, COL.delBtn, COL.keepBtn, COL.path, COL.size, COL.modified, COL.open],
    doneMsg: (msg) => `Done — ${msg.results} HTML files`,
    mapRow: (msg) => ({ path: msg.path, size: msg.size, modified: msg.modified || '' }),
  });

  _registerStandardSection({
    section: 'css-files',
    containerId: 'cssResult',
    columns: [COL.check, COL.delBtn, COL.keepBtn, COL.path, COL.size, COL.modified, COL.open],
    doneMsg: (msg) => `Done — ${msg.results} CSS files`,
    mapRow: (msg) => ({ path: msg.path, size: msg.size, modified: msg.modified || '' }),
  });

  _registerStandardSection({
    section: 'ext-search',
    containerId: 'extResult',
    columns: [COL.check, COL.delBtn, COL.keepBtn, COL.path, COL.ext, COL.size, COL.modified, COL.open],
    doneMsg: (msg) => `Done — ${msg.results} matching files`,
    mapRow: (msg) => ({
      path: msg.path,
      ext: msg.ext || '',
      size: msg.size,
      modified: msg.modified || '',
    }),
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  CUSTOM SECTIONS — unique behavior that can't use the factory
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Smart Dedup ───────────────────────────────────────────────────────────
  window._smartData = [];
  registerHandler('smart-dedup', (msg) => {
    if (msg.type === 'started') {
      window._smartData = [];
      resetPaging('smart-dedup');
      window._updateLoadMoreBtn?.('smart-dedup');
      SB.begin('smart-dedup', msg.root);
            window._scanToolbarVMs?.['smart-dedup']?.scanStarted();
      SG.showSkeleton('smart-dedup', 'smartResult', [COL.keep, COL.delPaths, COL.size]);
      SF.reset('smart-dedup');
      return;
    }
    if (msg.type === 'progress') { SB.progress('smart-dedup', { files: msg.files, results: msg.results, folder: msg.folder }); return; }
    if (msg.type === 'done')     { SG.removeSkeleton('smart-dedup'); SB.done('smart-dedup', `Done — ${msg.results} groups`); SF.rebuild('smart-dedup'); window._scanToolbarVMs?.['smart-dedup']?.scanDone(); return; }
    if (msg.type === 'error')    { SB.error('smart-dedup', msg.message); window._scanToolbarVMs?.['smart-dedup']?.scanDone(); return; }
    if (msg.type === 'result') {
      window._smartData.push(msg);
      SG.removeSkeleton('smart-dedup');
      SG.create('smart-dedup', 'smartResult', [COL.keep, COL.delPaths, COL.size]);
      SG.addRow('smart-dedup', {
        keep: msg.keep,
        delete: Array.isArray(msg.delete) ? msg.delete : [],
        size: msg.size,
        path: msg.keep, // for filter tracking
      });
      _set('smart-dedup', 'results', window._smartData.length.toLocaleString());
    }
  });

    // ── Duplicate Images ──────────────────────────────────────────────────────
  window._imageGroups = {};
  let _imgColumns = parseInt(localStorage.getItem('dcu_img_cols') || '3', 10) || 3;

  function _applyImgColumns() {
    const grid = document.getElementById('imageResult');
    if (grid) (grid as HTMLElement).style.setProperty('--img-cols', String(_imgColumns));
  }

  function _wireImgFilter() {
    const filterBar = document.getElementById('sf-images');
    if (!filterBar || filterBar.querySelector('.img-filter-input')) return;
    const fi = document.createElement('input') as HTMLInputElement;
    fi.type = 'text'; fi.placeholder = 'Filter by path…'; fi.className = 'img-filter-input';
    fi.style.cssText = 'margin-left:8px;width:220px;padding:2px 6px;font-size:.85rem;';
    fi.addEventListener('input', () => {
      const q = (fi.value || '').toLowerCase();
      (document.querySelectorAll('#imageResult .img-group2') as NodeListOf<HTMLElement>).forEach(grp => {
        const paths = [...grp.querySelectorAll('.img-path-cell')].map(p => (p.textContent || '').toLowerCase());
        grp.style.display = (!q || paths.some(p => p.includes(q))) ? '' : 'none';
      });
    });
    filterBar.appendChild(fi);
    const colWrap = document.createElement('span');
    colWrap.style.cssText = 'margin-left:12px;display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--muted)';
    colWrap.textContent = 'Cols:';
    const colInput = document.createElement('input') as HTMLInputElement;
    colInput.type = 'number'; colInput.min = '1'; colInput.max = '6';
    colInput.value = String(_imgColumns);
    colInput.style.cssText = 'width:44px;padding:2px 4px;font-size:.85rem;text-align:center;margin-left:4px';
    colInput.addEventListener('change', () => {
      _imgColumns = Math.max(1, Math.min(6, parseInt(colInput.value) || 3));
      colInput.value = String(_imgColumns);
      localStorage.setItem('dcu_img_cols', String(_imgColumns));
      _applyImgColumns();
    });
    colWrap.appendChild(colInput);
    filterBar.appendChild(colWrap);
    _applyImgColumns();
  }

  function _buildImgCard(fp: string, isOriginal: boolean, groupEl: HTMLElement): HTMLElement {
    const card = document.createElement('div');
    card.className = `img-card2 ${isOriginal ? 'img-card2-keep' : 'img-card2-copy'}`;
    card.dataset.path = fp;
    const img = document.createElement('img');
    img.src = `/api/file?path=${encodeURIComponent(fp)}`; img.loading = 'lazy'; img.alt = '';
    img.className = 'img-card2-img';
    img.onerror = () => {
      groupEl.querySelector(`.img-path-cell[title="${fp.replace(/"/g, '\\"')}"]`)?.remove();
      card.style.transition = 'opacity .2s'; card.style.opacity = '0';
      setTimeout(() => card.remove(), 220);
    };
    card.appendChild(img);
    const filename = fp.replace(/.*[\\/]/, '');
    const body = document.createElement('div'); body.className = 'img-card2-body';
    body.innerHTML = `<div class="img-card2-label ${isOriginal ? 'img-label-original' : 'img-label-copy'}">${isOriginal ? '✓ Original' : '⊘ Copy'}</div><div class="img-card2-name" title="${escHtml(fp)}">${escHtml(filename)}</div>`;
    card.appendChild(body);
    const foot = document.createElement('div'); foot.className = 'img-card2-foot';
    const delBtn = document.createElement('button'); delBtn.className = 'dup-delete-one-btn'; delBtn.textContent = '🗑 Delete';
    delBtn.addEventListener('click', () => {
      delBtn.disabled = true; delBtn.textContent = '⏳';
      fetch('/api/trash', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({paths:[fp]}) })
        .then(() => {
          fetch('/api/cache/images/remove', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({paths:[fp]}) }).catch(()=>{});
          groupEl.querySelector(`.img-path-cell[title="${fp.replace(/"/g,'\\"')}"]`)?.remove();
          card.style.transition='opacity .25s'; card.style.opacity='0';
          setTimeout(()=>{ card.remove(); if (!groupEl.querySelectorAll('.img-card2-copy').length){groupEl.style.transition='opacity .25s';groupEl.style.opacity='0';setTimeout(()=>groupEl.remove(),260);} },260);
        }).catch(()=>{delBtn.disabled=false; delBtn.textContent='🗑 Delete';});
    });
    foot.appendChild(delBtn);
    const vscBtn = document.createElement('button'); vscBtn.className='dup-open-btn'; vscBtn.textContent='</>'; vscBtn.title='Open in VS Code';
    vscBtn.addEventListener('click', ()=>fetch('/api/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:fp})}).catch(()=>{}));
    foot.appendChild(vscBtn); card.appendChild(foot);
    return card;
  }

  registerHandler('images', (msg) => {
    if (msg.type === 'started') {
      window._imageGroups = {};
      resetPaging('images');
      window._updateLoadMoreBtn?.('images');
      SB.begin('images', msg.root);
      window._scanToolbarVMs?.['images']?.scanStarted();
      const delBtn = document.getElementById('imgDeleteAllBtn') as HTMLButtonElement | null;
      if (delBtn) { delBtn.classList.add('hidden'); delBtn.disabled = false; delBtn.textContent = '\uD83D\uDDD1 Delete All Copies'; }
      _wireImgFilter();
      const c = document.getElementById('imageResult');
      if (c) c.innerHTML = '<div class="skel-grid">' + Array.from({length:6},()=>'<div class="skel-card"></div>').join('') + '</div>';
      return;
    }
    if (msg.type === 'progress') { _folder('images', msg.folder || ''); return; }
    if (msg.type === 'done') {
      removeSkeletons('imageResult');
      SB.done('images', `Done \u2014 ${msg.results} exact duplicate groups`);
      localStorage.setItem('dcu_img_scan_ts', String(Date.now()));
      window._scanToolbarVMs?.['images']?.scanDone();
      const delBtn = document.getElementById('imgDeleteAllBtn');
      if (delBtn && msg.results > 0) delBtn.classList.remove('hidden');
      return;
    }
    if (msg.type === 'error') { SB.error('images', msg.message); window._scanToolbarVMs?.['images']?.scanDone(); return; }
    if (msg.type === 'result' || msg.type === 'result_update') {
      const files: string[] = Array.isArray(msg.files) ? msg.files : [];
      window._imageGroups[msg.hash] = files;
      const container = document.getElementById('imageResult');
      if (!container) return;
      container.querySelector('.skel-grid')?.remove();
      (container.querySelector(`[data-img-hash="${msg.hash}"]`) as HTMLElement | null)?.remove();
      const group = document.createElement('div');
      group.className = 'img-group2'; group.dataset.imgHash = msg.hash;
      // Path comparison row \u2014 stacked, clickable \u2192 open folder
      const pathRow = document.createElement('div'); pathRow.className = 'dup-path-row';
      files.forEach(fp => {
        const cell = document.createElement('div');
        cell.className = 'dup-path-cell img-path-cell';
        cell.title = fp; cell.textContent = fp; cell.style.cursor = 'pointer';
        cell.addEventListener('click', () => {
          const folder = fp.replace(/[\\/][^\\/]*$/, '');
          fetch('/api/open-folder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:folder})}).catch(()=>{});
        });
        pathRow.appendChild(cell);
      });
      group.appendChild(pathRow);
      const cardsRow = document.createElement('div'); cardsRow.className = 'img-cards-row';
      files.forEach((fp, i) => cardsRow.appendChild(_buildImgCard(fp, i === 0, group)));
      group.appendChild(cardsRow);
      container.appendChild(group);
      const n = Object.keys(window._imageGroups).length;
      _set('images', 'results', n.toLocaleString()); _set('images', 'rows', n.toLocaleString());
      _applyImgColumns();
    }
  });

  // ── Duplicates — delegated to DuplicatesSection module ───────────────────
  // Registered after duplicates.js loads (see init.js)

} catch (ex) {
  ErrLog.log('[SECTION_HANDLERS]', ex.message, ex.stack, 'UNHANDLED_ERROR');
}