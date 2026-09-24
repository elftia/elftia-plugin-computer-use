---
name: computer-use
description: Operate a desktop computer's GUI through the computer-use CLI when a task needs real screen interaction — clicking buttons and menus, filling forms and dialogs, reading what an app shows, scrolling content, or automating software that has no API. Use when the user asks to control, drive, or operate the desktop, interact with a GUI application, or automate clicking and typing. Always prefer an API, CLI, or other headless path first; fall back to screen-level automation only when nothing programmatic exists.
---

# Computer Use — desktop operation via the `computer-use` CLI

This skill drives a real desktop: take a screenshot, decide, perform ONE
action, verify with a fresh screenshot, repeat. It is agent-agnostic — any
agent with a shell tool and a way to read images can run this loop.

## When to use / when not to use

Use this skill when the task lives at the GUI level:

- clicking buttons, menus, or dialogs in desktop applications
- filling and submitting forms in native apps
- reading on-screen state that has no programmatic export
- automating a workflow in software without an API or CLI
- the user explicitly asks you to "operate the desktop" or similar

Do NOT use this skill when a narrower path exists. The gradient, best first:

1. a documented API or SDK
2. a command-line interface
3. a file on disk you can read directly
4. an automation hook the app exposes
5. screen-level computer use (this skill) — last resort, and say so

Pixels are the slowest, most fragile, and most dangerous interface. Every
step down that gradient that you can take, you should.

## Prerequisites

- The `computer-use` CLI is vendored inside this skill's `scripts/` directory.
  Use the invocation below; no global install or PATH entry is required.
- Platform: Windows. On macOS/Linux the commands exit non-zero with a clear
  "not yet supported on <os>" JSON error — report that, do not improvise.

**Doctor first.** Before the first action in a session, run:

```
computer-use doctor
```

If any check fails (permissions, screenshot, input round-trip), report the
failure output to the user and stop. A broken tool must not drive a real
machine.

## Core discipline: the perception-action loop

You cannot see the screen unless you look. The loop is mandatory:

1. **Perceive** — run `computer-use get-state` (writes `state.json` +
   `screen.png`) or `computer-use screenshot`. Read the result before
   doing anything.
2. **Decide** — state in one line what you see and the single next action.
3. **Act** — exactly ONE action: one click, one `type`, one `key` combo,
   one `scroll`, or one `drag`. Never more than one.
4. **Verify** — take a fresh screenshot (pass `--shot` to the action
   command, or run `computer-use screenshot`) and confirm the screen
   changed the way you intended. Only then loop back to step 1.

Never act blind. Never stack actions without looking between them. If the
result surprises you, stop and re-perceive — do not "retry harder".

**Prefer element addressing over raw pixels**: when a `state.json` from a
prior `get-state` is available, click via `--state <state.json>
--element <idx>` instead of `--x/--y` coordinates — the CLI rescales the
element's coordinates against the live window bounds for you.

## Command vocabulary (v0.5 contract — verbatim)

Every command prints JSON on stdout (UTF-8 enforced on Windows). Exit 0 =
success, non-zero = failure. Screenshots and large UIA trees are ALWAYS
written to files under `--out` (default: `<cwd>\.computer-use\<timestamp>\`);
stdout JSON carries paths and metadata only — never base64, never giant
blobs. Action commands optionally return a fresh screenshot reference
(`"after": {path,...}`) when `--shot` is passed.

**How to invoke the CLI:** the CLI ships INSIDE this skill
(`scripts/`), so installing the skill installs everything — no global
install. Throughout this document `computer-use` means:

```
node "<skill-directory>/scripts/cli.js"
```

Use the skill directory from the `[Skill directory]` note (absolute
path). If a `computer-use` binary is also on PATH it is interchangeable.
Verify with `node "<skill-directory>/scripts/cli.js" doctor`.

```
computer-use apps                          # list top-level windows/apps → JSON array
computer-use get-state [--app <pid>] [--out <dir>]
                                           # writes state.json + screen.png into --out dir
                                           # state.json: active window, cursor pos, screen dims,
                                           #   screenshot path+dims, optional UIA tree summary
computer-use screenshot [--window <id>] [--region <x1,y1,x2,y2>] [--out <dir>] [--max-edge <px>]
                                           # writes screen.png; stdout JSON {path,width,height,window}
                                           # --region is screen-absolute and excludes --window
computer-use crop --in <png> --region <x1,y1,x2,y2> [--out <dir>]
                                           # crop an EXISTING image (zoom for fine text); region in the
                                           # SOURCE image's pixel frame; stdout JSON {path,width,height,source,region}
computer-use click --x <n> --y <n> [--button left|right|middle] [--double|--triple] [--mods ctrl|shift|alt]
computer-use click --state <state.json> --element <idx>   # element-index addressing from a prior get-state
computer-use type --text <s>               # UTF-8 text input via clipboard-paste or SendInput
computer-use key --combo <ctrl+s>          # key press / combination
computer-use scroll --x <n> --y <n> --direction up|down|left|right --amount <n>
computer-use drag --from-x <n> --from-y <n> --to-x <n> --to-y <n>
computer-use uia-tree [--app <pid>] [--max-depth <n>] [--out <file>]
                                           # Windows UIA tree (System.Windows.Automation);
                                           # big trees written to file, stdout = path + node count
computer-use doctor                        # self-test: permissions, screenshot, input round-trip
```

Reading the JSON contract:

- Judge success by the exit code first; on failure the JSON body describes
  the error (including the "not yet supported on <os>" platform stub).
- Payloads are paths-plus-metadata: take `screen.png`'s path from the JSON
  and read the file — never expect image bytes on stdout.
- `state.json` from `get-state` carries the active window, cursor position,
  screen dimensions, screenshot path+dims, and an optional UIA tree summary.
- Do not invent commands or flags beyond the block above; if something you
  need is missing, tell the user what is missing instead of improvising.

## Coordinates and scaling

- All coordinates are **screen-global pixels** (origin top-left), not
  window-relative.
- The `width`/`height` in screenshot JSON are the **actual PNG dimensions**.
  If your visual input was scaled (common with `--max-edge` or a model-side
  resize), rescale your coordinates before acting:
  `actual_x = model_x * png_width / model_image_width` (same for y).
- `--element <idx>` addressing is rescaled by the CLI against the live
  window bounds — that is exactly why it is preferred over raw pixels.
- An `ESTALE` error means the state file no longer matches the live window
  (window moved/resized/closed since `get-state`). Recovery is to re-run
  `get-state` and address a fresh element — NOT to retry the same click.

## Perception: reading the screen (agent-agnostic)

Both branches use the same action vocabulary above; only how you LOOK
differs.

- **Multimodal agents**: Read the screenshot file path directly as an
  image input (the path from `get-state`/`screenshot` JSON). This is the
  best branch — you see the actual pixels.
- **Text-only agents**: pass the screenshot path to a vision description
  tool and work from its output (in Elftia TinyElf that tool is
  `view_image`). Slower and coarser — compensate with more frequent
  verification and heavier use of `state.json`/`uia-tree` text, which you
  can read natively.

**Preferred text-only path in Elftia TinyElf: the `vision` subagent.** When
your session model cannot see images, Elftia offers a builtin `vision`
subagent running on the host's vision auxiliary model. Spawn it:

```
Agent(agent="vision", task="Look at <screenshot path>. Question: <precise WHAT question>")
```

It Reads the image natively at full resolution and can zoom ITSELF (its
`crop_image` tool) when fine text needs a closer look — give it the
precise question and let it decide whether to zoom. It is perception-only
(never acts on the desktop) and answers with verbatim text and
relative-position descriptions. It only exists in text-only sessions with
a vision model configured — if it is not in your agent list, fall back to
a vision description tool.

When using a vision description tool, respect a strict division of labor —
**ask it WHAT, never WHERE**:

- Vision answers identity, verbatim text, and state: "which entry in the
  list is titled ...", "what does the dialog say", "is a pasted image
  preview visible above the input box". Vision models hallucinate pixel
  coordinates almost universally — never ask for or trust coordinates
  from them.
- Coordinates come from STRUCTURAL sources only: `uia-tree` elements
  (real BoundingRectangle bounds), `state.json` elements, or `apps`
  window bounds. Standard pattern: vision names the element (by its
  title) → find that element in `uia-tree`/`state.json` → click the
  center of its real bounds (`click --state <file> --element <idx>`).

Two more patterns that materially raise accuracy:

1. **Follow-up on the SAME image.** Each description call is independent,
   but the screenshot file stays on disk. When an answer is vague or
   suspect, call the tool again on the SAME path with a sharper question,
   quoting the part of the previous answer you are drilling into ("the
   third entry you listed — give its exact pixel coordinates"). Treat a
   contradiction between two answers as a signal to stop and verify with
   `uia-tree` text instead of guessing.
2. **Zoom before asking.** Fine text (chat lists, menus, small labels) is
   unreliable at full-screen resolution. Capture a tighter frame first —
   `screenshot --window <id>` for the window, or crop the region of
   interest — then ask about that image. A cropped question beats a
   full-screen guess.

If the description tool says it cannot read something, believe it — do not
act on a guess.

If you have neither branch available, say so — do not guess the screen from
`state.json` coordinates alone.

## Safety discipline (mandatory)

You are driving the user's real machine. These rules override task
pressure:

- **Confirm before destructive actions.** Delete, send, submit, purchase,
  post, or closing an app with unsaved work: describe the exact action and
  get the user's explicit confirmation first. Every time, not once per
  session.
- **NEVER auto-accept OS security or system dialogs.** UAC/elevation
  prompts, certificate warnings, firewall or "are you sure" system
  pop-ups: stop and escalate to the user. A human must decide these.
- **Credentials**: never enter passwords, keys, or payment details you were
  not explicitly given. A login or payment screen you were not briefed for
  means stop and ask.
- **Kill switch**: the user stops the loop by saying "stop" or by
  interrupting the session (Ctrl+C / the agent's stop control). When
  stopped, halt immediately mid-loop — no cleanup actions.
- **Clipboard side effect**: `type` inputs text via clipboard-paste when
  available, which OVERWRITES the user's clipboard contents. Mention this
  when it matters (e.g. the user just copied something they need).

## Recipes

### Open an app and click a specific button

```
computer-use doctor
computer-use get-state                 # → perceive: read state.json + screen.png
computer-use key --combo <win>         # e.g. open Start menu — ONE action
computer-use screenshot                # → verify the menu opened
computer-use click --state <state.json> --element <idx> --shot
                                       # perceive result in "after" screenshot
```

### Type into a field and submit

```
computer-use get-state                 # locate the field element index
computer-use click --state <state.json> --element <idx> --shot   # focus the field
computer-use type --text <hello world>
computer-use screenshot                # verify the text landed in the field
computer-use key --combo <enter>
computer-use screenshot                # verify submission happened
```

### Scroll until you find something

```
computer-use get-state                 # perceive
computer-use scroll --x 960 --y 540 --direction down --amount 3 --shot
computer-use screenshot                # verify new content visible
# repeat perceive→scroll→verify until found or page end
```

(Adapt coordinates to the actual screen dimensions from `state.json` —
the values above assume a 1920x1080 screen.)
