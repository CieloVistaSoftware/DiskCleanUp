# WebSocket Reconnection Fix — May 17, 2026

## Problem
Dashboard displays "Connecting..." and fails to recover when the DiskCleanUp service becomes unreachable. This issue persisted for extended periods (weeks) with no auto-recovery.

**Root Cause:** The reconnect loop depended entirely on the `onclose` event being called after `_ws?.close()` in the timeout handler. In rare cases (browser edge cases, race conditions), if `onclose` didn't fire, the reconnection loop stalled permanently.

## Solution
Added **dual-layer automatic recovery** to ensure reconnects always happen, even if `onclose` misfires:

### Layer 1: Fallback onclose Handler (Immediate)
- When the 15-second connection timeout fires, a secondary 2-second timer starts
- If `onclose` hasn't been called by then, force an immediate reconnect
- Prevents stalling caused by missing `onclose` events

### Layer 2: Watchdog Timer (Background)
- Runs every 30 seconds checking if the connection is "Live"
- If NOT connected and >45 seconds have elapsed since the last connection attempt, force a reconnect
- Resets the exponential backoff to allow immediate retry
- Catches any edge cases where the entire reconnect loop somehow stalls

## Files Modified
- **`DiskCleanUp.Service/wwwroot/js/websocket.ts`** (lines 27-28, 199-220, 233, 249-261, 270)

## Changes Summary

1. **New module-level state tracking (lines 27-28):**
   - `_lastWsStatusTime`: Timestamp of last connection attempt
   - `_watchdogTimer`: Reference to the watchdog interval

2. **New function: `_startWatchdog()` (lines 199-220):**
   ```typescript
   // Checks every 30s if status is "Live"
   // Forces reconnect if >45s without successful connection
   ```

3. **Updated `wsConnect()` (lines 233, 254-261):**
   - Tracks connection attempt time
   - Starts the watchdog
   - Added 2-second fallback timer that checks if `onclose` was called
   - Forces reconnect if `onclose` doesn't fire

4. **Updated `onopen` handler (line 272):**
   - Clears the watchdog when connection succeeds (no overhead when live)

5. **Updated `onclose` handler (line 271):**
   - Sets `_oncloseWasCalled = true` flag for fallback detection

## Testing
```powershell
# Build the project
dotnet build --configuration Debug

# Run the service, then:
# 1. Kill the DiskCleanUp Windows Service
# 2. Open dashboard in browser
# 3. Watch console logs for:
#    - "watchdog triggered: forcing reconnect" if stalled
#    - "WARNING: onclose not fired after close()" if fallback triggered
# 4. Verify dashboard recovers automatically
```

## Behavior
- **When connected:** No overhead. Watchdog interval is clear.
- **When disconnected:** Exponential backoff continues (0→2→5→10→20s) with watchdog as safety net
- **If stalled >45s:** Watchdog forces immediate reconnect, resets backoff
- **If `onclose` misfires:** Fallback timer detects it within 2 seconds and forces reconnect

## No Breaking Changes
- User-facing behavior unchanged
- Error messages unchanged
- Button actions unchanged
- Only adds internal recovery mechanisms

## Build Result
✅ **Build succeeded** — 0 Warnings, 0 Errors
