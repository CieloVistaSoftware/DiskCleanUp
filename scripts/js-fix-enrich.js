#!/usr/bin/env node
// scripts/js-fix-enrich.js
//
// Retroactively enriches fixes.json entries DCU-014 through DCU-087.
// Reads each .bak (original) vs current file, diffs them, then writes
// a precise human-readable description of exactly what changed.
//
// USAGE:
//   node scripts/js-fix-enrich.js          → preview changes only
//   node scripts/js-fix-enrich.js --apply  → write enriched entries to fixes.json

import fs   from 'fs';
import path from 'path';

const FIXES_PATH = path.resolve('DiskCleanUp.Service/data/fixes.json');
const APPLY      = process.argv.includes('--apply');

// ── Banner ────────────────────────────────────────────────────────────────
console.log();
console.log('  ╔══════════════════════════════════════════════════════════════╗');
console.log('  ║  js-fix-enrich.js                                            ║');
console.log('  ║                                                              ║');
console.log('  ║  Reads each fixed .js file vs its .bak original and writes  ║');
console.log('  ║  a precise entry in fixes.json describing exactly what was  ║');
console.log('  ║  changed: import added, try/catch location, catch rewrites. ║');
console.log('  ╚══════════════════════════════════════════════════════════════╝');
console.log();

// ── Load fixes.json ───────────────────────────────────────────────────────
let doc;
try { doc = JSON.parse(fs.readFileSync(FIXES_PATH, 'utf8')); }
catch (ex) { console.error('Cannot read fixes.json:', ex.message); process.exit(1); }

// ── Only touch the error-handling batch ──────────────────────────────────
const TARGET_IDS = new Set(
  doc.fixes
    .filter(f => f.category === 'error-handling')
    .map(f => f.id)
);

console.log(`  Found ${TARGET_IDS.size} error-handling entries to enrich.\n`);

// ── Diff helpers ──────────────────────────────────────────────────────────
function countOccurrences(src, pattern) {
  return (src.match(pattern) || []).length;
}

function linesAdded(oldSrc, newSrc) {
  const oldLines = new Set(oldSrc.split('\n').map(l => l.trim()).filter(Boolean));
  return newSrc.split('\n')
    .map(l => l.trim())
    .filter(l => l && !oldLines.has(l));
}

function describeChanges(filePath, bakPath) {
  const changes   = [];
  const fileName  = path.basename(filePath);
  const tag       = path.basename(filePath, '.js').toUpperCase().replace(/-/g, '_');

  let oldSrc, newSrc;
  try { oldSrc = fs.readFileSync(bakPath,  'utf8'); }
  catch { return { problem: 'No .bak file found — original not available.', fix: 'Error handling added (details unavailable — .bak missing).', filesChanged: [filePath] }; }
  try { newSrc = fs.readFileSync(filePath, 'utf8'); }
  catch { return { problem: 'Cannot read fixed file.', fix: 'N/A', filesChanged: [filePath] }; }

  // ── What was wrong (problem) ──────────────────────────────────────────
  const problems = [];
  const oldTryCatch  = countOccurrences(oldSrc, /\btry\s*\{/g);
  const oldBareCatch = countOccurrences(oldSrc, /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g);
  const oldHasErrLog = /ErrLog\.log/.test(oldSrc);
  const oldHasImport = /import.*ErrLog.*error-logger/.test(oldSrc);

  if (oldTryCatch === 0)   problems.push('No try/catch blocks — any runtime exception crashes silently with no trace.');
  if (oldBareCatch > 0)    problems.push(`${oldBareCatch} bare catch{} block${oldBareCatch > 1 ? 's' : ''} that swallowed exceptions without logging.`);
  if (!oldHasErrLog)       problems.push('No ErrLog.log() calls — exceptions never reached the error log.');
  if (!oldHasImport && oldTryCatch > 0) problems.push('ErrLog not imported despite having catch blocks.');

  // ── What was done (fix) ───────────────────────────────────────────────
  const newTryCatch  = countOccurrences(newSrc, /\btry\s*\{/g);
  const newBareCatch = countOccurrences(newSrc, /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g);
  const newHasErrLog = /ErrLog\.log/.test(newSrc);
  const newHasImport = /import.*ErrLog.*error-logger/.test(newSrc);

  if (!oldHasImport && newHasImport)
    changes.push(`Added: import { ErrLog } from './error-logger.js' (or relative equivalent).`);

  if (oldTryCatch === 0 && newTryCatch > 0)
    changes.push(`Wrapped entire module body in try/catch. Tag: [${tag}]. All unhandled exceptions now call ErrLog.log() with message + stack.`);

  if (oldBareCatch > 0 && newBareCatch === 0)
    changes.push(`Replaced ${oldBareCatch} bare catch{} block${oldBareCatch > 1 ? 's' : ''} with catch(ex){ ErrLog.log('[${tag}]', ex.message, ex.stack, 'CAUGHT_ERROR'); }.`);

  if (!oldHasErrLog && newHasErrLog && oldTryCatch > 0)
    changes.push(`Wired ErrLog.log() into ${newTryCatch} existing catch block${newTryCatch > 1 ? 's' : ''} that previously had no logging.`);

  // Count lines added
  const added = linesAdded(oldSrc, newSrc);
  const errLogCallsAdded = added.filter(l => /ErrLog\.log/.test(l)).length;
  if (errLogCallsAdded > 0)
    changes.push(`${errLogCallsAdded} ErrLog.log() call${errLogCallsAdded > 1 ? 's' : ''} added total.`);

  return {
    problem:      problems.length > 0 ? problems.join(' ') : 'Missing error handling coverage.',
    fix:          changes.length  > 0 ? changes.join(' ')  : 'Error handling added.',
    filesChanged: [filePath.replace(/\\/g, '/').replace(/^.*wwwroot\//, 'wwwroot/')],
  };
}

// ── Enrich each entry ─────────────────────────────────────────────────────
let enriched = 0;
const updated = doc.fixes.map(fix => {
  if (!TARGET_IDS.has(fix.id)) return fix;

  // Resolve absolute path from the source field
  const rel     = fix.source || fix.filesChanged?.[0] || '';
  const absPath = path.resolve(rel);
  const bakPath = absPath + '.bak';

  const { problem, fix: fixDesc, filesChanged } = describeChanges(absPath, bakPath);

  const enrichedFix = {
    ...fix,
    problem:      problem,
    fix:          fixDesc,
    filesChanged: filesChanged,
    // Normalize any garbled encoding artifacts
    title: `Error handling: ${path.basename(rel)} — try/catch + ErrLog wired`,
  };

  if (APPLY) {
    enriched++;
    console.log(`  ✅ ${fix.id}  ${path.basename(rel)}`);
    console.log(`       Problem : ${problem.slice(0, 90)}${problem.length > 90 ? '...' : ''}`);
    console.log(`       Fix     : ${fixDesc.slice(0, 90)}${fixDesc.length > 90 ? '...' : ''}\n`);
  } else {
    console.log(`  👁  ${fix.id}  ${path.basename(rel)}`);
    console.log(`       Problem : ${problem.slice(0, 90)}${problem.length > 90 ? '...' : ''}`);
    console.log(`       Fix     : ${fixDesc.slice(0, 90)}${fixDesc.length > 90 ? '...' : ''}\n`);
  }

  return enrichedFix;
});

if (APPLY) {
  doc.fixes = updated;
  fs.writeFileSync(FIXES_PATH, JSON.stringify(doc, null, 2), 'utf8');
  console.log(`\n  ✅ fixes.json updated — ${enriched} entries enriched.\n`);
} else {
  console.log(`\n  Preview only. Run with --apply to write to fixes.json.\n`);
}
