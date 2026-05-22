// ═══════════════════════════════════════════════════════════════════════════
//  NODE MODULES MODEL — data contract
//
//  Defines: field names, column layout, JSONL row parsing.
//  Pure data description — no DOM, no state, no side effects.
// ═══════════════════════════════════════════════════════════════════════════
import { ErrLog } from '../js/error-logger.js';
export const NodeModulesModel = {
    section: 'node-modules',
    keyField: 'path', // rows keyed by folder path
    grouped: false, // simple flat rows, no groups
    // Column definitions for GridShell
    columns: [
        { field: 'select', label: '', width: '28px', type: 'checkbox' },
        { field: 'path', label: 'Path', width: '1fr', type: 'path' },
        { field: 'size', label: 'Size', width: '90px', type: 'bytes' },
    ],
    // Grid template from column widths
    get gridTemplate() {
        return this.columns.map(c => c.width).join(' ');
    },
    /**
     * Parse one JSONL row → normalized folder record.
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
        } catch (e) {
            ErrLog.log('[node-modules-model]', e?.message || String(e), e?.stack || null, 'PARSE_ERROR');
            return null;
        }
    },
};
//# sourceMappingURL=node-modules-model.js.map