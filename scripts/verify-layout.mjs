// Structural walk for `npm run verify`: asserts the repo contains exactly
// the declared layout — no stray files outside it, and no declared file
// missing. Plain Node ESM, zero dependencies.
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// The declared layout (design D1 + the verify walker itself + the smoke
// test). package-lock.json is allowed but not required (it appears once
// `npm install` has run).
const ALLOWED_FILES = new Set([
  '.gitattributes',
  '.gitignore',
  'README.md',
  'elftia-plugin.json',
  'eslint.config.js',
  'package.json',
  'package-lock.json',
  'vitest.config.ts',
  'skills/computer-use/SKILL.md',
  'scripts/verify-layout.mjs',
  'tests/smoke.test.ts',
  'tests/plugin.test.ts',
  'tests/skill.test.ts',
  'tests/english-only.test.ts',
]);

const REQUIRED_FILES = [...ALLOWED_FILES].filter((f) => f !== 'package-lock.json');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'coverage']);

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) found.push(...walk(full));
    } else {
      found.push(relative(repoRoot, full).split('\\').join('/'));
    }
  }
  return found;
}

const failures = [];
for (const file of walk(repoRoot)) {
  if (file.endsWith('.log')) continue; // transient tool output, gitignored
  if (!ALLOWED_FILES.has(file)) failures.push(`stray file outside declared layout: ${file}`);
}
for (const file of REQUIRED_FILES) {
  try {
    statSync(join(repoRoot, file));
  } catch {
    failures.push(`declared file missing: ${file}`);
  }
}

if (failures.length > 0) {
  console.error(`verify-layout: FAIL (${failures.length} problem(s))`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`verify-layout: PASS (${ALLOWED_FILES.size} declared files, no strays)`);
