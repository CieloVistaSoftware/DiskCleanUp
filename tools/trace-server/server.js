// ═══════════════════════════════════════════════════════════════════════════
//  TRACE SERVER — standalone, zero dependencies
//  Runs on port 5555, completely independent of the DiskCleanUp ASP.NET app.
//  If the main app freezes, this keeps serving the trace viewer.
//
//  Usage:  node server.js
//  Open:   http://localhost:5555
// ═══════════════════════════════════════════════════════════════════════════

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT      = 5555;
const TRACE_DIR = path.resolve(__dirname, '../../bin/Debug/net8.0');
const TRACE_FILE = path.join(TRACE_DIR, 'trace.jsonl');

// ── CORS headers (sendBeacon comes from a different port) ──────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ── Serve the viewer HTML ──────────────────────────────────────────────────
const VIEWER_HTML = fs.readFileSync(path.join(__dirname, 'viewer.html'), 'utf8');

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  // Home — serve viewer
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { ...CORS, 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(VIEWER_HTML);
  }

  // GET /api/trace — read trace lines
  if (req.url === '/api/trace' && req.method === 'GET') {
    try {
      if (!fs.existsSync(TRACE_FILE)) {
        res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ lines: [] }));
      }
      const lines = fs.readFileSync(TRACE_FILE, 'utf8')
        .split('\n')
        .filter(l => l.trim().length > 0);
      res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ lines }));
    } catch (e) {
      res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // POST /api/trace — append trace lines (from sendBeacon)
  if (req.url === '/api/trace' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        if (body.trim()) {
          fs.mkdirSync(TRACE_DIR, { recursive: true });
          fs.appendFileSync(TRACE_FILE, body + '\n');
        }
        res.writeHead(204, CORS);
        res.end();
      } catch (e) {
        res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // DELETE /api/trace — clear trace file
  if (req.url === '/api/trace' && req.method === 'DELETE') {
    try {
      if (fs.existsSync(TRACE_FILE)) fs.unlinkSync(TRACE_FILE);
      res.writeHead(204, CORS);
      return res.end();
    } catch (e) {
      res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // 404
  res.writeHead(404, { ...CORS, 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n  📜 Trace Server running at http://localhost:${PORT}\n`);
  console.log(`  Trace file: ${TRACE_FILE}`);
  console.log(`  Ctrl+C to stop\n`);
});
