#!/usr/bin/env node
/**
 * start.js - Bulletproof single-command start for DiskCleanUp.
 *
 * 1. Stop any running instance (graceful HTTP shutdown + taskkill fallback)
 * 2. Build (normal dir if unlocked, bin/Fresh if Session 0 service locks files)
 * 3. Run in console mode on port 5000
 */
import { execSync, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SLN = path.join(ROOT, 'DiskCleanUp.sln');
const PROJ = path.join(ROOT, 'DiskCleanUp.Service', 'DiskCleanUp.Service.csproj');
const FRESH_OUT = path.join(ROOT, 'DiskCleanUp.Service', 'bin', 'Fresh');
const FRESH_DLL = path.join(FRESH_OUT, 'DiskCleanUp.Service.dll');
const DOTNET = 'dotnet';

const args = new Set(process.argv.slice(2).map((a) => String(a || '').toLowerCase()));
const wantsHelp = args.has('--help') || args.has('-h');
const mode = args.has('--both') ? 'both' : args.has('--console') ? 'console' : 'service';

if (wantsHelp) {
  console.log('DiskCleanUp startup modes:');
  console.log('  node scripts/start.js           -> service mode only (default)');
  console.log('  node scripts/start.js --console -> console mode only (:5000)');
  console.log('  node scripts/start.js --both    -> service + console');
  process.exit(0);
}

console.log(`Startup mode: ${mode}`);

// == Step 0: Stop Windows Service first (releases DLL lock) ===========
console.log('=== Step 0: Stop Windows Service (releases DLL lock) ===');
{
  let wasSvcRunning = false;
  try {
    const out = execSync('sc.exe query DiskCleanUp', { encoding: 'utf8', stdio: 'pipe', timeout: 5000 });
    wasSvcRunning = out.includes('RUNNING') || out.includes('STOP_PENDING');
  } catch { /* not installed */ }

  if (wasSvcRunning) {
    console.log('  Windows Service is running — stopping it first...');
    try {
      execSync('sc.exe stop DiskCleanUp', { encoding: 'utf8', stdio: 'pipe', timeout: 10000 });
    } catch { /* may already be stopping */ }

    // Poll until SERVICE_STOPPED (max 20s)
    const deadline = Date.now() + 20000;
    let stopped = false;
    while (Date.now() < deadline) {
      try {
        execSync('ping -n 2 127.0.0.1', { stdio: 'ignore' }); // ~1s sleep
        const q = execSync('sc.exe query DiskCleanUp', { encoding: 'utf8', stdio: 'pipe', timeout: 5000 });
        if (!q.includes('RUNNING') && !q.includes('STOP_PENDING')) { stopped = true; break; }
      } catch { stopped = true; break; }
    }

    if (stopped) {
      console.log('  \u2705 Windows Service stopped — DLL lock released');
    } else {
      console.warn('  \u26a0\ufe0f  Service did not stop within 20s — build may still encounter locks');
    }
  } else {
    console.log('  Windows Service not running — no action needed');
  }
}

// == Step 1: Kill ===================================================
console.log('\n=== Step 1: Stop running instances ===');
let killExitCode;
try {
  execSync(`node "${path.join(ROOT, 'scripts', 'kill-port.js')}" 5000 5100`, {
    cwd: ROOT, stdio: 'inherit', timeout: 60000
  });
  killExitCode = 0;
} catch (e) {
  killExitCode = e.status ?? 1;
}

// Kill the Tray BEFORE the build so its exe is not locked during compilation
try {
  execSync('taskkill /F /IM DiskCleanUp.Tray.exe', { stdio: 'ignore' });
  console.log('  Tray stopped (unlocked for rebuild)');
} catch { /* not running — fine */ }

// Service is stopped — never treat it as still running
const serviceStillRunning = false;

// == Step 2: Build ==================================================
console.log('\n=== Step 2: Build ===');
let useFresh = false;

if (serviceStillRunning) {
  console.log('Service still running - building to bin/Fresh to avoid locked files...');
  try {
    execSync(`${DOTNET} build "${PROJ}" --output "${FRESH_OUT}"`, {
      cwd: ROOT, stdio: 'inherit', timeout: 120000
    });
    useFresh = true;
    console.log('Build to bin/Fresh succeeded');
  } catch {
    console.error('Build to bin/Fresh FAILED');
    process.exit(1);
  }
} else {
  try {
    execSync(`${DOTNET} build "${SLN}"`, {
      cwd: ROOT, stdio: 'inherit', timeout: 120000
    });
    console.log('Build succeeded');
  } catch {
    console.error('Build FAILED');
    process.exit(1);
  }
}

// == Step 3: TypeScript compile ===========================================
console.log('\n=== Step 3: TypeScript compile ===');
{
  // Dev ergonomics: allow startup even when legacy frontend TS files still
  // have type errors. Set STRICT_TSC=1 to restore fail-fast behavior.
  const strictTsc = process.env.STRICT_TSC === '1';
  const tscBin = path.join(ROOT, 'node_modules', '.bin', 'tsc');
  try {
    execSync(`"${tscBin}"`, { cwd: ROOT, stdio: 'inherit' });
    console.log('  \u2705 TypeScript compile: clean');
  } catch {
    if (strictTsc) {
      console.error('  \u274c TypeScript compile FAILED — fix errors before running (STRICT_TSC=1)');
      process.exit(1);
    }
    console.warn('  \u26a0\ufe0f  TypeScript compile has errors; continuing startup (set STRICT_TSC=1 to fail-fast).');
  }
}

// == Step 4: Start Windows Service (port 5100) =======================
// No elevation needed after one-time setup:
//   powershell -ExecutionPolicy Bypass -File scripts\setup-service.ps1
if (mode === 'service' || mode === 'both') {
console.log('\n=== Step 4: Start Windows Service (port 5100) ===');
{
  let svcRunning = false;
  try {
    const out = execSync('sc.exe query DiskCleanUp', { encoding: 'utf8', stdio: 'pipe', timeout: 5000 });
    svcRunning = out.includes('RUNNING');
  } catch { /* service not installed */ }

  if (svcRunning) {
    console.log('  \u2705 Windows Service already running \u2192 http://localhost:5100');
  } else {
    // Not running (we just shut it down in Step 1, or it crashed).
    // sc.exe start works without elevation after setup-service.ps1.
    try {
      execSync('sc.exe start DiskCleanUp', { encoding: 'utf8', stdio: 'pipe', timeout: 15000 });
      console.log('  \u2705 Windows Service started \u2192 http://localhost:5100');
    } catch (e) {
      const msg = (e.stdout?.toString() || e.stderr?.toString() || e.message || '').toLowerCase();
      if (msg.includes('1056') || msg.includes('already')) {
        console.log('  \u2705 Windows Service already running \u2192 http://localhost:5100');
      } else {
        console.warn('  \u26a0\ufe0f  Could not start Windows Service (run setup-service.ps1 once elevated if this persists).');
      }
    }
  }
}
}

// == Step 4: Launch tray icon + register auto-start =================
const TRAY_EXE = path.join(ROOT, 'DiskCleanUp.Tray', 'bin', 'Debug', 'net8.0-windows', 'DiskCleanUp.Tray.exe');
if (mode === 'service' || mode === 'both') {
console.log('\n=== Step 5: Launch tray icon ===');
try {
  const { existsSync } = await import('fs');
  if (existsSync(TRAY_EXE)) {
    const tray = spawn(TRAY_EXE, [], { detached: true, stdio: 'ignore' });
    tray.unref();
    console.log('  Tray icon launched');
  } else {
    console.warn(`  Tray exe not found — skipping (run npm run build first)`);
    console.warn(`  Expected: ${TRAY_EXE}`);
  }
} catch (e) {
  console.warn('  Tray launch warning:', e.message);
}
}

// == Step 4: Launch trace viewer on port 5001 =======================
if (mode === 'service' || mode === 'both') {
console.log('\n=== Step 6: Launch trace viewer (port 5001) ===');
try {
  // Kill anything already on 5001
  try { execSync('taskkill /F /IM node.exe /FI "WINDOWTITLE eq trace-server*"', { stdio: 'ignore' }); } catch { }
  const traceServer = spawn(
    process.execPath,
    [path.join(ROOT, 'scripts', 'trace-server.js')],
    { detached: true, stdio: 'ignore' }
  );
  traceServer.unref();
  console.log('  Trace viewer launched → http://localhost:5001/trace-viewer.html');
} catch (e) {
  console.warn('  Trace viewer launch warning:', e.message);
}
}

if (mode === 'service') {
  console.log('\nService mode startup complete. Dashboard: http://localhost:5100');
  process.exit(0);
}

// == Step 7: Run backend =============================================
console.log('\n=== Step 7: Start console mode (port 5000) ===');

let proc;
if (useFresh) {
  const serviceDir = path.join(ROOT, 'DiskCleanUp.Service');
  const dll = path.resolve(FRESH_DLL);
  console.log(`Running from ${dll} (cwd: ${serviceDir})`);
  proc = spawn(DOTNET, [dll, '--console'], { cwd: serviceDir, stdio: 'inherit' });
} else {
  proc = spawn(DOTNET, ['run', '--no-build', '--project', PROJ, '--', '--console'], {
    cwd: ROOT, stdio: 'inherit'
  });
}

proc.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => proc.kill(sig));
}
