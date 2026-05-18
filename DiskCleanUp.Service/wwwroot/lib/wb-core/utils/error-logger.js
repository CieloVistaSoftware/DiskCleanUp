/**
 * Error Logger
 * Logs errors and displays them in a fixed panel.
 * Styles in css/error-logger.css — zero inline styles.
 */
const ERROR_LOG_PATH = 'data/errors.json';
let errorContainer = null;
let errors = [];
let _cssLoaded = false;
/**
 * Load the companion stylesheet once
 */
function loadCSS() {
    if (_cssLoaded)
        return;
    _cssLoaded = true;
    // Resolve CSS path relative to this JS file
    const scriptUrl = import.meta.url;
    const cssUrl = new URL('../css/error-logger.css', scriptUrl).href;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssUrl;
    document.head.appendChild(link);
}
/**
 * Initialize the error display container
 */
function initErrorDisplay() {
    if (errorContainer)
        return;
    loadCSS();
    errorContainer = document.createElement('div');
    errorContainer.id = 'wb-error-display';
    errorContainer.setAttribute('role', 'log');
    errorContainer.setAttribute('aria-label', 'Error log');
    errorContainer.setAttribute('aria-live', 'polite');
    errorContainer.innerHTML = `
    <div class="wb-err-header">
      <span class="wb-err-title">❌ Errors (<span id="wb-error-count">0</span>)</span>
      <div class="wb-err-actions">
        <button id="wb-error-copy" class="wb-err-btn wb-err-btn-copy"
                title="Copy all errors to clipboard"
                aria-label="Copy all errors to clipboard">📋 Copy</button>
        <button id="wb-error-clear" class="wb-err-btn wb-err-btn-clear"
                title="Clear all errors"
                aria-label="Clear all errors">Clear</button>
        <button id="wb-error-close" class="wb-err-btn wb-err-btn-close"
                title="Close error panel"
                aria-label="Close error panel">✕</button>
      </div>
    </div>
    <div id="wb-error-list" role="list" aria-label="Error entries"></div>`;
    document.body.appendChild(errorContainer);
    document.getElementById('wb-error-copy').onclick = _copyAll;
    document.getElementById('wb-error-clear').onclick = _clearAll;
    document.getElementById('wb-error-close').onclick = () => {
        errorContainer.style.display = 'none';
    };
}
/**
 * Copy all errors to clipboard
 */
async function _copyAll() {
    const copyBtn = document.getElementById('wb-error-copy');
    const errorText = errors.map((e, i) => {
        let text = `[${i + 1}] ${e.prefix || ""} [${e.type || "ERROR"}] ${e.message}`;
        if (e.filename)
            text += `\n    File: ${e.filename}:${e.lineno || "?"}`;
        if (e.context)
            text += `\n    Context: ${e.context}`;
        if (e.to)
            text += `\n    To: ${e.to}`;
        if (e.stack)
            text += `\n    Stack:\n${e.stack.split("\n").map(l => "      " + l.trim()).join("\n")}`;
        text += `\n    Time: ${e.timestamp}`;
        text += `\n    URL: ${e.url}`;
        return text;
    }).join('\n\n');
    const header = `=== ${errors.length} Error(s) at ${new Date().toLocaleString()} ===\nPage: ${window.location.href}\n\n`;
    try {
        await navigator.clipboard.writeText(header + errorText);
        copyBtn.textContent = '✅ Copied!';
        copyBtn.classList.add('wb-err-btn-copied');
        setTimeout(() => {
            copyBtn.textContent = '📋 Copy';
            copyBtn.classList.remove('wb-err-btn-copied');
        }, 2000);
    }
    catch (e) {
        copyBtn.textContent = '❌ Failed';
        setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 2000);
    }
}
/**
 * Clear all errors
 */
function _clearAll() {
    errors = [];
    document.getElementById('wb-error-list').innerHTML = '';
    updateErrorCount();
    saveErrorLog();
}
/**
 * Parse filename, lineno, colno from a stack trace string
 */
function parseStack(stack) {
    if (!stack)
        return { filename: '', lineno: 0, colno: 0 };
    const match = stack.match(/(?:at\s+(?:\S+\s+)?)\(?(.+?):(\d+):(\d+)\)?/);
    return match
        ? { filename: match[1].split('/').pop(), lineno: parseInt(match[2], 10), colno: parseInt(match[3], 10) }
        : { filename: '', lineno: 0, colno: 0 };
}
/**
 * Infer error type from the Error object or message
 */
function inferType(err, overrideType) {
    if (overrideType)
        return overrideType;
    if (err instanceof TypeError || err instanceof ReferenceError || err instanceof SyntaxError)
        return 'RUNTIME_ERROR';
    const msg = String(err?.message || err).toLowerCase();
    if (msg.includes('fetch') || /\b[345]\d{2}\b/.test(msg))
        return 'FETCH_ERROR';
    return 'APP_ERROR';
}
/**
 * Log an error — simple interface, automatic field extraction.
 *
 * Usage:
 *   logError('[docs]', err);
 *   logError('[docs]', err, { context: 'boot', to: 'docs-container' });
 *   logError('[docs]', 'Something went wrong', { context: 'boot' });
 */
export async function logError(prefix, error, options = {}) {
    initErrorDisplay();
    const isErrorObj = error instanceof Error;
    const message = isErrorObj ? error.message : String(error);
    const stack = isErrorObj ? (error.stack || '') : '';
    const { filename, lineno, colno } = parseStack(stack);
    const entry = {
        id: (() => { let h = 5381; const s = message + (stack.split('\n')[1] || ''); for (let i = 0; i < s.length; i++)
            h = ((h << 5) + h) ^ s.charCodeAt(i); return h >>> 0; })(),
        timestamp: new Date().toISOString(),
        type: inferType(error, options.type),
        prefix,
        context: options.context || '',
        message,
        stack,
        filename,
        lineno,
        colno,
        to: options.to || '',
        url: window.location.href,
        userAgent: navigator.userAgent
    };
    errors.push(entry);
    updateErrorCount();
    // Build error item using CSS classes
    const list = document.getElementById('wb-error-list');
    const item = document.createElement('div');
    item.className = 'wb-err-item';
    item.setAttribute('role', 'listitem');
    const time = new Date(entry.timestamp).toLocaleTimeString();
    let meta = '';
    if (entry.filename)
        meta += `<span class="wb-err-file">${escapeHtml(entry.filename)}:${entry.lineno}</span>`;
    if (entry.context)
        meta += `<span class="wb-err-context">${escapeHtml(entry.context)}</span>`;
    if (entry.to)
        meta += `<span class="wb-err-to">→ ${escapeHtml(entry.to)}</span>`;
    item.innerHTML = `
    <div class="wb-err-item-head">
      <span class="wb-err-prefix">${escapeHtml(entry.prefix)} <span class="wb-err-type">${entry.type}</span></span>
      <time class="wb-err-time" datetime="${entry.timestamp}">${time}</time>
    </div>
    <div class="wb-err-message">${escapeHtml(entry.message)}</div>
    <div class="wb-err-meta">${meta}</div>
    ${entry.stack ? `<div class="wb-err-stack">${escapeHtml(entry.stack)}</div>` : ''}`;
    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
    // Show container
    errorContainer.style.display = 'block';
    // Save to file
    await saveErrorLog();
    // Console output
    console.error(`${entry.prefix} [${entry.type}] ${entry.message}${entry.filename ? ' (' + entry.filename + ':' + entry.lineno + ')' : ''}`);
    return entry;
}
/**
 * Save latest error to backend.
 * Posts to /api/errors (DiskCleanUp backend).
 * Silently fails — NEVER triggers logError to avoid infinite cascade.
 * Queues errors when tab is hidden (browser suspends network I/O).
 */
let _saveInFlight = false;
const _pendingErrors = [];
// Flush queued errors when tab becomes visible again
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && _pendingErrors.length > 0) {
        const batch = _pendingErrors.splice(0);
        batch.forEach(entry => _postError(entry));
    }
});
async function saveErrorLog() {
    if (_saveInFlight || errors.length === 0)
        return;
    const latest = errors[errors.length - 1];
    // Don't POST into a suspended network — queue it
    if (document.visibilityState === 'hidden') {
        _pendingErrors.push(latest);
        return;
    }
    await _postError(latest);
}
async function _postError(entry) {
    if (_saveInFlight)
        return;
    _saveInFlight = true;
    try {
        await fetch('/api/errors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                timestamp: entry.timestamp,
                type: entry.type,
                prefix: entry.prefix,
                message: entry.message,
                stack: entry.stack || '',
                filename: entry.filename || '',
                url: entry.url || ''
            })
        });
    }
    catch { /* silent — never re-trigger logError */ }
    _saveInFlight = false;
}
/**
 * Load errors from JSON file
 */
export async function loadErrorLog() {
    try {
        const response = await fetch(`/${ERROR_LOG_PATH}?t=${Date.now()}`);
        if (response.ok) {
            const data = await response.json();
            errors = data.errors || [];
            return data;
        }
    }
    catch (e) {
        console.warn('[ErrorLogger] Could not load error log:', e);
    }
    return { errors: [] };
}
/**
 * Get all logged errors
 */
export function getErrors() {
    return errors;
}
/**
 * Clear all errors
 */
export async function clearErrors() {
    errors = [];
    const list = document.getElementById('wb-error-list');
    if (list)
        list.innerHTML = '';
    updateErrorCount();
    await saveErrorLog();
}
/**
 * Escape HTML entities
 */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
/**
 * Update the error count badge
 */
function updateErrorCount() {
    const countEl = document.getElementById('wb-error-count');
    if (countEl)
        countEl.textContent = errors.length;
}
/**
 * Setup global error catching
 */
export function setupGlobalErrorHandler() {
    window.addEventListener('error', (event) => {
        logError('[global]', event.error || event.message, { type: 'UNCAUGHT_ERROR', context: event.filename });
    });
    window.addEventListener('unhandledrejection', (event) => {
        logError('[global]', event.reason instanceof Error ? event.reason : String(event.reason), { type: 'PROMISE_REJECTION' });
    });
}
export default { logError, loadErrorLog, getErrors, clearErrors, setupGlobalErrorHandler };
//# sourceMappingURL=error-logger.js.map