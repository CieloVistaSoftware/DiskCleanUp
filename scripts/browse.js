#!/usr/bin/env node
/**
 * browse.js — open the DiskCleanUp dashboard in the default browser.
 * Probes port 5100 (service mode) then 5000 (console/dev mode).
 * If neither responds, opens 5100 anyway so the user sees the connection error.
 */

import { get }      from 'http';
import { exec }     from 'child_process';

const PORTS = [5100, 5000];

function probe(port) {
  return new Promise(resolve => {
    const req = get({ hostname: '127.0.0.1', port, path: '/api/service/info', timeout: 1500 }, res => {
      req.destroy();
      resolve(res.statusCode < 500);
    });
    req.on('error',   () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function findPort() {
  for (const port of PORTS) {
    if (await probe(port)) return port;
  }
  return PORTS[0]; // fallback — browser will show connection error
}

const port = await findPort();
const url  = `http://localhost:${port}/`;
console.log(`Opening ${url}`);
exec(`start "" "${url}"`);
