import { ErrLog } from '/js/error-logger.js';

export const DuplicatesModel = {
    section: 'duplicates',
    keyField: 'hash', // groups keyed by content hash
    grouped: true, // each record has files[] array
    // Column definitions drive the View renderer
    columns: [
        { field: 'select', label: '', width: '28px', type: 'checkbox' },
        { field: 'status', label: 'Status', width: '70px', type: 'badge' },
        { field: 'path', label: 'File', width: '1fr', type: 'path' },
        { field: 'size', label: 'Size', width: '70px', type: 'bytes' },
        { field: 'modified', label: 'Modified', width: '90px', type: 'date' },
    ],
    // Grid template from column widths
    get gridTemplate() {
        return this.columns.map(c => c.width).join(' ');
    },
    /**
     * Parse one JSONL row → normalized group record.
     * Returns null if row is invalid or not a result row.
     *
     * @param {object} row — raw JSON object from JSONL
     * @returns {{ hash: string, files: FileRecord[] } | null}
     */
    parse(row) {
        try {
            const d = row.data ?? row.Data;
            if (!d)
                return null;
            const hash = d.hash ?? d.Hash;
            const files = d.files ?? d.Files;
            if (!hash || !Array.isArray(files) || files.length < 2)
                return null;
            return {
                hash,
                files: files.map(f => ({
                    path: f.path ?? f.Path ?? '',
                    size: f.size ?? f.Size ?? 0,
                    modified: f.modified ?? f.Modified ?? '',
                }))
            };
        } catch (err) {
            ErrLog.log('[duplicates-model.js]', err?.message || String(err), err?.stack || null, 'DUPLICATES_MODEL_ERROR');
            return null;
        }
    },
    /**
     * Sort a group's files so the shortest filename is first (the "Keep").
     * Copies have suffixes like " (1)", " (1) (1)" making them longer.
     * @param {{ path: string }[]} files
     * @returns {{ path: string }[]}
     */
    _sortedFiles(files) {
        try {
            return [...files].sort((a, b) => {
                const nameA = (a.path || '').replace(/.*[\/\\]/, '');
                const nameB = (b.path || '').replace(/.*[\/\\]/, '');
                return nameA.length - nameB.length || nameA.localeCompare(nameB);
            });
        } catch (err) {
            ErrLog.log('[duplicates-model.js]', err?.message || String(err), err?.stack || null, 'DUPLICATES_MODEL_ERROR');
            return [];
        }
    },
    /**
     * Extract all "copy" paths from a group (everything except the shortest filename).
     * @param {{ files: FileRecord[] }} group
     * @returns {string[]}
     */
    copyPaths(group) {
        try {
            return this._sortedFiles(group.files).slice(1).map(f => f.path).filter(Boolean);
        } catch (err) {
            ErrLog.log('[duplicates-model.js]', err?.message || String(err), err?.stack || null, 'DUPLICATES_MODEL_ERROR');
            return [];
        }
    },
    /**
     * Extract all copy paths from all groups.
     * @param {Map} dataMap — hash → group
     * @returns {string[]}
     */
    allCopyPaths(dataMap) {
        try {
            const paths = [];
            dataMap.forEach(group => {
                this._sortedFiles(group.files).slice(1).forEach(f => { if (f.path)
                    paths.push(f.path); });
            });
            return paths;
        } catch (err) {
            ErrLog.log('[duplicates-model.js]', err?.message || String(err), err?.stack || null, 'DUPLICATES_MODEL_ERROR');
            return [];
        }
    }
};
//# sourceMappingURL=duplicates-model.js.map