import { ErrLog } from '../js/error-logger.js';
// ═══════════════════════════════════════════════════════════════════════════
//  STALE FILE MODEL — data contract
//
//  Defines: field names, column layout, JSONL row parsing.
//  Pure data description — no DOM, no state, no side effects.
// ═══════════════════════════════════════════════════════════════════════════
export const StaleModel = {
    section: 'stale',
    keyField: 'path', // rows keyed by file path
    grouped: false, // simple flat rows, no groups
    // Column definitions for GridShell
    columns: [
        { field: 'select', label: '', width: '28px', type: 'checkbox' },
        { field: 'path', label: 'File', width: '1fr', type: 'path' },
        { field: 'size', label: 'Size', width: '70px', type: 'bytes' },
        { field: 'modified', label: 'Modified', width: '90px', type: 'date' },
    ],
    // Grid template from column widths
    get gridTemplate() {
        return this.columns.map(c => c.width).join(' ');
    },
    /**
     * Parse one JSONL row → normalized file record.
     * Returns null if row is invalid.
     *
     * @param {object} row — raw JSON object from JSONL
     * @returns {{ path: string, size: number, modified: string } | null}
     */
    parse(row) {
        try {
            const d = row.data ?? row.Data;
            if (!d)
                return null;
            const path = d.path ?? d.Path;
            if (!path)
                return null;
            return {
                path,
                size: d.size ?? d.Size ?? 0,
                modified: d.modified ?? d.Modified ?? '',
            };
        }
        catch (err) {
            ErrLog.log('[stale-model]', String(err), null, 'MODEL_ERROR');
            return null;
        }
    },
};
//# sourceMappingURL=stale-model.js.map