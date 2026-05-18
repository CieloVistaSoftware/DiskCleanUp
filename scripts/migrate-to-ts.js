#!/usr/bin/env node
/**
 * migrate-to-ts.js
 * Converts all frontend .js source files to .ts in-place.
 * TypeScript compiles .ts → .js (same location) so the browser
 * keeps loading the same paths. Source files become .ts.
 *
 * Run once: node scripts/migrate-to-ts.js
 */
import { execSync } from 'child_process';
import { readdirSync, renameSync, existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');
const WWWROOT   = path.join(ROOT, 'DiskCleanUp.Service', 'wwwroot');

// ── Vendor files we never touch ────────────────────────────────────────────
const SKIP = new Set([
  'signalr.min.js',
  'marked.min.js',
]);

// ── Directories to scan for .js → .ts ──────────────────────────────────────
const SCAN_DIRS = [
  path.join(WWWROOT, 'js'),
  path.join(WWWROOT, 'models'),
  path.join(WWWROOT, 'sections'),
  path.join(WWWROOT, 'viewmodels'),
  path.join(WWWROOT, 'views'),
  path.join(WWWROOT, 'lib', 'wb-core', 'utils'),
  path.join(WWWROOT, 'lib', 'wb-core', 'components'),
  path.join(WWWROOT, 'lib', 'wb-core', 'behaviors'),
];

// ── Step 1: Install TypeScript ──────────────────────────────────────────────
console.log('\n=== Step 1: Install TypeScript ===');
try {
  execSync('npm install --save-dev typescript', { cwd: ROOT, stdio: 'inherit' });
  console.log('  TypeScript installed');
} catch (e) {
  console.error('  FAILED to install TypeScript:', e.message);
  process.exit(1);
}

// ── Step 2: Write tsconfig.json ────────────────────────────────────────────
console.log('\n=== Step 2: Write tsconfig.json ===');
const tsconfig = {
  compilerOptions: {
    target: 'ES2020',
    module: 'ES2020',
    moduleResolution: 'bundler',
    lib: ['ES2020', 'DOM', 'DOM.Iterable'],
    strict: false,
    noImplicitAny: false,
    allowJs: false,
    skipLibCheck: true,
    noEmit: false,
    // Compile each .ts file to .js in-place (no outDir = same dir as source)
    declaration: false,
    sourceMap: true,
    removeComments: false,
    // Allow export/import in modules
    isolatedModules: false,
  },
  include: [
    'DiskCleanUp.Service/wwwroot/js/**/*.ts',
    'DiskCleanUp.Service/wwwroot/models/**/*.ts',
    'DiskCleanUp.Service/wwwroot/sections/**/*.ts',
    'DiskCleanUp.Service/wwwroot/viewmodels/**/*.ts',
    'DiskCleanUp.Service/wwwroot/views/**/*.ts',
    'DiskCleanUp.Service/wwwroot/lib/wb-core/**/*.ts',
  ],
  exclude: [
    'node_modules',
    'DiskCleanUp.Service/wwwroot/lib/wb-core/node_modules',
    '**/*.bak',
  ],
};

const tsconfigPath = path.join(ROOT, 'tsconfig.json');
writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));
console.log(`  Written: tsconfig.json`);

// ── Step 3: Rename .js → .ts ───────────────────────────────────────────────
console.log('\n=== Step 3: Rename .js → .ts ===');
let renamed = 0;
let skipped = 0;

for (const dir of SCAN_DIRS) {
  if (!existsSync(dir)) {
    console.log(`  SKIP (not found): ${dir}`);
    continue;
  }
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (!entry.endsWith('.js') || entry.endsWith('.bak')) { skipped++; continue; }
    if (SKIP.has(entry)) { console.log(`  SKIP vendor: ${entry}`); skipped++; continue; }

    const jsPath = path.join(dir, entry);
    const tsPath = path.join(dir, entry.replace(/\.js$/, '.ts'));

    if (existsSync(tsPath)) {
      console.log(`  ALREADY .ts: ${entry}`);
      skipped++;
      continue;
    }

    renameSync(jsPath, tsPath);
    const rel = tsPath.replace(WWWROOT, '');
    console.log(`  Renamed: ${rel}`);
    renamed++;
  }
}
console.log(`\n  Total renamed: ${renamed}, skipped: ${skipped}`);

// ── Step 4: Delete stale .bak files ───────────────────────────────────────
console.log('\n=== Step 4: Remove .bak files ===');
let deleted = 0;
for (const dir of SCAN_DIRS) {
  if (!existsSync(dir)) continue;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (!entry.endsWith('.bak')) continue;
    const { unlinkSync } = await import('fs');
    unlinkSync(path.join(dir, entry));
    console.log(`  Deleted: ${entry}`);
    deleted++;
  }
}
console.log(`  Total deleted: ${deleted}`);

// ── Step 5: First compile check ────────────────────────────────────────────
console.log('\n=== Step 5: TypeScript compile check ===');
const tscBin = path.join(ROOT, 'node_modules', '.bin', 'tsc');
try {
  execSync(`"${tscBin}" --noEmit`, { cwd: ROOT, stdio: 'inherit' });
  console.log('\n  ✅ TypeScript compile: CLEAN');
} catch {
  console.warn('\n  ⚠️  TypeScript compile errors above — fix before running npm start');
}

console.log('\n=== Migration complete ===');
console.log('Next: wire tsc into start.js (Step 2.5)');
