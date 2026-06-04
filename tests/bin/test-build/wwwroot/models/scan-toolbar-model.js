import { ErrLog } from '/js/error-logger.js';

export const SCAN_TOOLBAR_CONFIGS = [
    { section: 'duplicates', tableId: 'dupTable', specialty: ['delete-all-copies', 'white-bg'] },
    { section: 'smart-dedup', tableId: 'smartTable', specialty: ['apply-all'] },
    { section: 'stale', tableId: 'staleTable', specialty: [] },
    { section: 'large', tableId: 'largeTable', specialty: [] },
    { section: 'node-modules', tableId: 'nmTable', specialty: [] },
    { section: 'venvs', tableId: 'venvTable', specialty: [] },
    { section: 'empty', tableId: 'emptyTable', specialty: [] },
    { section: 'images', tableId: 'imageTable', specialty: ['delete-all-copies', 'white-bg'] },
    { section: 'backups', tableId: 'backupsTable', specialty: [] },
    { section: 'tiny-files', tableId: 'tinyTable', specialty: ['full-view'] },
    { section: 'html-files', tableId: 'htmlTable', specialty: ['html-utilities'] },
    { section: 'css-files', tableId: 'cssTable', specialty: [] },
];

/**
 * Look up config for a section. Returns null if section not registered.
 * @param {string} section
 * @returns {ScanToolbarConfig|null}
 */
export function getToolbarConfig(section) {
    try {
        return SCAN_TOOLBAR_CONFIGS.find(c => c.section === section) ?? null;
    } catch (err) {
        ErrLog.log('[scan-toolbar-model.js]', err?.message || String(err), err?.stack || null, 'SCAN_TOOLBAR_MODEL_ERROR');
        return null;
    }
}
//# sourceMappingURL=scan-toolbar-model.js.map