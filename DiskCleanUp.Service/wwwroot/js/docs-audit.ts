// ═══════════════════════════════════════════════════════════════════════════
//  DOCS AUDIT — orphaned docs report card (#43/#44)
// ═══════════════════════════════════════════════════════════════════════════

import { apiFetch } from './ui-utils.js';
import { ErrLog }   from './error-logger.js';

export async function loadDocsAudit(): Promise<void> {
  const summary = document.getElementById('docsAuditSummary');
  const list    = document.getElementById('docsAuditList');
  if (!summary || !list) return;

  summary.innerHTML = '<span class="muted">Loading…</span>';
  list.innerHTML    = '';

  try {
    const data = await apiFetch('/api/docs-audit', {}, { timeout: 10000 });
    const orphans: { path: string; exists: boolean }[] = data.orphans || [];
    const count  = data.count  ?? orphans.length;
    const source = data.source ?? '';

    summary.innerHTML = `
      <div class="docs-audit-header">
        <span class="docs-audit-badge ${count > 0 ? 'has-orphans' : 'no-orphans'}">
          ${count > 0 ? `⚠️ ${count} orphaned doc${count !== 1 ? 's' : ''}` : '✅ No orphans'}
        </span>
        ${source ? `<span class="docs-audit-source muted">Source: ${escHtml(source)}</span>` : ''}
      </div>`;

    if (orphans.length === 0) {
      list.innerHTML = '<p class="muted docs-audit-empty">No orphaned documents found.</p>';
      return;
    }

    list.innerHTML = orphans.map(o => `
      <div class="docs-audit-row ${o.exists ? 'row-exists' : 'row-gone'}">
        <span class="docs-audit-icon">${o.exists ? '📄' : '🗑'}</span>
        <span class="docs-audit-path" title="${escHtml(o.path)}">${escHtml(o.path)}</span>
        <span class="docs-audit-status">${o.exists ? 'exists' : 'already gone'}</span>
      </div>`).join('');
  } catch (ex: any) {
    summary.innerHTML = '<span class="docs-audit-error">⚠️ Failed to load audit data</span>';
    ErrLog.log('[DOCS-AUDIT]', ex.message, ex.stack, 'CAUGHT_ERROR');
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.loadDocsAudit = loadDocsAudit;
