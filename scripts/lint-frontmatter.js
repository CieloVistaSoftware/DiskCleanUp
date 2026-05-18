#!/usr/bin/env node
// lint-frontmatter.js — validates YAML front matter in all docs/**/*.md files
// Usage: node scripts/lint-frontmatter.js
// Exits 1 if any file fails to parse.

import { readFileSync, readdirSync } from 'fs';
import { resolve, relative } from 'path';
import yaml from 'js-yaml';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

function walkMd(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkMd(full));
    else if (entry.name.endsWith('.md')) results.push(full);
  }
  return results;
}

const FM_FENCE = /^---\r?\n([\s\S]*?)\r?\n---/;

const files = walkMd(resolve(ROOT, 'docs'));
let errors = 0;

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const match = content.match(FM_FENCE);
  if (!match) continue; // no front matter — skip

  try {
    yaml.load(match[1]);
  } catch (err) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    console.error(`FAIL  ${rel}`);
    console.error(`      ${err.message}\n`);
    errors++;
  }
}

if (errors === 0) {
  console.log(`OK  ${files.length} file(s) checked, 0 front matter errors.`);
  process.exit(0);
} else {
  console.error(`\n${errors} file(s) have invalid front matter.`);
  process.exit(1);
}
