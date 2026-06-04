/**
 * @cielovista/wb-core - Cielo Vista Software
 * Light DOM only. ES modules only. No framework dependencies.
 */

// --- Components --------------------------------------------------------
export { tabs }                     from './components/tabs.js';
export { dropdown }                 from './components/dropdown.js';
export { tooltip }                  from './components/tooltip.js';
export { toggle }                   from './components/toggle.js';
export { popover, drawer, lightbox, offcanvas, sheet, confirm, prompt } from './components/overlay.js';
export { toast, createToast, badge, progress, spinner, avatar, chip, alert, skeleton, divider, breadcrumb, notify, pill } from './components/feedback.js';
export { collapse, accordion }      from './components/collapse.js';
export { darkmode }                 from './components/darkmode.js';
export { draggable }                from './components/draggable.js';
export { masked }                   from './components/masked.js';
export { default as progressbar }   from './components/progressbar.js';
export { resizable }                from './components/resizable.js';
export { ripple }                   from './components/ripple.js';
export { search }                   from './components/search.js';
export { slider }                   from './components/slider.js';
export { stepper }                  from './components/stepper.js';
export { sticky }                   from './components/sticky.js';
export { tags }                     from './components/tags.js';
export { themecontrol }             from './components/themecontrol.js';
export { validator }                from './components/validator.js';
export { password }                 from './components/password.js';
export { floatinglabel }            from './components/floatinglabel.js';
export { autocomplete }             from './components/autocomplete.js';
export { default as autosize }      from './components/autosize.js';
export { form }                     from './components/form.js';
export { mdhtml }                   from './components/mdhtml.js';
export { audio, youtube, vimeo, video, image, gallery, ratio, figure } from './components/media.js';

// Layouts - sticky aliased to layoutSticky to avoid conflict with standalone sticky behavior
export {
  grid, flex, stack, cluster, masonry, container, center,
  sidebarlayout, switcher, cover, frame, reel, imposter,
  icon, drawerLayout, scrollable, fixed,
  sticky as layoutSticky
} from './components/layouts.js';

// --- Unified Grid Components (DiskCleanUp) ----------------------------
export { GridShell }                from './components/grid-shell.js';
export { RowActions }               from './components/row-actions.js';
export { StatusBar }                from './components/status-bar.js';
export { FilterBar }                from './components/filter-bar.js';
export { Toolbar }                  from './components/toolbar.js';
export { MetricsBar }               from './components/metrics-bar.js';
export { ConnectionBadge }          from './components/connection-badge.js';
export { SummaryBadges }            from './components/summary-badges.js';

// --- Behaviors ---------------------------------------------------------
export { copy }                     from './behaviors/copy.js';
export {
  lazy, print, share, fullscreen, hotkey, clipboard, scroll,
  truncate, highlight, external, countdown, clock, relativetime,
  offline, visible, debug
} from './behaviors/helpers.js';
export { tableResize }              from './behaviors/table-resize.js';
export { tableSort, sortTable, cellValue } from './behaviors/table-sort.js';

// --- Utilities ---------------------------------------------------------
export { PubSub, pubsub }           from './utils/pubsub.js';
export { getConfig, setConfig }     from './utils/config.js';
export { Theme }                    from './utils/theme.js';
export { logError, loadErrorLog, getErrors, clearErrors, setupGlobalErrorHandler } from './utils/error-logger.js';
export { apiFetch }                 from './utils/api-fetch.js';
export { fmtBytes, fmt, fmtNumber, fmtDate, fmtTime, escHtml } from './utils/format.js';
