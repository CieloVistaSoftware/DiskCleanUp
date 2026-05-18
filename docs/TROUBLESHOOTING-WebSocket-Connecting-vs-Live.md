# DiskCleanUp Troubleshooting Guide: "Connecting..." vs "Live"

## Purpose
This guide explains why the dashboard can get stuck at `⚡ Connecting...` and what fixes were applied so the UI reaches `⚡ Live` (`#connStatus.connected`).

## Symptoms
- Header connection indicator stays at `⚡ Connecting...`.
- Scans do not receive live updates.
- Page may appear responsive, but realtime events never arrive.

## What "healthy" looks like
- In the dashboard header, `#connStatus` shows:
  - Text: `⚡ Live`
  - Class: `connected`
- WebSocket endpoint is reachable at `ws://localhost:5000/ws` (or current host/port).

## Root causes observed
1. Reconnect loop could stall if close/reconnect timing got out of sync.
2. In some browser/runtime edge cases, calling `close()` did not reliably produce `onclose`, which blocked retry logic.
3. Runtime script/module issues could interrupt startup and prevent connection state transitions.

## Fixes that resolved the issue

### 1) Reconnect watchdog
A watchdog timer was added to detect prolonged non-live states and force a fresh reconnect attempt.

Why this matters:
- Prevents indefinite `Connecting...` when the normal reconnect path stalls.

### 2) Fallback reconnect when `onclose` does not fire
After timed close attempts, a fallback timer checks whether `onclose` actually occurred. If not, reconnect is forced.

Why this matters:
- Removes reliance on `onclose` always firing in every environment.

### 3) Connection attempt timing/backoff state hardening
Connection-attempt timestamps and reconnect/backoff reset behavior were tightened.

Why this matters:
- Keeps reconnect state machine consistent and recoverable.

### 4) Runtime module export repair
A runtime logger/export issue was corrected so startup paths could execute fully.

Why this matters:
- Prevents partial initialization that leaves status transitions broken.

## Verification procedure

### A) Service-level startup test
From repo root:

```powershell
npm test
```

Expected:
- Startup suite passes.
- Service responds on `/api/service/info`.
- `GET /` returns dashboard.

### B) UI connection status check
1. Start service:

```powershell
npm start
```

2. Open `http://localhost:5000/`.
3. Confirm header shows `⚡ Live`.

Optional devtools check:

```js
(() => {
  const el = document.getElementById('connStatus');
  return { text: el?.textContent?.trim(), className: el?.className };
})();
```

Expected result:

```json
{ "text": "⚡ Live", "className": "connected" }
```

## If it still shows "Connecting..."
1. Refresh the page once.
2. Confirm service is reachable:
   - `http://localhost:5000/api/service/info`
3. Check `ws-diagram.html` from the header link.
4. Restart service from tray app (if running) or rerun `npm start`.
5. Verify no stale process still owns port `5000`/`5100`.

## Notes
- The reconnect loop is expected to retry with backoff (0 -> 2s -> 5s -> 10s -> 20s).
- Seeing a brief `Connecting...` during startup/restart is normal.
- Persistent `Connecting...` after startup indicates a recoverability problem and should be investigated with this guide.
