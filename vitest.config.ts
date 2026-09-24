import { defineConfig } from 'vitest/config';

// All tests are pure Node (fs/path assertions over the repo's data files —
// manifests, SKILL.md, system prompt). No DOM, no host-repo imports: the
// suite must pass with only this repo present (toolchain spec).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The atomic-tree tests copy and hash the complete skill into an OS temp
    // directory. Windows filesystem filters can make that exceed Vitest's
    // browser-oriented 5 second default without indicating a deadlock.
    testTimeout: 120_000,
  },
});
