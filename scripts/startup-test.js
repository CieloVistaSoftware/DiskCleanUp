#!/usr/bin/env node
/**
 * startup-test.js — Comprehensive DiskCleanUp validation.
 *
 * [1]  Script entry points exist
 * [2]  dotnet build succeeds
 * [3]  JS import/export validation (static analysis)
 * [4]  Server starts, all pages return 200
 * [5]  Cache-Control: no-cache on all static files
 * [6]  WebSocket connects, stays alive 5s, clean close
 * [7]  WebSocket receives metrics broadcast within 10s
 * [8]  WebSocket handles rapid reconnect (5 connects in 2s)
 * [9]  Scan lifecycle per section: start → progress → done
 * [10] Concurrent scans don't crash (semaphore regression)
 * [11] MCP server starts without crash
 *
 * Usage:
 *   node scripts/startup-test.js            Full suite
 *   node scripts/startup-test.js --quick    Skip scan tests [9-10]
 *   node scripts/startup-test.js --ws       WebSocket tests only [6-8]
 *   node scripts/startup-test.js --scan     Scan tests only [9-10]
 */
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const WWWROOT = path.join(ROOT, 'DiskCleanUp.Service', 'wwwroot');
const DOTNET = 'C:\\Program Files\\dotnet\\dotnet.exe';
const NODE = process.execPath;
const PORT = 5000;

const ARGS = process.argv.slice(2);
const QUICK = ARGS.includes('--quick');
const WS_ONLY = ARGS.includes('--ws');
const SCAN_ONLY = ARGS.includes('--scan');
const SUBSET = WS_ONLY || SCAN_ONLY;

let passed = 0;
let failed = 0;
let warnings = 0;
let serverProc = null;
const failures = [];

function ok(name) { passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
function fail(name, reason) { failed++; failures.push({ name, reason }); console.log(`  \x1b[31m✗\x1b[0m ${name}: ${reason}`); }
function warn(name) { warnings++; console.log(`  \x1b[33m⚠\x1b[0m ${name}`); }
function skip(name) { console.log(`  \x1b[33m⊘\x1b[0m ${name} (skipped)`); }

function httpGet(urlPath) {
    return new Promise((resolve) => {
        http.get(`http://localhost:${PORT}${urlPath}`, (res) => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        }).on('error', (e) => resolve({ status: 0, headers: {}, body: '', error: e.message }));
    });
}

function waitForPort(port, timeoutSec = 20) {
    return new Promise((resolve) => {
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            const req = http.get(`http://localhost:${port}/`, () => { clearInterval(interval); resolve(true); });
            req.on('error', () => { if (attempts >= timeoutSec * 2) { clearInterval(interval); resolve(false); } });
            req.setTimeout(400, () => req.destroy());
        }, 500);
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Open WebSocket, return controller with message accumulator */
function openWS(wsPath = '/ws') {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${PORT}${wsPath}`);
        const messages = [];
        let closed = false;
        let closeCode = null;

        ws.addEventListener('open', () => resolve({
            ws, messages,
            send: (obj) => ws.send(JSON.stringify(obj)),
            close: () => ws.close(),
            get closed() { return closed; },
            get closeCode() { return closeCode; },
            waitFor: (filter, timeoutMs = 15000) => new Promise((res, rej) => {
                const existing = messages.find(filter);
                if (existing) return res(existing);
                const iv = setInterval(() => {
                    const found = messages.find(filter);
                    if (found) { clearInterval(iv); clearTimeout(to); res(found); }
                }, 100);
                const to = setTimeout(() => {
                    clearInterval(iv);
                    rej(new Error(`timeout waiting for message (got ${messages.length} total)`));
                }, timeoutMs);
            }),
            waitForN: (filter, count, timeoutMs = 60000) => new Promise((res, rej) => {
                const iv = setInterval(() => {
                    const found = messages.filter(filter);
                    if (found.length >= count) { clearInterval(iv); clearTimeout(to); res(found); }
                }, 100);
                const to = setTimeout(() => {
                    clearInterval(iv);
                    rej(new Error(`timeout: got ${messages.filter(filter).length}/${count}`));
                }, timeoutMs);
            }),
        }));

        ws.addEventListener('message', (ev) => { try { messages.push(JSON.parse(ev.data)); } catch {} });
        ws.addEventListener('close', (ev) => { closed = true; closeCode = ev.code; });
        ws.addEventListener('error', () => reject(new Error('WS connect failed')));
        setTimeout(() => reject(new Error('WS connect timeout')), 5000);
    });
}

// ═══════════════════════════════════════════════════════════════
//  [1] Script entry points
// ═══════════════════════════════════════════════════════════════
function test1() {
    console.log('\n[1] Script entry points');
    for (const [label, p] of [
        ['scripts/kill-port.js', 'scripts/kill-port.js'],
        ['mcp-server/server.js', 'mcp-server/server.js'],
        ['DiskCleanUp.Service.csproj', 'DiskCleanUp.Service/DiskCleanUp.Service.csproj'],
        ['DiskCleanUp.sln', 'DiskCleanUp.sln'],
    ]) {
        if (fs.existsSync(path.join(ROOT, p))) ok(label);
        else fail(label, 'not found');
    }
}

// ═══════════════════════════════════════════════════════════════
//  [2] dotnet build
// ═══════════════════════════════════════════════════════════════
function test2() {
    console.log('\n[2] dotnet build');
    try {
        execSync(`"${DOTNET}" build "${path.join(ROOT, 'DiskCleanUp.sln')}"`, { cwd: ROOT, stdio: 'pipe', timeout: 60000 });
        ok('build succeeded');
    } catch (e) {
        const out = (e.stdout?.toString() || '') + (e.stderr?.toString() || '');
        fail('build', out.split('\n').filter(l => l.includes('error')).slice(0, 2).join(' | '));
    }
}

// ═══════════════════════════════════════════════════════════════
//  [3] JS import/export validation
// ═══════════════════════════════════════════════════════════════
function test3() {
    console.log('\n[3] JS import/export validation');
    const exportMap = {};

    function scan(dir) {
        if (!fs.existsSync(dir)) return;
        for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
            const fp = path.join(dir, f);
            const src = fs.readFileSync(fp, 'utf8');
            const exps = new Set();
            for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) exps.add(m[1]);
            for (const m of src.matchAll(/export\s+(?:const|let|var)\s+(\w+)/g)) exps.add(m[1]);
            for (const m of src.matchAll(/export\s+class\s+(\w+)/g)) exps.add(m[1]);
            for (const m of src.matchAll(/export\s*\{([^}]+)\}/g))
                for (const n of m[1].split(',')) {
                    const parts = n.trim().split(/\s+as\s+/);
                    const name = (parts[1] || parts[0]).trim();
                    if (name) exps.add(name);
                }
            if (/export\s+default\b/.test(src)) exps.add('default');
            exportMap[fp] = exps;
        }
    }

    scan(path.join(WWWROOT, 'js'));
    scan(path.join(WWWROOT, 'sections'));

    let errs = 0;
    function validate(dir) {
        if (!fs.existsSync(dir)) return;
        for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
            const fp = path.join(dir, f);
            const lines = fs.readFileSync(fp, 'utf8').split('\n');
            for (let i = 0; i < lines.length; i++) {
                const m = lines[i].match(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/);
                if (!m) continue;
                const names = m[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
                const resolved = path.resolve(path.dirname(fp), m[2].split('?')[0]);
                if (!fs.existsSync(resolved)) continue;
                if (!exportMap[resolved]) {
                    const src = fs.readFileSync(resolved, 'utf8');
                    const exps = new Set();
                    for (const em of src.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) exps.add(em[1]);
                    for (const em of src.matchAll(/export\s+(?:const|let|var)\s+(\w+)/g)) exps.add(em[1]);
                    for (const em of src.matchAll(/export\s+class\s+(\w+)/g)) exps.add(em[1]);
                    for (const em of src.matchAll(/export\s*\{([^}]+)\}/g))
                        for (const n of em[1].split(',')) { const p = n.trim().split(/\s+as\s+/); exps.add((p[1]||p[0]).trim()); }
                    exportMap[resolved] = exps;
                }
                for (const name of names) {
                    if (!(exportMap[resolved] || new Set()).has(name)) {
                        fail(`${f}:${i+1}`, `'${name}' not exported from '${m[2].split('?')[0]}'`);
                        errs++;
                    }
                }
            }
        }
    }

    validate(path.join(WWWROOT, 'js'));
    validate(path.join(WWWROOT, 'sections'));
    if (errs === 0) ok('All imports resolve');
}

// ═══════════════════════════════════════════════════════════════
//  [4] Server starts, pages return 200
// ═══════════════════════════════════════════════════════════════
async function test4() {
    console.log('\n[4] Server startup & pages');
    try { execSync(`"${NODE}" scripts/kill-port.js ${PORT}`, { cwd: ROOT, stdio: 'pipe' }); } catch {}

    serverProc = spawn(DOTNET, [
        'run', '--project', path.join(ROOT, 'DiskCleanUp.Service', 'DiskCleanUp.Service.csproj'), '--', '--console'
    ], { cwd: ROOT, stdio: 'pipe' });

    if (!(await waitForPort(PORT))) { fail('Server start', 'timeout'); return false; }
    ok(`Server on port ${PORT}`);

    for (const p of ['/', '/trace-viewer.html', '/error-viewer.html', '/architecture.html', '/api/service/info']) {
        const r = await httpGet(p);
        if (r.status === 200) ok(`GET ${p} → 200`);
        else fail(`GET ${p}`, `${r.status} ${r.error || ''}`);
    }
    return true;
}

// ═══════════════════════════════════════════════════════════════
//  [5] Cache-Control headers
// ═══════════════════════════════════════════════════════════════
async function test5() {
    console.log('\n[5] Cache-Control headers');
    for (const f of ['/js/init.js', '/js/page-loader.js', '/js/websocket.js', '/index.html']) {
        const r = await httpGet(f);
        if (r.status !== 200) { fail(`Cache ${f}`, `status=${r.status}`); continue; }
        const cc = r.headers['cache-control'] || '';
        if (cc.includes('no-cache') || cc.includes('no-store')) ok(`${f} → ${cc}`);
        else fail(f, `Cache-Control='${cc}'`);
    }
}

// ═══════════════════════════════════════════════════════════════
//  [6] WebSocket connects, stays alive, closes clean
// ═══════════════════════════════════════════════════════════════
async function test6() {
    console.log('\n[6] WebSocket connect & stability');

    // 6a: Basic connect
    let conn;
    try {
        conn = await openWS();
        ok('WS connect');
    } catch (e) {
        fail('WS connect', e.message);
        return;
    }

    // 6b: Stay alive 5 seconds — no unexpected close
    await sleep(5000);
    if (!conn.closed) ok('WS alive after 5s');
    else fail('WS alive after 5s', `closed with code ${conn.closeCode}`);

    // 6c: Clean close
    conn.close();
    await sleep(500);
    if (conn.closed) ok('WS clean close');
    else warn('WS close did not complete in 500ms');
}

// ═══════════════════════════════════════════════════════════════
//  [7] WebSocket receives metrics within 10s
// ═══════════════════════════════════════════════════════════════
async function test7() {
    console.log('\n[7] WebSocket metrics broadcast');

    let conn;
    try { conn = await openWS(); } catch (e) { fail('WS connect for metrics', e.message); return; }

    try {
        const msg = await conn.waitFor(m => m.section === 'metrics' && m.type === 'update', 10000);
        const d = msg.data || {};
        ok(`Metrics received (CPU: ${d.cpu_pct ?? '?'}%, MEM: ${d.working_set_mb ?? '?'}MB)`);

        // Validate metrics shape — server sends snake_case keys
        if (typeof d.cpu_pct === 'number' && typeof d.mem_pct === 'number' &&
            typeof d.working_set_mb === 'number' && typeof d.total_ram_mb === 'number') {
            ok('Metrics shape valid (cpu_pct, mem_pct, working_set_mb, total_ram_mb)');
        } else {
            fail('Metrics shape', `got keys: ${Object.keys(d).join(', ')}`);
        }
    } catch {
        fail('Metrics broadcast', 'no metrics message in 10s');
    }

    conn.close();
}

// ═══════════════════════════════════════════════════════════════
//  [8] WebSocket rapid reconnect (5 connects in 2s)
// ═══════════════════════════════════════════════════════════════
async function test8() {
    console.log('\n[8] WebSocket rapid reconnect');

    const connections = [];
    let connectFails = 0;

    for (let i = 0; i < 5; i++) {
        try {
            const c = await openWS();
            connections.push(c);
        } catch {
            connectFails++;
        }
        await sleep(400);
    }

    if (connectFails === 0) ok(`5/5 rapid connects succeeded`);
    else fail('Rapid reconnect', `${connectFails}/5 failed`);

    // All should still be alive
    await sleep(1000);
    const alive = connections.filter(c => !c.closed).length;
    if (alive === connections.length) ok(`All ${alive} connections alive after 1s`);
    else fail('Connection stability', `${alive}/${connections.length} alive`);

    // Close all
    for (const c of connections) c.close();
    await sleep(500);

    const closedClean = connections.filter(c => c.closed).length;
    if (closedClean === connections.length) ok('All closed cleanly');
    else warn(`${closedClean}/${connections.length} closed`);
}

// ═══════════════════════════════════════════════════════════════
//  [9] Scan lifecycle: start → progress → done per section
// ═══════════════════════════════════════════════════════════════
async function test9() {
    console.log('\n[9] Scan lifecycle (per section)');

    // Test lightweight sections that complete fast
    const testSections = ['empty', 'css-files', 'html-files', 'tiny-files'];

    for (const section of testSections) {
        let conn;
        try { conn = await openWS(); } catch (e) { fail(`WS for ${section}`, e.message); continue; }

        // Start scan
        conn.send({ type: 'start', section });

        // Wait for started
        try {
            await conn.waitFor(m => m.section === section && m.type === 'started', 5000);
            ok(`${section}: started`);
        } catch {
            fail(`${section}: started`, 'no started message in 5s');
            conn.close();
            continue;
        }

        // Wait for done or error (up to 60s for a full scan)
        try {
            const done = await conn.waitFor(
                m => m.section === section && (m.type === 'done' || m.type === 'error'), 60000);

            if (done.type === 'done') {
                const d = done.data || {};
                ok(`${section}: done (files=${d.files ?? '?'}, results=${d.results ?? '?'})`);
            } else {
                const msg = done.data?.message || 'unknown';
                fail(`${section}: error`, msg);
            }
        } catch {
            fail(`${section}: done`, 'no done/error in 60s');
        }

        // Check that progress messages were received
        const progressMsgs = conn.messages.filter(
            m => m.section === section && (m.type === 'progress' || m.type === 'batch-ready'));
        if (progressMsgs.length > 0) ok(`${section}: ${progressMsgs.length} progress/batch signals`);
        else warn(`${section}: no progress messages (scan may have been very fast)`);

        // Wait between sections so tokens clear
        conn.close();
        await sleep(1000);
    }
}

// ═══════════════════════════════════════════════════════════════
//  [10] Concurrent scans — semaphore regression test
// ═══════════════════════════════════════════════════════════════
async function test10() {
    console.log('\n[10] Concurrent scans (semaphore regression)');

    // Fire 3 hash-based sections nearly simultaneously
    // This is what caused "Adding the specified count to the semaphore
    // would cause it to exceed its maximum count"
    const sections = ['css-files', 'html-files', 'tiny-files'];
    const connections = [];

    // Open separate WS per section
    for (const sec of sections) {
        try {
            const c = await openWS();
            connections.push({ section: sec, conn: c });
        } catch (e) {
            fail(`WS for concurrent ${sec}`, e.message);
        }
    }

    // Fire all starts within 200ms
    for (const { section, conn } of connections) {
        conn.send({ type: 'start', section });
        await sleep(50);
    }

    ok(`Fired ${connections.length} concurrent scans`);

    // Wait for all to complete (or error)
    const results = [];
    for (const { section, conn } of connections) {
        try {
            const msg = await conn.waitFor(
                m => m.section === section && (m.type === 'done' || m.type === 'error'), 90000);
            results.push({ section, type: msg.type, data: msg.data });
        } catch {
            results.push({ section, type: 'timeout', data: null });
        }
    }

    // Analyze results
    const errors = results.filter(r => r.type === 'error');
    const timeouts = results.filter(r => r.type === 'timeout');
    const successes = results.filter(r => r.type === 'done');

    if (successes.length === sections.length) {
        ok(`All ${sections.length} concurrent scans completed`);
        for (const r of successes) {
            ok(`  ${r.section}: done (${r.data?.results ?? '?'} results)`);
        }
    } else {
        for (const r of errors) {
            fail(`Concurrent ${r.section}`, r.data?.message || 'scan error');
        }
        for (const r of timeouts) {
            fail(`Concurrent ${r.section}`, 'timed out after 90s');
        }
    }

    // Check for semaphore errors specifically
    for (const { conn } of connections) {
        const semaphoreErrors = conn.messages.filter(
            m => m.type === 'error' && JSON.stringify(m.data).includes('semaphore'));
        if (semaphoreErrors.length > 0) {
            fail('SEMAPHORE REGRESSION', `${semaphoreErrors.length} semaphore errors detected`);
        }
    }

    // Cleanup
    for (const { conn } of connections) conn.close();
    await sleep(500);
}

// ═══════════════════════════════════════════════════════════════
//  [11] MCP server starts
// ═══════════════════════════════════════════════════════════════
async function test11() {
    console.log('\n[11] MCP server');
    const proc = spawn(NODE, ['mcp-server/server.js'], { cwd: ROOT, stdio: 'pipe' });
    await sleep(2000);
    if (proc.exitCode !== null) fail('MCP server', `crashed (exit ${proc.exitCode})`);
    else { ok('MCP server running'); proc.kill(); }
}

// ═══════════════════════════════════════════════════════════════
//  RUNNER
// ═══════════════════════════════════════════════════════════════
async function run() {
    console.log('═══════════════════════════════════════════════');
    console.log(' DiskCleanUp Test Suite');
    console.log(`═══════════════════════════════════════════════`);
    console.log(` Mode: ${QUICK ? '--quick' : WS_ONLY ? '--ws' : SCAN_ONLY ? '--scan' : 'full'}`);

    let serverUp = true;

    if (!SUBSET) {
        test1();
        test2();
        test3();
    }

    // Start server if not already running
    const portCheck = await new Promise(r => {
        const req = http.get(`http://localhost:${PORT}/`, () => r(true));
        req.on('error', () => r(false));
        req.setTimeout(1000, () => { req.destroy(); r(false); });
    });

    if (portCheck) {
        console.log(`\n  Server already running on port ${PORT}`);
        if (!SUBSET) ok(`Server on port ${PORT} (pre-existing)`);
    } else {
        serverUp = await test4();
    }

    if (serverUp && !SUBSET) await test5();

    if (serverUp && !SCAN_ONLY) {
        await test6();
        await test7();
        await test8();
    }

    if (serverUp && !QUICK && !WS_ONLY) {
        await test9();
        await test10();
    } else if (QUICK) {
        skip('[9] Scan lifecycle (--quick)');
        skip('[10] Concurrent scans (--quick)');
    }

    if (!SUBSET) await test11();

    // Cleanup — only kill server if WE started it
    if (serverProc) serverProc.kill();

    // Summary
    console.log('\n═══════════════════════════════════════════════');
    if (failures.length > 0) {
        console.log(' \x1b[31mFAILURES:\x1b[0m');
        for (const f of failures) console.log(`   ${f.name}: ${f.reason}`);
        console.log('');
    }
    console.log(` \x1b[32m${passed} passed\x1b[0m  \x1b[31m${failed} failed\x1b[0m  \x1b[33m${warnings} warnings\x1b[0m`);
    console.log('═══════════════════════════════════════════════');

    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
