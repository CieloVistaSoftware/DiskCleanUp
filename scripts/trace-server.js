#!/usr/bin/env node
/**
 * Trace Viewer — standalone server on port 5001.
 * Serves Service/wwwroot/ static files and proxies /api/* to the main server on :5000.
 *
 * Launched automatically by npm start.
 * Opens: http://localhost:5001/trace-viewer.html
 */
import http from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WWWROOT  = path.join(__dirname, '..', 'DiskCleanUp.Service', 'wwwroot');
const PORT     = 5001;
const API_HOST = 'http://localhost:5000';

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
};

function serveStatic(req, res) {
  let filePath = path.join(WWWROOT, req.url === '/' ? '/trace-viewer.html' : req.url.split('?')[0]);
  filePath = path.normalize(filePath);

  // Security: stay inside wwwroot
  if (!filePath.startsWith(WWWROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); res.end('Not Found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

function proxyApi(req, res) {
  const url = new URL(req.url, API_HOST);
  const opts = {
    hostname: url.hostname,
    port:     url.port,
    path:     url.pathname + url.search,
    method:   req.method,
    headers:  { ...req.headers, host: 'localhost:5000' },
  };
  const proxyReq = http.request(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (e) => {
    res.writeHead(502);
    res.end(JSON.stringify({ error: `Main server unavailable: ${e.message}` }));
  });
  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return proxyApi(req, res);
  serveStatic(req, res);
});

// Proxy WebSocket upgrades (/ws) to the main server on :5000
server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws') { socket.destroy(); return; }
  const upstream = net.connect(5000, '127.0.0.1', () => {
    upstream.write(
      `GET /ws HTTP/1.1\r\n` +
      `Host: localhost:5000\r\n` +
      Object.entries(req.headers)
        .filter(([k]) => k !== 'host')
        .map(([k, v]) => `${k}: ${v}`).join('\r\n') +
      `\r\n\r\n`
    );
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}/trace-viewer.html`;
  console.log(`📜 Trace Viewer → ${url}`);
  console.log(`   Proxying /api/* → ${API_HOST}`);
  setTimeout(() => exec(`start "" "${url}"`), 800);
});
