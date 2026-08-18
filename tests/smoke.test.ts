import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Bootstrap smoke test: proves the toolchain (vitest + node fs) works before
// the structural contract suite lands. Kept as a permanent trivial sanity
// check — the layout walker allowlists it.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('bootstrap smoke', () => {
  it('resolves the repo root and reads package.json', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('elftia-plugin-computer-use');
    expect(pkg.private).toBe(true);
  });
});
