/**
 * Format Utilities
 * ================
 * Common formatters for bytes, dates, numbers.
 *
 * Usage:
 *   import { fmtBytes, fmtNumber, fmtDate } from '@cielovista/wb-core';
 *   fmtBytes(1048576)   // "1.0 MB"
 *   fmtNumber(12345)    // "12,345"
 *   fmtDate(new Date()) // "2026-02-24"
 */

/**
 * Format bytes into human-readable string (B, KB, MB, GB)
 * @param {number} bytes
 * @returns {string}
 */
export function fmtBytes(bytes) {
  bytes = Number(bytes) || 0;
  if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(2) + ' GB';
  if (bytes >= 1_048_576)     return (bytes / 1_048_576).toFixed(1) + ' MB';
  if (bytes >= 1024)          return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

// Alias for backward compat
export const fmt = fmtBytes;

/**
 * Format number with locale-aware thousands separators
 * @param {number} n
 * @returns {string}
 */
export function fmtNumber(n) {
  return Number(n).toLocaleString();
}

/**
 * Format Date as YYYY-MM-DD
 * @param {Date|string|number} d
 * @returns {string}
 */
export function fmtDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().slice(0, 10);
}

/**
 * Format Date as locale time string (e.g. "3:45:12 PM")
 * @param {Date|string|number} [d] — defaults to now
 * @returns {string}
 */
export function fmtTime(d) {
  const dt = d ? (d instanceof Date ? d : new Date(d)) : new Date();
  return dt.toLocaleTimeString();
}

/**
 * Escape HTML entities — prevents XSS in dynamic markup
 * @param {string} s
 * @returns {string}
 */
export function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
