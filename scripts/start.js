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
const mode = args.has('--service') ? 'service' : 'console';

if (wantsHelp) {
  console.log('DiskCleanUp startup modes:');
  console.log('  node scripts/start.js            -> console mode (default, port 5000)');
  console.log('  node scripts/start.js --service  -> tray + trace viewer only (no console app)');
  process.exit(0);
}

console.log(`Startup mode: ${mode}`);

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

const serviceStillRunning = false;

// == Step 2: Build ==================================================
console.log('\n=== Step 2: Build ===');
let useFresh = false;

if (serviceStillRunning) {
  try {
    execSync(`${DOTNET} build "${PROJ}" --output "${FRESH_OUT}"`, {
      cwd: ROOT, stdio: 'inherit', timeout: 120000
    });
    useFresh = true;
  } catch {
    console.error('Build FAILED');
    process.exit(1);
  }
} else {
  try {
    execSync(`${DOTNET} build "${SLN}"`, {
      cwd: ROOT, stdio: 'inherit', timeout: 120000
    });
  } catch {
    console.error('Build FAILED');
    process.exit(1);
  }
}

// == Step 3: Launch tray icon =======================================
console.log('\n=== Step 3: Launch tray icon ===');
const TRAY_EXE = path.join(ROOT, 'DiskCleanUp.Tray', 'bin', 'Debug', 'net8.0-windows', 'DiskCleanUp.Tray.exe');
try {
  const { existsSync } = await import('fs');
  if (existsSync(TRAY_EXE)) {
    const tray = spawn(TRAY_EXE, [], { detached: true, stdio: 'ignore' });
    tray.unref();
    console.log('  Tray icon launched');
  } else {
    console.warn(`  Tray exe not found — skipping`);
  }
} catch (e) {
  console.warn('  Tray launch warning:', e.message);
}

// == Step 4: Launch trace viewer on port 5001 =======================
console.log('\n=== Step 4: Launch trace viewer (port 5001) ===');
try {
  try { execSync('taskkill /F /IM node.exe /FI "WINDOWTITLE eq trace-server*"', { stdio: 'ignore' }); } catch { }
  const traceServer = spawn(
    process.execPath,
    [path.join(ROOT, 'scripts', 'trace-server.js')],
    { detached: true, stdio: 'ignore' }
  );
  traceServer.unref();
  console.log('  Trace viewer launched -> http://localhost:5001/trace-viewer.html');
} catch (e) {
  console.warn('  Trace viewer launch warning:', e.message);
}

// == Step 5: Start console mode (port 5000) ========================
console.log('\n=== Step 5: Start console mode (port 5000) ===');

let proc;
if (useFresh) {
  const serviceDir = path.join(ROOT, 'DiskCleanUp.Service');
  proc = spawn(DOTNET, [path.resolve(FRESH_DLL), '--console'], { cwd: serviceDir, stdio: 'pipe' });
} else {
  proc = spawn(DOTNET, ['run', '--no-build', '--project', PROJ, '--', '--console'], {
    cwd: ROOT, stdio: 'pipe'
  });
}

// Pipe output to parent terminal
if (proc.stdout) proc.stdout.pipe(process.stdout);
if (proc.stderr) proc.stderr.pipe(process.stderr);
process.stdin.pipe(proc.stdin);

proc.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => proc.kill(sig));
}
