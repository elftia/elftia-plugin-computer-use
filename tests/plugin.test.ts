import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Structural contract: the plugin manifest (elftia-plugin.json) is a valid
// kind:agent contribution carrying exactly ONE bindable skill and NO agent
// package (the Desktop Operator persona was removed by user ruling 2026-08-19:
// computer-use is a skill for ANY agent, attached via Binding — design §25.9,
// plugin `enabled` is never a Binding).
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

  it('declares exactly one agent skill contribution with a stable id and path', () => {
    const manifest = loadPluginManifest();
    const entries = manifest.contributes?.agent?.skills;
    expect(Array.isArray(entries)).toBe(true);
    expect(entries).toHaveLength(1);
    expect(typeof entries[0].id).toBe('string');
    expect(entries[0].id).not.toBe('');
    expect(typeof entries[0].path).toBe('string');
    expect(entries[0].path).not.toBe('');
    // §25.9: recommendedAudience only PRE-SELECTS a UI choice. It must never
    // be able to force visibility — assert the manifest names no local agent
    // id and creates no binding authority of its own.
    if (entries[0].recommendedAudience !== undefined) {
      expect(['library-only', 'global', 'agent', 'project']).toContain(entries[0].recommendedAudience);
    }
  });

  it('resolves the contribution path to a skill directory containing SKILL.md', () => {
    const manifest = loadPluginManifest();
    const entry = manifest.contributes.agent.skills[0];
    const resolved = join(repoRoot, entry.path as string);
    expect(existsSync(resolved)).toBe(true);
    expect(existsSync(join(resolved, 'SKILL.md'))).toBe(true);
  });

  it('declares no agentPackages (operator persona removed; skills-only delivery)', () => {
    const manifest = loadPluginManifest();
    const packages = manifest.contributes?.agentPackages;
    expect(packages === undefined || (Array.isArray(packages) && packages.length === 0)).toBe(true);
  });
});
