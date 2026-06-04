// ═══════════════════════════════════════════════════════════════════════════
//  TABLE UTILITIES — skeleton, ensure, append, row index, clear
// ═══════════════════════════════════════════════════════════════════════════

import { makeColumnsResizable, makeColumnsSortable } from './column-controls.js';
import { ErrLog } from './error-logger.js';

const _sectionTbodies: Record<string, HTMLTableSectionElement> = {};

// Per-section row index maps: section → hash → [tr elements]
// Eliminates querySelectorAll('[data-hash=...]') on every result_update (O(n²) otherwise)
const _rowIndex: Record<string, Map<string, HTMLElement[]>> = {};

export function indexRows(section: string, hash: string, rows: HTMLElement[]) {
  try {
    if (!_rowIndex[section]) _rowIndex[section] = new Map();
    _rowIndex[section].set(hash, rows);
  } catch (err) { ErrLog.log('[table-utils]', String(err), null, 'TABLE_ERROR'); }
}

export function removeIndexedRows(section: string, hash: string) {
  try {
    const map = _rowIndex[section];
    if (!map) return;
    const rows = map.get(hash);
    if (rows) { rows.forEach(r => r.remove()); map.delete(hash); }
  } catch (err) { ErrLog.log('[table-utils]', String(err), null, 'TABLE_ERROR'); }
}

export function clearIndex(section: string) {
  try {
    delete _rowIndex[section];
  } catch (err) { ErrLog.log('[table-utils]', String(err), null, 'TABLE_ERROR'); }
}

export function clearSection(section: string) {
  try {
    delete _sectionTbodies[section];
    clearIndex(section);
  } catch (err) { ErrLog.log('[table-utils]', String(err), null, 'TABLE_ERROR'); }
}

export function ensureTable(section: string, containerId: string, tableId: string, headerHTML: string) {
  try {
    if (_sectionTbodies[section]) return _sectionTbodies[section];

    // Skeleton may already have built the table shell — reuse it, strip skeleton rows
    let tbl = document.getElementById(tableId) as HTMLTableElement | null;
    if (tbl) {
      const tbody = tbl.querySelector('tbody') as HTMLTableSectionElement;
      tbody.querySelectorAll('.skel-row').forEach(r => r.remove());
      _sectionTbodies[section] = tbody;
      return tbody;
    }

    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = `<table id="${tableId}">${headerHTML}<tbody></tbody></table>`;
    }
    _sectionTbodies[section] = document.querySelector(`#${tableId} tbody`) as HTMLTableSectionElement;
    tbl = document.getElementById(tableId) as HTMLTableElement | null;
    if (tbl) requestAnimationFrame(() => { makeColumnsResizable(tbl); makeColumnsSortable(tbl); });
    return _sectionTbodies[section];
  } catch (err) { ErrLog.log('[table-utils]', String(err), null, 'TABLE_ERROR'); return null as any; }
}

export function appendRow(tbody: HTMLTableSectionElement, html: string) {
  try {
    const tmp = document.createElement('tbody');
    tmp.innerHTML = html;
    [...tmp.children].forEach(tr => {
      (tr as HTMLElement).classList.add('live-row');
      const cells = tr.querySelectorAll('td');
      let path = '';
      for (let i = 0; i < cells.length; i++) {
        const text = cells[i].textContent || '';
        if (text.match(/\\|\//) && text.length > 3) {
          path = text.trim();
          break;
        }
      }
      if (path) {
        const openBtn = document.createElement('button');
        openBtn.textContent = 'Open';
        openBtn.className = 'btn muted';
        openBtn.classList.add('btn-inline');
        openBtn.onclick = () => window.openInVSCode(path);
        if (cells.length) cells[cells.length - 1].appendChild(openBtn);
      }
      tbody.appendChild(tr as HTMLElement);
    });
  } catch (err) { ErrLog.log('[table-utils]', String(err), null, 'TABLE_ERROR'); }
}

/** Remove all skeleton elements from a section container — call on 'done' */
export function removeSkeletons(containerId: string) {
  try {
    const c = document.getElementById(containerId);
    if (!c) return;
    c.querySelectorAll('.skel-row').forEach(r => r.remove());
    c.querySelectorAll('.skel-grid').forEach(r => r.remove());
    c.querySelectorAll('.skel-card').forEach(r => r.remove());
    c.querySelectorAll('.skel-bar').forEach(r => r.remove());
  } catch (err) { ErrLog.log('[table-utils]', String(err), null, 'TABLE_ERROR'); }
}

// Paints the table shell + 4 pulsing skeleton rows immediately on 'started'
export function showSkeleton(section: string, containerId: string, tableId: string, headerHTML: string, colCount: number) {
  try {
    if (_sectionTbodies[section]) return;
    const skelCols = Array.from({length: colCount}, (_, i) =>
      `<td><span class="skel-bar skel-w-${i % 6}"></span></td>`
    ).join('');
    const skelRows = Array.from({length: 4}, () =>
      `<tr class="skel-row">${skelCols}</tr>`
    ).join('');
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = `<table id="${tableId}">${headerHTML}<tbody>${skelRows}</tbody></table>`;
    }
    const tbl = document.getElementById(tableId) as HTMLTableElement | null;
    if (tbl) requestAnimationFrame(() => { makeColumnsResizable(tbl); makeColumnsSortable(tbl); });
  } catch (err) { ErrLog.log('[table-utils]', String(err), null, 'TABLE_ERROR'); }
}
