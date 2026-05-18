#!/usr/bin/env node
/**
 * test-ports.js — Proves console mode ALWAYS starts on port 5000.
 *
 * Three layers of protection:
 *   1. SOURCE CHECK  — Program.cs must use Constants.DevPort for console mode
 *   2. CONSTANTS     — Constants.cs must define DevPort = 5000, ServicePort = 5100
 *   3. RUNTIME CHECK — Running server must actually respond on 5000, NOT 5100
 *
 * This test must pass before any PR or build. If it fails, someone
 * broke the port isolation and dev will fight the Windows Service again.
 */

import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');

let passed = 0;
let failed = 0;

function pass(msg) { console.log(`  ✅ PASS: ${msg}`); passed++; }
function fail(msg) { console.error(`  ❌ FAIL: ${msg}`); failed++; }
function check(condition, msg) { condition ? pass(msg) : fail(msg); }

function httpGet(port, urlPath, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: urlPath, method: 'GET', timeout: timeoutMs },
      (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', () => resolve({ status: 0, body: 'not reachable' }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
    req.end();
  });
}

// ── Test 1: Constants.cs defines both ports correctly ────────────────────
console.log('\n=== Layer 1: Source — Constants.cs ===');
const constantsPath = path.join(ROOT, 'DiskCleanUp.Shared', 'Constants.cs');
const constantsSrc  = fs.readFileSync(constantsPath, 'utf8');

check(
  /public\s+const\s+int\s+DevPort\s*=\s*5000\s*;/.test(constantsSrc),
  'Constants.DevPort = 5000 is defined'
);
check(
  /public\s+const\s+int\s+ServicePort\s*=\s*5100\s*;/.test(constantsSrc),
  'Constants.ServicePort = 5100 is defined'
);
check(
  !/DevPort\s*=\s*51\d\d/.test(constantsSrc),
  'DevPort is NOT set to a 51xx value (would fight service)'
);

// ── Test 2: Program.cs uses DevPort for console mode ─────────────────────
console.log('\n=== Layer 2: Source — Program.cs ===');
const programPath = path.join(ROOT, 'DiskCleanUp.Service', 'Program.cs');
const programSrc  = fs.readFileSync(programPath, 'utf8');

// Must contain the conditional: isConsoleMode ? Constants.DevPort : ...
check(
  /isConsoleMode\s*\?\s*Constants\.DevPort/.test(programSrc),
  'Program.cs uses Constants.DevPort when isConsoleMode is true'
);

// Must NOT use ReadPortFromConfig unconditionally (old broken behavior)
const readPortLines = programSrc
  .split('\n')
  .filter(l => !l.trim().startsWith('//') && l.includes('ReadPortFromConfig'));
const unconditional = readPortLines.some(l => !l.includes('isConsoleMode') && !l.includes('isServiceMode') && !l.includes('?'));
check(
  !unconditional,
  'ReadPortFromConfig() is NOT called unconditionally (would override DevPort)'
);

// Must NOT hardcode 5000 as a magic number (must come from Constants)
check(
  !/\bUrls\.Add\([^)]*5000/.test(programSrc),
  'Program.cs does NOT hardcode 5000 directly (uses Constants.DevPort)'
);

// The port binding line must reference the variable, not a literal
const urlsAddLine = programSrc.split('\n').find(l => l.includes('app.Urls.Add'));
check(
  !!urlsAddLine && urlsAddLine.includes('{port}'),
  `app.Urls.Add uses {port} variable: ${(urlsAddLine || '').trim()}`
);

// ── Test 3: Runtime — if server is up, it must be on 5000 not 5100 ───────
console.log('\n=== Layer 3: Runtime (if server is running) ===');
const on5000 = await httpGet(5000, '/api/service/info');
const on5100 = await httpGet(5100, '/api/service/info');

if (on5000.status === 0 && on5100.status === 0) {
  console.log('  ℹ️  No server running — skipping runtime checks (start npm start first to test)');
} else {
  if (on5000.status === 200) {
    let info;
    try { info = JSON.parse(on5000.body); } catch { info = null; }
    check(on5000.status === 200, 'Server responds on port 5000');
    check(
      info?.mode === 'console',
      `Server on 5000 reports mode="console" (got: "${info?.mode}")`
    );
    check(
      info?.port === 5000,
      `Server on 5000 reports port=5000 (got: ${info?.port})`
    );
  }

  if (on5100.status === 200) {
    let info5100;
    try { info5100 = JSON.parse(on5100.body); } catch { info5100 = null; }
    // 5100 being up is only OK if it's the Windows Service (service mode)
    check(
      info5100?.mode === 'service',
      `If port 5100 is up, it must be service mode, not console (got: "${info5100?.mode}")`
    );
    if (info5100?.mode === 'console') {
      fail('CRITICAL: console mode server is running on 5100 — this breaks the port contract!');
    }
  }

  // If ONLY 5100 is up and in console mode — that's the bug we fixed
  if (on5000.status !== 200 && on5100.status === 200) {
    let info5100;
    try { info5100 = JSON.parse(on5100.body); } catch { info5100 = null; }
    if (info5100?.mode === 'console') {
      fail('REGRESSION: console mode started on 5100 instead of 5000! Check Program.cs port logic.');
    }
  }
}

// ── Summary ───────────────────────────────────────────────────────────────
console.log('\n========================================');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('========================================\n');
if (failed > 0) {
  console.error('PORT CONTRACT VIOLATED — console mode must always use port 5000.');
  console.error('Fix: Program.cs port line must be:');
  console.error('  int port = isConsoleMode ? Constants.DevPort : ReadPortFromConfig(dataDir);');
}
process.exit(failed > 0 ? 1 : 0);
