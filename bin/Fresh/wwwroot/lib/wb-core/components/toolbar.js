/**
 * Toolbar — Composable Button Bar With Standard Actions
 * 
 * Renders configurable toolbar with standard and custom buttons.
 * 
 * Features:
 * - Standard buttons: scan, cancel, selectAll, selectNone, delete, keep, loadMore
 * - Custom buttons per section
 * - Load More states: enabled (green dot, glowing), disabled (red dot, 0.45 opacity), loading
 * - Keep button enable/disable control
 * - Icon and label rendering
 * - Sensible defaults for callbacks
 * 
 * Load More Button States:
 * - Has more data: enabled, green dot, glow effect
 * - No more data: disabled, red dot, opacity 0.45
 * - Loading: opacity 0.6, cursor wait
 * 
 * API:
 * - create(sectionId, opts) → initialize
 * - setLoadMoreState(sectionId, { hasMore, loading }) → update Load More state
 * - setKeepEnabled(sectionId, enabled) → enable/disable Keep button
 * - destroy(sectionId) → cleanup
 * 
 * Example:
 * Toolbar.create('stale', {
 *   container: document.getElementById('toolbar-area'),
 *   buttons: ['scan', 'cancel', 'selectAll', 'selectNone', 'delete', 'keep', 'loadMore'],
 *   custom: [
 *     { label: '⚡ Apply All', class: 'btn danger', onClick: () => { } }
 *   ],
 *   onScan: () => fetch('/api/scan/stale'),
 *   onCancel: () => fetch('/api/task/cancel'),
 *   onSelectAll: () => grid.selectAll(true),
 *   onSelectNone: () => grid.selectAll(false),
 *   onDelete: () => grid.getChecked() |> delete,
 *   onKeep: () => grid.getChecked() |> keep-list,
 *   onLoadMore: () => page-loader.loadNext()
 * });
 * Toolbar.setLoadMoreState('stale', { hasMore: true, loading: false });
 */

/** @type {Map<string, Object>} Toolbar instances */
const toolbars = new Map();

/**
 * Create a button element
 * @private
 */
function createButton(icon, label, className, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `tb-btn ${className}`;
  btn.title = label;
  btn.innerHTML = icon;
  if (label) {
    const span = document.createElement('span');
    span.className = 'tb-label';
    span.textContent = label;
    btn.appendChild(span);
  }
  if (onClick) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
  }
  return btn;
}

export const Toolbar = {
  /**
   * Initialize toolbar for a section
   * @param {string} sectionId - Unique section identifier
   * @param {Object} opts - Configuration options
   *   @param {HTMLElement} opts.container - Parent element (optional)
   *   @param {string[]} opts.buttons - Standard buttons to show: '[scan,cancel,selectAll,selectNone,delete,keep,loadMore]'
   *   @param {Array} opts.custom - Custom buttons: [{ label, icon, class, onClick }]
   *   @param {Function} opts.onScan - Scan button callback
   *   @param {Function} opts.onCancel - Cancel button callback
   *   @param {Function} opts.onSelectAll - Select All callback
   *   @param {Function} opts.onSelectNone - Select None callback
   *   @param {Function} opts.onDelete - Delete button callback
   *   @param {Function} opts.onKeep - Keep button callback
   *   @param {Function} opts.onLoadMore - Load More button callback
   */
  create(sectionId, opts = {}) {
    if (!sectionId) {
      console.warn('Toolbar.create() requires sectionId');
      return;
    }

    const {
      container = null,
      buttons: explicitButtons = null,
      custom: customDirect = null,
      customButtons = null,
      onScan = null,
      onCancel = null,
      onSelectAll = null,
      onSelectNone = null,
      onDelete = null,
      onKeep = null,
      onLoadMore = null
    } = opts;

    // Accept 'customButtons' as alias for 'custom'
    const custom = customDirect || customButtons || [];

    // Auto-populate buttons array from provided callbacks if not explicitly set
    let buttons = explicitButtons;
    if (!buttons) {
      buttons = [];
      if (onSelectAll)  buttons.push('selectAll');
      if (onSelectNone) buttons.push('selectNone');
      if (onDelete)     buttons.push('delete');
      if (onKeep)       buttons.push('keep');
      if (onLoadMore)   buttons.push('loadMore');
    }

    // Create or use provided container (resolve string ID to element)
    let toolbarContainer = container;
    if (typeof toolbarContainer === 'string') {
      toolbarContainer = document.getElementById(toolbarContainer);
    }
    if (!toolbarContainer) {
      toolbarContainer = document.createElement('div');
      toolbarContainer.id = `toolbar-${sectionId}`;
    }
    toolbarContainer.className = 'tb-container';

    // Create toolbar bar
    const bar = document.createElement('div');
    bar.className = 'tb-bar';
    bar.setAttribute('data-section', sectionId);

    // Storage for elements
    const buttonElements = {};

    // Standard buttons
    const buttonDefs = {
      scan: { icon: '🔍', label: 'Scan', class: 'tb-btn-primary', handler: onScan || (() => {}) },
      cancel: { icon: '✖', label: 'Cancel', class: 'tb-btn-muted', handler: onCancel || (() => {}) },
      selectAll: { icon: '☑', label: 'Select All', class: 'tb-btn-muted', handler: onSelectAll || (() => {}) },
      selectNone: { icon: '☐', label: 'Select None', class: 'tb-btn-muted', handler: onSelectNone || (() => {}) },
      delete: { icon: '🗑', label: 'Delete', class: 'tb-btn-danger', handler: onDelete || (() => {}) },
      keep: { icon: '🔒', label: 'Keep', class: 'tb-btn-keep', handler: onKeep || (() => {}) },
      loadMore: { icon: '●', label: 'Load More', class: 'tb-load-more-btn', handler: onLoadMore || (() => {}), special: true }
    };

    // Render standard buttons
    buttons.forEach((btnName) => {
      const def = buttonDefs[btnName];
      if (!def) {
        console.warn(`Toolbar: unknown button name "${btnName}"`);
        return;
      }

      const btn = createButton(def.icon, def.label, def.class, def.handler);
      if (def.special) {
        btn.classList.add(def.class);
        buttonElements[btnName] = btn;
        // Add dot indicator
        const dot = document.createElement('span');
        dot.className = 'tb-dot tb-dot-red';
        btn.appendChild(dot);
      } else {
        buttonElements[btnName] = btn;
      }
      bar.appendChild(btn);
    });

    // Separator
    if (buttons.length > 0 && custom.length > 0) {
      const sep = document.createElement('div');
      sep.className = 'tb-separator';
      bar.appendChild(sep);
    }

    // Custom buttons
    custom.forEach((def) => {
      const { label, icon = '○', class: className = 'tb-btn-custom', onClick = () => {} } = def;
      const btn = createButton(icon, label, className, onClick);
      bar.appendChild(btn);
    });

    // Store state
    const state = {
      sectionId,
      container: toolbarContainer,
      bar,
      buttons: buttonElements,
      loadMoreState: { hasMore: false, loading: false }
    };

    toolbars.set(sectionId, state);

    // Append to container
    toolbarContainer.innerHTML = '';
    toolbarContainer.appendChild(bar);

    return bar;
  },

  /**
   * Update Load More button state
   * @param {string} sectionId
   * @param {Object} state - { hasMore: boolean, loading: boolean }
   */
  setLoadMoreState(sectionId, state = {}) {
    const toolbar = toolbars.get(sectionId);
    if (!toolbar) return;

    const { hasMore = false, loading = false } = state;
    const btn = toolbar.buttons.loadMore;

    if (!btn) return;

    toolbar.loadMoreState = { hasMore, loading };

    // Update visual state
    if (loading) {
      btn.classList.add('tb-loading');
      btn.disabled = true;
    } else {
      btn.classList.remove('tb-loading');
      btn.disabled = !hasMore;
    }

    // Update dot indicator
    const dot = btn.querySelector('.tb-dot');
    if (dot) {
      dot.classList.toggle('tb-dot-green', hasMore && !loading);
      dot.classList.toggle('tb-dot-red', !hasMore || loading);
    }
  },

  /**
   * Enable/disable Keep button
   * @param {string} sectionId
   * @param {boolean} enabled
   */
  setKeepEnabled(sectionId, enabled = true) {
    const toolbar = toolbars.get(sectionId);
    if (!toolbar) return;

    const btn = toolbar.buttons.keep;
    if (!btn) return;

    btn.disabled = !enabled;
  },

  /**
   * Enable/disable specific button
   * @param {string} sectionId
   * @param {string} buttonName
   * @param {boolean} enabled
   */
  setButtonEnabled(sectionId, buttonName, enabled = true) {
    const toolbar = toolbars.get(sectionId);
    if (!toolbar) return;

    const btn = toolbar.buttons[buttonName];
    if (!btn) return;

    btn.disabled = !enabled;
  },

  /**
   * Destroy toolbar
   * @param {string} sectionId
   */
  destroy(sectionId) {
    const toolbar = toolbars.get(sectionId);
    if (!toolbar) return;

    if (toolbar.bar.parentElement) {
      toolbar.bar.parentElement.removeChild(toolbar.bar);
    }
    toolbars.delete(sectionId);
  }
};
