import { fmtBytes, escHtml as esc } from '/lib/wb-core/utils/format.js';
import { ErrLog } from './error-logger.js';
/**
 * task-manager.js — Running Tasks view with safety classification
 *
 * Safety tiers (based on Microsoft docs + research):
 *   🔴 CRITICAL  — OS core processes. Killing = BSOD or system crash.
 *   🟡 CAUTION   — System services, drivers, AV. Killing may break functionality.
 *   🟢 SAFE      — User applications. Safe to terminate.
 *
 * Sources:
 *   - Microsoft Learn: Critical System Services
 *     (smss, csrss, wininit, logonui, lsass, services, winlogon, System, svchost w/ RPCSS)
 *   - Windows Internals: Protected Process Light (PPL) list
 *   - MakeUseOf: 9 Windows Processes You Can End Safely
 */
// ─── SAFETY DATABASE ────────────────────────────────────────────────
// Process names (lowercase, no .exe) → tier
const CRITICAL = new Set([
    'system', 'system idle process', 'registry', 'smss', 'csrss',
    'wininit', 'winlogon', 'services', 'lsass', 'lsaiso',
    'logonui', 'dwm', 'fontdrvhost', 'ntoskrnl', 'memory compression',
    'secure system', 'wslservice'
]);
const CAUTION_EXACT = new Set([
    'svchost', 'spoolsv', 'wuauserv', 'audiodg', 'conhost',
    'dashost', 'dllhost', 'lsm', 'msdtc', 'taskhostw',
    'sihost', 'ctfmon', 'explorer', 'shellexperiencehost',
    'startmenuexperiencehost', 'searchhost', 'searchindexer',
    'searchprotocolhost', 'runtimebroker', 'applicationframehost',
    'textinputhost', 'wmiprvse', 'wlanext', 'sppsvc',
    'securityhealthservice', 'securityhealthsystray',
    'msmpeng', 'nissrv', 'mpcmdrun', // Windows Defender
    'smartscreen', 'sgrmbroker', 'sgrmagent',
    'trustedinstaller', 'tiworker', 'wuauclt',
    'taskmgr', // Task Manager itself
    'windefend', 'wscsvc',
    'com surrogate', 'microsoftedgeupdate',
    'windowsinternal.composableshell.experiences.textinput.inputapp',
    'lockapp', 'widgetservice', 'widgets'
]);
// Pattern-based caution (startsWith or includes)
const CAUTION_PATTERNS = [
    'nvidia', // GPU drivers
    'amd', // GPU/CPU drivers
    'intel', // Intel services
    'realtek', // Audio drivers
    'razer', // Peripheral drivers
    'corsair', // Peripheral drivers
    'logitech', // Peripheral drivers
    'wacom', // Tablet drivers
    'msi', // MSI services
    'asus', // ASUS services
    'hp', // HP services
    'dell', // Dell services
    'lenovo', // Lenovo services
];
// Company names that indicate system/driver level
const CAUTION_COMPANIES = [
    'microsoft corporation',
    'microsoft windows',
    'nvidia',
    'amd',
    'intel',
    'realtek',
];
// Known safe user apps (always green regardless of company)
const SAFE_APPS = new Set([
    'chrome', 'firefox', 'msedge', 'brave', 'opera', 'vivaldi',
    'code', 'code - insiders', 'devenv',
    'notepad', 'notepad++', 'sublime_text', 'atom',
    'slack', 'discord', 'teams', 'zoom', 'skype',
    'spotify', 'vlc', 'wmplayer', 'foobar2000',
    'winword', 'excel', 'powerpnt', 'outlook', 'onenote', 'msteams',
    'gimp', 'photoshop', 'illustrator', 'figma',
    'obs64', 'obs32', 'streamlabs obs',
    'steam', 'epicgameslauncher', 'origin',
    'windowsterminal', 'wt', 'pwsh', 'powershell',
    'cmd',
    'postman', 'insomnia',
    'git', 'node', 'python', 'dotnet', 'java', 'javaw',
    'filezilla', 'winscp', 'putty',
    '7zfm', 'winrar', 'peazip',
    'acrobat', 'foxitreader', 'sumatrapdf',
    'calculator', 'mspaint', 'snippingtool', 'screenclippinghost',
    'everything', 'listary',
    'diskcleanup', 'diskcleanuplauncher',
    'ditto', 'sharex', 'greenshot',
    'thunderbird',
    'wordpad', 'write',
    'calibre', 'kindle',
    'docker desktop', 'docker',
    'playwright', 'npx',
]);
/**
 * Classify a process into a safety tier.
 * @returns {'critical'|'caution'|'safe'}
 */
function classify(proc) {
    const name = (proc.name || '').toLowerCase();
    const path = (proc.path || '').toLowerCase();
    const company = (proc.company || '').toLowerCase();
    // 1. Critical OS processes — never kill
    if (CRITICAL.has(name))
        return 'critical';
    if (proc.pid <= 4)
        return 'critical'; // System + System Idle
    // 2. Known safe user apps — always safe
    if (SAFE_APPS.has(name))
        return 'safe';
    // 3. svchost is always caution (hosts OS services)
    if (name === 'svchost')
        return 'caution';
    // 4. Exact caution matches
    if (CAUTION_EXACT.has(name))
        return 'caution';
    // 5. Pattern-based caution (drivers, GPU, peripherals)
    for (const pat of CAUTION_PATTERNS) {
        if (name.includes(pat))
            return 'caution';
    }
    // 6. Paths in Windows\System32 or Windows\SysWOW64 → caution
    if (path.includes('\\windows\\system32') || path.includes('\\windows\\syswow64')) {
        return 'caution';
    }
    // 7. Microsoft company but NOT in safe apps → caution
    for (const co of CAUTION_COMPANIES) {
        if (company.includes(co))
            return 'caution';
    }
    // 8. No path at all (system-level, can't inspect) → caution
    if (!path)
        return 'caution';
    // 9. Everything else → safe (user-land applications)
    return 'safe';
}
// ─── FORMATTING HELPERS ──────────────────────────────────────────
// fmtBytes and esc (escHtml) imported from wb-core at top of file
const fmtMem = fmtBytes; // alias for readability in this module
const BADGE = {
    critical: '<span class="task-badge task-critical" title="CRITICAL — do NOT kill, causes BSOD">🔴</span>',
    caution: '<span class="task-badge task-caution" title="CAUTION — system service, may break functionality">🟡</span>',
    safe: '<span class="task-badge task-safe" title="SAFE — user application, ok to kill">🟢</span>',
};
// ─── DASHBOARD BROWSER DETECTION ────────────────────────────────
// Protects only the specific browser process whose MainWindowTitle
// matches this dashboard page. Single PID — won't over-protect.
let _dashboardPid = null;
function _detectDashboardBrowser(procs) {
    _dashboardPid = null;
    const pageTitle = document.title.toLowerCase();
    for (const p of procs) {
        const procTitle = (p.title || '').toLowerCase();
        if (!procTitle)
            continue;
        if (procTitle.includes(pageTitle) || pageTitle.includes(procTitle)) {
            _dashboardPid = p.pid;
            break;
        }
    }
}
function _isDashboardBrowser(proc) {
    return _dashboardPid !== null && proc.pid === _dashboardPid;
}
// ─── WINDOW TITLE PROTECTION ───────────────────────────────
// Multi-process apps (Edge, Chrome, VS Code, etc.) have one process
// with a visible window title and many child workers (renderers, GPU,
// extension hosts). Killing a child crashes the whole app.
//
// Rule: if a process has NO window title AND shares a name with another
// process that DOES have a title, it’s a child worker. Mark it with a
// ⚠️ warning so the user knows killing it will crash the parent app.
const _windowApps = new Map(); // processName → Set of window titles
function _detectWindowApps(procs) {
    _windowApps.clear();
    for (const p of procs) {
        const title = (p.title || '').trim();
        if (!title)
            continue;
        const name = (p.name || '').toLowerCase();
        if (!_windowApps.has(name))
            _windowApps.set(name, new Set());
        _windowApps.get(name).add(title);
    }
}
// Returns the window title of the parent app if this is a titleless child
// worker, or null if this process is standalone or has its own title.
function _getParentAppTitle(proc) {
    const title = (proc.title || '').trim();
    if (title)
        return null; // has its own title — not a hidden child
    const name = (proc.name || '').toLowerCase();
    const titles = _windowApps.get(name);
    if (!titles || titles.size === 0)
        return null;
    // Return first title as representative
    return titles.values().next().value;
}
// ─── TASK MANAGER MODULE ────────────────────────────────────────
let _allProcs = [];
let _displayed = [];
const _el = {
    get result() { return document.getElementById('taskResult'); },
    get filter() { return document.getElementById('taskFilter'); },
    get safety() { return document.getElementById('taskSafetyFilter'); },
    get count() { return document.getElementById('taskCount'); },
};
async function load() {
    const container = _el.result;
    if (!container)
        return;
    container.innerHTML = '<div style="color:var(--muted);padding:12px">Loading processes…</div>';
    try {
        const r = await fetch('/api/tasks');
        const data = await r.json();
        const rawProcs = data.processes || [];
        _detectDashboardBrowser(rawProcs);
        _detectWindowApps(rawProcs);
        _allProcs = rawProcs.map(p => ({
            ...p,
            tier: classify(p),
            _memNum: p.memory || 0,
        }));
        // Sort: safe first, then caution, then critical; within tier sort by memory desc
        _allProcs.sort((a, b) => {
            const tierOrder = { safe: 0, caution: 1, critical: 2 };
            const td = tierOrder[a.tier] - tierOrder[b.tier];
            if (td !== 0)
                return td;
            return b._memNum - a._memNum;
        });
        render();
    }
    catch (e) {
        ErrLog.log('[TASK_MANAGER]', e.message, e.stack, 'CAUGHT_ERROR');
        container.innerHTML = `<div style="color:#f85149;padding:12px">Failed to load: ${e.message}</div>`;
    }
}
function render() {
    const container = _el.result;
    if (!container)
        return;
    const textFilter = (_el.filter?.value || '').toLowerCase();
    const safetyFilter = _el.safety?.value || '';
    _displayed = _allProcs.filter(p => {
        // Safety filter
        if (safetyFilter && p.tier !== safetyFilter)
            return false;
        // Text filter
        if (textFilter) {
            const haystack = `${p.name} ${p.path} ${p.company} ${p.description} ${p.title} ${p.pid}`.toLowerCase();
            if (!haystack.includes(textFilter))
                return false;
        }
        return true;
    });
    // Stats
    const safeCount = _displayed.filter(p => p.tier === 'safe').length;
    const cautionCount = _displayed.filter(p => p.tier === 'caution').length;
    const critCount = _displayed.filter(p => p.tier === 'critical').length;
    const totalMem = _displayed.reduce((s, p) => s + p._memNum, 0);
    _el.count.textContent = `${_displayed.length} of ${_allProcs.length} processes | ${fmtMem(totalMem)} | 🟢 ${safeCount}  🟡 ${cautionCount}  🔴 ${critCount}`;
    // Build table
    let html = `<table class="task-table">
    <thead><tr>
      <th class="task-th-cb"><input type="checkbox" id="taskSelectAll" onchange="window._taskMgr?.toggleAll(this.checked)"></th>
      <th class="task-th-safety">⚡</th>
      <th class="task-th-pid">PID</th>
      <th class="task-th-name">Name</th>
      <th class="task-th-title">Window Title</th>
      <th class="task-th-mem">Memory</th>
      <th class="task-th-threads">Threads</th>
      <th class="task-th-company">Company</th>
      <th class="task-th-desc">Description</th>
      <th class="task-th-path">Path</th>
    </tr></thead><tbody>`;
    for (const p of _displayed) {
        const isCrit = p.tier === 'critical';
        const isActiveBrowser = _isDashboardBrowser(p);
        const parentApp = _getParentAppTitle(p);
        const rowClass = `task-row task-row-${p.tier}${isActiveBrowser ? ' task-row-active-browser' : ''}${parentApp ? ' task-row-child-worker' : ''}`;
        const disabled = (isCrit || isActiveBrowser) ? 'disabled' : '';
        const shortPath = p.path ? p.path.replace(/^C:\\Windows\\System32\\/i, 'System32\\').replace(/^C:\\Windows\\SysWOW64\\/i, 'SysWOW64\\') : '';
        // Build name badge
        let nameBadge = '';
        if (isActiveBrowser) {
            nameBadge = ` <span class="task-browser-warn" title="Dashboard browser">\u26a0\ufe0f DASHBOARD</span>`;
        }
        else if (parentApp) {
            nameBadge = ` <span class="task-child-warn" title="Child of: ${esc(parentApp)}">\u2191 ${esc(parentApp)}</span>`;
        }
        html += `<tr class="${rowClass}" data-pid="${p.pid}" data-tier="${p.tier}">
      <td><input type="checkbox" class="task-cb" data-pid="${p.pid}" ${disabled}></td>
      <td>${BADGE[p.tier]}</td>
      <td class="task-pid">${p.pid}</td>
      <td class="task-name" title="${esc(p.name)}">${esc(p.name)}${isActiveBrowser ? ' <span class="task-browser-warn" title="This is your dashboard browser — killing it closes this page!">⚠️ DASHBOARD</span>' : ''}</td>
      <td class="task-title" title="${esc(p.title)}">${esc(p.title)}</td>
      <td class="task-mem">${fmtMem(p._memNum)}</td>
      <td class="task-threads">${p.threads}</td>
      <td class="task-company" title="${esc(p.company)}">${esc(p.company)}</td>
      <td class="task-desc" title="${esc(p.description)}">${esc(p.description)}</td>
      <td class="task-path" title="${esc(p.path)}">${esc(shortPath)}</td>
    </tr>`;
    }
    html += '</tbody></table>';
    container.innerHTML = html;
    // Row click → focus that process's window (skip clicks on checkboxes)
    container.querySelectorAll('tr.task-row[data-pid]').forEach(row => {
        const pid = +(row.dataset.pid ?? 0);
        const proc = _displayed.find(p => p.pid === pid);
        if (!proc?.title)
            return;
        row.style.cursor = 'pointer';
        row.addEventListener('click', (e) => {
            if (e.target.tagName === 'INPUT')
                return;
            void focusWindow(pid);
        });
    });
}
async function focusWindow(pid) {
    try {
        const r = await fetch('/api/tasks/focus', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pid }),
        });
        const d = await r.json();
        if (!d.ok && d.reason !== 'no-window') {
            ErrLog.log('[TASK_MANAGER]', d.error || 'focus failed', '', 'CAUGHT_ERROR');
        }
    }
    catch (e) {
        ErrLog.log('[TASK_MANAGER]', e.message, e.stack, 'CAUGHT_ERROR');
    }
}
// esc is now imported from wb-core as escHtml
function filter() { render(); }
function toggleAll(checked) {
    document.querySelectorAll('.task-cb:not(:disabled)').forEach(cb => { cb.checked = checked; });
}
async function killSelected() {
    const allChecked = [...document.querySelectorAll('.task-cb:checked')].map(cb => +cb.dataset.pid);
    // Double-check: never kill dashboard browser processes even if somehow checked
    const pids = allChecked.filter(pid => {
        const p = _allProcs.find(x => x.pid === pid);
        return p ? !_isDashboardBrowser(p) : true;
    });
    if (!pids.length)
        return;
    const names = pids.map(pid => {
        const p = _allProcs.find(x => x.pid === pid);
        return p ? `${p.name} (${pid})` : `PID ${pid}`;
    });
    // Warn about multi-process apps that could crash
    const byName = new Map();
    for (const pid of pids) {
        const p = _allProcs.find(x => x.pid === pid);
        if (!p)
            continue;
        const n = p.name.toLowerCase();
        byName.set(n, (byName.get(n) || 0) + 1);
    }
    const warnings = [];
    for (const [name, count] of byName) {
        if (count >= 3 && SAFE_APPS.has(name)) {
            warnings.push(`${count}x ${name} (may crash the app)`);
        }
    }
    const warnStr = warnings.length ? `\n\n\u26a0\ufe0f WARNING:\n${warnings.join('\n')}` : '';
    if (!confirm(`Kill ${pids.length} process(es)?\n\n${names.join('\n')}${warnStr}`))
        return;
    let killed = 0, errors = [], totalFreed = 0;
    for (const pid of pids) {
        try {
            const r = await fetch('/api/tasks/kill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pid })
            });
            const d = await r.json();
            if (d.ok) {
                killed++;
                totalFreed += d.memoryFreed || 0;
            }
            else
                errors.push(d.error || `PID ${pid} failed`);
        }
        catch (e) {
            ErrLog.log('[TASK_MANAGER]', e.message, e.stack, 'CAUGHT_ERROR');
            errors.push(`PID ${pid}: ${e.message}`);
        }
    }
    // Flash result with memory freed
    const freedStr = totalFreed > 0 ? ` | ${fmtMem(totalFreed)} freed` : '';
    const msg = errors.length
        ? `Killed ${killed}, ${errors.length} failed: ${errors[0]}${freedStr}`
        : `Killed ${killed} process(es)${freedStr}`;
    _el.count.textContent = msg;
    // Refresh after 500ms
    setTimeout(load, 500);
}
// ─── EXPORTS ─────────────────────────────────────────────────────
window._taskMgr = { load, filter, killSelected, toggleAll };
export { load as loadTasks };
//# sourceMappingURL=task-manager.js.map