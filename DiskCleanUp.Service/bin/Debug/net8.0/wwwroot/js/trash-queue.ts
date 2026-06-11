// ═══════════════════════════════════════════════════════════════════════════
//  DELETE QUEUE — one fire-and-forget call, server handles the rest
// ═══════════════════════════════════════════════════════════════════════════

import { ErrLog } from './error-logger.js';
import { updateTotalSaved } from './savings.js';
import { crumb } from './breadcrumb.js';

export const TrashQ = (() => {

  function enqueue(paths, onComplete?) {
    if (!paths.length) return;
    crumb('trash', 'enqueue', { count: paths.length });

    window._T?.('DEL', `FIRE ${paths.length} files → server`);

    // One call. Server loops. We don't wait.
    // Single retry on network failure (survives server restarts)
    const _fire = (attempt) => fetch('/api/trash', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ paths })
    })
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(data => {
      window._T?.('DEL', `✓ ${paths.length} done — freed ${((data.freed||0)/1024).toFixed(0)}KB`);
      if (data.errors?.length) data.errors.forEach(e => window._T?.('DEL', `  ⚠ ${e}`));
      updateTotalSaved();
    })
    .catch(e => {
      if (attempt < 2) {
        window._T?.('DEL', `⚠ attempt ${attempt} failed, retry in 2s…`);
        setTimeout(() => _fire(attempt + 1), 2000);
      } else {
        window._T?.('DEL', `✗ FAIL — ${e}`);
        ErrLog.log('[queue]', `Delete failed: ${e}`, null, 'TRASH_ERROR');
      }
    });
    _fire(1);

    // Callback fires NOW — UI is already done
    if (onComplete) try { onComplete(); } catch (_) {
  ErrLog.log('[TRASH_QUEUE]', _.message, _.stack, 'CAUGHT_ERROR');
}
  }

  return { enqueue };
})();

window.TrashQ = TrashQ;
