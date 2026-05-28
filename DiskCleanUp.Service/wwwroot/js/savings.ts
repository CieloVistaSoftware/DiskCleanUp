// ═══════════════════════════════════════════════════════════════════════════
//  SAVINGS — log, sessions, export, total saved badge
//  + filter, select, restore from Recycle Bin
// ═══════════════════════════════════════════════════════════════════════════

import { apiFetch, fmt } from './ui-utils.js';
import { wireTable }     from './column-controls.js';
import { escHtml }       from '/lib/wb-core/utils/format.js';
import { ErrLog } from './error-logger.js';

export async function updateTotalSaved() {
  try {
    const data = await apiFetch('/api/savings/summary', {}, { timeout: 10000 });
    const el = document.getElementById('totalSaved');
    if (el) el.textContent = data.totalBytes > 0 ? `💾 ${fmt(data.totalBytes)} freed` : '';
  } catch (ex) {
    ErrLog.log('[SAVINGS]', ex.message, ex.stack, 'CAUGHT_ERROR');
  }
}

const _pageSize = 200;
let   _savingsOffset = 0;

export async function loadSavings() {
  _savingsOffset = 0;
  await _fetchAndRenderSavings(false);
}

async function _fetchAndRenderSavings(append: boolean) {
  try {
    const [page, session] = await Promise.all([
      apiFetch(`/api/savings?limit=${_pageSize}&offset=${_savingsOffset}`, {}, { timeout: 20000 }),
      apiFetch('/api/session', {}, { timeout: 20000 })
    ]);

    if (!append) {
      const badge = document.getElementById('sessionBadge');
      if (badge && session?.label) badge.textContent = '📋 ' + session.label;

      // Fetch summary separately for all-time totals (avoids loading all entries on first page)
      apiFetch('/api/savings/summary', {}, { timeout: 10000 }).then(summary => {
        document.getElementById('savingsStats').innerHTML = `
          <div class="stat-box"><div class="val">${fmt(summary.totalBytes)}</div>
            <div class="lbl">All-Time Freed</div></div>
          <div class="stat-box stat-accent"><div class="val">${fmt(summary.sessionBytes)}</div>
            <div class="lbl">${session?.label || 'Current Session'}</div></div>`;
      }).catch(() => {});
    }

    const data: any[] = page.entries || [];

    if (!append && !data.length) {
      document.getElementById('savingsLog').innerHTML =
        '<p class="empty-msg">No savings recorded yet. Run a scan and delete some files!</p>';
      return;
    }

    const groups = new Map();
    data.forEach(e => {
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
        const ts      = e.ts ? new Date(e.ts).toLocaleString() : '';
        const path    = e.detail || '';
        const esc     = escHtml(path);
        const isLink  = e.action === 'hardlink' || e.action === 'hardlink-xvol';
        const verifyBtn = isLink && path
          ? `<button class="btn-verify-hardlink" data-path="${esc}" title="Verify this hardlink still exists">🔗 Verify</button>`
          : '';
        html += `<tr data-savings-path="${esc}">
          <td><input type="checkbox" data-path="${esc}"></td>
          <td class="td-muted">${ts}</td>
          <td><span class="badge green">${e.action || ''}</span></td>
          <td>${fmt(e.bytes || 0)}</td>
          <td class="td-path" title="${esc}">${esc} ${verifyBtn}</td>
        </tr>`;
      });

      html += '</tbody></table></div>';
    });

    const log = document.getElementById('savingsLog');
    if (append) {
      log.querySelector('.savings-load-more')?.remove();
      log.insertAdjacentHTML('beforeend', html);
    } else {
      log.innerHTML = html;
    }

    _savingsOffset += data.length;
    const remaining = page.total - _savingsOffset;
    if (remaining > 0) {
      const btn = document.createElement('button');
      btn.className = 'btn savings-load-more';
      btn.textContent = `Load ${Math.min(remaining, _pageSize)} more (${remaining} remaining)`;
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Loading…';
        await _fetchAndRenderSavings(true);
      });
      log.append(btn);
    }

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
  const text = ((document.getElementById('savingsFilter') as HTMLInputElement | null)?.value || '').toLowerCase();
  const action = (document.getElementById('savingsActionFilter') as HTMLInputElement | null)?.value || '';
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
      (tr as HTMLElement).style.display = show ? '' : 'none';
      if (show) visible++;
    });
  });

  const status = document.getElementById('savingsFilterStatus');
  if (status) status.textContent = text || action ? `${visible} of ${total}` : '';
}

// ── Select All / None (visible rows only) ────────────────────
export function savingsSelectAll() {
  document.querySelectorAll('#savingsLog tbody tr').forEach(tr => {
    if ((tr as HTMLElement).style.display !== 'none') {
      const cb = tr.querySelector('input[type=checkbox]') as HTMLInputElement | null;
      if (cb) cb.checked = true;
    }
  });
  _updateSelCount();
}

export function savingsSelectNone() {
  document.querySelectorAll('#savingsLog input[type=checkbox]').forEach(cb => (cb as HTMLInputElement).checked = false);
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

  const paths = checked.map(cb => (cb as HTMLInputElement).dataset.path).filter(Boolean);
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
    checked.forEach(cb => { (cb as HTMLInputElement).checked = false; });
    _updateSelCount();
  } catch (e) {
    if (status) status.textContent = '';
    ErrLog.log('[SAVINGS]', e.message, e.stack, 'CAUGHT_ERROR');
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

// ── Recycle Bin audit — cross-reference savings log against current bin ──────
export async function auditBinStatus() {
  const btn = document.getElementById('binAuditBtn') as HTMLButtonElement | null;
  const status = document.getElementById('savingsFilterStatus');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Checking…'; }

  // Remove any prior audit badges
  document.querySelectorAll('#savingsLog .bin-status').forEach(el => el.remove());
  const summary = document.getElementById('binAuditSummary');
  if (summary) summary.remove();

  try {
    const bin = await apiFetch('/api/recycle-bin', {}, { timeout: 35000 });
    const binPaths = new Set(
      (bin.items || []).map((item: any) => (item.originalPath || '').toLowerCase())
    );

    let trashTotal = 0, inBin = 0;
    document.querySelectorAll('#savingsLog tbody tr').forEach(tr => {
      const badge = tr.querySelector('.badge');
      if (!badge) return;
      const action = badge.textContent?.trim() || '';
      if (action !== 'trash') return;

      trashTotal++;
      const path = (tr as HTMLElement).dataset.savingsPath || '';
      const inRecycleBin = binPaths.has(path.toLowerCase());
      if (inRecycleBin) inBin++;

      const pill = document.createElement('span');
      pill.className = `bin-status bin-status-${inRecycleBin ? 'in' : 'gone'}`;
      pill.title = inRecycleBin
        ? 'Still in Recycle Bin — space not yet reclaimed'
        : 'No longer in Recycle Bin — space has been reclaimed';
      pill.textContent = inRecycleBin ? '♻️ in bin' : '✅ reclaimed';
      tr.querySelector('td.td-path')?.append(pill);
    });

    const log = document.getElementById('savingsLog');
    if (log && trashTotal > 0) {
      const div = document.createElement('div');
      div.id = 'binAuditSummary';
      div.className = 'bin-audit-summary';
      const gone = trashTotal - inBin;
      div.innerHTML = inBin > 0
        ? `⚠️ <strong>${inBin} of ${trashTotal}</strong> trashed files still in Recycle Bin — disk space not yet reclaimed. Empty the bin to reclaim <em>estimated</em> space.`
        : `✅ All ${trashTotal} trashed files have been purged from the Recycle Bin — disk space fully reclaimed.`;
      log.prepend(div);
    }

    if (status && trashTotal === 0) status.textContent = 'No trash entries in visible rows.';
  } catch (e) {
    ErrLog.log('[SAVINGS]', e.message, e.stack, 'CAUGHT_ERROR');
    if (status) status.textContent = '⚠️ Bin audit failed';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🗑 Bin Status'; }
  }
}

// Expose for inline onclick handlers
window.filterSavings          = filterSavings;
window.savingsSelectAll       = savingsSelectAll;
window.savingsSelectNone      = savingsSelectNone;
window.restoreSavingsSelected = restoreSavingsSelected;
window.auditBinStatus         = auditBinStatus;

// Wire checkbox change events for selection count
document.addEventListener('change', (e) => {
  if ((e.target as Element).matches('#savingsLog input[type=checkbox]')) _updateSelCount();
});

// ── Hardlink verify (delegated click on .btn-verify-hardlink) ────────────────
document.addEventListener('click', async (e) => {
  const btn = (e.target as Element).closest('.btn-verify-hardlink') as HTMLButtonElement | null;
  if (!btn) return;
  const path = btn.dataset.path;
  if (!path) return;

  btn.disabled = true;
  btn.textContent = '⏳';

  // Remove any existing result bubble on this row
  const row = btn.closest('tr');
  row?.querySelector('.hl-verify-result')?.remove();

  try {
    const res = await apiFetch(`/api/hardlink/info?path=${encodeURIComponent(path)}`, {}, { timeout: 8000 });
    const bubble = document.createElement('span');
    bubble.className = 'hl-verify-result';

    if (res.isHardlinked) {
      const others = (res.links as string[]).filter(l => l.toLowerCase() !== path.toLowerCase());
      bubble.className += ' hl-ok';
      bubble.innerHTML = `✅ Hardlinked · ${res.linkCount} paths share this data`
        + (others.length ? `<ul>${others.map(l => `<li>${escHtml(l)}</li>`).join('')}</ul>` : '');
    } else if (res.linkCount === 1) {
      bubble.className += ' hl-warn';
      bubble.textContent = '⚠️ Only 1 path — hardlink may have been deleted';
    } else {
      bubble.className += ' hl-warn';
      bubble.textContent = '⚠️ Could not read hardlink info';
    }

    btn.after(bubble);
    btn.textContent = '🔗 Verify';
    btn.disabled = false;
  } catch {
    btn.textContent = '⚠ Error';
    btn.disabled = false;
  }
});
