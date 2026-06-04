import { ErrLog } from '../js/error-logger.js';
// ═══════════════════════════════════════════════════════════════════════════
//  SCAN TOOLBAR MODEL — pure config, no DOM, no state, no side effects.
//
//  ONE-TIME-ONE-PLACE: this is the single authoritative definition of what
//  every scan toolbar contains and what specialty additions each section adds.
//
//  Minimum Common Denominator (MCD) buttons — present on every section:
//    scan-filter-bar | Scan | Cancel | Select All | Select None |
//    Delete Selected | Keep Selected | Load More
//
//  Specialty keys (added on top of MCD only where needed):
//    'delete-all-copies'  — Duplicates, Images
//    'apply-all'          — Smart Dedup
//    'html-utilities'     — HTML Files
//    'full-view'          — Tiny Files
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {object} ScanToolbarConfig
 * @property {string}   section   — section key (e.g. 'stale', 'tiny-files')
 * @property {string}   tableId   — grid/table ID for Select All/None/Delete
 * @property {string[]} specialty — specialty button keys to add after MCD
 */

/** @type {ScanToolbarConfig[]} */
export const SCAN_TOOLBAR_CONFIGS = [
  { section: 'duplicates',   tableId: 'dupTable',     specialty: ['delete-all-copies', 'white-bg'] },
  { section: 'smart-dedup',  tableId: 'smartTable',   specialty: ['apply-all']         },
  { section: 'stale',        tableId: 'staleTable',   specialty: []                    },
  { section: 'large',        tableId: 'largeTable',   specialty: []                    },
  { section: 'node-modules', tableId: 'nmTable',      specialty: []                    },
  { section: 'venvs',        tableId: 'venvTable',    specialty: []                    },
  { section: 'empty',        tableId: 'emptyTable',   specialty: []                    },
  { section: 'images',       tableId: 'imageTable',   specialty: ['delete-all-copies', 'white-bg'] },
  { section: 'backups',      tableId: 'backupsTable', specialty: []                    },
  { section: 'tiny-files',   tableId: 'tinyTable',    specialty: ['full-view']         },
  { section: 'html-files',   tableId: 'htmlTable',    specialty: ['html-utilities']    },
  { section: 'css-files',    tableId: 'cssTable',     specialty: []                    },
];

/**
 * Look up config for a section. Returns null if section not registered.
 * @param {string} section
 * @returns {ScanToolbarConfig|null}
 */
export function getToolbarConfig(section) {
  return SCAN_TOOLBAR_CONFIGS.find(c => c.section === section) ?? null;
}
