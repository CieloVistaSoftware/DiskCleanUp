/**
 * StatusBar — Section Status Display
 * 
 * Generic status bar with configurable metric segments.
 * Shows: status (Idle/Scanning/Done/Error) + metrics + elapsed time + folder ticker + stop button
 * 
 * Segments:
 * - status (built-in): "Idle" / "Scanning…" / "Done" / "Error"
 * - metric (configurable): Custom label + value (FILES, RESULTS, SIZE, etc.)
 * - rows (built-in): Current row count
 * - time (built-in): Elapsed time MM:SS
 * - folder (built-in): Current path / ticker
 * - stop (built-in): Stop button (red, disabled when idle/done)
 * 
 * Visual States:
 * - Idle: Gray border
 * - Scanning: Orange border + status text
 * - Done: Green border + status text
 * - Error: Red border + error message
 * 
 * API:
 * - create(sectionId, opts) → initialize
 * - begin(sectionId) → start scanning
 * - progress(sectionId, { files, results, folder, ... }) → update metrics
 * - done(sectionId, summary) → mark complete
 * - error(sectionId, message) → show error
 * - reset(sectionId) → return to idle
 * - destroy(sectionId) → cleanup
 * 
 * Example:
 * StatusBar.create('stale', {
 *   container: document.getElementById('status-area'),
 *   segments: ['files', 'results'],
 *   onStop: () => fetch('/api/task/cancel'),
 *   onError: (msg) => console.error(msg)
 * });
 * StatusBar.begin('stale');
 * StatusBar.progress('stale', { files: 150, results: 23, folder: 'C:\\temp' });
 * StatusBar.done('stale', { files: 500, results: 45 });
 */

/** @type {Map<string, Object>} Status bar instances */
const statusBars = new Map();

/**
 * Format elapsed seconds as MM:SS
 * @private
 */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * Create a metric segment element
 * @private
 */
function createSegment(label, value = '0') {
  const seg = document.createElement('div');
  seg.className = 'sb-segment';
  seg.innerHTML = `<span class="sb-label">${label}</span><span class="sb-value">${value}</span>`;
  return seg;
}

export const StatusBar = {
  /**
   * Initialize a status bar for a section
   * @param {string} sectionId - Unique section identifier
   * @param {Object} opts - Configuration options
   *   @param {HTMLElement} opts.container - Parent element (optional, creates if not provided)
   *   @param {string[]} opts.segments - Metric names: ['files', 'results', 'size', ...]
   *   @param {Function} opts.onStop - Callback when stop button clicked
   *   @param {Function} opts.onError - Callback on error
   */
  create(sectionId, opts = {}) {
    if (!sectionId) {
      console.warn('StatusBar.create() requires sectionId');
      return;
    }

    const {
      container = null,
      segments = [],
      onStop = () => {},
      onError = () => {}
    } = opts;

    // Create or use provided container (resolve string ID to element)
    let statusContainer = container;
    if (typeof statusContainer === 'string') {
      statusContainer = document.getElementById(statusContainer);
    }
    if (!statusContainer) {
      statusContainer = document.createElement('div');
      statusContainer.id = `status-${sectionId}`;
    }
    statusContainer.className = 'sb-container';

    // Create main bar
    const bar = document.createElement('div');
    bar.className = 'sb-bar sb-idle';
    bar.setAttribute('data-section', sectionId);

    // Status indicator (Idle/Scanning/Done/Error)
    const status = document.createElement('div');
    status.className = 'sb-status';
    status.textContent = 'Idle';
    bar.appendChild(status);

    // Custom metric segments (configurable)
    const metricElements = {};
    segments.forEach((segName) => {
      const label = segName.toUpperCase();
      const el = createSegment(label, '0');
      metricElements[segName] = el.querySelector('.sb-value');
      bar.appendChild(el);
    });

    // Built-in: row count (skip if caller already has a ROWS segment)
    const hasCustomRows = segments.some(s => s.toLowerCase() === 'rows');
    let rowsValue = null;
    if (!hasCustomRows) {
      const rowsSeg = createSegment('ROWS', '0');
      rowsValue = rowsSeg.querySelector('.sb-value');
      bar.appendChild(rowsSeg);
    } else {
      // Use the custom ROWS segment
      rowsValue = metricElements['ROWS'] || metricElements['rows'] || null;
    }

    // Built-in: elapsed time
    const timeSeg = createSegment('TIME', '0:00');
    const timeValue = timeSeg.querySelector('.sb-value');
    bar.appendChild(timeSeg);

    // Built-in: folder ticker
    const folderTicker = document.createElement('div');
    folderTicker.className = 'sb-folder';
    const folderText = document.createElement('span');
    folderText.className = 'sb-folder-text';
    folderText.textContent = 'Ready';
    folderTicker.appendChild(folderText);
    bar.appendChild(folderTicker);

    // Built-in: stop button
    const stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.className = 'sb-stop-btn';
    stopBtn.innerHTML = '⏸';
    stopBtn.title = 'Stop scan';
    stopBtn.disabled = true;
    stopBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onStop();
    });
    bar.appendChild(stopBtn);

    // Store instance state
    const state = {
      sectionId,
      container: statusContainer,
      bar,
      segments: {
        status,
        metric: metricElements,
        rows: rowsValue,
        time: timeValue,
        folder: folderText,
        stopBtn
      },
      metrics: {},
      startTime: null,
      timerInterval: null,
      currentState: 'idle',
      onStop,
      onError
    };

    statusBars.set(sectionId, state);

    // Append bar to container
    statusContainer.innerHTML = '';
    statusContainer.appendChild(bar);

    return bar;
  },

  /**
   * Begin scanning state (show orange state, start timer)
   * @param {string} sectionId
   */
  begin(sectionId) {
    const state = statusBars.get(sectionId);
    if (!state) {
      console.warn(`StatusBar: unknown sectionId "${sectionId}"`);
      return;
    }

    // Update visual state
    state.bar.classList.remove('sb-idle', 'sb-done', 'sb-error');
    state.bar.classList.add('sb-scanning');
    state.segments.status.textContent = 'Scanning…';
    state.segments.stopBtn.disabled = false;
    state.currentState = 'scanning';
    state.startTime = Date.now();

    // Start elapsed time timer (updates every 200ms)
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
      const elapsed = (Date.now() - state.startTime) / 1000;
      state.segments.time.textContent = formatTime(elapsed);
    }, 200);
  },

  /**
   * Update progress metrics during scanning
   * @param {string} sectionId
   * @param {Object} data - Metric values { files, results, size, folder, rowCount, ... }
   */
  progress(sectionId, data = {}) {
    const state = statusBars.get(sectionId);
    if (!state) return;

    // Update custom metrics
    Object.entries(data).forEach(([key, value]) => {
      // Special handling for folder
      if (key === 'folder') {
        state.segments.folder.textContent = value || 'Scanning…';
        return;
      }

      // Update if this is a registered metric segment
      if (state.segments.metric[key]) {
        state.segments.metric[key].textContent = value;
        state.metrics[key] = value;
      }
    });

    // Update row count if provided
    if (typeof data.rowCount === 'number') {
      state.segments.rows.textContent = data.rowCount;
    }
  },

  /**
   * Mark scan as complete (show green state, stop timer)
   * @param {string} sectionId
   * @param {Object} summary - Final metric values
   */
  done(sectionId, summary = {}) {
    const state = statusBars.get(sectionId);
    if (!state) return;

    // Stop timer
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }

    // Update visual state
    state.bar.classList.remove('sb-idle', 'sb-scanning', 'sb-error');
    state.bar.classList.add('sb-done');
    state.segments.status.textContent = 'Done';
    state.segments.stopBtn.disabled = true;
    state.currentState = 'done';

    // Update final metrics
    Object.entries(summary).forEach(([key, value]) => {
      if (state.segments.metric[key]) {
        state.segments.metric[key].textContent = value;
        state.metrics[key] = value;
      }
    });

    state.segments.folder.textContent = 'Complete';
  },

  /**
   * Show error state (show red state, stop timer)
   * @param {string} sectionId
   * @param {string} message - Error message to display
   */
  error(sectionId, message = 'Error') {
    const state = statusBars.get(sectionId);
    if (!state) return;

    // Stop timer
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }

    // Update visual state
    state.bar.classList.remove('sb-idle', 'sb-scanning', 'sb-done');
    state.bar.classList.add('sb-error');
    state.segments.status.textContent = 'Error';
    state.segments.stopBtn.disabled = true;
    state.segments.folder.textContent = message;
    state.currentState = 'error';

    // Trigger error callback
    state.onError(message);
  },

  /**
   * Get current state
   * @param {string} sectionId
   * @returns {Object|null} { status, metrics }
   */
  getState(sectionId) {
    const state = statusBars.get(sectionId);
    return state ? { status: state.currentState, metrics: state.metrics } : null;
  },

  /**
   * Reset to idle state
   * @param {string} sectionId
   */
  reset(sectionId) {
    const state = statusBars.get(sectionId);
    if (!state) return;

    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }

    state.bar.classList.remove('sb-scanning', 'sb-done', 'sb-error');
    state.bar.classList.add('sb-idle');
    state.segments.status.textContent = 'Idle';
    state.segments.time.textContent = '0:00';
    state.segments.folder.textContent = 'Ready';
    state.segments.stopBtn.disabled = true;
    state.currentState = 'idle';
    state.metrics = {};

    Object.values(state.segments.metric).forEach((el) => {
      el.textContent = '0';
    });
  },

  /**
   * Destroy status bar and cleanup
   * @param {string} sectionId
   */
  destroy(sectionId) {
    const state = statusBars.get(sectionId);
    if (!state) return;

    if (state.timerInterval) {
      clearInterval(state.timerInterval);
    }
    if (state.bar.parentElement) {
      state.bar.parentElement.removeChild(state.bar);
    }
    statusBars.delete(sectionId);
  }
};
