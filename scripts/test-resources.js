import http from 'http';

const BASE = 'http://localhost:5100';
const PATHS = [
  '/js/breadcrumb.js','/js/error-logger.js','/js/metrics.js','/js/event-queue.js',
  '/js/column-controls.js','/js/status-bar.js','/js/table-utils.js','/js/ui-utils.js',
  '/js/savings.js','/js/settings.js','/js/trash-queue.js','/js/websocket.js',
  '/js/actions.js','/js/ext-colors.js','/js/scan-filter.js','/js/scan-grid.js',
  '/js/section-handlers.js','/js/events.js','/js/keep-list.js','/js/recycle-bin.js',
  '/js/task-manager.js','/js/page-loader.js','/js/init.js',
  '/sections/duplicates.js',
  '/models/duplicates-model.js','/viewmodels/section-vm.js','/views/grid-view.js',
  '/lib/wb-core/index.js','/lib/wb-core/utils/format.js','/lib/wb-core/utils/error-logger.js',
  '/lib/wb-core/components/grid-shell.js','/lib/wb-core/components/status-bar.js',
  '/lib/wb-core/components/filter-bar.js','/lib/wb-core/components/toolbar.js',
  '/lib/wb-core/components/row-actions.js',
  '/','/api/service/info',
];

function get(path) {
  return new Promise(resolve => {
    http.get(BASE + path, res => {
      res.resume();
      resolve({ path, status: res.statusCode });
    }).on('error', e => resolve({ path, status: 0, err: e.message }));
  });
}

const results = await Promise.all(PATHS.map(get));
const fails = results.filter(r => r.status !== 200);

if (fails.length === 0) {
  console.log('ALL OK - ' + results.length + ' resources');
  process.exit(0);
} else {
  console.log('FAILURES:');
  fails.forEach(r => console.log('  FAIL ' + (r.status||'ERR') + '  ' + r.path + (r.err ? ' - '+r.err : '')));
  process.exit(1);
}
