import { defineConfig } from 'vitest/config';

// All tests are pure Node (fs/path assertions over the repo's data files —
// manifests, SKILL.md, system prompt). No DOM, no host-repo imports: the
// suite must pass with only this repo present (toolchain spec).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
