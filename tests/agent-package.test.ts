import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Structural contract: agent/manifest.json is a valid AgentPackageManifest
// with a safety-first configuration (capability computer-use-plugin-package).
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const agentDir = join(repoRoot, 'agent');

// AgentCategory union from the host contract
// (packages/shared/src/contracts/runtime/contracts/custom-agent-types/agent.ts).
const AGENT_CATEGORIES = [
  'my',
  'featured',
  'work',
  'business',
  'finance',
  'tools',
  'language',
  'office',
  'general',
  'writing',
  'coding',
  'emotion',
  'creative',
];

function loadAgentManifest() {
  return JSON.parse(readFileSync(join(agentDir, 'manifest.json'), 'utf8'));
}

describe('agent package manifest', () => {
  it('has all required AgentPackageManifest fields', () => {
    const manifest = loadAgentManifest();
    for (const field of ['id', 'version', 'name', 'category'] as const) {
      expect(typeof manifest[field]).toBe('string');
      expect(manifest[field]).not.toBe('');
    }
    expect(AGENT_CATEGORIES).toContain(manifest.category);
  });

  it('declares exactly one skill with all three ManifestSkill fields', () => {
    const manifest = loadAgentManifest();
    expect(Array.isArray(manifest.skills)).toBe(true);
    expect(manifest.skills).toHaveLength(1);
    const skill = manifest.skills[0];
    expect(typeof skill.name).toBe('string');
    expect(skill.name).not.toBe('');
    expect(typeof skill.description).toBe('string');
    expect(skill.description).not.toBe('');
    expect(typeof skill.contentPath).toBe('string');
    expect(skill.contentPath).not.toBe('');
  });

  it('references files that exist on disk (system prompt + skill dir with SKILL.md)', () => {
    const manifest = loadAgentManifest();
    const systemPrompt = join(agentDir, manifest.systemPromptFile);
    expect(existsSync(systemPrompt)).toBe(true);
    const skillDir = join(agentDir, manifest.skills[0].contentPath);
    expect(existsSync(skillDir)).toBe(true);
    expect(existsSync(join(skillDir, 'SKILL.md'))).toBe(true);
  });

  it('is safety-first: permissionMode default, NO hooks, allowedTools exactly Bash+Read', () => {
    const manifest = loadAgentManifest();
    expect(manifest.permissionMode).toBe('default');
    if (manifest.hooks !== undefined) {
      expect(manifest.hooks).toEqual([]);
    }
    expect(manifest.allowedTools).toEqual(['Bash', 'Read']);
  });

  it('does not fake builtin trust (no builtin- id prefix) and stays single-loop', () => {
    const manifest = loadAgentManifest();
    expect(manifest.id.startsWith('builtin-')).toBe(false);
    // The operator is deliberately a single-loop agent (design Non-Goal):
    // none of these optional arrays may be declared.
    for (const key of ['subAgents', 'commands', 'mcpServers', 'scriptPlugins']) {
      expect(manifest[key]).toBeUndefined();
    }
  });
});
