#!/usr/bin/env node
/**
 * test-startup.js - Automated test for npm start reliability.
 *
 * Tests that kill-port.js properly frees ports and reports status.
 * Tests that the service starts and responds on port 5000.
 */
import { execSync, spawn } from 'child_process';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { console.log(`  PASS: ${msg}`); passed++; }
  else { console.error(`  FAIL: ${msg}`); failed++; }
}

function run(cmd, opts = {}) {
  try {
    return { ok: true, out: execSync(cmd, { encoding: 'utf8', stdio: 'pipe', timeout: opts.timeout || 30000, cwd: opts.cwd || ROOT }).trim() };
  } catch (e) {
    return { ok: false, code: e.status, out: (e.stdout || '').trim(), err: (e.stderr || '').trim() };
  }
}

function httpGet(port, urlPath) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: urlPath, method: 'GET', timeout: 5000 },
      (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
    req.end();
  });
}

function httpPost(port, urlPath) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: urlPath, method: 'POST', timeout: 5000 },
      (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', () => resolve({ status: 0, body: 'error' }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
    req.end();
  });
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function tryParseJson(text) {
  try { return JSON.parse(text); }
  catch { return null; }
}

function isPortListening(port) {
  const r = run('netstat -ano');
  if (!r.ok) return false;
  return r.out.split('\n').some(l => l.includes(':' + port) && l.includes('LISTENING'));
}

// ===================================================================
async function main() {
  console.log('\n========================================');
  console.log('  DiskCleanUp Startup Test Suite');
  console.log('========================================\n');

  // -- Test 1: kill-port.js runs without error ----------------------
  console.log('Test 1: kill-port.js executes cleanly');
  const killResult = run(`node "${path.join(ROOT, 'scripts', 'kill-port.js')}" 5000 5100`, { timeout: 60000 });
  assert(killResult.ok || killResult.code === 2, `kill-port.js exited with code ${killResult.ok ? 0 : killResult.code} (0 or 2 are valid)`);

  const serviceLockedFiles = !killResult.ok && killResult.code === 2;
  if (serviceLockedFiles) {
    console.log('  INFO: Session 0 service still running (expected on dev machines)');
  }

  // -- Test 2: Port 5000 is free after kill -------------------------
  console.log('\nTest 2: Port 5000 is free after kill-port.js');
  assert(!isPortListening(5000), 'Port 5000 is not listening');

  // -- Test 3: Build succeeds ---------------------------------------
  console.log('\nTest 3: Build succeeds');
  let useFresh = false;
  let buildOk = false;
  if (serviceLockedFiles) {
    const proj = path.join(ROOT, 'DiskCleanUp.Service', 'DiskCleanUp.Service.csproj');
    const freshOut = path.join(ROOT, 'DiskCleanUp.Service', 'bin', 'Fresh');
    const r = run(`dotnet build "${proj}" --output "${freshOut}"`, { timeout: 120000 });
    buildOk = r.ok;
    useFresh = r.ok;
    assert(r.ok, 'dotnet build to bin/Fresh succeeded');
  } else {
    const r = run(`dotnet build "${path.join(ROOT, 'DiskCleanUp.sln')}"`, { timeout: 120000 });
    buildOk = r.ok;
    assert(r.ok, 'dotnet build DiskCleanUp.sln succeeded');
  }

  if (!buildOk) {
    console.log('\nBuild failed - cannot continue with runtime tests.');
    printSummary();
    return;
  }

  // -- Test 4: Service starts and responds --------------------------
  console.log('\nTest 4: Service starts and responds on port 5000');
  let proc;
  if (useFresh) {
    const freshDll = path.resolve(path.join(ROOT, 'DiskCleanUp.Service', 'bin', 'Fresh', 'DiskCleanUp.Service.dll'));
    const serviceDir = path.join(ROOT, 'DiskCleanUp.Service');
    proc = spawn('dotnet', [freshDll, '--console'], { cwd: serviceDir, stdio: 'pipe' });
  } else {
    const proj = path.join(ROOT, 'DiskCleanUp.Service', 'DiskCleanUp.Service.csproj');
    proc = spawn('dotnet', ['run', '--no-build', '--project', proj, '--', '--console'], { cwd: ROOT, stdio: 'pipe' });
  }

  // Wait for service to be ready (up to 15s)
  let serviceReady = false;
  for (let i = 0; i < 30; i++) {
    sleepMs(500);
    const resp = await httpGet(5000, '/api/service/info');
    if (resp.status === 200) {
      serviceReady = true;
      break;
    }
  }
  assert(serviceReady, 'Service responded to /api/service/info within 15s');

  if (serviceReady) {
    // Test 5: Dashboard HTML is served
    console.log('\nTest 5: Dashboard serves index.html');
    const dashboard = await httpGet(5000, '/');
    assert(dashboard.status === 200, 'GET / returns 200');
    assert(dashboard.body.includes('Disk Cleanup') || dashboard.body.includes('DiskCleanUp'), 'Response contains Disk Cleanup');

    // Test 6: /api/shutdown endpoint exists
    console.log('\nTest 6: /api/shutdown endpoint exists');

    // Test 7: /api/answers/refresh endpoint triggers artifact generation
    console.log('\nTest 7: /api/answers/refresh generates artifacts');
    const refresh = await httpPost(5000, '/api/answers/refresh');
    const refreshJson = tryParseJson(refresh.body);
    assert(refresh.status === 200, 'POST /api/answers/refresh returns 200');
    assert(!!refreshJson, 'Refresh response is valid JSON');
    assert(refreshJson?.status === 'ok', 'Refresh response status is ok');

    // Test 8: /api/answers/manifest returns expected shape
    console.log('\nTest 8: /api/answers/manifest returns contract fields');
    const manifestResp = await httpGet(5000, '/api/answers/manifest');
    const manifest = tryParseJson(manifestResp.body);
    assert(manifestResp.status === 200, 'GET /api/answers/manifest returns 200');
    assert(!!manifest, 'Manifest response is valid JSON');
    assert(typeof manifest?.status === 'string', 'Manifest contains status');
    assert(typeof manifest?.generatedAtUtc === 'string', 'Manifest contains generatedAtUtc');
    assert(typeof manifest?.sections === 'object' && manifest?.sections !== null, 'Manifest contains sections object');

    const expectedSections = [
      'duplicates', 'smart-dedup', 'stale', 'large', 'node-modules',
      'venvs', 'empty', 'images', 'backups', 'tiny-files', 'html-files', 'css-files'
    ];
    const allSectionsPresent = expectedSections.every((s) => Object.prototype.hasOwnProperty.call(manifest?.sections || {}, s));
    assert(allSectionsPresent, 'Manifest includes all expected sections');

    // Test 9: manifest file exists on disk
    console.log('\nTest 9: answers manifest file is written to disk');
    const programData = process.env.ProgramData || 'C:\\ProgramData';
    const manifestPath = path.join(programData, 'DiskCleanUp', 'answers', 'manifest.json');
    assert(fs.existsSync(manifestPath), 'answers/manifest.json exists on disk');

    const shutdown = await httpPost(5000, '/api/shutdown');
    assert(shutdown.status === 200, 'POST /api/shutdown returns 200');

    // Wait for shutdown
    console.log('  Waiting for service to stop...');
    for (let i = 0; i < 20; i++) {
      sleepMs(500);
      if (!isPortListening(5000)) break;
    }
    assert(!isPortListening(5000), 'Port 5000 freed after /api/shutdown');
  } else {
    // Kill the process if it didn't start properly
    proc.kill();
  }

  printSummary();
}

function printSummary() {
  console.log('\n========================================');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

main();
