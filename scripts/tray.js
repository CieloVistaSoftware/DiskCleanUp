#!/usr/bin/env node
/**
 * tray.js — Kill → Build → Launch the tray app safely.
 *
 * Usage (via npm scripts):
 *   npm run tray          — kill existing + launch (no rebuild)
 *   npm run tray:build    — kill existing + build only
 *   npm run tray:rebuild  — kill existing + build + launch
 *
 * Why this exists:
 *   dotnet build fails with MSB3027 if the tray exe is locked by a running
 *   process. This script kills the old tray first so the build never fails.
 */

import { execSync, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');
const TRAY_EXE  = path.join(ROOT, 'DiskCleanUp.Tray', 'bin', 'Debug', 'net8.0-windows', 'DiskCleanUp.Tray.exe');
const TRAY_PROJ = path.join(ROOT, 'DiskCleanUp.Tray');

const args      = process.argv.slice(2);
const buildOnly = args.includes('--build-only');
const rebuild   = args.includes('--rebuild');
const launchOnly = !buildOnly && !rebuild;  // default: just launch

// ── Step 1: Kill any running tray instance ────────────────────────────────
console.log('Stopping existing tray instance...');
try {
  execSync('taskkill /F /IM DiskCleanUp.Tray.exe', { stdio: 'pipe' });
  console.log('  Stopped.');
  // Brief pause so Windows releases the file lock
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 800);
} catch {
  console.log('  Not running.');
}

// ── Step 2: Build (if requested) ─────────────────────────────────────────
if (rebuild || buildOnly) {
  console.log('\nBuilding DiskCleanUp.Tray...');
  try {
    execSync(`dotnet build "${TRAY_PROJ}" --configuration Debug`, {
      cwd: ROOT, stdio: 'inherit', timeout: 60000
    });
    console.log('Build succeeded.');
  } catch {
    console.error('Build FAILED.');
    process.exit(1);
  }
}

// ── Step 3: Launch (unless build-only) ───────────────────────────────────
if (!buildOnly) {
  console.log('\nLaunching tray...');
  spawn(TRAY_EXE, [], {
    detached: true,
    stdio: 'ignore',
    cwd: path.dirname(TRAY_EXE),
  }).unref();
  console.log(`Tray launched. Check the system tray (^ overflow on taskbar).`);
}
