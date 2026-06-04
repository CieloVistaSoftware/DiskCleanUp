/**
 * ConnectionBadge — WebSocket Connection Status Indicator
 *
 * Simple status badge showing real-time WebSocket connection state.
 *
 * States:
 * - Connected: Green badge with ⚡ Online indicator
 * - Disconnected: Red badge with Disconnected text
 * - Reconnecting: Orange badge with "Reconnecting…" text
 *
 * Features:
 * - Visual status indicator (dot) with smooth color transitions
 * - Tooltip on hover
 * - Lightweight DOM (single element)
 * - CSS-based animations
 *
 * API:
 * - create(containerId) → initialize in container
 * - setConnected(connected) → update state (boolean)
 * - setReconnecting(reconnecting) → show reconnecting state
 * - destroy() → cleanup
 *
 * Example:
 * ConnectionBadge.create('status-area-id');
 * ConnectionBadge.setConnected(true); // Green
 * ConnectionBadge.setReconnecting(true); // Orange
 * ConnectionBadge.setConnected(false); // Red
 */
/** @type {Object|null} Connection badge instance */
let badgeInstance = null;
export const ConnectionBadge = {
    /**
     * Create connection badge in a container
     * @param {string} containerId - Container element ID
     * @returns {HTMLElement|null} Badge element
     */
    create(containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn(`ConnectionBadge: container "${containerId}" not found`);
            return null;
        }
        // Create badge element
        const badge = document.createElement('div');
        badge.className = 'cb-badge cb-connected';
        badge.innerHTML = '<span class="cb-dot"></span><span class="cb-text">⚡ Online</span>';
        badge.title = 'WebSocket connection: Online';
        // Store instance
        badgeInstance = { element: badge, state: 'connected' };
        // Append to container
        container.innerHTML = '';
        container.appendChild(badge);
        return badge;
    },
    /**
     * Update connection state
     * @param {boolean} connected - Connection status
     */
    setConnected(connected = true) {
        if (!badgeInstance) {
            console.warn('ConnectionBadge: not initialized. Call create() first.');
            return;
        }
        badgeInstance.element.classList.remove('cb-disconnected', 'cb-reconnecting');
        if (connected) {
            badgeInstance.element.classList.add('cb-connected');
            badgeInstance.element.innerHTML = '<span class="cb-dot"></span><span class="cb-text">⚡ Online</span>';
            badgeInstance.element.title = 'WebSocket connection: Online';
            badgeInstance.state = 'connected';
        }
        else {
            badgeInstance.element.classList.add('cb-disconnected');
            badgeInstance.element.innerHTML = '<span class="cb-dot"></span><span class="cb-text">Offline</span>';
            badgeInstance.element.title = 'WebSocket connection: Offline';
            badgeInstance.state = 'disconnected';
        }
    },
    /**
     * Show reconnecting state
     * @param {boolean} reconnecting - Reconnecting status
     */
    setReconnecting(reconnecting = true) {
        if (!badgeInstance) {
            console.warn('ConnectionBadge: not initialized. Call create() first.');
            return;
        }
        badgeInstance.element.classList.remove('cb-connected', 'cb-disconnected');
        if (reconnecting) {
            badgeInstance.element.classList.add('cb-reconnecting');
            badgeInstance.element.innerHTML = '<span class="cb-dot"></span><span class="cb-text">Reconnecting…</span>';
            badgeInstance.element.title = 'WebSocket connection: Reconnecting…';
            badgeInstance.state = 'reconnecting';
        }
        else {
            badgeInstance.element.classList.add('cb-connected');
            badgeInstance.element.innerHTML = '<span class="cb-dot"></span><span class="cb-text">⚡ Online</span>';
            badgeInstance.element.title = 'WebSocket connection: Online';
            badgeInstance.state = 'connected';
        }
    },
    /**
     * Get current connection state
     * @returns {string} 'connected', 'disconnected', or 'reconnecting'
     */
    getState() {
        return badgeInstance ? badgeInstance.state : null;
    },
    /**
     * Destroy badge
     */
    destroy() {
        if (badgeInstance && badgeInstance.element.parentElement) {
            badgeInstance.element.parentElement.removeChild(badgeInstance.element);
        }
        badgeInstance = null;
    }
};
//# sourceMappingURL=connection-badge.js.map