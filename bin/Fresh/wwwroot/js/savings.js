// ═══════════════════════════════════════════════════════════════════════════
//  SAVINGS — log, sessions, export, total saved badge
//  + filter, select, restore from Recycle Bin
// ═══════════════════════════════════════════════════════════════════════════

import { apiFetch, fmt } from './ui-utils.js';
import { wireTable }     from './column-controls.js';
import { escHtml }       from '/lib/wb-core/utils/format.js';

export async function updateTotalSaved() {
  try {
    const data  = await apiFetch('/api/savings', {}, { timeout: 20000 });
    const total = data.reduce((a, b) => a + (b.bytes || 0), 0);
    const el = document.getElementById('totalSaved');
    if (el) el.textContent = total > 0 ? `💾 ${fmt(total)} freed` : '';
  } catch {}
}

export async function loadSavings() {
  try {
    const [data, session] = await Promise.all([
      apiFetch('/api/savings', {}, { timeout: 20000 }),
      apiFetch('/api/session', {}, { timeout: 20000 })
    ]);

    const badge = document.getElementById('sessionBadge');
    if (badge && session?.label) badge.textContent = '📋 ' + session.label;

    const total          = data.reduce((a, b) => a + (b.bytes || 0), 0);
    const sessionEntries = data.filter(e => e.session_id === session?.id);
    const sessionTotal   = sessionEntries.reduce((a, b) => a + (b.bytes || 0), 0);

    document.getElementById('savingsStats').innerHTML = `
      <div class="stat-box"><div class="val">${fmt(total)}</div>
        <div class="lbl">All-Time Freed</div></div>
      <div class="stat-box stat-accent"><div class="val">${fmt(sessionTotal)}</div>
        <div class="lbl">${session?.label || 'Current Session'}</div></div>`;

    if (!data.length) {
      document.getElementById('savingsLog').innerHTML =
        '<p class="empty-msg">No savings recorded yet. Run a scan and delete some files!</p>';
      return;
    }

    const groups = new Map();
    [...data].reverse().forEach(e => {
      const sid = e.session_id || 'legacy';
      if (!groups.has(sid)) groups.set(sid, []);
      groups.get(sid).push(e);
    });

    let html = '';
    groups.forEach((entries, sid) => {
      const isActive   = sid === session?.id;
      const groupTotal = entries.reduce((a, b) => a + (b.bytes || 0), 0);
      const label      = isActive ? (session?.label || 'Current Session') :
                         sid === 'legacy' ? 'Pre-Session History' :
                         'Session ' + sid.slice(0, 8);

      html += `
        <div class="savings-session">
          <div class="savings-session-header">
            <span class="savings-session-label ${isActive ? 'active' : 'inactive'}">
              ${isActive ? '📌 ' : ''}${label}
            </span>
            <span class="savings-badge">${fmt(groupTotal)} freed</span>
            <span class="savings-meta">${entries.length} operation${entries.length!==1?'s':''}</span>
          </div>
          <table id="savingsTable-${sid}"><thead><tr>
            <th style="width:30px"></th>
            <th>Time</th><th>Action</th><th data-sort-type="size">Freed</th><th>Path</th>
          </tr></thead><tbody>`;

      entries.forEach(e => {
        const ts   = e.ts ? new Date(e.ts).toLocaleString() : '';
        const path = e.detail || '';
        const esc  = escHtml(path);
        html += `<tr data-savings-path="${esc}">
          <td><input type="checkbox" data-path="${esc}"></td>
          <td class="td-muted">${ts}</td>
          <td><span class="badge green">${e.action || ''}</span></td>
          <td>${fmt(e.bytes || 0)}</td>
          <td class="td-path" title="${esc}">${esc}</td>
        </tr>`;
      });

      html += '</tbody></table></div>';
    });

    document.getElementById('savingsLog').innerHTML = html;

    // Wire sortable columns on each savings table
    document.querySelectorAll('#savingsLog table').forEach(t => {
      if (!t.id) t.id = 'savingsTable-' + Math.random().toString(36).slice(2, 8);
      wireTable(t);
    });
  } catch {
    document.getElementById('savingsLog').innerHTML =
      '<p class="empty-msg">⚠️ Could not load savings — backend offline?</p>';
  }
}

// ── Filter savings rows ──────────────────────────────────────
export function filterSavings() {
  const text = (document.getElementById('savingsFilter')?.value || '').toLowerCase();
  const action = document.getElementById('savingsActionFilter')?.value || '';
  const tables = document.querySelectorAll('#savingsLog table');
  let visible = 0, total = 0;

  tables.forEach(tbl => {
    tbl.querySelectorAll('tbody tr').forEach(tr => {
      total++;
      const rowText = tr.textContent.toLowerCase();
      const rowAction = tr.querySelector('.badge')?.textContent || '';
      const textMatch = !text || rowText.includes(text);
      const actionMatch = !action || rowAction === action;
      const show = textMatch && actionMatch;
      tr.style.display = show ? '' : 'none';
      if (show) visible++;
    });
  });

  const status = document.getElementById('savingsFilterStatus');
  if (status) status.textContent = text || action ? `${visible} of ${total}` : '';
}

// ── Select All / None (visible rows only) ────────────────────
export function savingsSelectAll() {
  document.querySelectorAll('#savingsLog tbody tr').forEach(tr => {
    if (tr.style.display !== 'none') {
      const cb = tr.querySelector('input[type=checkbox]');
      if (cb) cb.checked = true;
    }
  });
  _updateSelCount();
}

export function savingsSelectNone() {
  document.querySelectorAll('#savingsLog input[type=checkbox]').forEach(cb => cb.checked = false);
  _updateSelCount();
}

function _updateSelCount() {
  const checked = document.querySelectorAll('#savingsLog input[type=checkbox]:checked');
  const el = document.getElementById('savingsSelCount');
  if (el) el.textContent = checked.length ? `${checked.length} selected` : '';
}

// ── Restore selected from Recycle Bin ────────────────────────
export async function restoreSavingsSelected() {
  const checked = [...document.querySelectorAll('#savingsLog input[type=checkbox]:checked')];
  if (!checked.length) { alert('Select entries first.'); return; }

  const paths = checked.map(cb => cb.dataset.path).filter(Boolean);
  if (!paths.length) { alert('No file paths to restore.'); return; }
  if (!confirm(`Attempt to restore ${paths.length} item(s) from the Recycle Bin?\n\nNote: Only items still in the Recycle Bin can be restored.`)) return;

  const status = document.getElementById('savingsFilterStatus');
  if (status) status.textContent = `Searching Recycle Bin for ${paths.length} items…`;

  try {
    // Get recycle bin contents
    const bin = await apiFetch('/api/recycle-bin', {}, { timeout: 35000 });
    const binItems = bin.items || [];

    // Build lookup: originalPath → recyclePath
    const pathSet = new Set(paths.map(p => p.toLowerCase()));
    const matches = binItems.filter(item =>
      pathSet.has((item.originalPath || '').toLowerCase())
    );

    if (!matches.length) {
      if (status) status.textContent = '';
      alert('None of the selected items were found in the Recycle Bin.\nThey may have been permanently deleted or already restored.');
      return;
    }

    if (status) status.textContent = `Restoring ${matches.length} of ${paths.length} items…`;

    const recyclePaths = matches.map(m => m.recyclePath);
    const res = await apiFetch('/api/recycle-bin/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: recyclePaths })
    }, { timeout: 60000 });

    const notFound = paths.length - matches.length;
    let msg = `✅ Restored ${res.restored} item(s)`;
    if (notFound > 0) msg += `\n⚠️ ${notFound} not found in Recycle Bin`;
    if (res.errors?.length) msg += `\n❌ ${res.errors.length} error(s)`;
    if (status) status.textContent = '';
    alert(msg);

    // Uncheck restored rows
    checked.forEach(cb => { cb.checked = false; });
    _updateSelCount();
  } catch (e) {
    if (status) status.textContent = '';
    alert(`Restore failed: ${e.message}`);
  }
}

export async function newSession() {
  const label = prompt(
    'Start a new session? All future savings will be grouped under the new session.\n\nSession name (leave blank for auto-number):',
    ''
  );
  if (label === null) return;
  try {
    const session = await apiFetch('/api/session/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: label.trim() || null })
    });
    const badge = document.getElementById('sessionBadge');
    if (badge) badge.textContent = '📋 ' + session.label;
    await loadSavings();
  } catch {
    alert('Could not start new session — is the server running?');
  }
}

export async function exportSavings() {
  const res = await apiFetch('/api/export');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' }));
  a.download = 'disk_cleanup_export.json';
  a.click();
}

// Expose for inline onclick handlers
window.filterSavings          = filterSavings;
window.savingsSelectAll       = savingsSelectAll;
window.savingsSelectNone      = savingsSelectNone;
window.restoreSavingsSelected = restoreSavingsSelected;

// Wire checkbox change events for selection count
document.addEventListener('change', (e) => {
  if (e.target.matches('#savingsLog input[type=checkbox]')) _updateSelCount();
});
