/**
 * FilterBar — Dropdown + Text + Chips Filter
 * 
 * Reusable filter bar with configurable modes, text search, and exclude chips.
 * 
 * Features:
 * - Dropdown (dynamically populated, sorted alphabetically)
 * - Include/Exclude toggle (muted ↔ red styling)
 * - Text input (real-time, case-insensitive substring matching)
 * - Status display ("X rows" / "Showing X of Y")
 * - Exclude chips (removable pills in exclude mode)
 * - Persistence (localStorage)
 * - Callback on filter state change
 * 
 * API:
 * - create(sectionId, opts) → initialize
 * - addOption(sectionId, value, label) → add dropdown item
 * - rebuild(sectionId, options[]) → replace all options
 * - apply(sectionId) → trigger filter callback
 * - getState(sectionId) → { mode, text, excluded[], selected }
 * 
 * Example:
 * FilterBar.create('stale', {
 *   container: document.getElementById('filter-area'),
 *   persistKey: 'stale-filters',
 *   onFilter: (state) => {
 *     console.log('Filter changed:', state);
 *     gridShell.filter(state);
 *   }
 * });
 * FilterBar.addOption('stale', '.txt', 'Text Files');
 * FilterBar.addOption('stale', '.bak', 'Backup Files');
 */

/** @type {Map<string, Object>} Filter bar instances */
const filterBars = new Map();

/**
 * Create a chip element
 * @private
 */
function createChip(label, onRemove) {
  const chip = document.createElement('div');
  chip.className = 'fb-chip';
  chip.innerHTML = `<span>${label}</span><button type="button" class="fb-chip-remove">×</button>`;
  chip.querySelector('.fb-chip-remove').addEventListener('click', onRemove);
  return chip;
}

export const FilterBar = {
  /**
   * Initialize filter bar for a section
   * @param {string} sectionId - Unique section identifier
   * @param {Object} opts - Configuration options
   *   @param {HTMLElement} opts.container - Parent element (optional)
   *   @param {string} opts.persistKey - localStorage key for persistence
   *   @param {Function} opts.onFilter - Callback when filter state changes
   */
  create(sectionId, opts: { container?: HTMLElement | string | null; persistKey?: string; onFilter?: (...args: any[]) => any } = {}) {
    if (!sectionId) {
      console.warn('FilterBar.create() requires sectionId');
      return;
    }

    const {
      container = null,
      persistKey = `filter-${sectionId}`,
      onFilter = () => {}
    } = opts;

    // Create or use provided container (resolve string ID to element)
    let filterContainer = container;
    if (typeof filterContainer === 'string') {
      filterContainer = document.getElementById(filterContainer);
    }
    if (!filterContainer) {
      filterContainer = document.createElement('div');
      filterContainer.id = `filter-${sectionId}`;
    }
    filterContainer.className = 'fb-container';

    // Create filter bar
    const bar = document.createElement('div');
    bar.className = 'fb-bar';
    bar.setAttribute('data-section', sectionId);

    // Dropdown
    const dropdownDiv = document.createElement('div');
    dropdownDiv.className = 'fb-group fb-dropdown-group';
    const dropdown = document.createElement('select');
    dropdown.className = 'fb-dropdown';
    dropdown.setAttribute('title', 'Show only files matching this extension');
    const optAll = document.createElement('option');
    optAll.value = '*';
    optAll.textContent = 'All Files';
    dropdown.appendChild(optAll);
    dropdownDiv.appendChild(dropdown);
    bar.appendChild(dropdownDiv);

    // Mode toggle (Include ↔ Exclude)
    const modeDiv = document.createElement('div');
    modeDiv.className = 'fb-group fb-mode-group';
    const modeLabel = document.createElement('label');
    modeLabel.className = 'fb-mode-label fb-mode-include';
    modeLabel.innerHTML = '<input type="checkbox" class="fb-mode-toggle"> <span class="fb-mode-text">Include Only</span>';
    modeDiv.appendChild(modeLabel);
    bar.appendChild(modeDiv);

    // Text input
    const textDiv = document.createElement('div');
    textDiv.className = 'fb-group fb-text-group';
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'fb-text-input';
    textInput.placeholder = 'Filter by chars…';
    textInput.setAttribute('title', 'Real-time substring filter (case-insensitive)');
    textDiv.appendChild(textInput);
    bar.appendChild(textDiv);

    // Status display
    const statusDiv = document.createElement('div');
    statusDiv.className = 'fb-status';
    statusDiv.textContent = '0 rows';
    bar.appendChild(statusDiv);

    // Chips container (hidden in include mode)
    const chipsDiv = document.createElement('div');
    chipsDiv.className = 'fb-chips fb-chips-hidden';
    bar.appendChild(chipsDiv);

    // Store state
    const state = {
      sectionId,
      container: filterContainer,
      bar,
      elements: {
        dropdown,
        modeToggle: modeLabel.querySelector('input'),
        modeText: modeLabel.querySelector('.fb-mode-text'),
        textInput,
        statusDiv,
        chipsDiv,
        modeLabel
      },
      options: new Map(), // value → label
      mode: 'include', // include or exclude
      text: '',
      excluded: [],
      persistKey,
      onFilter,
      rowCount: 0,
      totalRows: 0
    };

    // Event listeners
    dropdown.addEventListener('change', () => {
      if (dropdown.value !== '*') {
        state.text = dropdown.value;
        textInput.value = dropdown.value;
      }
      FilterBar.apply(sectionId);
    });

    modeLabel.querySelector('input').addEventListener('change', () => {
      const isExclude = modeLabel.querySelector('input').checked;
      state.mode = isExclude ? 'exclude' : 'include';
      modeLabel.classList.toggle('fb-mode-include', !isExclude);
      modeLabel.classList.toggle('fb-mode-exclude', isExclude);
      modeLabel.querySelector('.fb-mode-text').textContent = isExclude ? 'Exclude' : 'Include Only';
      chipsDiv.classList.toggle('fb-chips-hidden', !isExclude);
      FilterBar.apply(sectionId);
    });

    textInput.addEventListener('input', () => {
      state.text = textInput.value.toLowerCase();
      FilterBar.apply(sectionId);
    });

    filterBars.set(sectionId, state);

    // Append bar to container
    filterContainer.innerHTML = '';
    filterContainer.appendChild(bar);

    // Restore persisted state if available
    const saved = localStorage.getItem(persistKey);
    if (saved) {
      try {
        const restored = JSON.parse(saved);
        if (restored.mode) {
          state.mode = restored.mode;
          modeLabel.querySelector('input').checked = restored.mode === 'exclude';
          modeLabel.classList.toggle('fb-mode-include', restored.mode !== 'exclude');
          modeLabel.classList.toggle('fb-mode-exclude', restored.mode === 'exclude');
          chipsDiv.classList.toggle('fb-chips-hidden', restored.mode !== 'exclude');
        }
        if (restored.text) {
          state.text = restored.text;
          textInput.value = restored.text;
        }
      } catch (e) {
        console.error('FilterBar: failed to restore persisted state', e);
      }
    }

    return bar;
  },

  /**
   * Add a single dropdown option
   * @param {string} sectionId
   * @param {string} value - Option value (typically file extension like '.txt')
   * @param {string} label - Display label
   */
  addOption(sectionId, value, label) {
    const state = filterBars.get(sectionId);
    if (!state) {
      console.warn(`FilterBar: unknown sectionId "${sectionId}"`);
      return;
    }

    if (state.options.has(value)) {
      return; // Already exists
    }

    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    state.elements.dropdown.appendChild(option);
    state.options.set(value, label);

    // Keep options sorted
    const options = Array.from(state.elements.dropdown.options).sort((a, b) => {
      const aOpt = a as HTMLOptionElement;
      const bOpt = b as HTMLOptionElement;
      if (aOpt.value === '*') return -1;
      if (bOpt.value === '*') return 1;
      return (aOpt.textContent || '').localeCompare(bOpt.textContent || '');
    });
    state.elements.dropdown.innerHTML = '';
    options.forEach((opt) => {
      state.elements.dropdown.appendChild(opt);
    });
  },

  /**
   * Rebuild dropdown with new options
   * @param {string} sectionId
   * @param {Array} options - Array of { value, label } objects
   */
  rebuild(sectionId, options = []) {
    const state = filterBars.get(sectionId);
    if (!state) return;

    const dropdown = state.elements.dropdown;
    const selected = dropdown.value;

    // Clear and rebuild
    dropdown.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = '*';
    optAll.textContent = 'All Files';
    dropdown.appendChild(optAll);

    const sorted = options.slice().sort((a, b) => {
      return a.label.localeCompare(b.label);
    });

    sorted.forEach(({ value, label }) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      dropdown.appendChild(opt);
      state.options.set(value, label);
    });

    // Restore previous selection if still available
    if (dropdown.querySelector(`option[value="${selected}"]`)) {
      dropdown.value = selected;
    }
  },

  /**
   * Apply filter (trigger callback)
   * @param {string} sectionId
   */
  apply(sectionId) {
    const state = filterBars.get(sectionId);
    if (!state) return;

    // Save state to localStorage
    localStorage.setItem(state.persistKey, JSON.stringify({
      mode: state.mode,
      text: state.text,
      excluded: state.excluded
    }));

    // Trigger callback
    state.onFilter({
      mode: state.mode,
      text: state.text,
      excluded: state.excluded,
      selected: state.elements.dropdown.value
    });
  },

  /**
   * Get current filter state
   * @param {string} sectionId
   * @returns {Object|null}
   */
  getState(sectionId) {
    const state = filterBars.get(sectionId);
    return state ? {
      mode: state.mode,
      text: state.text,
      excluded: state.excluded,
      selected: state.elements.dropdown.value
    } : null;
  },

  /**
   * Update row count display
   * @param {string} sectionId
   * @param {number} visible - Number of visible rows
   * @param {number} total - Total row count
   */
  setRowCount(sectionId, visible, total = null) {
    const state = filterBars.get(sectionId);
    if (!state) return;

    state.rowCount = visible;
    state.totalRows = total || visible;

    if (total && total > visible) {
      state.elements.statusDiv.textContent = `${visible} of ${total} rows`;
    } else {
      state.elements.statusDiv.textContent = `${visible} row${visible !== 1 ? 's' : ''}`;
    }
  },

  /**
   * Reset filter to initial state
   * @param {string} sectionId
   */
  reset(sectionId) {
    const state = filterBars.get(sectionId);
    if (!state) return;

    state.mode = 'include';
    state.text = '';
    state.excluded = [];

    state.elements.dropdown.value = '*';
    state.elements.modeToggle.checked = false;
    state.elements.modeLabel.classList.add('fb-mode-include');
    state.elements.modeLabel.classList.remove('fb-mode-exclude');
    state.elements.textInput.value = '';
    state.elements.chipsDiv.innerHTML = '';
    state.elements.chipsDiv.classList.add('fb-chips-hidden');
    state.elements.statusDiv.textContent = '0 rows';

    FilterBar.apply(sectionId);
  },

  /**
   * Destroy filter bar
   * @param {string} sectionId
   */
  destroy(sectionId) {
    const state = filterBars.get(sectionId);
    if (!state) return;

    if (state.bar.parentElement) {
      state.bar.parentElement.removeChild(state.bar);
    }
    filterBars.delete(sectionId);
  },

};
