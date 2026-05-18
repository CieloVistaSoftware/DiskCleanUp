/**
 * WB PubSub — Event Bus System
 * ============================
 * Lightweight publish/subscribe with optional RAF-batched delivery.
 *
 * TIME-BUDGETED DRAIN: Instead of a fixed batch size, the drain loop
 * processes events until it has used N ms of wall-clock time per frame.
 * Heavy DOM ops (addRow) self-throttle; light ops process more per frame.
 * This eliminates ~1s freezes that occurred with fixed batch sizes.
 *
 * Usage:
 *   import { pubsub } from '@cielovista/wb-core';
 *
 *   // Standard (synchronous)
 *   pubsub.subscribe('scan:result', data => renderRow(data));
 *   pubsub.publish('scan:result', { hash, files });
 *
 *   // RAF-batched (high-frequency events)
 *   pubsub.publishBatched('scan:result', { hash, files });
 *
 *   // Backpressure: drop stale events when queue is deep
 *   pubsub.publishBatched('scan:progress', data, { dropWhenFull: true, maxQueue: 50 });
 */
export class PubSub {
    constructor() {
        this._memDropCount = 0;
        // ── TIME-BUDGETED DRAIN ─────────────────────────────────────────────
        // Process events until wall-clock budget is exhausted.
        // 8ms normal = fits inside 16ms frame with room for paint.
        // 4ms under pressure = even more conservative.
        this._drainCount = 0;
        this._backoffLogged = false;
        this.events = new Map();
        this._queue = [];
        this._rafPending = false;
        this._batchSize = 20; // kept for API compat, but drain uses time budget
    }
    setBatchSize(size) {
        this._batchSize = Math.max(1, size);
    }
    subscribe(event, callback) {
        if (!this.events.has(event))
            this.events.set(event, new Set());
        this.events.get(event).add(callback);
        return () => this.unsubscribe(event, callback);
    }
    unsubscribe(event, callback) {
        const subs = this.events.get(event);
        if (subs) {
            subs.delete(callback);
            if (subs.size === 0)
                this.events.delete(event);
        }
    }
    once(event, callback) {
        const unsub = this.subscribe(event, (data) => { unsub(); callback(data); });
        return unsub;
    }
    publish(event, data) {
        const subs = this.events.get(event);
        if (!subs)
            return;
        subs.forEach(cb => {
            try {
                cb(data);
            }
            catch (err) {
                console.error(`[PubSub] Error in subscriber for "${event}":`, err);
            }
        });
    }
    publishBatched(event, data, opts = {}) {
        const { dropWhenFull = false, maxQueue = 50, lowPriority = false } = opts;
        if (dropWhenFull && this._queue.length > maxQueue)
            return;
        // Only drop under memory pressure when the caller opted in (dropWhenFull).
        // Result events use dropWhenFull: false — they must never be silently lost.
        const mem = window._memPct || 0;
        if (dropWhenFull && mem > 70 && !lowPriority) {
            this._memDropCount++;
            if (this._memDropCount === 1 || this._memDropCount % 50 === 0)
                window._T?.('PUBSUB', `MEM ${mem}% - dropped event #${this._memDropCount} (${event})`);
            return;
        }
        this._queue.push({ event, data });
        if (!this._rafPending) {
            this._rafPending = true;
            requestAnimationFrame(() => this._drain());
        }
    }
    _drain() {
        this._drainCount++;
        const cpu = window._cpuPct || 0;
        // CPU >= 90%: skip entirely, retry in 500ms
        if (cpu >= 90) {
            if (!this._backoffLogged) {
                window._T?.('PUBSUB', `CPU ${cpu}% - pausing drain, queue=${this._queue.length}`);
                this._backoffLogged = true;
            }
            setTimeout(() => this._drain(), 500);
            return;
        }
        const mem = window._memPct || 0;
        let budgetMs = 8;
        if (cpu >= 70 || mem > 70)
            budgetMs = 4;
        if (cpu < 70 && mem <= 70)
            this._backoffLogged = false;
        if (this._drainCount <= 5 || this._drainCount % 50 === 0)
            window._T?.('PUBSUB', `drain #${this._drainCount}: queue=${this._queue.length} cpu=${cpu}% mem=${mem}% budget=${budgetMs}ms`);
        const t0 = performance.now();
        let processed = 0;
        while (this._queue.length > 0 && (performance.now() - t0) < budgetMs) {
            const { event, data } = this._queue.shift();
            this.publish(event, data);
            processed++;
        }
        if (this._queue.length > 0) {
            if (cpu >= 70 || mem > 70)
                setTimeout(() => this._drain(), 50);
            else
                requestAnimationFrame(() => this._drain());
        }
        else {
            this._rafPending = false;
            this._backoffLogged = false;
            if (this._memDropCount > 0) {
                window._T?.('PUBSUB', `MEM recovered - dropped ${this._memDropCount} events during pressure`);
                this._memDropCount = 0;
            }
        }
    }
    get queueDepth() { return this._queue.length; }
    get draining() { return this._rafPending; }
    clear() {
        this.events.clear();
        this._queue.length = 0;
        this._rafPending = false;
    }
}
export const pubsub = new PubSub();
export default pubsub;
//# sourceMappingURL=pubsub.js.map