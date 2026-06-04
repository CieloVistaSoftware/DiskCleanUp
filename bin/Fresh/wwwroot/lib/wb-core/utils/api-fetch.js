/**
 * API Fetch — timeout-wrapped fetch with error callbacks
 * ======================================================
 * Usage:
 *   import { apiFetch } from '@cielovista/wb-core';
 *
 *   const data = await apiFetch('/api/config');
 *   const data = await apiFetch('/api/trash', { method: 'POST', body: ... });
 *   const data = await apiFetch('/api/slow', {}, { timeout: 15000 });
 *
 * Error handling:
 *   apiFetch.onError = (type, message, detail) => { ... };
 *   Types: 'TIMEOUT', 'FETCH_ERROR', 'HTTP_ERROR'
 */

/** @type {((type: string, message: string, detail?: any) => void) | null} */
let _onError = null;

/**
 * @param {string} url
 * @param {RequestInit} [opts]
 * @param {Object} [config]
 * @param {number} [config.timeout=8000] — ms before AbortController fires
 * @returns {Promise<any>} parsed JSON
 */
export async function apiFetch(url, opts = {}, config = {}) {
  const { timeout = 8000 } = config;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeout);

  let r;
  try {
    r = await fetch(url, { signal: ctrl.signal, ...opts });
  } catch (err) {
    if (err.name === 'AbortError') {
      _onError?.('TIMEOUT', `Timeout after ${timeout}ms — ${url}`, null);
    } else {
      _onError?.('FETCH_ERROR', `Network error: ${url} — ${err.message}`, err);
    }
    throw err;
  } finally {
    clearTimeout(tid);
  }

  if (!r.ok) {
    const body = await r.text().catch(() => '');
    _onError?.('HTTP_ERROR', `HTTP ${r.status} ${r.statusText} — ${url}${body ? ' | ' + body.slice(0, 120) : ''}`, null);
    return null;
  }

  return r.json();
}

/**
 * Set global error callback — called for every fetch error.
 * @param {(type: string, message: string, detail?: any) => void} fn
 */
apiFetch.setErrorHandler = (fn) => { _onError = fn; };

export default apiFetch;
