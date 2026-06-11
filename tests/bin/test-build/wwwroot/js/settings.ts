// ═══════════════════════════════════════════════════════════════════════════
//  SETTINGS — load / save configuration via REST
// ═══════════════════════════════════════════════════════════════════════════

import { apiFetch } from './ui-utils.js';
import { ErrLog } from './error-logger.js';

function _wireFolderChoices(input: HTMLInputElement | null, listId = 'folderChoicesList') {
  if (!input || (input as any).dataset.folderChoicesWired) return;
  const list = document.getElementById(listId) as HTMLDataListElement | null;
  if (!list) return;

  (input as any).dataset.folderChoicesWired = '1';
  let timer: number | null = null;

  const refresh = async () => {
    try {
      const current = (input.value || '').trim();
      const res: any = await apiFetch(`/api/folder-choices?path=${encodeURIComponent(current)}`);
      const choices = Array.isArray(res?.choices) ? res.choices : [];
      list.innerHTML = '';
      for (const p of choices) {
        const opt = document.createElement('option');
        opt.value = p;
        list.appendChild(opt);
      }
    } catch {}
  };

  input.addEventListener('focus', refresh);
  input.addEventListener('input', () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(refresh, 120);
  });
}

export async function loadSettings() {
  try {
    const cfg = await apiFetch('/api/config');
    document.getElementById('cfgRoot').value          = cfg.root || '';
    _wireFolderChoices(document.getElementById('cfgRoot') as HTMLInputElement | null);
    document.getElementById('cfgExtraRoots').value    = (cfg.extra_roots || cfg.extraRoots || []).join('\n');
    document.getElementById('cfgStaleDays').value     = cfg.stale_days || cfg.staleDays || 90;
    document.getElementById('cfgLargeMb').value       = cfg.large_file_mb || cfg.largeFileMb || 50;
    document.getElementById('cfgParallelism').value   = cfg.max_parallelism || cfg.maxParallelism || 4;
    document.getElementById('rootDisplay').textContent = cfg.root || '';
    _wireRootEditable();
    const _rb = document.getElementById('rootOpenBtn');
    if (_rb) _rb.style.display = cfg.root ? '' : 'none';
    // Trace toggle (localStorage, not server config)
    const traceEl = document.getElementById('cfgTrace');
    if (traceEl) traceEl.checked = localStorage.getItem('dcu_trace') !== 'false';
  } catch {
    document.getElementById('cfgStaleDays').value     = 90;
    document.getElementById('cfgLargeMb').value       = 50;
    document.getElementById('cfgParallelism').value   = 4;
    document.getElementById('rootDisplay').textContent = '⚠️ Offline';
  }
}

export async function saveSettings() {
  const cfg = {
    root:            document.getElementById('cfgRoot').value.trim(),
    extra_roots:     document.getElementById('cfgExtraRoots').value.split('\n').map(s => s.trim()).filter(Boolean),
    stale_days:      parseInt(document.getElementById('cfgStaleDays').value) || 90,
    large_file_mb:   parseInt(document.getElementById('cfgLargeMb').value) || 50,
    max_parallelism: parseInt(document.getElementById('cfgParallelism').value) || 4,
  };
  await apiFetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg)
  });
  const msg = document.getElementById('settingsMsg');
  if (msg) { msg.textContent = '✅ Saved!'; setTimeout(() => msg.textContent = '', 2500); }
  document.getElementById('rootDisplay').textContent = cfg.root;
  const _rb2 = document.getElementById('rootOpenBtn');
  if (_rb2) _rb2.style.display = cfg.root ? '' : 'none';
  // Save trace toggle to localStorage (takes effect on next page load)
  const traceEl = document.getElementById('cfgTrace');
  if (traceEl) localStorage.setItem('dcu_trace', traceEl.checked ? 'true' : 'false');
}

// ── Inline root editor — click #rootDisplay to edit, Enter/blur to save ──
function _wireRootEditable() {
  const display = document.getElementById('rootDisplay') as HTMLElement | null;
  const input   = document.getElementById('rootEditInput') as HTMLInputElement | null;
  if (!display || !input || (display as any).dataset.wired) return;
  (display as any).dataset.wired = '1';

  display.addEventListener('click', () => {
    input.value = display.textContent?.trim() || '';
    _wireFolderChoices(input);
    display.classList.add('hidden');
    input.classList.remove('hidden');
    input.focus();
    input.select();
  });

  const _commit = async () => {
    const newRoot = input.value.trim();
    input.classList.add('hidden');
    display.classList.remove('hidden');
    if (!newRoot || newRoot === display.textContent?.trim()) return;
    try {
      const cfg: any = await apiFetch('/api/config');
      cfg.root = newRoot;
      await apiFetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg)
      });
      display.textContent = newRoot;
      const cfgRootEl = document.getElementById('cfgRoot') as HTMLInputElement | null;
      if (cfgRootEl) cfgRootEl.value = newRoot;
      const rootOpenBtn = document.getElementById('rootOpenBtn') as HTMLElement | null;
      if (rootOpenBtn) rootOpenBtn.style.display = newRoot ? '' : 'none';
      window._T?.('SETTINGS', 'Root changed via header: ' + newRoot);
    } catch (e: any) {
      display.textContent = '⚠️ Save failed';
      setTimeout(() => loadSettings(), 1500);
    }
  };

  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter')  { e.preventDefault(); _commit(); }
    if (e.key === 'Escape') { input.classList.add('hidden'); display.classList.remove('hidden'); }
  });
  input.addEventListener('blur', _commit);
}

// ── Settings help panel — fetch markdown, render with marked.js ──
export async function loadSettingsHelp() {
  const el = document.getElementById('settingsHelp');
  if (!el) return;
  try {
    const res = await fetch('/settings-help.md', { cache: 'no-store' });
    if (!res.ok) { el.textContent = '(help file not found)'; return; }
    const md = await res.text();
    // marked.js loaded via CDN <script> tag — available as window.marked
    if (typeof marked !== 'undefined' && marked.parse) {
      el.innerHTML = marked.parse(md);
    } else {
      // Fallback: render as preformatted text
      el.innerHTML = '<pre style="white-space:pre-wrap">' + md.replace(/</g,'&lt;') + '</pre>';
    }
  } catch (e) {
    el.textContent = '(failed to load help: ' + e.message + ')';
  
  ErrLog.log('[SETTINGS]', e.message, e.stack, 'CAUGHT_ERROR');
}
}

// Kick off help load when settings module loads
loadSettingsHelp();
