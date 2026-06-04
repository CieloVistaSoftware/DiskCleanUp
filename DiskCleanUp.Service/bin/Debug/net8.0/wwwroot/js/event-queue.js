// ═══════════════════════════════════════════════════════════════════════════
//  EVENT QUEUE — powered by @cielovista/wb-core PubSub
//  Uses RAF-batched publishing for scan RESULT events so DOM stays responsive.
//  Progress events fire IMMEDIATELY — they just update text nodes, zero layout cost.
//
//  CACHE RESTORE: pushEventSync() bypasses RAF batching so that
//  DocumentFragment batching in scan-grid.js can collect ALL rows
//  and flush in a single appendChild — one layout recalc instead of hundreds.
// ═══════════════════════════════════════════════════════════════════════════
import { pubsub } from '/lib/wb-core/utils/pubsub.js';
import { crumb } from './breadcrumb.js';
import { ErrLog } from './error-logger.js';
// Configure batch size for scan event throughput
pubsub.setBatchSize(20);
// Section handler registry — subscribe wrappers
const _handlers = {};
/**
 * Register a handler for a scan section.
 * Creates a pubsub subscription on `scan:{section}`.
 */
export function registerHandler(section, fn) {
    try {
        // Unsubscribe previous if re-registering
        if (_handlers[section])
            _handlers[section]();
        _handlers[section] = pubsub.subscribe(`scan:${section}`, fn);
    }
    catch (ex) {
        ErrLog.log('[EVENT_QUEUE]', ex.message, ex.stack, 'UNHANDLED_ERROR');
    }
}
/**
 * Push a scan event (live scanning).
 * - progress/started/done/error: fire IMMEDIATELY (just text updates)
 * - result/result_update: RAF-batched (DOM insertions need throttling)
 */
export function pushEvent(section, type, data) {
    try {
        const payload = { section, type, ...data };
        crumb('eq', 'push', { section, type });
        if (type === 'result' || type === 'result_update') {
            pubsub.publishBatched(`scan:${section}`, payload, {
                dropWhenFull: false,
                maxQueue: 500
            });
        }
        else {
            pubsub.publish(`scan:${section}`, payload);
        }
    }
    catch (ex) {
        ErrLog.log('[EVENT_QUEUE]', ex.message, ex.stack, 'UNHANDLED_ERROR');
    }
}
/**
 * Push a scan event SYNCHRONOUSLY (cache restore).
 * Bypasses RAF batching so scan-grid's DocumentFragment can
 * accumulate all rows and flush in ONE appendChild call.
 * The microtask flush fires after the entire sync loop completes.
 */
export function pushEventSync(section, type, data) {
    try {
        const payload = { section, type, ...data };
        pubsub.publish(`scan:${section}`, payload);
    }
    catch (ex) {
        ErrLog.log('[EVENT_QUEUE]', ex.message, ex.stack, 'UNHANDLED_ERROR');
    }
}
// Expose for devtools / testing
Object.defineProperty(window, '_eventQueueDepth', { get: () => pubsub.queueDepth });
Object.defineProperty(window, '_eventQueueDraining', { get: () => pubsub.draining });
//# sourceMappingURL=event-queue.js.map