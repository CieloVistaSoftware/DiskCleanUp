import { ErrLog } from './error-logger.js';
// ═══════════════════════════════════════════════════════════════════════════
//  METRICS — System-wide CPU & MEM mini-graphs, updated via WebSocket
// ═══════════════════════════════════════════════════════════════════════════

export const Metrics = (() => {
  const maxPoints = 24;
  let cpuHistory = [];
  let memHistory = [];

  function drawGraph(canvas, data, color) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(150,150,160,0.3)';
    ctx.lineWidth = 0.5;

    // Horizontal: 25%, 50%, 75%
    for (const pct of [25, 50, 75]) {
      const gy = h - (pct / 100) * (h - 2) - 1;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }

    // Vertical: divide into 4 columns
    for (let i = 1; i < 4; i++) {
      const gx = Math.round(w * i / 4);
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }

    const n = data.length;
    if (n < 2) return;
    const xStep  = w / (maxPoints - 1);
    const startX = w - (n - 1) * xStep;
    const y = (pct) => h - Math.max(0, Math.min(1, pct / 100)) * (h - 2) - 1;

    // Fill area
    ctx.beginPath();
    ctx.moveTo(startX, y(data[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(startX + i * xStep, y(data[i]));
    ctx.lineTo(startX + (n - 1) * xStep, h);
    ctx.lineTo(startX, h);
    ctx.closePath();
    ctx.fillStyle = color + '22';
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(startX, y(data[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(startX + i * xStep, y(data[i]));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  function update(data) {
    markAlive(); // Server just talked to us
    const cpuCanvas = document.getElementById('cpuCanvas');
    const memCanvas = document.getElementById('memCanvas');
    const cpuVal    = document.getElementById('cpuVal');
    const memVal    = document.getElementById('memVal');
    const memGb     = document.getElementById('memGb');
    const threadVal = document.getElementById('threadVal');

    const cpuPct   = Math.round(data.cpu_pct || 0);
    window._cpuPct = cpuPct;  // expose for backpressure checks
    const memPct   = Math.round(data.mem_pct || 0);
    window._memPct = memPct;   // expose for backpressure checks
    const usedGb   = ((data.working_set_mb || 0) / 1024).toFixed(1);
    const totalGb  = ((data.total_ram_mb || 0) / 1024).toFixed(0);

    cpuHistory.push(cpuPct); memHistory.push(memPct);
    if (cpuHistory.length > maxPoints) cpuHistory.shift();
    if (memHistory.length > maxPoints) memHistory.shift();

    const cpuColor = cpuPct > 80 ? '#ff4444' : cpuPct > 60 ? '#e3b341' : '#3fb950';
    const memColor = memPct > 80 ? '#ff4444' : memPct > 60 ? '#e3b341' : '#3fb950';

    if (cpuVal) {
      cpuVal.textContent = cpuPct + '%';
      cpuVal.style.color = cpuColor;
    }
    if (memVal) {
      memVal.textContent = `${memPct}%`;
      memVal.style.color = memColor;
    }
    if (memGb) {
      memGb.textContent = `${usedGb}/${totalGb} GB`;
      memGb.style.color = memColor;
    }
    if (threadVal) {
      threadVal.textContent = `${data.thread_count || 0} threads`;
    }

    requestAnimationFrame(() => {
      drawGraph(cpuCanvas, cpuHistory, cpuColor);
      drawGraph(memCanvas, memHistory, memColor);
    });

    // Memory red zone check (async, fire-and-forget)
    _checkRedZone(memPct, data);
  }

  // ── Memory Red Zone ─────────────────────────────────────
  const RED_ZONE_PCT   = 85;   // show warning + auto-GC
  const CRIT_ZONE_PCT  = 92;   // cancel idle scans
  const COOLDOWN_MS    = 30000; // min 30s between auto-GC calls
  let _lastGcTime = 0;
  let _redZoneActive = false;

  async function _checkRedZone(memPct, data) {
    const banner = _ensureRedZoneBanner();

    if (memPct < RED_ZONE_PCT) {
      // All clear
      if (_redZoneActive) {
        banner.style.display = 'none';
        _redZoneActive = false;
      }
      return;
    }

    // Red zone active
    _redZoneActive = true;
    const processMb = Math.round(data.working_set_mb || 0);
    const isCritical = memPct >= CRIT_ZONE_PCT;

    banner.style.display = 'flex';
    banner.style.borderColor = isCritical ? 'var(--red)' : 'var(--orange)';
    banner.querySelector('.rz-text').innerHTML = isCritical
      ? `⚠️ <b>CRITICAL</b> — Memory ${memPct}% (server ${processMb} MB). Cancelling idle scans…`
      : `⚠️ Memory ${memPct}% (server ${processMb} MB) — auto-GC triggered`;

    // Auto-GC with cooldown
    const now = Date.now();
    if (now - _lastGcTime > COOLDOWN_MS) {
      _lastGcTime = now;
      try {
        const res = await fetch('/api/gc', { method: 'POST' });
        const json = await res.json();
        const gcBtn = banner.querySelector('.rz-gc-btn');
        if (gcBtn) gcBtn.textContent = `GC → ${json.process_mb} MB`;
      } catch { /* best effort */ }
    }

    // Critical: cancel idle scans + close previews
    if (isCritical) {
      _cancelIdleScans();
      _closePreviews();
    }
  }

  function _ensureRedZoneBanner() {
    let banner = document.getElementById('memRedZone');
    if (banner) return banner;
    banner = document.createElement('div');
    banner.id = 'memRedZone';
    banner.style.cssText = `
      display:none; align-items:center; gap:12px;
      padding:8px 16px; margin:0 20px 8px;
      background:#1a0a0a; border:1px solid var(--orange);
      border-radius:6px; font-size:13px; color:var(--text);
    `;
    banner.innerHTML = `
      <span class="rz-text" style="flex:1"></span>
      <button class="btn btn-sm muted rz-gc-btn" onclick="window._manualGC()">Force GC</button>
      <button class="btn btn-sm muted" onclick="this.parentElement.style.display='none'">Dismiss</button>
    `;
    const main = document.querySelector('main');
    if (main) main.prepend(banner);
    return banner;
  }

  function _cancelIdleScans() {
    // Send cancel to any non-active section that might be scanning
    // Uses the WebSocket if available
    if (window._wsSend) {
      const activeSections = document.querySelectorAll('.section-sb.scanning');
      activeSections.forEach(sb => {
        const section = sb.closest('[id^=section-]');
        if (section && (section as HTMLElement).style.display === 'none') {
          const sectionName = section.id.replace('section-', '');
          window._wsSend(JSON.stringify({ type: 'cancel', section: sectionName }));
        }
      });
    }
  }

  function _closePreviews() {
    // Remove any open preview panes to free DOM memory
    document.querySelectorAll('.dup-preview').forEach(el => el.remove());
  }

  // Expose manual GC trigger
  window._manualGC = async () => {
    try {
      const res = await fetch('/api/gc', { method: 'POST' });
      const json = await res.json();
      const btn = document.querySelector('.rz-gc-btn');
      if (btn) btn.textContent = `GC → ${json.process_mb} MB`;
    } catch { /* ignore */ }
  };

  // ── Uptime Heartbeat Ticker ──────────────────────────────
  // Ticks every 1s. Proves: JS event loop alive, server responding.
  // Green = all good. Amber = no WS data in 10s. Red = no WS data in 30s.
  const _t0 = Date.now();
  let _lastWsDataAt = Date.now();

  function _startUptimeTicker() {
    const dot = document.getElementById('uptimePulse');
    const val = document.getElementById('uptimeVal');
    if (!dot || !val) return;

    setInterval(() => {
      // Update uptime display
      const elapsed = Math.floor((Date.now() - _t0) / 1000);
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      const s = elapsed % 60;
      val.textContent = h > 0
        ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
        : `${m}:${String(s).padStart(2,'0')}`;

      // Check server liveness via last WS data timestamp
      const stale = Date.now() - _lastWsDataAt;
      if (stale > 30000) {
        dot.className = 'pulse-dot red';
        val.title = 'No server data in 30s+';
      } else if (stale > 10000) {
        dot.className = 'pulse-dot amber';
        val.title = 'No server data in 10s+';
      } else {
        dot.className = 'pulse-dot green';
        val.title = 'System healthy';
      }
    }, 1000);
  }

  // Called by metrics.update() to mark "server is talking"
  function markAlive() {
    _lastWsDataAt = Date.now();
  }

  // Auto-start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _startUptimeTicker);
  } else {
    _startUptimeTicker();
  }

  return { update, markAlive };
})();
