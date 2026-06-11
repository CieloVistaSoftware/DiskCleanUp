import { SB } from '../js/status-bar.js';
import { DuplicatesModel } from '../models/duplicates-model.js';
import { SectionVM } from '../viewmodels/section-vm.js';
import { GridView } from '../views/grid-view.js';
import { ErrLog } from '../js/error-logger.js';

const _imgExts = new Set(['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico']);
const _codeExts = new Set(['.js', '.ts', '.jsx', '.tsx', '.css', '.html', '.htm', '.json',
    '.xml', '.md', '.txt', '.cs', '.py', '.ps1', '.yaml', '.yml',
    '.toml', '.ini', '.cfg', '.sh', '.bat', '.cmd', '.sql', '.csv']);
function _extOf(path) {
    const m = String(path).match(/\.[^.\\/]+$/);
    return m ? m[0].toLowerCase() : '';
}
export const DuplicatesSection = (() => {
    const vm = new SectionVM(DuplicatesModel);
    const view = new GridView('dupResult', {
        onDeleteGroup: (hash, paths, btn) => deleteGroup(btn, hash, paths),
        onLoadPreview: (el) => _loadPreview(el),
    });
    vm.bindView(view);
    let _visible = true;
    let _allCopiesNuked = false;
    vm.visible = true;

    function onShow() {
        window._T?.('DUP', `onShow data=${vm.size}`);
        _visible = true;
        vm.visible = true;
        if (vm.size === 0) {
            vm.loadAndBind().catch(err => {
                ErrLog.log('[duplicates.js]', err?.message || String(err), err?.stack || null, 'DUPLICATES_ERROR');
                window._T?.('DUP', `restore failed: ${err.message}`);
            });
        }
    }
    function onHide() {
        _visible = false;
        vm.visible = false;
    }
    function onEvent(msg) {
        switch (msg.type) {
            case 'started':
                if (vm.size > 0)
                    reset();
                vm.visible = true;
                vm.scanStarted();
                SB.begin('duplicates', msg.root);
                window._setSectionStatus?.('duplicates', 'scanning');
                return;
            case 'progress':
                SB.progress('duplicates', {
                    files: msg.files, results: msg.results, folder: msg.folder
                });
                return;
            case 'done':
                vm.scanDone();
                SB.done('duplicates', `Done — ${vm.size} dupe groups`);
                window._setSectionStatus?.('duplicates', 'done');
                return;
            case 'error':
                SB.error('duplicates', msg.message);
                window._setSectionStatus?.('duplicates', 'error');
                return;
            case 'result':
            case 'result_update':
                if (_allCopiesNuked)
                    return;
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
        const el = document.getElementById('sbv-duplicates-rows');
        if (el)
            el.textContent = vm.size.toLocaleString();
    }
    async function deleteGroup(btn, hash, paths) {
        if (!Array.isArray(paths) || !paths.length)
            return;
        window._T?.('DEL', `deleteGroup: ${paths.length} paths`);
        if (btn) {
            btn.textContent = '\u23f3 deleting\u2026';
            btn.disabled = true;
        }
        try {
            await vm.removePaths(paths, { trash: true });
        } catch (err) {
            ErrLog.log('[duplicates.js]', err?.message || String(err), err?.stack || null, 'DUPLICATES_ERROR');
        }
    }
    async function deleteAllCopies() {
        const paths = DuplicatesModel.allCopyPaths(vm.data);
        if (!paths.length) {
            alert('No duplicate copies found.');
            return;
        }
        if (!confirm(`Delete ALL ${paths.length} duplicate cop${paths.length === 1 ? 'y' : 'ies'}?\nOriginals are safe. Files go to Recycle Bin.`))
            return;
        window._T?.('DEL', `deleteAllCopies: ${paths.length} paths`);
        _allCopiesNuked = true;
        SB.progress('duplicates', { files: 0, results: 0, folder: 'Deleting copies\u2026' });
        try {
            await vm.removeAllCopies();
            if (vm.size === 0) {
                fetch('/api/cache/duplicates', { method: 'DELETE' }).catch(err => {
                    ErrLog.log('[duplicates.js]', err?.message || String(err), err?.stack || null, 'DUPLICATES_ERROR');
                });
            }
            SB.done('duplicates', `${vm.size} dupe groups`);
        } catch (err) {
            ErrLog.log('[duplicates.js]', err?.message || String(err), err?.stack || null, 'DUPLICATES_ERROR');
        }
    }
    function filter(val) {
        view.filter(val);
    }
    async function _loadPreview(el) {
        const path = el.dataset.previewPath;
        if (!path)
            return;
        const ext = _extOf(path);
        if (_imgExts.has(ext)) {
            const img = document.createElement('img');
            img.className = 'dup-thumb';
            if (ext === '.svg')
                img.classList.add('dup-thumb-svg');
            img.alt = path.split(/[\\/]/).pop();
            img.loading = 'lazy';
            img.onerror = () => { img.remove(); el.textContent = '(preview unavailable)'; };
            img.src = `/api/file?path=${encodeURIComponent(path)}`;
            el.textContent = '';
            el.appendChild(img);
        }
        else if (_codeExts.has(ext)) {
            try {
                const r = await fetch(`/api/preview?path=${encodeURIComponent(path)}`);
                if (!r.ok) {
                    el.textContent = '(preview unavailable)';
                    return;
                }
                const data = await r.json();
                if (data.type === 'text' && data.content) {
                    const pre = document.createElement('pre');
                    pre.className = 'dup-code';
                    const lines = data.content.split('\n').slice(0, 5);
                    pre.textContent = lines.join('\n');
                    if (data.content.split('\n').length > 5)
                        pre.textContent += '\n\u2026';
                    el.textContent = '';
                    el.appendChild(pre);
                }
                else {
                    el.textContent = '(binary file)';
                }
            } catch (err) {
                ErrLog.log('[duplicates.js]', err?.message || String(err), err?.stack || null, 'DUPLICATES_ERROR');
                el.textContent = '(preview failed)';
            }
        }
        else {
            el.textContent = `(.${ext.slice(1) || '?'} file)`;
        }
    }
    return {
        onEvent,
        onShow,
        onHide,
        reset,
        deleteGroup,
        deleteAllCopies,
        filter,
        get size() { return vm.size; }
    };
})();