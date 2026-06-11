// ═══════════════════════════════════════════════════════════════════════════
//  SECTION HANDLERS — registers all built-in scan section event handlers
//  NOW POWERED BY scan-grid.js (CSS Grid) + scan-filter.js + ext-colors.js
//
//  FACTORY PATTERN: Most scan sections follow the same lifecycle:
//    started → skeleton → progress → result (addRow) → done
//  The _registerStandardSection() factory handles this. Only sections
//  with unique behavior (smart-dedup, images, duplicates) are hand-written.
// ═══════════════════════════════════════════════════════════════════════════
import { registerHandler } from './event-queue.js';
import { SB, _set, _folder, _getVal } from './status-bar.js';
import { removeSkeletons } from './table-utils.js';
import { fmt } from './ui-utils.js';
import { resetPaging } from './page-loader.js';
import * as SG from './scan-grid.js';
import * as SF from './scan-filter.js';
import { ErrLog } from '/js/error-logger.js';
// ── Column definitions (shared across sections) ──────────────────────────
try {
    const COL = {
        check: { key: 'check', width: 56, type: 'checkbox' },
        path: { key: 'path', label: 'File', flex: 3, minWidth: 150, type: 'path' },
        keep: { key: 'keep', label: 'Keep (newest)', flex: 2, minWidth: 120, type: 'path' },
        delPaths: { key: 'delete', label: 'Will Delete', flex: 3, minWidth: 150, type: 'paths' },
        size: { key: 'size', label: 'Size', width: 90, type: 'size' },
        modified: { key: 'modified', label: 'Modified', width: 140, type: 'text' },
        ext: { key: 'ext', label: 'Ext', width: 90, type: 'text' },
        project: { key: 'project', label: 'Project', flex: 1, minWidth: 100, type: 'text' },
        dirName: { key: 'dirName', label: 'Folder Name', width: 140, type: 'badge' },
        files: { key: 'fileCount', label: 'Files', width: 70, type: 'text' },
        open: { key: 'open', label: '', width: 60, type: 'open' },
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
        const { section, containerId, columns, doneMsg, mapRow, progressMap = (msg) => ({ files: msg.files, results: msg.results, folder: msg.folder }), trackResults = false, } = config;
        registerHandler(section, (msg) => {
            switch (msg.type) {
                case 'started':
                    resetPaging(section);
                    window._updateLoadMoreBtn?.(section);
                    SB.begin(section, msg.root);
                    SG.showSkeleton(section, containerId, columns);
                    SF.reset(section);
                    window._setSectionStatus?.(section, 'scanning');
                    break;
                case 'progress':
                    SB.progress(section, progressMap(msg));
                    break;
                case 'done':
                    SG.removeSkeleton(section);
                    SB.done(section, doneMsg(msg));
                    SF.rebuild(section);
                    window._setSectionStatus?.(section, 'done');
                    break;
                case 'error':
                    SB.error(section, msg.message);
                    window._setSectionStatus?.(section, 'error');
                    break;
                case 'result':
                    SG.removeSkeleton(section);
                    SG.create(section, containerId, columns);
                    SG.addRow(section, mapRow(msg));
                    if (trackResults) {
                        _set(section, 'results', (parseInt(_getVal(section, 'results').replace(/,/g, '')) || 0) + 1 + '');
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
        columns: [COL.check, COL.path, COL.size, COL.modified, COL.open],
        doneMsg: (msg) => `Done — ${msg.results} stale files`,
        mapRow: (msg) => ({ path: msg.path, size: msg.size, modified: msg.modified || '' }),
    });
    // LARGE
    _registerStandardSection({
        section: 'large',
        containerId: 'largeResult',
        columns: [COL.check, COL.path, COL.size, COL.open],
        doneMsg: (msg) => `Done — ${msg.results} large files`,
        mapRow: (msg) => ({ path: msg.path, size: msg.size }),
    });
    // NODE-MODULES
    _registerStandardSection({
        section: 'node-modules',
        containerId: 'nmResult',
        columns: [COL.check, { key: 'path', label: 'Path', flex: 3, minWidth: 150, type: 'path' }, COL.size, COL.open],
        doneMsg: (msg) => `Done — ${msg.results} found`,
        progressMap: (msg) => ({ results: msg.results, folder: msg.folder }),
        mapRow: (msg) => ({ path: msg.path, size: msg.size }),
        trackResults: true,
    });
    _registerStandardSection({
        section: 'empty',
        containerId: 'emptyResult',
        columns: [COL.check, { key: 'path', label: 'Path', flex: 3, minWidth: 200, type: 'path' }, COL.open],
        doneMsg: (msg) => `Done — ${msg.results} empty folders`,
        progressMap: (msg) => ({ files: msg.scanned, results: msg.results, folder: msg.folder }),
        mapRow: (msg) => ({ path: msg.path }),
    });
    _registerStandardSection({
        section: 'venvs',
        containerId: 'venvResult',
        columns: [COL.check, { key: 'path', label: 'Venv Path', flex: 2, minWidth: 150, type: 'path' }, COL.project, COL.size, COL.open],
        doneMsg: (msg) => `Done — ${msg.results} venvs`,
        progressMap: (msg) => ({ results: msg.results, folder: msg.folder }),
        mapRow: (msg) => ({ path: msg.path, project: msg.project || '', size: msg.size }),
        trackResults: true,
    });
    _registerStandardSection({
        section: 'backups',
        containerId: 'backupsResult',
        columns: [COL.check, COL.dirName, { key: 'path', label: 'Path', flex: 2, minWidth: 150, type: 'path' }, COL.files, COL.size, COL.open],
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
        columns: [COL.check, COL.path, COL.size, COL.modified, COL.open],
        doneMsg: (msg) => `Done — ${msg.results} tiny files`,
        mapRow: (msg) => ({ path: msg.path, size: msg.size, modified: msg.modified || '' }),
    });
    _registerStandardSection({
        section: 'html-files',
        containerId: 'htmlResult',
        columns: [COL.check, COL.path, COL.size, COL.modified, COL.open],
        doneMsg: (msg) => `Done — ${msg.results} HTML files`,
        mapRow: (msg) => ({ path: msg.path, size: msg.size, modified: msg.modified || '' }),
    });
    _registerStandardSection({
        section: 'css-files',
        containerId: 'cssResult',
        columns: [COL.check, COL.path, COL.size, COL.modified, COL.open],
        doneMsg: (msg) => `Done — ${msg.results} CSS files`,
        mapRow: (msg) => ({ path: msg.path, size: msg.size, modified: msg.modified || '' }),
    });
    _registerStandardSection({
        section: 'ext-search',
        containerId: 'extResult',
        columns: [COL.check, COL.path, COL.ext, COL.size, COL.modified, COL.open],
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
            SG.showSkeleton('smart-dedup', 'smartResult', [COL.keep, COL.delPaths, COL.size]);
            SF.reset('smart-dedup');
            return;
        }
        if (msg.type === 'progress') {
            SB.progress('smart-dedup', { files: msg.files, results: msg.results, folder: msg.folder });
            return;
        }
        if (msg.type === 'done') {
            SG.removeSkeleton('smart-dedup');
            SB.done('smart-dedup', `Done — ${msg.results} groups`);
            SF.rebuild('smart-dedup');
            return;
        }
        if (msg.type === 'error') {
            SB.error('smart-dedup', msg.message);
            return;
        }
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
    registerHandler('images', (msg) => {
        if (msg.type === 'started') {
            window._imageGroups = {};
            resetPaging('images');
            window._updateLoadMoreBtn?.('images');
            SB.begin('images', msg.root);
            const delBtn = document.getElementById('imgDeleteAllBtn');
            if (delBtn) {
                delBtn.classList.add('hidden');
                delBtn.disabled = false;
                delBtn.textContent = '\ud83d\uddd1 Delete All Copies';
            }
            document.getElementById('imageResult').innerHTML =
                '<div class="skel-grid">' +
                    Array.from({ length: 6 }, () => '<div class="skel-card"></div>').join('') +
                    '</div>';
            return;
        }
        if (msg.type === 'progress') {
            _folder('images', msg.folder || '');
            return;
        }
        if (msg.type === 'done') {
            removeSkeletons('imageResult');
            SB.done('images', `Done — ${msg.results} duplicate groups`);
            if (msg.results > 0) {
                const delBtn = document.getElementById('imgDeleteAllBtn');
                if (delBtn)
                    delBtn.classList.remove('hidden');
            }
            return;
        }
        if (msg.type === 'error') {
            SB.error('images', msg.message);
            return;
        }
        if (msg.type === 'result' || msg.type === 'result_update') {
            const files = Array.isArray(msg.files) ? msg.files : [];
            window._imageGroups[msg.hash] = files;
            const container = document.getElementById('imageResult');
            const skel = container.querySelector('.skel-grid');
            if (skel)
                skel.remove();
            const existing = container.querySelector(`[data-img-hash="${msg.hash}"]`);
            if (existing)
                existing.remove();
            const div = document.createElement('div');
            div.className = 'img-group';
            div.dataset.imgHash = msg.hash;
            div.innerHTML = `<span class="badge red">Duplicate Group</span><div class="img-grid">${files.map((fp, i) => {
                const escaped = (fp || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                return `<div class="img-card">
            <img src="/api/file?path=${encodeURIComponent(fp)}" loading="lazy" onerror="this.classList.add('img-broken')" alt="">
            <p>${fp}</p>
            <div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap">
            ${i > 0
                    ? `<button class="btn danger btn-sm img-trash-btn" onclick="window.trashImage('${escaped}')">\ud83d\uddd1 Delete</button>`
                    : `<span class="img-keep">\u2705 Original</span>`}
            <button class="btn-keep" onclick="window.keepPaths(['${escaped}'])">\ud83d\udd12 Keep</button>
            </div>
          </div>`;
            }).join('')}</div>`;
            container.appendChild(div);
            const imgCount = Object.keys(window._imageGroups).length;
            _set('images', 'results', imgCount.toLocaleString());
            _set('images', 'rows', imgCount.toLocaleString());
        }
    });
    // ── Duplicates — delegated to DuplicatesSection module ───────────────────
    // Registered after duplicates.js loads (see init.js)
}
catch (ex) {
    ErrLog.log('[SECTION_HANDLERS]', ex.message, ex.stack, 'UNHANDLED_ERROR');
}
//# sourceMappingURL=section-handlers.js.map