// ═══════════════════════════════════════════════════════════════════════════
//  ERROR LOGGER — thin wrapper over wb-core error-logger
//  Provides backward-compat ErrLog.log(prefix, msg, detail, type) API
// ═══════════════════════════════════════════════════════════════════════════
import { logError, getErrors, clearErrors, setupGlobalErrorHandler } from '/lib/wb-core/utils/error-logger.js';
// Wire up global error + unhandled rejection catchers
setupGlobalErrorHandler();
// Backward-compat shim — existing callers use:
//   ErrLog.log(prefix, message, errorOrNull, type)
// wb-core uses:
//   logError(prefix, errorOrString, { type, context })
export const ErrLog = {
    log(prefix, message, detail, type) {
        // If detail is an Error, pass it (has .message + .stack);
        // otherwise pass the message string
        const err = detail instanceof Error ? detail : (message || 'Unknown error');
        logError(prefix, err, { type: type || 'ERROR' });
    },
    getErrors,
    clearErrors
};
//# sourceMappingURL=error-logger.js.map