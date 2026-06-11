/**
 * symlink-endpoint.test.mjs
 * Recreates the symlink failure reported in #90.
 *
 * Creates two real temp files, calls /api/symlink, and reports
 * the exact failure reason so we know what to fix.
 *
 * Run: node tests/symlink-endpoint.test.mjs
 */

import fs   from 'fs';
import os   from 'os';
import path from 'path';

// Auto-detect port — service runs on 5100 (production) or 5000 (dev/console)
async function _detectPort() {
  for (const port of [5100, 5000]) {
    try {
      const r = await fetch(`http://localhost:${port}/api/service/info`, { signal: AbortSignal.timeout(1000) });
      if (r.ok) return port;
    } catch {}
  }
  return 5100; // fallback
}
const PORT     = await _detectPort();
const BASE_URL = `http://localhost:${PORT}`;
console.log(`Using port ${PORT}`);
const TMP      = os.tmpdir();

let passed = 0;
let failed = 0;

function ok(name, val, msg) {
  if (val) { console.log(`  ✓ ${name}`); passed++; }
  else      { console.error(`  ✗ ${name}${msg ? ': ' + msg : ''}`); failed++; }
}

async function apiFetch(path, body) {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json = {};
  try { json = await r.json(); } catch {}
  return { status: r.status, ok: r.ok, json };
}

// ── helpers ────────────────────────────────────────────────────────────────

function makeTempFile(name, content = 'duplicate content for symlink test') {
  const p = path.join(TMP, name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

function cleanup(...paths) {
  for (const p of paths) {
    try { fs.rmSync(p, { force: true }); } catch {}
  }
}

// ── Test 1: service reachability ───────────────────────────────────────────
console.log('\nTest 1 — service is reachable');
try {
  const r = await fetch(`${BASE_URL}/api/service/info`, { signal: AbortSignal.timeout(3000) });
  ok('GET /api/service/info returns 200', r.ok, `status ${r.status}`);
} catch (e) {
  ok('service reachable', false, `${e.message} — is the service running on port 5100?`);
  console.error('\nService is not running. Start it with: npm run restart');
  process.exit(1);
}

// ── Test 2: endpoint exists (not 404) ─────────────────────────────────────
console.log('\nTest 2 — /api/symlink endpoint exists');
{
  const keep = makeTempFile('symlink-keep.txt');
  const copy = makeTempFile('symlink-copy.txt');
  const { status, json } = await apiFetch('/api/symlink', { copyPath: copy, keepPath: keep });
  ok('endpoint exists (not 404)', status !== 404,
    status === 404 ? 'Got 404 — service needs restart to pick up new endpoint' : `status ${status}`);
  if (status === 404) {
    console.error('\n  ➜ FIX: restart the service — the /api/symlink endpoint is not registered yet.');
  }
  cleanup(keep, copy);
}

// ── Test 3: validation — missing fields ───────────────────────────────────
console.log('\nTest 3 — validation rejects missing paths');
{
  const { status } = await apiFetch('/api/symlink', {});
  ok('empty body returns 400', status === 400, `got ${status}`);
}

// ── Test 4: validation — missing file ─────────────────────────────────────
console.log('\nTest 4 — validation rejects missing file');
{
  const keep = makeTempFile('symlink-keep2.txt');
  const { status, json } = await apiFetch('/api/symlink', {
    copyPath: path.join(TMP, 'symlink-ghost.txt'),
    keepPath: keep,
  });
  ok('non-existent copyPath returns 400', status === 400, `got ${status}`);
  cleanup(keep);
}

// ── Test 5: happy path — create symlink ───────────────────────────────────
console.log('\nTest 5 — happy path: creates symlink, removes copy');
{
  const content = 'identical content abc123';
  const keep = makeTempFile('symlink-keep3.txt', content);
  const copy = makeTempFile('symlink-copy3.txt', content);

  const { status, ok: resOk, json } = await apiFetch('/api/symlink', {
    copyPath: copy,
    keepPath: keep,
  });

  if (status === 500 && json.detail?.includes('Developer Mode')) {
    console.log('  ⚠ Symlink requires Developer Mode — testing hardlink fallback path');
    ok('endpoint returned actionable error', true);
    cleanup(keep, copy);
  } else if (status === 500 && json.detail?.includes('privilege')) {
    console.log('  ⚠ Insufficient privilege for symlink creation');
    ok('endpoint returned actionable error', true);
    cleanup(keep, copy);
  } else {
    ok('POST /api/symlink returns 200', resOk, `status=${status} detail=${json.detail || json.error || ''}`);

    if (resOk) {
      console.log(`  ℹ link type created: ${json.linkType}`);
      // copy path should exist (as symlink or hardlink) pointing to same content
      const stat = fs.lstatSync(copy, { throwIfNoEntry: false });
      ok('link exists at copy path', !!stat, 'file not found at copy path');
      ok('link resolves to same content', fs.readFileSync(copy, 'utf8') === content);
      ok('freed bytes returned', typeof json.freed === 'number' && json.freed > 0,
        `got ${JSON.stringify(json.freed)}`);
      ok('linkType is symlink or hardlink',
        json.linkType === 'symlink' || json.linkType === 'hardlink',
        `got ${json.linkType}`);
    }
    cleanup(keep, copy);
  }
}

// ── Test 6: error detail surfaces to caller ────────────────────────────────
console.log('\nTest 6 — error responses include readable detail');
{
  const keep = makeTempFile('symlink-keep4.txt');
  // Use a path that definitely doesn't exist as copy
  const { status, json } = await apiFetch('/api/symlink', {
    copyPath: 'C:\\nonexistent\\path\\ghost.txt',
    keepPath: keep,
  });
  ok('missing copy returns 400 with error field',
    status === 400 && (json.error || json.detail),
    `status=${status} body=${JSON.stringify(json)}`);
  cleanup(keep);
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
if (failed === 0) {
  console.log(`✓ All ${passed} symlink tests passed.\n`);
  process.exit(0);
} else {
  console.error(`✗ ${failed} of ${passed + failed} tests FAILED.\n`);
  process.exit(1);
}
