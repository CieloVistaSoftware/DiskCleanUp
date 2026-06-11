import { ErrLog } from '../js/error-logger.js';
// ═══════════════════════════════════════════════════════════════════════════
//  LARGE FILES MODEL — data contract
//
//  Defines: field names, column layout, JSONL row parsing.
//  Pure data description — no DOM, no state, no side effects.
// ═══════════════════════════════════════════════════════════════════════════
export const LargeModel = {
    section: 'large',
    keyField: 'path', // rows keyed by file path
    grouped: false, // simple flat rows, no groups
    // Column definitions for GridShell
    columns: [
        { field: 'select', label: '', width: '28px', type: 'checkbox' },
        { field: 'path', label: 'File', width: '1fr', type: 'path' },
        { field: 'size', label: 'Size', width: '90px', type: 'bytes' },
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
     * @returns {{ path: string, size: number } | null}
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
            };
        }
        catch (err) {
            ErrLog.log('[large-model]', String(err), null, 'MODEL_ERROR');
            return null;
        }
    },
};
//# sourceMappingURL=large-model.js.map