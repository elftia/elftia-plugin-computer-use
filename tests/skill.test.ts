import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Content contract: SKILL.md (capability computer-use-plugin-skill).
//
// The FROZEN_VOCABULARY below is the v0.5 CLI command block from the
// computer-use portfolio's planning-context.md, copied VERBATIM (byte-exact,
// including internal alignment whitespace). The sibling repo
// `elftia-computer-use` builds its CLI against the same frozen block, so any
// wording drift between the two children shows up HERE, at this repo's test
// boundary. Changing the vocabulary requires re-freezing the contract first.
const FROZEN_VOCABULARY: readonly string[] = [
  'computer-use apps                          # list top-level windows/apps → JSON array',
  'computer-use get-state [--app <pid>] [--out <dir>]',
  '                                           # writes state.json + screen.png into --out dir',
  '                                           # state.json: active window, cursor pos, screen dims,',
  '                                           #   screenshot path+dims, optional UIA tree summary',
  'computer-use screenshot [--window <id>] [--region <x1,y1,x2,y2>] [--out <dir>] [--max-edge <px>]',
  '                                           # writes screen.png; stdout JSON {path,width,height,window}',
  '                                           # --region is screen-absolute and excludes --window',
  'computer-use crop --in <png> --region <x1,y1,x2,y2> [--out <dir>]',
  '                                           # crop an EXISTING image (zoom for fine text); region in the',
  '                                           # SOURCE image\'s pixel frame; stdout JSON {path,width,height,source,region}',
  'computer-use click --x <n> --y <n> [--button left|right|middle] [--double|--triple] [--mods ctrl|shift|alt]',
  'computer-use click --state <state.json> --element <idx>   # element-index addressing from a prior get-state',
  'computer-use type --text <s>               # UTF-8 text input via clipboard-paste or SendInput',
  'computer-use key --combo <ctrl+s> [--hold-ms <ms>]  # key press / combination; --hold-ms = press-and-HOLD (key-down, dwell, key-up)',
  'computer-use scroll --x <n> --y <n> --direction up|down|left|right --amount <n>',
  'computer-use drag --from-x <n> --from-y <n> --to-x <n> --to-y <n>',
  'computer-use uia-tree [--app <pid>] [--max-depth <n>] [--out <file>]',
  '                                           # Windows UIA tree (System.Windows.Automation);',
  '                                           # big trees written to file, stdout = path + node count',
  'computer-use doctor                        # self-test: permissions, screenshot, input round-trip',
];

const EXPECTED_SUBCOMMANDS = [
  'apps',
  'click',
  'crop',
  'doctor',
  'drag',
  'get-state',
  'key',
  'screenshot',
  'scroll',
  'type',
  'uia-tree',
] as const;

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillPath = join(repoRoot, 'skills', 'computer-use', 'SKILL.md');
const skillText = readFileSync(skillPath, 'utf8').replace(/\r\n/g, '\n');
const skillLines = skillText.split('\n');

function section(headingPattern: RegExp): string {
  const start = skillLines.findIndex((line) => headingPattern.test(line));
  expect(start, `section heading ${headingPattern} exists`).toBeGreaterThanOrEqual(0);
  const rest = skillLines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

function fencedBlocks(text: string): string[][] {
  const lines = text.split('\n');
  const blocks: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (current === null) {
        current = [];
      } else {
        blocks.push(current);
        current = null;
      }
    } else if (current !== null) {
      current.push(line);
    }
  }
  return blocks;
}

describe('SKILL.md frontmatter', () => {
  it('starts with a CC-compatible frontmatter block: name + trigger-rich description', () => {
    expect(skillText.startsWith('---\n')).toBe(true);
    const end = skillText.indexOf('\n---\n', 4);
    expect(end).toBeGreaterThan(0);
    const frontmatter = skillText.slice(4, end);
    const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim();
    const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim();
    expect(name).toBe('computer-use-cli');
    expect(description).toBeTruthy();
    expect(description!.length).toBeGreaterThan(40);
  });
});

describe('SKILL.md CLI vocabulary (frozen v0.5 contract pin)', () => {
  it('contains every frozen contract line verbatim (line-level include check)', () => {
    const missing = FROZEN_VOCABULARY.filter((line) => !skillLines.includes(line));
    expect(missing, 'paraphrased or omitted contract lines').toEqual([]);
  });

  it('carries the vocabulary as an exact fenced block with exactly the eleven commands', () => {
    const blocks = fencedBlocks(skillText);
    const contractBlock = blocks.find((block) =>
      block.some((line) => line.startsWith('computer-use apps ')),
    );
    expect(contractBlock, 'a fenced block carrying the contract vocabulary').toBeDefined();
    // The contract block must be EXACTLY the frozen lines, in order —
    // no paraphrase, no omission, no invented command inside the core
    // vocabulary section.
    expect(contractBlock!).toEqual([...FROZEN_VOCABULARY]);
    const subcommands = [
      ...new Set(
        contractBlock!
          .filter((line) => line.startsWith('computer-use '))
          .map((line) => line.split(/\s+/)[1]),
      ),
    ].sort();
    expect(subcommands).toEqual([...EXPECTED_SUBCOMMANDS]);
  });
});

describe('SKILL.md required sections', () => {
  it('teaches the perception-action loop with per-step verification and element addressing', () => {
    const loop = section(/## Core discipline: the perception-action loop/);
    expect(loop).toContain('--shot');
    expect(loop).toContain('--element');
    expect(loop.toLowerCase()).toContain('verify');
    expect(loop.toLowerCase()).toContain('one action');
  });

  it('documents coordinates, actual-PNG-dims rescale, element rescale, and ESTALE recovery', () => {
    const coords = section(/## Coordinates and scaling/);
    expect(coords).toContain('screen-global pixels');
    expect(coords).toContain('actual PNG dimensions');
    expect(coords).toMatch(/rescal/);
    expect(coords).toContain('ESTALE');
    expect(coords.toLowerCase()).toContain('get-state');
  });

  it('documents both perception branches agent-agnostically', () => {
    const perception = section(/## Perception: reading the screen/);
    expect(perception.toLowerCase()).toContain('multimodal');
    expect(perception).toContain('view_image');
    expect(perception.toLowerCase()).toContain('text-only');
  });

  it('confines host-specific names (view_image, Elftia) to the perception-branches section', () => {
    const perception = section(/## Perception: reading the screen/);
    for (const term of ['view_image', 'Elftia']) {
      const total = skillText.split(term).length - 1;
      const inside = perception.split(term).length - 1;
      expect(total, `${term} appears at least once`).toBeGreaterThan(0);
      expect(inside, `${term} must appear ONLY in the perception section`).toBe(total);
    }
  });

  it('has a mandatory safety section covering all five rules', () => {
    const safety = section(/## Safety discipline/);
    expect(safety.toLowerCase()).toContain('destructive');
    expect(safety).toContain('UAC');
    expect(safety.toLowerCase()).toContain('credential');
    expect(safety.toLowerCase()).toContain('kill switch');
    expect(safety.toLowerCase()).toContain('clipboard');
  });

  it('documents automatic foreground visibility and hold input', () => {
    const visibility = section(/## Foreground-operation visibility/);
    expect(visibility).toContain('arrow+hourglass');
    expect(visibility).toContain('tray toast');
    expect(visibility).toContain('ELFTIA_CU_FOREGROUND_NOTICE=0');
    expect(visibility).toContain('--hold-ms');
    expect(visibility).toContain('delivery_mode');
  });

  it('teaches a doctor-first prerequisite ritual', () => {
    const prereq = section(/## Prerequisites/);
    expect(prereq).toContain('computer-use doctor');
    expect(prereq).toContain('scripts/');
    expect(prereq.toLowerCase()).toContain('no global install');
  });
});

describe('SKILL.md Cua Driver route (preferred execution backend)', () => {
  it('health-checks cua in the prerequisites and ranks it first', () => {
    const prereq = section(/## Prerequisites/);
    expect(prereq).toContain('computer-use cua --action health');
    expect(prereq.toLowerCase()).toContain('preferred execution backend');
    const cua = section(/## Preferred Cua Driver route/);
    expect(cua).toContain('route every GUI');
    expect(cua).toContain('element_token');
    expect(cua).toContain('background_unavailable');
    expect(cua).toContain('delivery_mode');
  });

  it('teaches the full routing priority 0-7 with Mado as perception only', () => {
    const cua = section(/## Preferred Cua Driver route/);
    for (const marker of [
      '0. API / CLI / file / other headless path',
      '2. Cua semantic path',
      '4. MadoPilot perception',
      '5. Cua pixel path',
      '7. Fallback',
    ]) {
      expect(cua).toContain(marker);
    }
    expect(cua).toMatch(/reading evidence, never execution|perception/i);
    const mado = section(/## MadoPilot perception route/);
    expect(mado.toLowerCase()).toContain('perception');
    expect(mado).not.toMatch(/preferred (execution|input)/i);
  });

  it('teaches cua-serve for multi-step work plus the token staleness rule', () => {
    const cua = section(/## Preferred Cua Driver route/);
    expect(cua).toContain('cua-serve');
    expect(cua).toContain('/call');
    expect(cua).toContain('/shutdown');
    expect(cua).toContain('element_token is stale');
    expect(cua.toLowerCase()).toContain('foreground');
  });

  it('carries a one-shot cua command block', () => {
    const cua = section(/## Preferred Cua Driver route/);
    const blocks = fencedBlocks(cua);
    const oneShot = blocks.find((block) =>
      block.some((line) => line.startsWith('computer-use cua --action health')),
    );
    expect(oneShot, 'a fenced block with the one-shot cua forms').toBeDefined();
    expect(oneShot!.join('\n')).toContain('list-tools');
    expect(oneShot!.join('\n')).toContain('get_window_state');
    expect(oneShot!.join('\n')).toContain('element_token');
  });

  it('documents the three coordinate systems and the verified app-class routing', () => {
    const coords = section(/## Coordinates and scaling/);
    expect(coords).toContain('THREE coordinate systems');
    expect(coords).toContain('Core screen-global pixels');
    expect(coords).toContain('MadoPilot capture pixels');
    expect(coords).toContain('Cua window-local pixels');
    const cua = section(/## Preferred Cua Driver route/);
    expect(cua).toContain('Application-class routing');
    expect(cua).toContain('browser_route_unavailable');
    expect(cua).toContain('browser_consent_required');
    expect(cua).toMatch(/degraded.*signal|EMPTY/i);
  });
});
