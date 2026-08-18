import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// English-only agent-facing docs (capability computer-use-plugin-toolchain):
// no CJK codepoints in SKILL.md, the agent system prompt, or the manifests
// (every string field in these two JSON manifests is agent-facing data), and
// no elftia i18n call patterns anywhere in the agent-facing markdown.
//
// The CJK detection pattern is built from numeric code-point ranges (not
// literal characters and not textual escape sequences) so that this repo
// itself contains zero CJK codepoints and zero escape-sequence ambiguity.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const CJK_CODE_POINT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x3000, 0x303f], // CJK symbols and punctuation
  [0x3040, 0x30ff], // hiragana + katakana
  [0x3400, 0x4dbf], // CJK unified ideographs extension A
  [0x4e00, 0x9fff], // CJK unified ideographs
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0xff00, 0xffef], // fullwidth / halfwidth forms
];

// The arrow in the frozen contract block (U+2192) is intentionally NOT in
// any range above.
function containsCJK(text: string): string[] {
  return [...text].filter((ch) => {
    const cp = ch.codePointAt(0)!;
    return CJK_CODE_POINT_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
  });
}

const AGENT_FACING_FILES = [
  'elftia-plugin.json',
  'agent/manifest.json',
  'agent/system-prompt.md',
  'agent/skills/computer-use/SKILL.md',
] as const;

describe('english-only agent-facing content', () => {
  for (const relPath of AGENT_FACING_FILES) {
    it(`${relPath} contains no CJK codepoints`, () => {
      const text = readFileSync(join(repoRoot, relPath), 'utf8');
      expect(containsCJK(text), `CJK codepoints found in ${relPath}`).toEqual([]);
    });
  }

  it('uses no elftia i18n key patterns in agent-facing markdown', () => {
    for (const relPath of ['agent/system-prompt.md', 'agent/skills/computer-use/SKILL.md']) {
      const text = readFileSync(join(repoRoot, relPath), 'utf8');
      expect(text).not.toMatch(/\bt\(\s*['"][\w.-]+\.[\w.-]+['"]/);
      expect(text).not.toMatch(/\$t\(/);
    }
  });
});
