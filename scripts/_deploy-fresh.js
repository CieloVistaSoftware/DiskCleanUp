#!/usr/bin/env node
/**
 * One-time bootstrap: runs the fresh build (which has /api/shutdown)
 * as a console process on port 5000, then uses IT to prove the
 * shutdown endpoint works.  Meanwhile the old service on 5100
 * stays running until we can replace it.
 *
 * Real goal: just prove the build compiles and the shutdown endpoint works.
 */
import { spawn } from 'child_process';
import http from 'http';

const FRESH = 'DiskCleanUp.Service/bin/Fresh/DiskCleanUp.Service.dll';
const PORT = 5000;

function httpPost(port, path) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'POST', timeout: 5000 },
      (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
    req.end();
  });
}

function waitForPort(port, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const iv = setInterval(() => {
      if (Date.now() - start > timeoutMs) { clearInterval(iv); resolve(false); return; }
      const req = http.get(`http://127.0.0.1:${port}/`, () => { clearInterval(iv); resolve(true); });
      req.on('error', () => {});
      req.setTimeout(500, () => req.destroy());
    }, 500);
  });
}

async function main() {
  // 1. Try to shutdown the OLD service on 5100 first (it won't have the endpoint, but try)
  console.log('Attempting POST /api/shutdown on port 5100 (old service)...');
  const oldResult = await httpPost(5100, '/api/shutdown');
  console.log(`  Result: ${oldResult.status} ${oldResult.body || oldResult.error || ''}`);

  // 2. Start fresh build on port 5000
  console.log(`\nStarting fresh build on port ${PORT}...`);
  const proc = spawn('dotnet', [FRESH, '--console'], { stdio: 'pipe' });

  let output = '';
  proc.stdout.on('data', d => { output += d; process.stdout.write(d); });
  proc.stderr.on('data', d => { output += d; process.stderr.write(d); });

  const up = await waitForPort(PORT);
  if (!up) {
    console.error('Fresh build did not start within 15s');
    proc.kill();
    process.exit(1);
  }
  console.log(`\nFresh build running on port ${PORT}`);

  // 3. Test the shutdown endpoint
  console.log('\nTesting POST /api/shutdown on port 5000...');
  const result = await httpPost(PORT, '/api/shutdown');
  console.log(`  Status: ${result.status}`);
  console.log(`  Body: ${result.body}`);

  if (result.status === 200) {
    console.log('\n✓ Shutdown endpoint works! Waiting for process to exit...');
    await new Promise(resolve => {
      proc.on('exit', (code) => {
        console.log(`  Process exited with code ${code}`);
        resolve();
      });
      setTimeout(() => {
        console.log('  Timeout — killing');
        proc.kill();
        resolve();
      }, 10000);
    });
    console.log('\n✓ SUCCESS — /api/shutdown is working correctly');
  } else {
    console.error('\n✗ Shutdown endpoint failed');
    proc.kill();
    process.exit(1);
  }
}

main();
