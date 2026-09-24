# elftia-plugin-computer-use

An [Elftia](https://elftia.com) `kind: agent` plugin that teaches agents to
operate a real desktop through the **`computer-use` CLI**.

The plugin contributes one agent-agnostic skill (`computer-use`) and no agent
persona. The CLI runtime is vendored inside that skill; there are no
renderer/main halves and no changes to the Elftia host.

## Included computer-use CLI

The CLI ships inside `skills/computer-use/scripts/`. No global CLI install or
sibling `elftia-computer-use` checkout is required. Verify the shipped runtime
with:

```bash
node "<installed-skill-directory>/scripts/cli.js" doctor
```

The skill requires a successful `doctor` check before operating the desktop.
Platform support matches the CLI: **Windows first**; on macOS/Linux the CLI
exits non-zero with a clear "not yet supported on \<os\>" error.

The vendored CLI also exposes an optional `mado` command for MadoPilot window
capture, template matching, OCR and frame-bound clicking. When a native bundle
is present in `skills/computer-use/scripts/native/`, it is discovered without
environment variables. Run
`node "<installed-skill-directory>/scripts/cli.js" mado --action health`.
The source checkout excludes binary assets from Git. Stage a bundle before
`npm run build` using `npm run install:mado-native -- <sidecar.exe>
<opencv_world4140.dll> <onnxruntime.dll> <model-root>`; the model root must
contain `rapidocr-v3.9.2/`. The build includes that local bundle in `dist/`.
Absolute `ELFTIA_MADO_PILOT_SIDECAR`, `ELFTIA_MADO_PILOT_MODEL_ROOT` and
`ELFTIA_MADO_PILOT_RUNTIME_PATH` can override it. The sidecar source and build
instructions live in the `elftia-computer-use` repository.

## What's inside

```
elftia-plugin.json                     # kind:agent manifest, one bindable skill contribution
skills/
  computer-use/
    SKILL.md                            # the agent-agnostic skill (frozen v0.5 CLI vocabulary)
    package.json                        # vendored CLI version marker
    scripts/                            # self-contained computer-use CLI runtime
```

## Install into Elftia

Build the install tree, then select **`dist/computer-use/`** in Elftia's
"install from folder" development flow:

```bash
npm run build
```

For distribution, use `npm run release` and give users the matching pair from
`release/0.8.2/`: `computer-use.epkg` (an Elftia plugin package using a ZIP
container) plus its external
`computer-use.json` integrity sidecar. Do not install the repository root;
source, tests and development dependencies are deliberately outside the
install tree.

After installation, the plugin appears in the plugin manager and the
**computer-use** skill becomes available in the skill library, ready to attach
to any agent.

Not installed = the capability does not exist. That is deliberate.

## Attaching the skill to an agent

The plugin ships NO agent of its own (the Desktop Operator persona was
removed by design): computer-use is a skill for ANY agent. After install,
attach it from the agent's skill section (agent detail -> attached skills)
or wherever your Elftia version manages skill bindings. Installing the
plugin never makes the skill visible by itself — visibility comes only
from the binding you create (host design SS25.9).

Once attached, the agent runs a strict loop — screenshot, decide, ONE
action, verify — over the normal shell permission gate:

- every `computer-use ...` invocation crosses the normal shell permission
  gate (there are deliberately NO auto-allow hooks);
- it confirms with you before destructive actions (delete, send, purchase,
  close-without-save);
- it never auto-accepts OS security/system dialogs (UAC, certificate
  warnings) — it stops and asks you;
- it never enters credentials you did not explicitly hand it.

A multimodal model is recommended (the agent reads screenshots directly);
text-only models work through a vision-description tool such as Elftia's
`view_image`, at the cost of an extra call per step.

## Reusing the skill from other agents

`skills/computer-use/SKILL.md` is agent-agnostic (CC-compatible
frontmatter). To use it from Claude Code or any skills-compatible agent,
copy the whole skill directory (including its vendored `scripts/`) into that
agent's skills location:

```
<skills-dir>/computer-use/
  SKILL.md
  package.json
  scripts/
```

The skill's core loop needs only a shell tool (to run the CLI) and a way to
look at the screenshot file (direct image input, or a vision tool for
text-only agents).

## Safety story

Real-machine control is opt-in at every layer:

1. **Opt-in install** — nothing is present until you install the plugin.
2. **Permission-gated actions** — `permissionMode: "default"`, no
   auto-allow hooks; every CLI invocation is approvable command by command.
3. **Minimal runtime surface** — one skill plus its vendored CLI; no agent
   package and no main or renderer contribution.
4. **Mandatory safety discipline** — the skill's safety section is
   test-pinned content: destructive-action confirmation, never
   auto-accepting system dialogs, credential handling, kill-switch
   instructions, and the clipboard side effect of `type`.
5. **Verbatim contract pin** — the test suite pins the CLI command
   vocabulary line-by-line to the frozen v0.5 contract, so this skill
   cannot silently drift from the CLI it drives.

## Development

```bash
npm install
npm run build   # atomically publish the whitelist-only dist/computer-use tree
npm test        # vitest: structural contracts + verbatim vocabulary pin
npm run lint    # self-contained flat eslint (elftia basics)
npm run verify  # lint + test + source layout + build + shipped-byte parity
npm run release # release/0.8.2/computer-use.epkg + external computer-use.json
```

Producer tooling comes from the published `@elftia/plugin-kit` package on the
public npm registry. It does not resolve tooling from a sibling Elftia
checkout or a parent `node_modules` directory.

The repo is English-only in all agent-facing content (SKILL.md, system
prompt, manifest strings) — enforced by test. Git: work happens on `dev`;
merging to `main` is the owner's call.

## License

MIT
