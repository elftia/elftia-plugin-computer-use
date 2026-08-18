# elftia-plugin-computer-use

An [Elftia](https://elftia.com) `kind: agent` plugin that teaches agents to
operate a real desktop through the **`computer-use` CLI** — plus a
ready-made **Desktop Operator** agent package that uses it.

The plugin is pure data: one agent package (`Desktop Operator`), one
agent-agnostic skill (`computer-use`). No executable code, no renderer/main
halves, zero changes to the Elftia host.

## Prerequisite: the computer-use CLI

This plugin drives the separate `computer-use` CLI
(repo `elftia-computer-use`, npm `bin`). Install that first and make sure it
is on `PATH`. Verify with:

```bash
computer-use doctor
```

The skill and the agent both refuse to operate the desktop when `doctor`
fails. Platform support matches the CLI: **Windows first**; on macOS/Linux
the CLI exits non-zero with a clear "not yet supported on \<os\>" error.

## What's inside

```
elftia-plugin.json                     # kind:agent manifest, one bindable skill contribution
skills/
  computer-use/SKILL.md                # the agent-agnostic skill (frozen v0.5 CLI vocabulary)
```

## Install into Elftia

Copy this repository (or just the plugin folder) into the Elftia plugins
root so it sits at `~/.elftia/plugins/elftia-plugin-computer-use/` with
`elftia-plugin.json` at the top of that folder, then restart Elftia. The
plugin appears in the plugin manager and the **computer-use** skill becomes
available in the skill library, ready to attach to any agent.

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
copy the skill directory into that agent's skills location:

```
<skills-dir>/computer-use/SKILL.md
```

The skill's core loop needs only a shell tool (to run the CLI) and a way to
look at the screenshot file (direct image input, or a vision tool for
text-only agents).

## Safety story

Real-machine control is opt-in at every layer:

1. **Opt-in install** — nothing is present until you install the plugin.
2. **Permission-gated actions** — `permissionMode: "default"`, no
   auto-allow hooks; every CLI invocation is approvable command by command.
3. **Minimal tool surface** — `allowedTools` is exactly `Bash` + `Read`;
   no file-writing tools.
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
npm test        # vitest: structural contracts + verbatim vocabulary pin
npm run lint    # self-contained flat eslint (elftia basics)
npm run verify  # lint + test + layout walk (no strays outside the declared layout)
```

The repo is English-only in all agent-facing content (SKILL.md, system
prompt, manifest strings) — enforced by test. Git: work happens on `dev`;
merging to `main` is the owner's call.

## License

MIT
