// ═══════════════════════════════════════════════════════════════════════════
//  DUPLICATES MODEL — data contract
//
//  Defines:  field names, types, column layout, JSONL row parsing.
//  No DOM, no state, no side effects. Pure data description.
// ═══════════════════════════════════════════════════════════════════════════
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
    },
    /**
     * Extract all "copy" paths from a group (everything except index 0).
     * @param {{ files: FileRecord[] }} group
     * @returns {string[]}
     */
    copyPaths(group) {
        return group.files.slice(1).map(f => f.path).filter(Boolean);
    },
    /**
     * Extract all copy paths from all groups.
     * @param {Map} dataMap — hash → group
     * @returns {string[]}
     */
    allCopyPaths(dataMap) {
        const paths = [];
        dataMap.forEach(group => {
            group.files.slice(1).forEach(f => { if (f.path)
                paths.push(f.path); });
        });
        return paths;
    }
};
//# sourceMappingURL=duplicates-model.js.map