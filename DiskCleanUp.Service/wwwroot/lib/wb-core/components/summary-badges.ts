import { ErrLog } from '../../../js/error-logger.js';
/**
 * SummaryBadges — Header-Level Stat Badges
 * 
 * Reusable stat badges for displaying header-level summaries.
 * - Total Saved (green text) — Cumulative freed disk space
 * - Queue (orange) — "🗑 N queued" files pending deletion
 * - Keep Count (default) — "🔒 N" protected files
 * 
 * Features:
 * - Color-coded by type (green, orange, default)
 * - Real-time updates
 * - Tooltip support
 * - Flex layout for responsive display
 * - Lightweight inline elements
 * - Custom badges support
 * 
 * API:
 * - create(containerId, opts?) → initialize
 * - update(containerId, badgeType, value) → update badge value
 * - addCustomBadge(containerId, label, value, color?) → add custom badge
 * - clear(containerId) → remove all badges
 * - destroy(containerId) → cleanup
 * 
 * Example:
 * SummaryBadges.create('header-stats');
 * SummaryBadges.update('header-stats', 'totalSaved', '2.3 GB');
 * SummaryBadges.update('header-stats', 'queue', 12);
 * SummaryBadges.update('header-stats', 'keepCount', 45);
 */

/** @type {Map<string, Object>} Badge instances */
const badgeInstances = new Map();

/**
 * Create a single badge element
 * @private
 */
function createBadgeEl(label, value, color = 'default') {
  const badge = document.createElement('div');
  badge.className = `sb-badge sb-${color}`;
  badge.innerHTML = `<span class="sb-label">${label}</span><span class="sb-value">${value}</span>`;
  return badge;
}

export const SummaryBadges = {
  /**
   * Create summary badges in a container
   * @param {string} containerId - Container element ID
   * @param {Object} options - Configuration
   *   @param {boolean} options.showTotalSaved - Show Total Saved badge (default true)
   *   @param {boolean} options.showQueue - Show Queue badge (default true)
   *   @param {boolean} options.showKeepCount - Show Keep Count badge (default true)
   */
  create(containerId, options: Record<string, any> = {}) {
    const {
      showTotalSaved = true,
      showQueue = true,
      showKeepCount = true
    } = options;

    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`SummaryBadges: container "${containerId}" not found`);
      return null;
    }

    // Create container
    const wrapper = document.createElement('div');
    wrapper.className = 'sb-container';

    // Create badge elements
    const badges = {};

    if (showTotalSaved) {
      badges.totalSaved = createBadgeEl('Total Saved', '0 B', 'green');
      wrapper.appendChild(badges.totalSaved);
    }

    if (showQueue) {
      badges.queue = createBadgeEl('🗑 Queue', '0', 'orange');
      wrapper.appendChild(badges.queue);
    }

    if (showKeepCount) {
      badges.keepCount = createBadgeEl('🔒 Kept', '0', 'default');
      wrapper.appendChild(badges.keepCount);
    }

    // Store instance
    badgeInstances.set(containerId, { wrapper, badges });

    // Append to container
    container.innerHTML = '';
    container.appendChild(wrapper);

    return wrapper;
  },

  /**
   * Update a badge value
   * @param {string} containerId - Container ID (from create)
   * @param {string} badgeType - 'totalSaved', 'queue', 'keepCount'
   * @param {string|number} value - New value
   */
  update(containerId, badgeType, value) {
    const instance = badgeInstances.get(containerId);
    if (!instance) {
      console.warn(`SummaryBadges: instance for "${containerId}" not found. Call create() first.`);
      return;
    }

    const badge = instance.badges[badgeType];
    if (!badge) {
      console.warn(`SummaryBadges: badge type "${badgeType}" not found in "${containerId}"`);
      return;
    }

    const valueEl = badge.querySelector('.sb-value');
    if (valueEl) {
      valueEl.textContent = value;
    }
  },

  /**
   * Add a custom badge
   * @param {string} containerId - Container ID
   * @param {string} label - Badge label
   * @param {string|number} value - Badge value
   * @param {string} color - Color class: 'green', 'orange', 'red', 'blue', or 'default'
   */
  addCustomBadge(containerId, label, value, color = 'default') {
    const instance = badgeInstances.get(containerId);
    if (!instance) {
      console.warn(`SummaryBadges: instance for "${containerId}" not found. Call create() first.`);
      return;
    }

    const badge = createBadgeEl(label, value, color);
    instance.wrapper.appendChild(badge);
    instance.badges[label] = badge;
  },

  /**
   * Clear all badges
   * @param {string} containerId - Container ID
   */
  clear(containerId) {
    const instance = badgeInstances.get(containerId);
    if (!instance) return;

    instance.wrapper.innerHTML = '';
    instance.badges = {};
  },

  /**
   * Destroy badge instance
   * @param {string} containerId - Container ID
   */
  destroy(containerId) {
    const instance = badgeInstances.get(containerId);
    if (!instance) return;

    if (instance.wrapper.parentElement) {
      instance.wrapper.parentElement.removeChild(instance.wrapper);
    }
    badgeInstances.delete(containerId);
  }
};
