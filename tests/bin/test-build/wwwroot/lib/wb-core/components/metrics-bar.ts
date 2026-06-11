import { ErrLog } from '../../../js/error-logger.js';
/**
 * MetricsBar — Real-Time System Metrics Display
 * 
 * Header-level system health display with mini canvas graphs.
 * 
 * Widgets:
 * - CPU Canvas: Real-time CPU % mini-graph + numeric value
 * - Memory Canvas: Real-time memory % mini-graph + numeric value
 * - Thread Counter: App thread count
 * - Uptime Pulse Dot: Green pulsing heartbeat (indicates service alive)
 * - Uptime Display: Elapsed time since load
 * 
 * Features:
 * - Mini canvas graphs (40px × 16px) for CPU and memory
 * - Real-time data updates with smooth line drawing
 * - Percentage displays with color coding
 * - Thread count and uptime tracking
 * - Pulse animation for alive indicator
 * - Responsive layout
 * 
 * API:
 * - create(containerId, opts?) → initialize
 * - update(data) → update metrics { cpu, mem, threads, uptime }
 * - startUptimeTimer() → begin uptime countdown
 * - destroy() → cleanup
 * 
 * Example:
 * MetricsBar.create('header-metrics', { metrics: ['cpu', 'mem', 'threads', 'uptime'] });
 * MetricsBar.update({ cpu: 23.5, mem: 45.2, threads: 12 });
 * MetricsBar.startUptimeTimer();
 */

/** @type {Object|null} MetricsBar instance */
let metricsInstance = null;

/**
 * Draw mini line graph on canvas
 * @private
 */
function drawMiniGraph(canvas, value, color = '#007bff') {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // Clear
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, 0, w, h);

  // Draw background grid
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.stroke();

  // Draw value bar (percentage shown as height)
  const barHeight = (value / 100) * h;
  ctx.fillStyle = color;
  ctx.fillRect(0, h - barHeight, w, barHeight);

  // Draw border
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, w, h);
}

export const MetricsBar = {
  /**
   * Create metrics bar
   * @param {string} containerId - Container element ID
   * @param {Object} opts - Configuration
   *   @param {string[]} opts.metrics - Metrics to show: ['cpu', 'mem', 'threads', 'uptime']
   */
  create(containerId, opts = {}) {
    const {
      metrics = ['cpu', 'mem', 'threads', 'uptime']
    } = opts;

    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`MetricsBar: container "${containerId}" not found`);
      return null;
    }

    // Create bar container
    const bar = document.createElement('div');
    bar.className = 'mb-bar';

    const elements = {};

    // CPU metric
    if (metrics.includes('cpu')) {
      const cpuDiv = document.createElement('div');
      cpuDiv.className = 'mb-metric';
      const cpuCanvas = document.createElement('canvas');
      cpuCanvas.width = 40;
      cpuCanvas.height = 16;
      cpuCanvas.title = 'CPU Usage';
      const cpuValue = document.createElement('span');
      cpuValue.className = 'mb-value';
      cpuValue.textContent = '0%';
      cpuDiv.appendChild(cpuCanvas);
      cpuDiv.appendChild(cpuValue);
      bar.appendChild(cpuDiv);
      elements.cpu = { canvas: cpuCanvas, value: cpuValue };
    }

    //Memory metric
    if (metrics.includes('mem')) {
      const memDiv = document.createElement('div');
      memDiv.className = 'mb-metric';
      const memCanvas = document.createElement('canvas');
      memCanvas.width = 40;
      memCanvas.height = 16;
      memCanvas.title = 'Memory Usage';
      const memValue = document.createElement('span');
      memValue.className = 'mb-value';
      memValue.textContent = '0%';
      memDiv.appendChild(memCanvas);
      memDiv.appendChild(memValue);
      bar.appendChild(memDiv);
      elements.mem = { canvas: memCanvas, value: memValue };
    }

    // Thread counter
    if (metrics.includes('threads')) {
      const threadsDiv = document.createElement('div');
      threadsDiv.className = 'mb-metric';
      const threadsLabel = document.createElement('span');
      threadsLabel.className = 'mb-label';
      threadsLabel.textContent = 'Threads';
      const threadsValue = document.createElement('span');
      threadsValue.className = 'mb-value';
      threadsValue.textContent = '0';
      threadsDiv.appendChild(threadsLabel);
      threadsDiv.appendChild(threadsValue);
      bar.appendChild(threadsDiv);
      elements.threads = { value: threadsValue };
    }

    // Uptime
    if (metrics.includes('uptime')) {
      const uptimeDiv = document.createElement('div');
      uptimeDiv.className = 'mb-metric mb-uptime';
      const pulseDot = document.createElement('span');
      pulseDot.className = 'mb-pulse-dot';
      const uptimeValue = document.createElement('span');
      uptimeValue.className = 'mb-value';
      uptimeValue.textContent = '0:00:00';
      uptimeDiv.appendChild(pulseDot);
      uptimeDiv.appendChild(uptimeValue);
      bar.appendChild(uptimeDiv);
      elements.uptime = { value: uptimeValue, dot: pulseDot };
    }

    // Store instance
    metricsInstance = {
      container,
      bar,
      elements,
      startTime: Date.now(),
      uptimeInterval: null
    };

    // Append to container
    container.innerHTML = '';
    container.appendChild(bar);

    return bar;
  },

  /**
   * Update metrics display
   * @param {Object} data - Metrics { cpu, mem, threads }
   */
  update(data = {}) {
    if (!metricsInstance) {
      console.warn('MetricsBar: not initialized. Call create() first.');
      return;
    }

    const { cpu, mem, threads } = data;

    // Update CPU
    if (typeof cpu === 'number' && metricsInstance.elements.cpu) {
      const cpuColor = cpu > 80 ? '#f44336' : cpu > 50 ? '#ff9800' : '#4caf50';
      drawMiniGraph(metricsInstance.elements.cpu.canvas, cpu, cpuColor);
      metricsInstance.elements.cpu.value.textContent = `${cpu.toFixed(1)}%`;
    }

    // Update Memory
    if (typeof mem === 'number' && metricsInstance.elements.mem) {
      const memColor = mem > 80 ? '#f44336' : mem > 50 ? '#ff9800' : '#4caf50';
      drawMiniGraph(metricsInstance.elements.mem.canvas, mem, memColor);
      metricsInstance.elements.mem.value.textContent = `${mem.toFixed(1)}%`;
    }

    // Update Threads
    if (typeof threads === 'number' && metricsInstance.elements.threads) {
      metricsInstance.elements.threads.value.textContent = threads;
    }
  },

  /**
   * Start uptime timer (updates every second)
   */
  startUptimeTimer() {
    if (!metricsInstance || !metricsInstance.elements.uptime) {
      console.warn('MetricsBar: uptime metric not initialized or not available.');
      return;
    }

    if (metricsInstance.uptimeInterval) {
      clearInterval(metricsInstance.uptimeInterval);
    }

    metricsInstance.startTime = Date.now();
    metricsInstance.uptimeInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - metricsInstance.startTime) / 1000);
      const hours = Math.floor(elapsed / 3600);
      const mins = Math.floor((elapsed % 3600) / 60);
      const secs = elapsed % 60;
      const uptime = `${hours}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
      metricsInstance.elements.uptime.value.textContent = uptime;
    }, 1000);
  },

  /**
   * Stop uptime timer
   */
  stopUptimeTimer() {
    if (!metricsInstance || !metricsInstance.uptimeInterval) return;
    clearInterval(metricsInstance.uptimeInterval);
    metricsInstance.uptimeInterval = null;
  },

  /**
   * Destroy metrics bar
   */
  destroy() {
    if (!metricsInstance) return;

    this.stopUptimeTimer();

    if (metricsInstance.bar.parentElement) {
      metricsInstance.bar.parentElement.removeChild(metricsInstance.bar);
    }
    metricsInstance = null;
  }
};
