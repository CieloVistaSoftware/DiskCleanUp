#!/usr/bin/env node
// scripts/js-error-audit.js
//
// PURPOSE:
//   1. AUDIT   — scan all .js files, flag any with zero try/catch blocks
//   2. FIX     — work through violations one-by-one, mark fixed + write fixes.json
//   3. ENFORCE — can be wired into CI: exits non-zero if violations exist
//
// USAGE:
//   node scripts/js-error-audit.js            → audit + print report
//   node scripts/js-error-audit.js --fix      → interactive fix mode (one at a time)
//   node scripts/js-error-audit.js --ci       → audit only, exit 1 if violations found

import fs   from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ── Config ────────────────────────────────────────────────────────────────
const ROOT        = path.resolve('DiskCleanUp.Service/wwwroot');
const FIXES_PATH  = path.resolve('DiskCleanUp.Service/data/fixes.json');
const REPORT_PATH = path.resolve('data/js-error-audit.json');
const AUDIT_STATE = path.resolve('data/js-error-audit-state.json');

const EXCLUDE_DIRS  = new Set(['node_modules', '_retired', 'obj', 'bin', 'lib']);  // lib = vendor/deployed packages (wb-core etc), not DiskCleanUp app code
const EXCLUDE_FILES = new Set([
  // 3rd-party libs — we don't own these
  'marked.min.js',
  'pubsub.js',      // wb-core — intentional design, not our catch obligation
]);

// Files where "no try/catch" is intentional (pure data/config modules)
const INTENTIONAL_NO_CATCH = new Set([
  'ext-colors.js',   // pure lookup table
  'breadcrumb.js',   // tiny ring buffer, no I/O
]);

const MODE_AUDIT = !process.argv.includes('--fix') && !process.argv.includes('--ci');
const MODE_FIX   = process.argv.includes('--fix');
const MODE_CI    = process.argv.includes('--ci');

// ── Helpers ───────────────────────────────────────────────────────────────
function walk(dir, results = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return results; }

  for (const e of entries) {
    if (EXCLUDE_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, results);
    } else if (e.isFile() && e.name.endsWith('.js') && !EXCLUDE_FILES.has(e.name)) {
      results.push(full);
    }
  }
  return results;
}

function countTryCatch(src) {
  // Count try { blocks — simple regex, good enough for our codebase
  return (src.match(/\btry\s*\{/g) || []).length;
}

function hasCatchAll(src) {
  // Detect the old bare "catch { }" or "catch(e){ }" with empty body pattern
  return /catch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(src);
}

function hasErrLogCall(src) {
  // Does the file reference our error logger?
  return /ErrLog\.log|error-logger|console\.error/.test(src);
}

function relPath(p) {
  return path.relative(process.cwd(), p).replace(/\\/g, '/');
}

// ── Audit ─────────────────────────────────────────────────────────────────
function runAudit() {
  const files = walk(ROOT);
  const violations = [];
  const warnings   = [];
  const clean      = [];

  for (const file of files) {
    const rel = relPath(file);
    let src;
    try { src = fs.readFileSync(file, 'utf8'); }
    catch (ex) { console.error(`[SKIP] Cannot read ${rel}: ${ex.message}`); continue; }

    const tryCatchCount = countTryCatch(src);
    const hasErrLog     = hasErrLogCall(src);
    const hasBareCatch  = hasCatchAll(src);
    const intentional   = INTENTIONAL_NO_CATCH.has(path.basename(file));

    if (intentional) {
      clean.push({ file: rel, tryCatchCount, note: 'intentional-no-catch' });
      continue;
    }

    if (tryCatchCount === 0) {
      violations.push({
        file: rel,
        tryCatchCount: 0,
        hasErrLog,
        severity: 'ERROR',
        issue: 'No try/catch — unhandled exceptions will crash silently',
      });
    } else {
      // Has try/catch — check quality
      const issues = [];
      if (hasBareCatch)  issues.push('bare catch{} swallows errors silently');
      if (!hasErrLog)    issues.push('no ErrLog.log call — errors not reaching error log');

      if (issues.length > 0) {
        warnings.push({ file: rel, tryCatchCount, hasErrLog, severity: 'WARN', issues });
      } else {
        clean.push({ file: rel, tryCatchCount, hasErrLog });
      }
    }
  }

  return { violations, warnings, clean, scannedAt: new Date().toISOString() };
}

// ── Print report ──────────────────────────────────────────────────────────
function printReport(report) {
  const { violations, warnings, clean } = report;

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║         JS ERROR HANDLING AUDIT REPORT              ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  console.log(`  ✅ Clean     : ${clean.length} files`);
  console.log(`  ⚠️  Warnings  : ${warnings.length} files (has try/catch but poor quality)`);
  console.log(`  ❌ Violations: ${violations.length} files (NO try/catch at all)\n`);

  if (violations.length > 0) {
    console.log('── ❌ VIOLATIONS (must fix) ──────────────────────────────');
    violations.forEach((v, i) => {
      console.log(`  ${String(i + 1).padStart(2)}. ${v.file}`);
      console.log(`      ${v.issue}`);
      console.log(`      ErrLog wired: ${v.hasErrLog ? '✅' : '❌'}\n`);
    });
  }

  if (warnings.length > 0) {
    console.log('── ⚠️  WARNINGS (should fix) ─────────────────────────────');
    warnings.forEach((w, i) => {
      console.log(`  ${String(i + 1).padStart(2)}. ${w.file} (${w.tryCatchCount} try/catch)`);
      w.issues.forEach(issue => console.log(`      • ${issue}`));
      console.log();
    });
  }
}

// ── Save report to disk ───────────────────────────────────────────────────
function saveReport(report) {
  const dir = path.dirname(REPORT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\n  📄 Full report saved → ${relPath(REPORT_PATH)}`);
}

// ── Load / save audit state (tracks what's been fixed) ───────────────────
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(AUDIT_STATE, 'utf8'));
  } catch {
    return { fixed: [], skipped: [], nextViolationIndex: 0 };
  }
}

function saveState(state) {
  const dir = path.dirname(AUDIT_STATE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(AUDIT_STATE, JSON.stringify(state, null, 2));
}

// ── Write entry to fixes.json ─────────────────────────────────────────────
function writeFix(fixEntry) {
  let fixesDoc;
  try {
    fixesDoc = JSON.parse(fs.readFileSync(FIXES_PATH, 'utf8'));
  } catch {
    fixesDoc = { metadata: {}, fixes: [] };
  }

  // Auto-assign next DCU-XXX id
  const existingIds = (fixesDoc.fixes || [])
    .map(f => parseInt((f.id || '').replace('DCU-', ''), 10))
    .filter(n => !isNaN(n));
  const nextId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
  fixEntry.id = `DCU-${String(nextId).padStart(3, '0')}`;

  fixesDoc.fixes.push(fixEntry);
  fs.writeFileSync(FIXES_PATH, JSON.stringify(fixesDoc, null, 2));
  console.log(`\n  ✅ fixes.json updated → ${fixEntry.id}: ${fixEntry.title}`);
}

// ── Fix mode: one violation at a time ────────────────────────────────────
function runFixMode() {
  const report = runAudit();
  const state  = loadState();
  const allViolations = [...report.violations, ...report.warnings];

  // Filter out already-fixed files
  const fixedFiles = new Set(state.fixed.map(f => f.file));
  const remaining  = allViolations.filter(v => !fixedFiles.has(v.file));

  if (remaining.length === 0) {
    console.log('\n  🎉 All violations resolved! Nothing left to fix.\n');
    return;
  }

  const current = remaining[0];

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║              FIX MODE — NEXT VIOLATION              ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');
  console.log(`  File     : ${current.file}`);
  console.log(`  Severity : ${current.severity}`);
  if (current.issue)   console.log(`  Issue    : ${current.issue}`);
  if (current.issues)  current.issues.forEach(i => console.log(`  Issue    : ${i}`));
  console.log(`  ErrLog   : ${current.hasErrLog ? '✅ wired' : '❌ NOT wired'}`);
  console.log(`\n  Remaining: ${remaining.length} of ${allViolations.length} total\n`);

  console.log('  What to do:');
  console.log('  1. Open the file in VS Code');
  console.log('  2. Wrap top-level logic in try/catch');
  console.log('  3. In catch: call ErrLog.log(\'[filename]\', err.message, err.stack, \'TAG\')');
  console.log('  4. Test — confirm no console errors');
  console.log('  5. Re-run: node scripts/js-error-audit.js --fix --mark-fixed\n');

  // If --mark-fixed flag: record it and write to fixes.json
  if (process.argv.includes('--mark-fixed')) {
    const now = new Date().toISOString();
    const fixEntry = {
      id: '',   // auto-assigned
      source:   current.file,
      title:    `Added try/catch + ErrLog to ${path.basename(current.file)}`,
      problem:  current.issue || (current.issues || []).join('; '),
      fix:      `Wrapped module logic in try/catch. All catch blocks now call ErrLog.log() with full stack. Bare catch{} patterns removed.`,
      category: 'error-handling',
      resolved: true,
      seenCount: 1,
      firstSeen: now,
      lastSeen:  now,
      filesChanged: [current.file],
      resolvedOn: now,
      resolution: { type: 'code-change' },
    };

    writeFix(fixEntry);

    state.fixed.push({ file: current.file, fixedAt: now, id: fixEntry.id });
    saveState(state);

    const stillRemaining = remaining.slice(1);
    console.log(`\n  ✅ Marked as fixed. ${stillRemaining.length} violations remaining.`);
    if (stillRemaining.length > 0) {
      console.log(`  ▶ Next: ${stillRemaining[0].file}`);
      console.log(`  Run:   node scripts/js-error-audit.js --fix\n`);
    } else {
      console.log('  🎉 All done!\n');
    }
  }
}

// ── Banner ───────────────────────────────────────────────────────────────
function printBanner() {
  const banners = {
    audit: [
      '╔══════════════════════════════════════════════════════════════╗',
      '║  npm run audit:errors                                        ║',
      '║                                                              ║',
      '║  Scans every .js file under wwwroot and checks that each     ║',
      '║  one has at least one try/catch block wired to ErrLog.       ║',
      '║  Flags bare catch{} blocks that swallow errors silently.     ║',
      '║  Saves full results to data/js-error-audit.json.             ║',
      '╚══════════════════════════════════════════════════════════════╝',
    ],
    ci: [
      '╔══════════════════════════════════════════════════════════════╗',
      '║  npm run audit:errors:ci                                     ║',
      '║                                                              ║',
      '║  Same as audit:errors but exits with code 1 if any          ║',
      '║  violations are found. Use this in CI pipelines to block     ║',
      '║  a build when unhandled exception coverage is missing.       ║',
      '╚══════════════════════════════════════════════════════════════╝',
    ],
    fix: [
      '╔══════════════════════════════════════════════════════════════╗',
      '║  npm run audit:fix                                           ║',
      '║                                                              ║',
      '║  Shows the next unfixed violation and explains what needs    ║',
      '║  to change. Does NOT modify any files — preview only.        ║',
      '║  Use audit:mark-fixed after you have fixed the file.         ║',
      '╚══════════════════════════════════════════════════════════════╝',
    ],
    markFixed: [
      '╔══════════════════════════════════════════════════════════════╗',
      '║  npm run audit:mark-fixed                                    ║',
      '║                                                              ║',
      '║  Marks the current violation as resolved, writes a full      ║',
      '║  entry to fixes.json (DCU-XXX id, file, problem, fix),       ║',
      '║  and advances the queue to the next violation.               ║',
      '╚══════════════════════════════════════════════════════════════╝',
    ],
  };

  let key = 'audit';
  if (MODE_CI)                                  key = 'ci';
  else if (MODE_FIX && process.argv.includes('--mark-fixed')) key = 'markFixed';
  else if (MODE_FIX)                            key = 'fix';

  console.log();
  banners[key].forEach(l => console.log('  ' + l));
  console.log();
}

// ── Main ──────────────────────────────────────────────────────────────────
printBanner();

if (MODE_FIX) {
  runFixMode();
} else {
  const report = runAudit();
  printReport(report);
  saveReport(report);

  if (MODE_CI && report.violations.length > 0) {
    console.error(`\n  ❌ CI FAILED: ${report.violations.length} files with no error handling.\n`);
    process.exit(1);
  }
}
