import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Structural contract: the plugin manifest (elftia-plugin.json) is a valid
// kind:agent contribution (capability computer-use-plugin-package).
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadPluginManifest() {
  return JSON.parse(readFileSync(join(repoRoot, 'elftia-plugin.json'), 'utf8'));
}

describe('elftia-plugin.json', () => {
  it('parses with kind "agent" and non-empty identity fields', () => {
    const manifest = loadPluginManifest();
    expect(manifest.kind).toBe('agent');
    expect(typeof manifest.name).toBe('string');
    expect(manifest.name).not.toBe('');
    expect(typeof manifest.version).toBe('string');
    expect(manifest.version).not.toBe('');
    expect(typeof manifest.displayName).toBe('string');
    expect(manifest.displayName).not.toBe('');
    expect(typeof manifest.description).toBe('string');
    expect(manifest.description).not.toBe('');
  });

  it('declares exactly one agentPackages contribution', () => {
    const manifest = loadPluginManifest();
    const entries = manifest.contributes?.agentPackages;
    expect(Array.isArray(entries)).toBe(true);
    expect(entries).toHaveLength(1);
    expect(typeof entries[0].file).toBe('string');
    expect(entries[0].file).not.toBe('');
  });

  it('resolves the contribution file to an existing file on disk', () => {
    const manifest = loadPluginManifest();
    const file = manifest.contributes.agentPackages[0].file as string;
    const resolved = join(repoRoot, file);
    expect(existsSync(resolved)).toBe(true);
  });
});
