---
name: computer-use-cli
description: Operate a desktop computer's GUI through the computer-use CLI when a task needs real screen interaction — clicking buttons and menus, filling forms and dialogs, reading what an app shows, scrolling content, or automating software that has no API. Use when the user asks to control, drive, or operate the desktop, interact with a GUI application, or automate clicking and typing. Prefer MadoPilot native capture, OCR and frame-bound clicks when its health check succeeds and a unique target window is available. Always prefer an API, CLI, or other headless path first; fall back to screen-level automation only when nothing programmatic exists.
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

Then run `computer-use mado --action health` once. If it returns `ok: true`,
prefer the MadoPilot route below for a uniquely identified application window.
Use its OCR only when `ocr_ready: true`. If MadoPilot is unavailable or no
unique target can be selected, continue with the core commands; do not treat
MadoPilot as a prerequisite for desktop operation.

## Core discipline: the perception-action loop

You cannot see the screen unless you look. The loop is mandatory:

1. **Perceive** — for an available MadoPilot target, run `mado capture` and
   read its PNG; use `mado read-text` for on-screen text. Otherwise run
   `computer-use get-state` (writes `state.json` + `screen.png`) or
   `computer-use screenshot`. Read the result before doing anything.
2. **Decide** — state in one line what you see and the single next action.
3. **Act** — exactly ONE action: one click, one `type`, one `key` combo,
   one `scroll`, or one `drag`. Never more than one.
4. **Verify** — inspect MadoPilot's newer `after` frame when available, or
   run a fresh `mado capture`. For a core action, pass `--shot` or run
   `computer-use screenshot`. Confirm the intended change before looping.

Never act blind. Never stack actions without looking between them. If the
result surprises you, stop and re-perceive — do not "retry harder".

**For core clicks, prefer element addressing over raw pixels**: when a
`state.json` from a prior `get-state` is available, click via `--state <state.json>
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
- Do not invent commands or flags beyond this block and the MadoPilot block
  below. Choose the MadoPilot route first when it can perform the operation.

## Preferred MadoPilot native route

The vendored CLI supports `mado` when a native bundle is installed beside its
scripts. The bundle includes the MadoPilot sidecar, OpenCV, ONNX Runtime and
RapidOCR models; the CLI finds these automatically. Explicit absolute paths in
`ELFTIA_MADO_PILOT_SIDECAR`, `ELFTIA_MADO_PILOT_MODEL_ROOT` and
`ELFTIA_MADO_PILOT_RUNTIME_PATH` can override the bundle. After `doctor`, run
`computer-use mado --action health`, then `list-targets` and select exactly
one target. Prefer `capture` over core screenshots for that window, `read-text`
over a vision guess for text, and `find-template` or `wait-template` when a
real template PNG is available. Use MadoPilot's frame-bound `click` for a
single primary-button click on that target.

```
computer-use mado --action list-targets
computer-use mado --action capture --target <id> [--out <dir>]
computer-use mado --action find-template --target <id> --template <png> [--min-score <0..1>]
computer-use mado --action wait-template --target <id> --template <png> [--min-score <0..1>] [--timeout-ms <ms>]
computer-use mado --action read-text --target <id>
computer-use mado --action click --target <id> --x <capture-pixel> --y <capture-pixel> --route system|window-message|process-directed --expected-hash <capture image_hash>
```

Take `<id>` from `list-targets` → `targets[].id`. The CLI starts a new process
for each command, so the sidecar rediscovers the window and requires one exact
match on title and verified process identity. A recreated window in the same
process with the same title may still match: capture again and provide that
capture's `image_hash` when clicking. Changed pixels make the click fail.
MadoPilot coordinates are relative to the captured image, whereas core `click`
coordinates are screen-global. One MadoPilot click sends one primary-button
sequence tied to a fresh frame and returns a newer capture when available. If
`after_available` is false, capture again to inspect the application effect.
Use the newest `capture.image_hash` for a click. Never reuse coordinates from
a resized image without mapping them back to capture pixels. If the hash is
stale, capture again and replan; do not blindly resend the input.
The `window-message` route can submit to a window without activating its child
controls; prefer the route that works for the target application. If input
fails, stop and inspect the screen;
partial native submission must not be retried automatically. Preserve the core
perception-action and safety rules above.

Use the core CLI for tasks MadoPilot cannot perform: typing, keyboard shortcuts,
scrolling, dragging, multi-button clicks, UIA element addressing, or full-desktop
capture. Also use it when health fails, window discovery is ambiguous, or the
target application does not support MadoPilot input. An uncertain or partially
submitted MadoPilot click must be verified before any fallback input.

## Bounded observation and cropping

- Prefer a screenshot of the target window over a full desktop image. Keep the
  original desktop screenshot separately when the user's task is to send that file.
- Usually make at most two crops of one observation. The CLI enforces a hard
  limit of three attempts per source-image content in the current workspace,
  shared across CLI processes and independent of filenames or `--out`.
- After the third attempt, switch to a target-window screenshot, `uia-tree`,
  or a genuinely changed observation. Do not keep shifting nearly identical
  rectangles, copy/rename the image to reset the counter, or crop a crop to
  continue the same unsuccessful inspection. If none provides new evidence,
  report the blocker instead of guessing coordinates.
- Always read the crop path returned in JSON. Crops have unique filenames;
  never assume a fixed `crop.png` or overwrite an earlier observation.

## Coordinates and scaling

- Core CLI click coordinates are **screen-global pixels** (origin top-left).
  MadoPilot click coordinates are pixels in its captured target image.
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

Both branches use the same perception-action discipline; how you LOOK depends
on the model and on whether MadoPilot can inspect the target window.

- **Multimodal agents**: Read the screenshot file path directly as an
  image input (the path from `mado capture` or core screenshot JSON). This is the
  best branch — you see the actual pixels.
- **Text-only agents**: pass the screenshot path to a vision description
  tool and work from its output (in Elftia TinyElf that tool is
  `view_image`). Slower and coarser — compensate with more frequent
  verification and heavier use of MadoPilot `read-text` when OCR is ready,
  or `state.json`/`uia-tree` text on the core path.

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
- Coordinates come from grounded sources only: MadoPilot OCR/template boxes
  tied to a captured frame, `uia-tree` elements (real BoundingRectangle
  bounds), `state.json` elements, or `apps` window bounds. On the core path,
  vision names the element → find it in `uia-tree`/`state.json` → click its
  real bounds (`click --state <file> --element <idx>`).

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

### Inspect a window with MadoPilot first

```text
computer-use doctor
computer-use mado --action health
computer-use mado --action list-targets      # choose one exact target id
computer-use mado --action capture --target <id>  # read PNG and image_hash
computer-use mado --action read-text --target <id> # if OCR is ready
computer-use mado --action capture --target <id>  # fresh hash before a click
computer-use mado --action click --target <id> --x <capture-pixel> --y <capture-pixel> --route system|window-message|process-directed --expected-hash <fresh image_hash>
computer-use mado --action capture --target <id>  # verify the effect
```

Choose coordinates only from the target's captured pixels or grounded
OCR/template geometry. Do not click if the selected window or frame changed.
The following recipes use core commands for operations MadoPilot lacks.

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
