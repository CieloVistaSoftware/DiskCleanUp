#!/usr/bin/env node
/**
 * kill-port.js - Kill processes listening on specified ports (Windows)
 *
 * Strategy:
 *   1. For each port: POST /api/shutdown (graceful, no admin)
 *   2. Wait for that specific port to become free
 *   3. taskkill by port PID as fallback
 *   4. taskkill /IM as nuclear fallback
 *   5. Check if any DiskCleanUp process still running (Session 0 service)
 *
 * Exit codes: 0 = all clear, 2 = Session 0 service still running (use alt build)
 */
import { execSync } from 'child_process';
import http from 'http';

const EXE_NAME = 'DiskCleanUp.Service.exe';
const PORTS = process.argv.slice(2).map(Number).filter(Boolean);
if (!PORTS.length) { console.log('Usage: node kill-port.js <port> [port2...]'); process.exit(0); }

// -- Helpers --------------------------------------------------------
function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', timeout: 30000 }).trim(); }
  catch { return null; }
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isPortListening(port) {
  const out = run('netstat -ano');
  if (!out) return false;
  const portStr = ':' + port;
  return out.split('\n').some(l => l.includes(portStr) && l.includes('LISTENING'));
}

function getPidsOnPort(port) {
  const out = run('netstat -ano');
  if (!out) return [];
  const pids = new Set();
  const portStr = ':' + port;
  for (const line of out.split('\n')) {
    if (line.includes(portStr) && line.includes('LISTENING')) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0' && !isNaN(pid)) pids.add(pid);
    }
  }
  return [...pids];
}

function isAnyDiskCleanUpRunning() {
  const out = run('powershell.exe -NoProfile -Command "Get-Process DiskCleanUp* -ErrorAction SilentlyContinue | Measure-Object | Select-Object -ExpandProperty Count"');
  return out != null && parseInt(out, 10) > 0;
}

function httpPost(port, urlPath) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: urlPath, method: 'POST', timeout: 5000 },
      (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }
    );
    req.on('error', () => resolve(0));
    req.on('timeout', () => { req.destroy(); resolve(0); });
    req.end();
  });
}

// -- Per-port shutdown ----------------------------------------------
async function shutdownPort(port) {
  if (!isPortListening(port)) {
    console.log(`  Port ${port}: not in use`);
    return true;
  }

  // Try graceful HTTP shutdown
  console.log(`  Port ${port}: POST /api/shutdown ...`);
  const status = await httpPost(port, '/api/shutdown');

  if (status === 200) {
    console.log(`  Port ${port}: shutdown accepted, waiting...`);
    for (let i = 0; i < 20; i++) {  // 10s max
      sleepMs(500);
      if (!isPortListening(port)) {
        console.log(`  Port ${port}: freed`);
        return true;
      }
    }
    console.log(`  Port ${port}: still listening after 10s`);
  } else {
    console.log(`  Port ${port}: HTTP ${status || 'no response'} (no /api/shutdown)`);
  }

  // Fallback: taskkill by PID
  const pids = getPidsOnPort(port);
  for (const pid of pids) {
    console.log(`  Port ${port}: taskkill /PID ${pid} /F`);
    run(`taskkill /PID ${pid} /F`);
  }

  sleepMs(1000);
  if (!isPortListening(port)) {
    console.log(`  Port ${port}: freed after taskkill`);
    return true;
  }

  console.log(`  Port ${port}: could not free (Session 0 service?)`);
  return false;
}

// -- Main -----------------------------------------------------------
async function main() {
  console.log('Stopping DiskCleanUp instances...');

  let allFreed = true;
  for (const port of PORTS) {
    const freed = await shutdownPort(port);
    if (!freed) allFreed = false;
  }

  // Nuclear fallback for any stragglers not on known ports
  if (isAnyDiskCleanUpRunning()) {
    console.log('  Trying taskkill /IM fallback...');
    run(`taskkill /IM ${EXE_NAME} /F`);
    sleepMs(2000);
  }

  // Final verdict
  if (isAnyDiskCleanUpRunning()) {
    console.log(`WARNING: ${EXE_NAME} still running (Session 0 service). Will use alternate build dir.`);
    process.exit(2);
  }

  console.log('All clear');
}

main();
