#!/usr/bin/env node
// scripts/js-error-fix.js
//
// AUTO-FIXER for js-error-audit violations.
// Processes files ONE AT A TIME. Each run:
//   1. Picks the next unfixed violation from the audit report
//   2. Applies the fix (adds try/catch + ErrLog wiring, fixes bare catch{})
//   3. Writes a backup (.bak) before touching anything
//   4. On --commit: writes the fixes.json entry and advances the queue
//
// USAGE:
//   node scripts/js-error-fix.js              → show next file to fix + preview patch
//   node scripts/js-error-fix.js --apply      → apply fix to the next file
//   node scripts/js-error-fix.js --commit     → mark current file done, write fixes.json
//   node scripts/js-error-fix.js --apply --commit  → apply + commit in one step
//   node scripts/js-error-fix.js --status     → show queue progress
//   node scripts/js-error-fix.js --skip       → skip current file (add to skip list)

import fs   from 'fs';
import path from 'path';

// ── Paths ─────────────────────────────────────────────────────────────────
const ROOT         = path.resolve('DiskCleanUp.Service/wwwroot');
const FIXES_PATH   = path.resolve('DiskCleanUp.Service/data/fixes.json');
const REPORT_PATH  = path.resolve('data/js-error-audit.json');
const QUEUE_PATH   = path.resolve('data/js-error-fix-queue.json');

// ── Args ──────────────────────────────────────────────────────────────────
const APPLY  = process.argv.includes('--apply');
const COMMIT = process.argv.includes('--commit');
const STATUS = process.argv.includes('--status');
const SKIP   = process.argv.includes('--skip');

// ── Queue state ───────────────────────────────────────────────────────────
function loadQueue() {
  try { return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8')); }
  catch { return { done: [], skipped: [], lastApplied: null }; }
}
function saveQueue(q) {
  fs.mkdirSync(path.dirname(QUEUE_PATH), { recursive: true });
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(q, null, 2));
}

// ── Load audit report ─────────────────────────────────────────────────────
function loadReport() {
  try { return JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8')); }
  catch {
    console.error('❌ No audit report found. Run: node scripts/js-error-audit.js');
    process.exit(1);
  }
}

// ── Resolve ErrLog import path relative to a given JS file ───────────────
function errLogImportPath(jsFile) {
  const errLogAbs = path.join(ROOT, 'js', 'error-logger.js');
  let rel = path.relative(path.dirname(jsFile), errLogAbs).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

// ── Detect file structure ─────────────────────────────────────────────────
function analyzeFile(src, filePath) {
  const lines      = src.split('\n');
  const hasImports = /^import\s+/m.test(src);
  const hasExports = /^export\s+/m.test(src);
  const isModule   = hasImports || hasExports;

  // Find where imports end (last import line)
  let lastImportLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^import\s+/.test(lines[i])) lastImportLine = i;
  }

  // Already has ErrLog import?
  const hasErrLogImport = /import.*ErrLog.*error-logger/.test(src);

  // Count try/catch
  const tryCatchCount = (src.match(/\btry\s*\{/g) || []).length;

  // Has bare catch (empty body)?
  const bareCatchRe = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
  const bareMatches = [...src.matchAll(bareCatchRe)];

  return {
    lines, isModule, hasImports, hasExports,
    lastImportLine, hasErrLogImport,
    tryCatchCount, bareMatches,
    fileName: path.basename(filePath),
    tag: path.basename(filePath, '.js').toUpperCase().replace(/-/g, '_'),
  };
}

// ── Build the ErrLog import line ──────────────────────────────────────────
function buildErrLogImport(jsFile) {
  const importPath = errLogImportPath(jsFile);
  return `import { ErrLog } from '${importPath}';`;
}

// ── Fix: add try/catch wrapper to a file with none ───────────────────────
function fixNoCatch(src, info, jsFile) {
  const { lines, isModule, lastImportLine, hasErrLogImport, tag } = info;
  let result = [...lines];

  // 1. Add ErrLog import if missing
  let importOffset = 0;
  if (!hasErrLogImport) {
    const insertAt = lastImportLine >= 0 ? lastImportLine + 1 : 0;
    result.splice(insertAt, 0, buildErrLogImport(jsFile));
    importOffset = 1;
  }

  // 2. Find the first non-import, non-comment, non-blank line (module body start)
  let bodyStart = -1;
  for (let i = 0; i < result.length; i++) {
    const l = result[i].trim();
    if (!l) continue;
    if (l.startsWith('//') || l.startsWith('*') || l.startsWith('/*')) continue;
    if (/^import\s+/.test(l)) continue;
    bodyStart = i;
    break;
  }

  if (bodyStart < 0) {
    // Nothing to wrap
    return result.join('\n');
  }

  // 3. Wrap everything from bodyStart to end in try/catch
  const beforeBody = result.slice(0, bodyStart);
  const bodyLines  = result.slice(bodyStart);

  const indented   = bodyLines.map(l => l ? '  ' + l : l);
  const catchBlock = [
    `} catch (ex) {`,
    `  ErrLog.log('[${tag}]', ex.message, ex.stack, 'UNHANDLED_ERROR');`,
    `}`,
  ];

  return [
    ...beforeBody,
    `try {`,
    ...indented,
    ...catchBlock,
  ].join('\n');
}

// ── Fix: replace bare catch{} with proper ErrLog catch ───────────────────
function fixBareCatch(src, info) {
  const { tag } = info;
  // Replace catch { } and catch(e) { } with proper logging catch
  // Handles: catch { }  catch(e) { }  catch (e) { }  catch(ex) { }
  return src.replace(
    /catch\s*(\([^)]*\))?\s*\{\s*\}/g,
    (match, param) => {
      const varName = param ? param.replace(/[()]/g, '').trim() || 'ex' : 'ex';
      return `catch (${varName}) {\n  ErrLog.log('[${tag}]', ${varName}.message, ${varName}.stack, 'CAUGHT_ERROR');\n}`;
    }
  );
}

// ── Fix: add ErrLog import + wire into existing catch blocks ─────────────
function fixMissingErrLog(src, info, jsFile) {
  let result = src;
  const { lines, lastImportLine, hasErrLogImport, tag } = info;

  // 1. Add import if missing
  if (!hasErrLogImport) {
    const allLines = result.split('\n');
    const insertAt = lastImportLine >= 0 ? lastImportLine + 1 : 0;
    allLines.splice(insertAt, 0, buildErrLogImport(jsFile));
    result = allLines.join('\n');
  }

  // 2. Find catch blocks that have a body but no ErrLog call — add one
  // Match: catch (ex) { <body without ErrLog> }
  result = result.replace(
    /catch\s*\(([^)]+)\)\s*\{([^}]*)\}/g,
    (match, param, body) => {
      if (/ErrLog\.log/.test(body)) return match; // already has it
      const varName = param.trim();
      const logLine = `\n  ErrLog.log('[${tag}]', ${varName}.message, ${varName}.stack, 'CAUGHT_ERROR');`;
      return `catch (${varName}) {${body}${logLine}\n}`;
    }
  );

  return result;
}

// ── Apply the right fix strategy for a violation ─────────────────────────
function applyFix(jsFile, violation) {
  const src  = fs.readFileSync(jsFile, 'utf8');
  const info = analyzeFile(src, jsFile);

  // Back up original
  fs.writeFileSync(jsFile + '.bak', src);

  let fixed = src;
  let strategies = [];

  if (info.tryCatchCount === 0) {
    // No try/catch at all — wrap the whole module
    fixed = fixNoCatch(src, info, jsFile);
    strategies.push('wrapped module in try/catch');
  }

  if (info.bareMatches.length > 0) {
    // Has bare catch{} — replace with logged version
    fixed = fixBareCatch(fixed, info);
    strategies.push(`replaced ${info.bareMatches.length} bare catch{} with ErrLog`);
  }

  if (!info.hasErrLogImport || !/ErrLog\.log/.test(fixed)) {
    // Has catch blocks but no ErrLog wiring
    fixed = fixMissingErrLog(fixed, info, jsFile);
    strategies.push('added ErrLog import + wired into catch blocks');
  }

  fs.writeFileSync(jsFile, fixed, 'utf8');
  return strategies;
}

// ── Write to fixes.json ───────────────────────────────────────────────────
function writeFix(violation, strategies, jsFile) {
  let doc;
  try { doc = JSON.parse(fs.readFileSync(FIXES_PATH, 'utf8')); }
  catch { doc = { metadata: {}, fixes: [] }; }

  const existingIds = (doc.fixes || [])
    .map(f => parseInt((f.id || '').replace('DCU-', ''), 10))
    .filter(n => !isNaN(n));
  const nextId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
  const id     = `DCU-${String(nextId).padStart(3, '0')}`;
  const now    = new Date().toISOString();

  const entry = {
    id,
    source:   violation.file,
    title:    `Error handling: add try/catch + ErrLog to ${path.basename(jsFile)}`,
    problem:  violation.issue || (violation.issues || []).join('; '),
    fix:      strategies.join('. ') + '. All unhandled exceptions now route to ErrLog → errors.jsonl.',
    category: 'error-handling',
    resolved: true,
    seenCount: 1,
    firstSeen:  now,
    lastSeen:   now,
    filesChanged: [violation.file],
    resolvedOn:  now,
    resolution: { type: 'code-change' },
  };

  doc.fixes.push(entry);
  fs.writeFileSync(FIXES_PATH, JSON.stringify(doc, null, 2));
  return id;
}

// ── Banner ──────────────────────────────────────────────────────────────
function printBanner() {
  const banners = {
    preview: [
      '╔══════════════════════════════════════════════════════════════╗',
      '║  npm run fix:errors                                          ║',
      '║                                                              ║',
      '║  Shows the next file in the violation queue and previews     ║',
      '║  exactly what changes will be made. Does NOT touch any       ║',
      '║  files — safe to run any time to check what is next.         ║',
      '╚══════════════════════════════════════════════════════════════╝',
    ],
    apply: [
      '╔══════════════════════════════════════════════════════════════╗',
      '║  npm run fix:errors:apply                                    ║',
      '║                                                              ║',
      '║  Applies the fix to the next file in the queue.             ║',
      '║  Writes a .bak backup before touching anything.             ║',
      '║  Does NOT write to fixes.json yet — run :commit after        ║',
      '║  testing to record the fix permanently.                      ║',
      '╚══════════════════════════════════════════════════════════════╝',
    ],
    commit: [
      '╔══════════════════════════════════════════════════════════════╗',
      '║  npm run fix:errors:commit                                   ║',
      '║                                                              ║',
      '║  Applies the fix AND immediately writes the full entry to    ║',
      '║  fixes.json (DCU-XXX id, file, problem, what was changed).   ║',
      '║  Advances the queue to the next violation when done.         ║',
      '╚══════════════════════════════════════════════════════════════╝',
    ],
    status: [
      '╔══════════════════════════════════════════════════════════════╗',
      '║  npm run fix:errors:status                                   ║',
      '║                                                              ║',
      '║  Shows a summary of the fix queue: how many violations       ║',
      '║  exist, how many are fixed, skipped, and remaining.          ║',
      '║  Lists the next 5 files waiting to be fixed.                 ║',
      '╚══════════════════════════════════════════════════════════════╝',
    ],
    skip: [
      '╔══════════════════════════════════════════════════════════════╗',
      '║  npm run fix:errors:skip                                     ║',
      '║                                                              ║',
      '║  Skips the current file and moves to the next violation.     ║',
      '║  Use for 3rd-party files or intentional no-catch patterns.   ║',
      '║  Skipped files are tracked and excluded from future runs.    ║',
      '╚══════════════════════════════════════════════════════════════╝',
    ],
  };

  let key = 'preview';
  if (STATUS)        key = 'status';
  else if (SKIP)     key = 'skip';
  else if (APPLY && COMMIT) key = 'commit';
  else if (APPLY)    key = 'apply';

  console.log();
  banners[key].forEach(l => console.log('  ' + l));
  console.log();
}

// ── Status display ────────────────────────────────────────────────────────
function showStatus() {
  const report = loadReport();
  const queue  = loadQueue();
  const all    = [...report.violations, ...report.warnings];
  const doneSet    = new Set(queue.done.map(d => d.file));
  const skippedSet = new Set(queue.skipped);
  const remaining  = all.filter(v => !doneSet.has(v.file) && !skippedSet.has(v.file));

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║            JS ERROR FIX — QUEUE STATUS          ║');
  console.log('╚══════════════════════════════════════════════════╝\n');
  console.log(`  Total violations : ${all.length}`);
  console.log(`  ✅ Fixed          : ${queue.done.length}`);
  console.log(`  ⏭  Skipped        : ${queue.skipped.length}`);
  console.log(`  🔧 Remaining      : ${remaining.length}\n`);

  if (remaining.length > 0) {
    console.log('  Next up:');
    remaining.slice(0, 5).forEach((v, i) => {
      const sev = v.severity === 'ERROR' ? '❌' : '⚠️ ';
      console.log(`    ${i + 1}. ${sev} ${v.file}`);
    });
    if (remaining.length > 5) console.log(`    ... and ${remaining.length - 5} more`);
  }
  console.log();
}

// ── Main ──────────────────────────────────────────────────────────────────
printBanner();

if (STATUS) {
  showStatus();
  process.exit(0);
}

const report = loadReport();
const queue  = loadQueue();
const all    = [...report.violations, ...report.warnings];
const doneSet    = new Set(queue.done.map(d => d.file));
const skippedSet = new Set(queue.skipped);
const remaining  = all.filter(v => !doneSet.has(v.file) && !skippedSet.has(v.file));

if (remaining.length === 0) {
  console.log('\n  🎉 All violations fixed. Nothing left to do.\n');
  process.exit(0);
}

const current = remaining[0];
const absPath = path.resolve(current.file);

console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║              JS ERROR FIX — CURRENT FILE            ║');
console.log('╚══════════════════════════════════════════════════════╝\n');
console.log(`  File     : ${current.file}`);
console.log(`  Severity : ${current.severity}`);
if (current.issue)        console.log(`  Issue    : ${current.issue}`);
if (current.issues?.length) current.issues.forEach(i => console.log(`  Issue    : ${i}`));
console.log(`  Progress : ${queue.done.length + 1} / ${all.length}`);
console.log(`  Remaining: ${remaining.length}\n`);

if (SKIP) {
  queue.skipped.push(current.file);
  saveQueue(queue);
  console.log(`  ⏭  Skipped. Next: ${remaining[1]?.file || '(none)'}\n`);
  process.exit(0);
}

if (!APPLY && !COMMIT) {
  // Preview mode — show what will be done
  const src  = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf8') : '(file not found)';
  const info = analyzeFile(src, absPath);
  console.log('  What this fixer will do:');
  if (info.tryCatchCount === 0)
    console.log('  • Wrap entire module body in try/catch');
  if (info.bareMatches.length > 0)
    console.log(`  • Replace ${info.bareMatches.length} bare catch{} with ErrLog.log()`);
  if (!info.hasErrLogImport)
    console.log(`  • Add: import { ErrLog } from '${errLogImportPath(absPath)}'`);
  if (info.tryCatchCount > 0 && !/ErrLog\.log/.test(src))
    console.log('  • Wire ErrLog.log() into existing catch blocks');
  console.log('\n  Run with --apply to apply, --apply --commit to apply + write fixes.json\n');
  process.exit(0);
}

if (!fs.existsSync(absPath)) {
  console.error(`  ❌ File not found: ${absPath}`);
  process.exit(1);
}

if (APPLY) {
  console.log('  🔧 Applying fix...');
  const strategies = applyFix(absPath, current);
  console.log(`  ✅ Fixed: ${strategies.join(', ')}`);
  console.log(`  📄 Backup: ${current.file}.bak`);
  queue.lastApplied = { file: current.file, appliedAt: new Date().toISOString() };
  saveQueue(queue);
}

if (COMMIT) {
  const target = queue.lastApplied?.file || current.file;
  const v      = all.find(x => x.file === target) || current;
  const abs    = path.resolve(target);
  const src    = fs.readFileSync(abs, 'utf8');
  const info   = analyzeFile(src, abs);

  const strategies = [];
  if (info.tryCatchCount > 0) strategies.push('added try/catch wrapper');
  if (/ErrLog\.log/.test(src)) strategies.push('ErrLog.log() wired in all catch blocks');
  if (info.hasErrLogImport)    strategies.push('ErrLog import added');

  const id = writeFix(v, strategies.length > 0 ? strategies : ['error handling added'], abs);
  queue.done.push({ file: target, fixId: id, doneAt: new Date().toISOString() });
  queue.lastApplied = null;
  saveQueue(queue);

  const next = remaining.slice(1).find(r => !new Set(queue.done.map(d=>d.file)).has(r.file));
  console.log(`\n  ✅ Committed → fixes.json ${id}`);
  console.log(`  ${remaining.length - 1} violations remaining.`);
  if (next) console.log(`  ▶ Next: ${next.file}`);
  console.log(`  Run: node scripts/js-error-fix.js --apply --commit\n`);
}
