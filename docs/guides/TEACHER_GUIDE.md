# Teacher Guide - NES Game Technical Reference

## Overview

This project builds a NES ROM using the **cc65 toolchain** (a C compiler and assembler targeting the 6502 CPU). The game is written primarily in C with a small amount of 65xx assembly for graphics data loading. The cc65 library (`nes.lib`) provides the startup code (crt0), C runtime, and hardware abstraction.

> **Pupil feedback log:** log and triage pupil-testing feedback in [PUPIL_FEEDBACK.md](PUPIL_FEEDBACK.md). Append new items as they come in; don't wait for a formal review.
>
> **In-editor feedback form:** pupils can submit feedback from inside each editor page via the `?` help dialog (💬 Feedback tab on Backgrounds / Sprites, or the expandable section on Behaviour / Code). Submissions land in `feedback.jsonl` in the repo root. Open `http://<server>:8765/feedback` for a read-back page with ✓ handled toggles — the handled-set persists in `feedback-handled.json`. Both files are `.gitignore`d.

## Two VS Code workspaces

There are two workspace files in the project root. Pick the one that matches what you are doing:

- **`nesgame_teacher.code-workspace`** - Full read/write access to every file. Use this when you are preparing lessons, editing `Makefile`, regenerating graphics, or modifying anything outside `main.c`.
- **`nesgame_pupil.code-workspace`** - Everything is read-only except `**/src/main.c` and markdown guides. Makefile, graphics.s, linker config, assets, and `tools/` are hidden or locked. The pupil cannot accidentally break the build by editing infrastructure files.

Both workspaces share the same `.vscode/tasks.json`, so **`Ctrl+Shift+B`** builds and runs the step containing the currently-open file. The task auto-detects which step folder the file lives in using `${fileWorkspaceFolder}`.

### How the read-only restriction works

The pupil workspace uses VS Code's `files.readonlyInclude` and `files.readonlyExclude` settings:

```json
"files.readonlyInclude": { "**/*": true },
"files.readonlyExclude": {
    "**/src/main.c": true,
    "**/*.md": true
}
```

Everything is locked by default, then `main.c` and markdown files are explicitly unlocked. If you add new pupil-editable files later (e.g. a `level_data.h`), add them to `readonlyExclude`.

Additionally `files.exclude` hides the files we don't want the pupil to see at all (Makefiles, cfg/, tools/, reset.s, etc.). They still exist on disk - they just don't appear in the file tree.

### Comment conventions for pupil guidance

Four comment prefixes are colour-highlighted by the `better-comments` extension and listed in the **TODO Tree** sidebar:

- `// TRY:` - suggestion to experiment with a value (green)
- `// EDIT:` - a value the pupil is intended to change (yellow)
- `// NOTE:` - explanation of what's happening (cyan)
- `// WARNING:` - caution / do not change (red)

Use these whenever you add something to `main.c` that you want the pupil to notice.

### Swapping in real assets

If the pupil creates new sprites in Aseprite, you (teacher) can convert and place them by opening the teacher workspace, running the `Regenerate All Graphics (Teacher)` task, or using `tools/png2chr.py` as documented in `ASEPRITE_WORKFLOW.md`. The pupil workspace has `tools/` hidden.

---

## Pupil-facing tile/sprite editor

The project ships a self-contained web-based tile editor in `tools/tile_editor_web/`:

- **`index.html`** — the Backgrounds page (tileset, palettes, nametable, multi-background management).
- **`sprites.html`** — the Sprites page (composite sprite builder, Play-in-NES dialog).
- **`behaviour.html`** — the Behaviour page (per-tile behaviour map: ground / wall / platform / ladder / door / trigger).
- **`builder.html`** — the Builder page (tick modules to build a game without writing C).
- **`code.html`** — the Code page (free-form C or asm main).
- **Shared modules**:
  - **`play-pipeline.js`** — one "assemble + build + launch" helper every page calls.  Handles state fortification (stub player when the project has none), `customMainC` / `customMainAsm` overrides for the Code page, the native-vs-browser mode selector, and the Download-ROM flow.
  - **`emulator.js`** — the embedded jsnes dialog + keyboard mapping.  Injects its own `<dialog>` + CSS on first call, idempotent when a host page already has one.
  - **`storage.js`**, **`feedback.js`**, **`sprite-render.js`**, **`builder-assembler.js`**, **`builder-modules.js`**, **`builder-validators.js`**, **`tour.js`** — as before.

All pages are plain HTML with inline CSS and JS, no build step. They share one project blob in `localStorage` under the key `nes_tile_editor.current.v1`, so edits on any page save into the same state — and the same Play pipeline reads it, so "▶ Play" from any page produces the same ROM.

### State shape

The editor state object (what JSON export writes and import reads) is:

```text
{
  version: 1,
  name: "untitled",
  universal_bg: 0x21,
  bg_palettes: [{slots:[b,b,b]}, ...4 of these],
  sprite_palettes: [{slots:[b,b,b]}, ...4 of these],
  sprite_tiles: [{pixels:[8×8], name:""}, ...256 of these],
  bg_tiles:     [{pixels:[8×8], name:""}, ...256 of these],
  backgrounds: [{name, dimensions:{screens_x,screens_y}, nametable:[[...]]}],
  selectedBgIdx: 0,
  sprites: [{name, width, height, cells:[[{tile,palette,flipH,flipV,priority,empty}]]}],
  animations: [{id, name, fps, frames:[spriteIdx, ...]}],
  animation_assignments: {walk: id|null, jump: id|null},
  nextAnimationId: 1,
  metadata: {created, modified}
}
```

Two independent 256-tile pools (`sprite_tiles` / `bg_tiles`) mirror the NES pattern tables and stop the two pages clobbering each other's art. Legacy saves with a single `tiles` pool are migrated by `migrateState()` on load — they duplicate across both pools.

### Animations

Animations are ordered lists of sprite indices — nothing more. The same sprite can appear in multiple animations, and can repeat within one. Animations have a monotonically-allocated **`id`** (via `nextAnimationId`) so walk/jump **assignments are id-based**, not index-based — deleting or reordering animations doesn't break the walking/jumping selection. `migrateState()` also clears assignments whose target id no longer exists.

When a sprite is deleted, `btn-sprite-del` rewrites every animation's `frames` array to filter the removed index and decrement higher indices, keeping the cascade consistent. Bounds-checks on load catch anything missed by older saves.

`animations[].fps` is 1..60 and converts to **vblank ticks** on the server side: `ticks = max(1, round(60/fps))`. A frame of 1 tick advances every vblank (≈60 fps); 30 ticks is about half a second per frame.

### Playground Server (`tools/playground_server.py`)

Python stdlib HTTP server on `127.0.0.1:8765`. Two roles:

1. **Serves the editor** over HTTP (the `file://` protocol breaks `fetch()` CORS when the editor tries to POST).
2. **POST `/play`** — accepts the full editor state, encodes sprite_tiles + bg_tiles into a single 8 KB CHR (sprite pool at $0000, BG pool at $1000 — `PPU_CTRL=0x10` selects $1000 for the background), encodes the active nametable into 1024 bytes (960 tile + 64 attribute), writes `src/scene.inc` + `src/palettes.inc` into `steps/Step_Playground/`, runs `make -C steps/Step_Playground`, and spawns `fceux` detached on the resulting ROM.

The server is stdlib-only — no pip installs needed. Keep it that way.

**VSCode tasks**: `Start Playground Server` is auto-run on folder open. `Open Editor via Playground Server` is the canonical entry — opens the browser on the served URL (the Play button fails on `file://` with a CORS hint in the status bar).

### Classroom deployment (Proxmox LXC)

For class-wide use the server runs on a shared host; pupils browse to its LAN IP. No install on pupil machines — just a modern browser.

**LXC setup (Debian/Ubuntu):**

```bash
# Inside the container
apt update && apt install -y python3 make cc65 git
git clone <this-repo> /opt/nesgame
cd /opt/nesgame
PLAYGROUND_HOST=0.0.0.0 PLAYGROUND_PORT=8765 python3 tools/playground_server.py
```

**systemd unit** (survives reboots and tty closes) — save as `/etc/systemd/system/nesgame.service`:

```ini
[Unit]
Description=NES Game Playground Server
After=network.target

[Service]
User=nesgame
WorkingDirectory=/opt/nesgame
Environment=PLAYGROUND_HOST=0.0.0.0 PLAYGROUND_PORT=8765
ExecStart=/usr/bin/python3 tools/playground_server.py
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Then `systemctl enable --now nesgame`. Pupils open `http://<lxc-ip>:8765/sprites.html`.

**No fceux on the server.** The classroom path is browser-only — `/health` reports `fceux: false` and the Play dialog only shows "This browser (jsnes)" as the Run-on option. Pupils who want the real FCEUX emulator run the stack on their own laptop (see the single-user dev instructions above).

**Per-pupil state.** Everything lives in each pupil's `localStorage`, keyed to the origin. Clearing browser data wipes their project — the **Export → JSON** button is the escape hatch. There is intentionally no user-facing account system.

**Concurrency.** A `threading.Lock()` wraps the shared `steps/Step_Playground/` writes + `make` invocation, so two pupils pressing Play at the same instant serialise on the ~1 s build rather than clobbering each other's `scene.inc`. Pupils using the Code page (Phase 3a) bypass this lock — their builds clone `Step_Playground` into a throwaway tempdir and compile in parallel.

### Phase 3a — pupil-editable `main.c` (the Code page)

[tools/tile_editor_web/code.html](tools/tile_editor_web/code.html) adds a third editor tab that opens the stock [steps/Step_Playground/src/main.c](steps/Step_Playground/src/main.c) in a CodeMirror 5 editor. The pupil's edited source is saved to `state.customMainC` in the shared `nes_tile_editor.current.v1` localStorage record (null = "use the built-in template").

On Play, the Code page posts `customMainC` alongside the usual scene payload. The server:

1. Clones `steps/Step_Playground/` into `tempfile.TemporaryDirectory()` (skipping `game.nes`, object files, and `build/`).
2. Overwrites `src/main.c` in the copy with the pupil's version.
3. Writes the auto-generated `game.chr`, `level.nam`, `scene.inc`, `palettes.inc` into the copy.
4. Runs `make -C <tempdir>` and returns the resulting ROM.

The tempdir is torn down automatically. Because each request has its own working directory, concurrent Code-page builds do not take `BUILD_LOCK` — they run in parallel, limited only by `cc65` CPU.

A `GET /default-main-c` endpoint serves the stock `main.c` as `text/plain` so the Code page's **↻ Restore default** button can round-trip back to the template.

cc65 output is rendered in a panel below the editor with clickable `file.c(line)` locations. The tempdir prefix is stripped from diagnostics before send-back so those jumps land at `src/main.c(42)` rather than an unreachable path.

**Caveats.** `state.customMainC` is per-browser-profile. If a pupil switches machine, they need to copy-paste their `main.c` across (or use **Export → JSON**, which now includes the field). `load_background()`, the cc65 headers, and the `PPU_*` MMIO macros are all fair game to edit; removing `waitvsync()` or `PPU_MASK = 0x1E` will give a visibly broken ROM, which is a useful teaching moment.

### Phase 3b — Guided mode + autocomplete

The Code page has two modes, toggled in its header:

- **🎓 Guided** (default for new pupils) parses `//>> id: hint` … `//<<` markers in `main.c` and makes everything *outside* those ranges read-only. The pupil sees a banner listing each region (e.g. `player_start`, `jump_height`, `walk_speed`), clicking a region scrolls the editor to it. Editable lines get a green wash so they're visually unmistakable. The `//>>` and `//<<` marker lines themselves are locked but visible.
- **⚙️ Advanced** clears all the read-only marks and lets the pupil edit any line. A confirmation dialog fires the first time they switch, and the choice is persisted in `playground.codemode.v1`.

**Marker syntax.** Each region is delimited by:

```c
//>> some_id: One-line explanation that shows up in the jump-to banner.
    <editable C code>
//<<
```

`//>>` requires an identifier (`[A-Za-z_][A-Za-z0-9_]*`) followed by a colon and free-text hint; `//<<` stands alone on its own line. Anything cc65 accepts between the two is fine. The C compiler treats both lines as ordinary comments so builds in Advanced mode, at the terminal, or via `make -C steps/Step_Playground` are unaffected.

**Seed regions in [steps/Step_Playground/src/main.c](steps/Step_Playground/src/main.c):**

- `walk_speed` — how many pixels the player moves per frame (a module-scope variable referenced by the LEFT / RIGHT branches).
- `player_start` — where the player spawns (`px = PLAYER_X; py = PLAYER_Y; ground_y = PLAYER_Y;`).
- `jump_height` — the `jmp_up = 20;` initialiser inside the jump branch.

Add more by dropping `//>> … //<<` pairs around any block you want pupils to tweak in a given lesson.

**Autocomplete.** The editor vendors `codemirror/addon/hint/show-hint` and ships a custom hint source (`nesHint` in [code.html](tools/tile_editor_web/code.html)) that offers:

- Generated scene symbols (`PLAYER_X`, `player_tiles`, `walk_tiles`, `NUM_STATIC_SPRITES`, `palette_bytes`, the `ss_*` arrays, etc.).
- NES MMIO macros the template defines (`PPU_CTRL`, `OAM_DATA`, `JOYPAD1`, …).
- cc65 helpers (`waitvsync`, `load_background`, `read_controller`).
- A short C keyword list.

Each symbol carries a one-line description shown inline in the completion popup. Triggered automatically while typing identifier characters and explicitly via `Ctrl-Space`. If you rename a generated symbol in `build_scene_inc()`, update the `HINT_SYMBOLS` table to match or the hint shown to pupils will drift.

### Phase 3c — Lesson library + hover tooltips

The Code page now ships a lesson library backed by the `lessons/` directory at the repo root. Each lesson is a **complete, compilable `main.c`** with a JSON metadata block pinned to the top:

```c
/*! LESSON
{
  "id": "01-move-player",
  "title": "Move the Player",
  "difficulty": 1,
  "summary": "Short sentence shown in the picker.",
  "description": "Longer paragraph shown before the pupil loads the lesson.",
  "goal": "What the pupil should achieve.",
  "hints": [
    "First hint, shown under the collapsible 💡 Show hints panel.",
    "Second hint."
  ]
}
*/
```

The `/*! LESSON … */` is a plain C block comment — `cc65` ignores it, `make -C steps/Step_Playground` still builds when the lesson file is swapped in. The server re-reads `lessons/*.c` on every `/lessons` request so teachers can author, tweak, and save without restarting the playground. Malformed JSON is logged to stderr and the file is dropped from the list rather than 500-ing the whole request.

**Seed lessons** (ship with the repo, ordered by difficulty):

| File                                            | Region(s) unlocked         | Teaching goal                                             |
|-------------------------------------------------|----------------------------|-----------------------------------------------------------|
| [lessons/01-move-player.c](lessons/01-move-player.c)    | `player_start`             | Change three numbers to reposition the spawn.             |
| [lessons/02-speed-and-jump.c](lessons/02-speed-and-jump.c) | `walk_speed`, `jump_height` | Tune two constants to change game feel.                   |
| [lessons/03-magic-button.c](lessons/03-magic-button.c)  | `magic_button`             | Write a per-frame `if (pad & 0x40)` branch for the B button. |

**Server endpoints:**

- `GET /lessons` → `{"ok": true, "lessons": [<meta>...]}` sorted by `(difficulty, id)`.
- `GET /lessons/<id>` → the raw `main.c` (JSON header still attached).

Unknown ids 404. The pupil's chosen lesson is persisted in `state.currentLesson` inside the shared `nes_tile_editor.current.v1` localStorage blob, so it survives reloads and rides along with Export → JSON. `migrateState()` in index.html / sprites.html normalises the new field.

**UI on the Code page:**

- **📚 chip** in the toolbar opens the picker dialog. When a lesson is active the chip shows its title and a solid info border; empty it shows dashed "Pick a lesson…".
- **Goal panel** sits below the hint banner while a lesson is active — shows title, difficulty chip, goal sentence, and a collapsed `<details>` with hints. A `×` dismiss button hides the panel for the session (the chip still indicates the active lesson).
- **Restore default** button now also clears the `currentLesson` pointer so pupils who bail back to the free-form scaffolding don't see a stale goal panel.

**Hover tooltips for generated symbols.** Moving the mouse over any identifier in the editor looks it up in `HINT_SYMBOLS` (same table that feeds autocomplete) and floats a tooltip above the cursor with the one-line description. Unknown tokens hide the tooltip silently. Implementation: `cm.coordsChar()` + `cm.getTokenAt()` on the wrapper element's `mousemove`, with a small timer to hide on `mouseleave`.

**Authoring new lessons.** Copy the closest existing lesson, change the JSON header, add / remove `//>> … //<<` regions around whatever you want the pupil to edit. Anything outside those markers becomes read-only in Guided mode, so keep the editable ranges narrow to reinforce the teaching point. `make -C steps/Step_Playground` with your lesson swapped in as `src/main.c` is the fastest way to verify it compiles before serving it to a class.

### Phase 3d — Snippet library

A sibling of the lesson library: `snippets/` at the repo root holds short blocks of pre-tested C that the pupil can paste into whatever editable region they happen to be in. Each snippet is a `.c` file with a `/*! SNIPPET { JSON } */` header and a body of plain C (no `main`, no includes — the snippet is pasted *inside* existing code):

```c
/*! SNIPPET
{
  "id": "teleport-on-b",
  "title": "Teleport on B button",
  "summary": "Short sentence shown in the picker.",
  "description": "Longer paragraph shown as hover-help, optional.",
  "regions": ["magic_button"],
  "tags": ["input", "movement"]
}
*/
        if ((pad & 0x40) && !(prev_pad & 0x40)) {
            px = 16;
            py = 24;
            ground_y = 24;
        }
```

`regions` is an optional list of lesson-region ids (`player_start`, `walk_speed`, `magic_button`, …) where this snippet is most useful. Snippets whose `regions` list matches the pupil's current cursor region get a green left-border and sort first in the picker. Leave the list empty to offer the snippet everywhere.

**Seed snippets:**

| File                                                                     | Fits region    | Effect                                                     |
|--------------------------------------------------------------------------|----------------|------------------------------------------------------------|
| [snippets/teleport-on-b.c](snippets/teleport-on-b.c)                     | `magic_button` | Pressing B warps the hero to the top-left corner.          |
| [snippets/sprint-on-a.c](snippets/sprint-on-a.c)                         | `magic_button` | Hold A to double walking speed.                            |
| [snippets/run-on-b.c](snippets/run-on-b.c)                               | `magic_button` | Hold B to triple walking speed.                            |
| [snippets/wrap-screen.c](snippets/wrap-screen.c)                         | `magic_button` | Walking off either edge re-enters from the other side.     |
| [snippets/wrap-vertical.c](snippets/wrap-vertical.c)                     | `magic_button` | Flying off the top/bottom re-enters from the other side.   |
| [snippets/rainbow-background.c](snippets/rainbow-background.c)           | `magic_button` | Rewrites PPU $3F00 every frame for a palette strobe.       |
| [snippets/rainbow-player.c](snippets/rainbow-player.c)                   | `magic_button` | Cycles the player's primary colour every frame.            |
| [snippets/auto-bounce.c](snippets/auto-bounce.c)                         | `magic_button` | Re-fires a jump the instant the hero lands.                |
| [snippets/fly-on-a.c](snippets/fly-on-a.c)                               | `magic_button` | Hold A to rise; release to fall.                           |
| [snippets/fast-fall.c](snippets/fast-fall.c)                             | `magic_button` | Hold DOWN while airborne to slam back down.                |
| [snippets/double-jump.c](snippets/double-jump.c)                         | `magic_button` | A second A-press mid-air gives one extra bounce.           |
| [snippets/dash-on-b.c](snippets/dash-on-b.c)                             | `magic_button` | Tap B for a short horizontal dash in the facing direction. |
| [snippets/high-jump.c](snippets/high-jump.c)                             | `magic_button` | Boosts every jump so it travels roughly twice as high.     |
| [snippets/freeze-on-start.c](snippets/freeze-on-start.c)                 | `magic_button` | Hold START to pause gravity so you can walk on air.        |
| [snippets/auto-walk-right.c](snippets/auto-walk-right.c)                 | `magic_button` | Autopilot: the player walks right without input.           |
| [snippets/bounce-off-walls.c](snippets/bounce-off-walls.c)               | `magic_button` | Autopilot with direction flip at each screen edge.         |
| [snippets/solid-obstacles.c](snippets/solid-obstacles.c)                 | `magic_button` | Scene sprites block horizontal movement (walls).           |
| [snippets/stand-on-obstacles.c](snippets/stand-on-obstacles.c)           | `magic_button` | Scene sprites become platforms you can stand on.           |
| [snippets/screen-shake-on-landing.c](snippets/screen-shake-on-landing.c) | `magic_button` | PPU scroll wobbles for 8 frames after each landing.        |

**Server endpoints:**

- `GET /snippets` → `{"ok": true, "snippets": [<meta>...]}` sorted by `id`.
- `GET /snippets/<id>` → the raw body *after* the header comment, with leading/trailing blank lines trimmed.

Unknown ids 404 (same id-validation as lessons: `[A-Za-z0-9][A-Za-z0-9._-]*`). The server re-scans `snippets/*.c` on every request so teachers can author without restarting.

**UI on the Code page:**

- **🧩 Snippets…** button next to the lesson chip opens the picker.
- Each item shows title, summary, region badges (`fits: <id>`) and tag badges.
- The picker sorts snippets that match the current region to the top and marks them with a green left-border.
- A **live preview pane** shows the exact text that will be pasted.
- A footer hint tells the pupil whether the cursor is on a locked line (Guided) or in free-edit mode, and warns if the insert won't land (cursor on a `//<<` / header / locked line).
- **Insert at cursor** pastes the snippet body on a new line after the current cursor line, then moves the cursor to the end of the pasted block. In Guided mode, CodeMirror's `readOnly, atomic: true` marks backstop the UI guard — the insert is silently rejected if the pupil does land on a locked line despite the hint.

**Authoring new snippets.** Drop a new `.c` file into `snippets/`, write the JSON header, then paste the body indented to match its usual context (the seed snippets use 8-space indent because `magic_button` regions live two scopes deep inside `main()`'s `while (1)` loop). Snippets are free to reference any variable already in scope at the target region — when in doubt, temporarily stash the body into `steps/Step_Playground/src/main.c` and `make` before shipping it.

### Phase 3e — Assembly mode (C / 6502 toggle)

The Code page carries a second mode-toggle pair beside **Guided / Advanced**: **C / Asm**. Advanced pupils can flip the editor's source between [steps/Step_Playground/src/main.c](steps/Step_Playground/src/main.c) (cc65) and a standalone 6502 starter at [steps/Step_Playground/src/main.s.starter](steps/Step_Playground/src/main.s.starter) (ca65). Each language keeps its own working copy inside the same shared state blob (`state.customMainC`, `state.customMainAsm`), so switching back and forth never loses work.

**Why a standalone asm starter (no `nes.lib`).** The starter writes its own `.segment "HEADER"` iNES bytes and its own `.segment "VECTORS"` block, and the asm build path links `main.o + graphics.o` directly with `ld65 -C cfg/nes.cfg` — no crt0, no `nes.lib`. This keeps the boot path visible end-to-end: `reset:` disables rendering, double-waits for vblank, writes palettes, calls `_load_background`, sets `PPU_CTRL`/`PPU_MASK`/scroll, then drops into `game_loop`. An empty `.segment "STARTUP"` stub silences the nes.cfg-declared segment without pulling any runtime in.

**Asm-flavoured includes.** Where the C path writes `palettes.inc` / `scene.inc`, the asm path writes sibling files `palettes.asminc` / `scene.asminc`, generated by `build_palettes_asminc()` and `build_scene_asminc()`:

- Constants (`PLAYER_X`, `PLAYER_Y`, `PLAYER_W/H`, `NUM_STATIC_SPRITES`, `WALK_FRAME_COUNT/TICKS`, `JUMP_FRAME_COUNT/TICKS`) become `.define NAME value` — ca65 text-replacement macros.
- Tables (`palette_bytes`, `player_tiles`, `player_attrs`, `walk_tiles/attrs`, `jump_tiles/attrs`, `ss_x/y/w/h/offset/tiles/attrs`) become labelled `.byte` data inside `.pushseg` / `.segment "RODATA"` / `.popseg` so the include can drop anywhere in the pupil's file without clobbering the current segment. Empty data sets emit a 1-byte `$00` stub to keep the labels valid.

**Guided markers work in both languages.** `parseEditableRegions()` accepts either comment style:

```c
//>> player_start: Change these two numbers to move where the hero spawns.
//<<
```

```asm
;>> player_start: Change these two numbers to move where the hero spawns.
;<<
```

The starter ships two regions (`player_start`, `movement`) so Guided mode and the tile-editor's "Where should the hero start?" picker both keep working when the pupil is writing asm.

**Server endpoints:**

- `GET /default-main-c` → stock `main.c.starter` (unchanged from 3b/3c).
- `GET /default-main-s` → stock `main.s.starter`.

**`/play` accepts either language.** The contract now allows `customMainC` *or* `customMainAsm` (never both — the server 400s if both are present). Dispatch in `_build_rom()`:

| Body field          | Build path                                 | Includes written                  |
|---------------------|--------------------------------------------|-----------------------------------|
| `customMainC` set   | `_build_in_tempdir()` (cc65 + nes.lib)     | `palettes.inc`, `scene.inc`       |
| `customMainAsm` set | `_build_asm_in_tempdir()` (ca65, no .lib)  | `palettes.asminc`, `scene.asminc` |
| neither             | `_build_in_shared_dir()` (native workflow) | `palettes.inc`, `scene.inc`       |

The asm path copies `STEP_DIR` to a tempdir, removes `main.c` / `scene.inc` / `palettes.inc`, drops the pupil's `main.s` + generated `.asminc` files, overwrites `Makefile` with the in-memory `ASM_MAKEFILE` (ca65-only, two `.o` → `ld65`), then runs `make`. CHR (`assets/sprites/game.chr`) and NAM (`assets/backgrounds/level.nam`) assets are written the same way as the C path — `graphics.s` reads them at assemble time.

**UI on the Code page:**

- Second `.mode-toggle` pair sits beside Guided/Advanced. **C** is default-active; clicking **Asm** pops a one-time confirm explaining that C code is preserved on switch and that lessons + snippets stay C-only for now.
- In asm mode the lesson chip and **🧩 Snippets…** button are greyed out with an explanatory tooltip.
- `switchLanguage(next)` saves the editor buffer to `state.custom*` for the *current* lang, loads the target lang's saved source (or fetches the starter), clears guided marks, sets the editor value, and re-applies guided marks if Guided mode is active.
- **▶ Play** reads `cm.getValue()` once, saves it to the right state field, and sends `customMainC` *or* `customMainAsm` based on `codeLang`.
- **Restore default** is lang-aware: it confirms `"Replace your main.s with the default?"` in asm mode and invalidates only that lang's cache slot.
- CodeMirror still uses the `clike` mode for both languages (asm mode is not loaded). 6502 highlighting is close enough to C for this classroom use — authoring a proper ca65 mode is a future task.

**Authoring notes.** The asm starter is deliberately minimal — no walk animation, no jump — so the 6502 bookkeeping doesn't drown the interesting bits. Compare `main.s.starter` side-by-side with `main.c.starter` to see the same game in both languages. Asm lessons / snippets are not implemented yet; if you add them, gate them on `lang === 'asm'` in the lesson/snippet pickers and reuse the `;>>` / `;<<` marker style for editable regions.

### `/play` endpoint contract

POST body:

```json
{
  "state": { /* full editor state */ },
  "customMainC": "// optional — full contents of src/main.c",
  "playerSpriteIdx": 0,
  "playerStart": { "x": 60, "y": 155 },
  "sceneSprites": [{ "spriteIdx": 2, "x": 96, "y": 120 }],
  "mode": "browser"
}
```

`mode` is `"browser"` (default) or `"native"`. Native auto-falls-back to browser (with a warning in the response) if `fceux` isn't on PATH. When `customMainC` is present and non-empty, the build runs in a per-request tempdir so concurrent pupil edits don't race; without it, the shared `steps/Step_Playground/` build path is used (serialised through `BUILD_LOCK`).

Native mode writes the just-built ROM to `steps/Step_Playground/_play_latest.nes` and launches `fceux` against **that** file, not the shared `game.nes`.  The tempdir build path never updates `game.nes`, so an earlier bug had fceux loading whatever stale ROM the last offline `make` had left there; the dedicated `_play_latest.nes` keeps the offline workflow's stock `game.nes` authoritative while giving `/play` a predictable launch target.  `*.nes` is already in `.gitignore`, so nothing new to ignore.

Response on success:

```json
{
  "ok": true,
  "stage": "built" | "launched-native" | "launched-browser-fallback",
  "log": "<cc65 build output>",
  "size": 49168,
  "rom_b64": "<base64 iNES ROM, only in browser/fallback modes>"
}
```

Browser mode decodes `rom_b64` and hands it either to the page's embedded `jsnes.NES.loadROM()` (Builder / Sprites / Code / Backgrounds / Behaviour — all now share [tools/tile_editor_web/emulator.js](tools/tile_editor_web/emulator.js)) or to a blob URL for the Download-ROM flow. Native mode spawns `fceux` detached and returns immediately. `/health` publishes `{ok, fceux, modes}` so the client can grey out unavailable options at page load — [play-pipeline.js](tools/tile_editor_web/play-pipeline.js)'s `capabilities()` caches the probe for the page's lifetime.

**Step_Playground** is a throwaway step folder. Its `src/scene.inc` and `src/palettes.inc` are committed as placeholders so the skeleton compiles before the first Play, but they are overwritten on every Play. `src/main.c` reads `palette_bytes[32]`, `player_tiles/attrs/X/Y/W/H`, `ss_*` arrays (extra static sprites), and the animation tables **`walk_tiles` / `walk_attrs` / `WALK_FRAME_COUNT` / `WALK_FRAME_TICKS`** (and the `jump_*` equivalents). If you rename any of these symbols, update `build_scene_inc()` in the server to match.

**Walk/jump contract:** for each kind, the server emits a compile-time count (0 when no animation is assigned), a tick interval, and two flat byte arrays sized `count * PLAYER_W * PLAYER_H` that concatenate every frame's tile + attribute cells row-major. All frames of a given animation must share the Player sprite's W×H — `_resolve_animation()` in the server silently drops frames that don't. When the count is 0, cc65 still needs a valid array so the server emits a 1-element stub; `main.c` gates the use behind the macros with `#if WALK_FRAME_COUNT > 0`.

**main.c state machine:** UP held selects jump (if assigned), else LEFT/RIGHT held selects walk (if assigned), else the static `player_tiles` layout. Switching mode resets `anim_frame` / `anim_tick` so every animation enters from its first frame. The frame index is advanced each vblank when `anim_tick >= FRAME_TICKS`. `plrdir` still XORs the flip-H bit into every attribute byte so a left-facing walk still mirrors correctly.

### Converting pupil's legacy `my_tiles.txt`

`tools/convert_my_tiles.py` reads the old text-block format (via `tools/tile_editor.py`'s parser) and writes `assets/pupil/my_project.json` in the current editor schema:

```bash
python3 tools/convert_my_tiles.py
```

It categorises tiles by whether they're referenced by sprites or backgrounds, fills the matching pool(s) starting at slot 1 (slot 0 left blank to match the editor convention), and claims up to 4 BG + 4 sprite palette slots. Unused palette slots are filled with the editor defaults so the pupil doesn't open an all-black palette grid.

Once run, the pupil imports the JSON on each editor page (**Import background…** / **Import sprites…**).

### Phase B — Builder page (🧱)

The **🧱 Builder** is the fifth editor tab.  It lets pupils build
a compilable NES game by ticking modules and filling in typed
attributes — no C required.  The pipeline is:

```text
state.builder (JSON)  →  builder-assembler.js  →  main.c
                         + builder-modules.js        ↓
                         + builder-validators.js    /play
                                                     ↓
                                                   cc65 → .nes
```

See [BUILDER_GUIDE.md](BUILDER_GUIDE.md) for the full module
reference.  A few teacher-relevant bits:

- **Modules live in `tools/tile_editor_web/builder-modules.js`.**
  Each is a plain JS object with `label`, `description`,
  `defaultConfig`, a typed `schema` and an optional
  `applyToTemplate(template, node, state)` transform.  Adding a
  module is usually 30-80 lines of code plus a smoke test.
- **The template at `tools/tile_editor_web/builder-templates/platformer.c`**
  is a near-copy of `steps/Step_Playground/src/main.c` with
  `#if`-gated blocks for HP, HUD, Player 2, multi-background
  doors, dialogue, runtime animations.  When no Builder modules
  are enabled the template compiles to a ROM with the same
  `sha1sum` as the stock Step_Playground ROM — a **byte-identical
  baseline invariant** that the regression suite enforces.
- **Font-tile convention for Dialogue.**  Text renders by writing
  tile indices to the nametable (ASCII values of each character).
  Pupils paint letter glyphs at `0x41`..`0x5A` (A..Z) and
  `0x30`..`0x39` (0..9) in their BG tile set.  Unpainted indices
  show whatever happens to be there (blank for a fresh project).

### Regression tests

Run `node tools/builder-tests/run-all.mjs` from the repo root.
It syntax-checks every module + inline script, verifies the
byte-identical baseline invariant, and runs eight smoke-test
suites covering Player 2, HP+HUD, runtime animations, teleport
doors, multi-background doors, the polish sweep (P2 HP + P2
animation + enemy/pickup idle), and dialogue (including a
regression guard against the old `draw_text()` / `clear_text_row()`
from-per-frame pattern that caused a one-frame sprite stutter).

The suite should be green before any Builder change ships.

---

## Step-based lesson structure

The project includes a `steps/` folder with self-contained, buildable snapshots of the game at each stage of development. Each step can be built independently with `make` from within its folder.

| Step | Folder | What it teaches |
|------|--------|----------------|
| 1 | `Step_1_Player_Movement/` | Sprites, OAM, controller input, animation, basic physics (jump/gravity). The minimal working game. |
| 2 | `Step_2_Background_Level/` | Background tiles (CHR pattern tables), nametables, palette management, PPU_CTRL pattern table selection. A visible level with ground, platforms, clouds, and castle walls. |
| 3 | `Step_3_Enemies_And_Items/` | Multiple sprite palettes, enemy AI (patrol behaviour), collision detection (bounding box), game state (collectibles, score tracking). |

The `tools/generate_chr.py` script was used to create the CHR tile data and nametables for Steps 2 and 3. It can be used as a reference for how NES tile graphics are encoded (2-bit planar format), or modified to generate new tiles programmatically.

Pupils can work in any step folder without affecting the others, and can look ahead to later steps to see how features were implemented. This avoids needing git for version management during lessons.

---

## NES Architecture Summary

The NES has two main processors:

### CPU: Ricoh 2A03 (modified 6502)
- 8-bit processor, 1.79 MHz clock
- 16-bit address bus (64KB addressable space)
- Runs game logic, reads controllers, sends commands to the PPU
- Has 2KB of internal RAM ($0000-$07FF)
- Cartridge ROM is mapped at $8000-$FFFF (our code lives here)
- Hardware stack at $0100-$01FF (used for function calls, interrupts)

### PPU: Ricoh 2C02 (Picture Processing Unit)
- Separate processor dedicated to graphics
- Has its own 16KB address space (separate from the CPU)
- Renders a 256x240 pixel display at 60fps (NTSC)
- The CPU communicates with the PPU through memory-mapped registers at $2000-$2007

### Key PPU concepts

**Pattern Tables (CHR-ROM):** Two 4KB banks of tile graphics, each containing 256 tiles of 8x8 pixels. One bank is typically used for sprites, the other for backgrounds. Each pixel uses 2 bits (4 possible values: transparent + 3 colors). Our CHR data comes from `walk1.chr` (8KB = both banks).

**Palettes:** The PPU has 32 bytes of palette memory at $3F00-$3F1F:
- $3F00: Universal background color (shared by all palettes)
- $3F01-$3F03: Background palette 0 (3 colors)
- $3F05-$3F07: Background palette 1
- $3F09-$3F0B: Background palette 2
- $3F0D-$3F0F: Background palette 3
- $3F11-$3F13: Sprite palette 0 (3 colors) - **this is what we set**
- $3F15-$3F17: Sprite palette 1
- $3F19-$3F1B: Sprite palette 2
- $3F1D-$3F1F: Sprite palette 3

Each palette's color 0 is transparent (for sprites) or the universal background color.

**OAM (Object Attribute Memory):** 256 bytes of dedicated memory for sprite data. Holds up to 64 sprites, 4 bytes each:
- Byte 0: Y position (0-239, $FF = offscreen)
- Byte 1: Tile index (which 8x8 tile from the pattern table)
- Byte 2: Attributes
  - Bits 0-1: Palette number (0-3)
  - Bit 5: Priority (0 = in front of background, 1 = behind)
  - Bit 6: Horizontal flip
  - Bit 7: Vertical flip
- Byte 3: X position (0-255)

**Nametables:** The background is composed of a 32x30 grid of 8x8 tiles (256x240 pixels). Each byte in the nametable is a tile index. The NES has 2KB of nametable RAM, enough for two screens. Nametable data can be found in `.nam` files.

---

## File-by-file technical breakdown

### src/main.c - Game Logic

This is the entire game in one C file. It compiles to 6502 assembly via cc65.

#### Hardware register definitions (lines 32-41)

```c
#define PPU_CTRL      *((unsigned char*)0x2000)
```

These are C macros that create pointers to the NES hardware registers. Writing to the dereferenced pointer writes directly to the hardware. For example, `PPU_MASK = 0x1E` compiles to a `STA $2001` instruction. This is standard practice for memory-mapped I/O on the 6502.

The key registers used:

| Address | Name       | Purpose |
|---------|-----------|---------|
| $2000   | PPU_CTRL  | NMI enable (bit 7), sprite/BG pattern table selection, nametable base |
| $2001   | PPU_MASK  | Rendering enable - bit 3: show BG, bit 4: show sprites, bits 1-2: left column masking |
| $2002   | PPU_STATUS| Read to check vblank (bit 7), also resets $2005/$2006 write latch |
| $2003   | OAM_ADDR  | Set the write address within OAM (0-255) |
| $2004   | OAM_DATA  | Write one byte to OAM at the current address (auto-increments) |
| $2005   | PPU_SCROLL| Set horizontal then vertical scroll (two sequential writes) |
| $2006   | PPU_ADDR  | Set VRAM address for reads/writes (two sequential writes: high byte, low byte) |
| $2007   | PPU_DATA  | Read/write one byte of VRAM at the address set by $2006 (auto-increments) |
| $4016   | JOYPAD1   | Controller port - write 1 then 0 to strobe, then read 8 times for button states |

#### Global variables (lines 49-57)

All declared as `unsigned char` (8-bit), which is the natural word size for the 6502. Using larger types on this CPU generates significantly more code. Key teaching point: every variable costs precious RAM - the NES only has 2KB.

The variables with initial values (e.g., `x = 120`) are placed in the DATA segment by cc65. The nes.lib crt0 startup code copies these initial values from ROM into RAM before calling `main()`. Variables without initial values go into BSS (zeroed at startup).

#### Animation table (lines 79-85)

```c
static const unsigned char anim_tiles[4][8] = { ... };
```

`static const` causes cc65 to place this in the RODATA segment, which lives in ROM. This is important: ROM is read-only but doesn't use precious RAM. The table stores tile indices for 4 animation frames, each consisting of 8 tiles (2 columns x 4 rows).

The tile indices follow a pattern in the CHR layout. In the sprite sheet, tiles are arranged in a 16x16 grid (16 tiles per row). The hex numbering reflects this:
- Row 0: tiles $00-$0F
- Row 1: tiles $10-$1F
- Row 2: tiles $20-$2F
- etc.

So the player's standing frame uses tiles that form a 2x4 block: $01/$02, $11/$12, $21/$22, $31/$32 - which is a vertical strip 2 tiles wide and 4 rows down in the sprite sheet.

#### Controller reading (lines 105-120)

The NES controller uses a serial protocol. Writing 1 then 0 to $4016 latches the button states. Each subsequent read from $4016 returns one button (in bit 0), in the order: A, B, Select, Start, Up, Down, Left, Right.

The code shifts and ORs to build a byte where each bit represents a button. This is a standard NES controller read routine. Note: on real hardware, it's recommended to read the controller twice and compare results to avoid errors from the DPCM audio channel stealing CPU cycles, but this is fine for emulator development.

The resulting button byte layout:

```
Bit:  7    6    5      4     3   2    1    0
      A    B    Sel    Start Up  Down Left Right
```

#### draw_one_sprite (lines 132-138)

A helper function that writes 4 bytes to OAM_DATA ($2004). Each write auto-increments the internal OAM address. This is the simplest (though not most robust) way to update sprites. On real hardware, writing to $2004 during rendering can cause glitches; the proper method is OAM DMA via $4014 (writing the high byte of a 256-byte aligned RAM page triggers a hardware copy of that entire page to OAM). We use the simpler approach here for clarity.

#### draw_player (lines 151-178)

Draws the 8 sprites that make up the player character. Key logic:

1. Selects animation frame via `moved % 4`
2. Gets a pointer into the RODATA tile table
3. Calculates left/right X positions (swapped when facing left)
4. Sets OAM_ADDR to 0 to start writing from sprite 0
5. Loops through 4 rows x 2 columns, calling draw_one_sprite for each

When facing left (`plrdir = 0x40`), two things happen:
- The attribute byte gets bit 6 set (horizontal flip) so each individual tile is mirrored
- The left and right column X positions are swapped so the overall character image mirrors

#### main() initialization (lines 187-221)

The startup sequence:

1. `waitvsync()` - waits for vertical blank. Provided by nes.lib. Polls PPU_STATUS bit 7.
2. `PPU_MASK = 0` - disables rendering. **Critical**: many PPU registers can only be safely written during vblank or with rendering disabled.
3. Palette writes via PPU_ADDR/PPU_DATA - sets the VRAM write address to $3F00 (palette memory), then writes color values. Sequential writes to PPU_DATA auto-increment the address.
4. `PPU_MASK = 0x1E` - enables rendering. Bit breakdown:
   - Bit 1 (0x02): Show sprites in leftmost 8 pixels
   - Bit 2 (0x04): Show background in leftmost 8 pixels
   - Bit 3 (0x08): Show background
   - Bit 4 (0x10): Show sprites

#### Game loop (lines 226-290)

Runs once per frame (synchronized by `waitvsync()`). The structure is:

1. **Input**: Read controller state into `pad`
2. **Logic**: Update position based on input + physics
3. **Sync**: `waitvsync()` waits for vertical blank
4. **Draw**: Update OAM with new sprite positions

The gravity system is simple: if the player is above the floor (y < 150), they're in the air. During a jump, `jmptime` counts down while moving upward. When it hits 0, gravity pulls the player down. When y >= 150, the player is on the ground and can jump again. This creates a linear arc, not a parabolic one.

#### Interrupt vectors (lines 298-302)

```c
const void *vectors[] = {
    (void *) 0,    // NMI  ($FFFA)
    (void *) main, // RESET ($FFFC)
    (void *) 0     // IRQ  ($FFFE)
};
```

The 6502 reads three 16-bit addresses at the top of memory:
- **$FFFA-$FFFB (NMI)**: Called on every vblank if PPU_CTRL bit 7 is set. Currently unused (set to 0).
- **$FFFC-$FFFD (RESET)**: Where the CPU starts on power-on/reset. Points to `main()`.
- **$FFFE-$FFFF (IRQ)**: Hardware interrupt. Unused.

This array is placed in the VECTORS segment by the linker config, which maps to $FFFA in ROM.

**Teaching note**: The NMI vector being 0 means the vblank interrupt is not used. The game relies entirely on polling PPU_STATUS via `waitvsync()`. A more robust approach would be to implement an NMI handler that performs OAM DMA ($4014) from a RAM buffer each frame. This is how commercial NES games work and prevents sprite corruption. This is a good next step for an advanced lesson.

---

### src/graphics.s - Tile Data Loader

This is 65xx assembly (assembled by ca65). It serves two purposes:

#### 1. copy_mytiles_chr procedure (lines 24-45)

An assembly routine that copies the CHR tile data from ROM to the PPU's pattern table via PPU registers. It:
1. Loads the address of the CHR data into a zero-page pointer
2. Disables rendering (writes 0 to $2001)
3. Sets PPU address to $0000 (start of pattern table)
4. Copies 32 pages of 256 bytes (8KB total) via a nested loop

**Note**: This routine exists but is **not currently called** from main.c. The CHR data reaches the PPU through a different mechanism - it's placed in the CHARS segment which the linker puts into the CHR-ROM section of the iNES file. The emulator/hardware loads CHR-ROM directly into the PPU's pattern table memory. This routine would only be needed for CHR-RAM (some cartridges use RAM instead of ROM for pattern tables).

#### 2. CHR data inclusion (line 48)

```asm
.segment "CHARS"
mytiles_chr: .incbin "../assets/sprites/walk1.chr"
```

The `.incbin` directive includes the raw binary contents of `walk1.chr` (8192 bytes) directly into the CHARS segment. The linker config maps CHARS to the CHR-ROM section of the output file. This is how the sprite graphics get into the ROM.

The CHR file contains 256 tiles in the NES's 2-bit-per-pixel format. Each tile is 16 bytes: 8 bytes for bit plane 0 (low bit of each pixel), followed by 8 bytes for bit plane 1 (high bit). The two bits combine to give values 0-3, selecting a color from the assigned palette.

---

### cfg/nes.cfg - Linker Configuration

This file tells ld65 how to arrange the compiled code into a valid NES ROM.

#### SYMBOLS section

```
__STACKSIZE__: value = $0300   # 768 bytes for cc65's software stack
NES_CHR_BANKS: value = 1       # One 8KB CHR bank
NES_MIRRORING: value = 1       # Vertical mirroring (horizontal scrolling)
NES_MAPPER:    value = 0       # Mapper 0 (NROM) - no bank switching
```

These are used by nes.lib's crt0 to generate the iNES header.

**Mapper 0 (NROM)** is the simplest cartridge type: 32KB PRG-ROM + 8KB CHR-ROM, no bank switching. This limits the game to 32KB of code/data and 8KB of graphics. Zelda 2 used Mapper 1 (MMC1) with bank switching for much more content - that's a possible future upgrade.

**Vertical mirroring** means the two physical nametables are arranged side-by-side, which suits horizontal scrolling (the direction Zelda 2 scrolls).

#### MEMORY section

Defines the physical memory regions:

| Region | Address      | Size  | Purpose |
|--------|-------------|-------|---------|
| ZP     | $0002-$001B | 26B   | Zero page - fast-access variables (cc65 runtime uses these) |
| HEADER | File offset 0| 16B  | iNES file header |
| ROM0   | $8000-$FFF9 | ~32KB | All program code and constant data |
| ROMV   | $FFFA-$FFFF | 6B    | CPU interrupt vectors |
| CHR    | $0000       | 16KB  | Pattern table data (tile graphics) |
| SRAM   | $0500-$07FF | 768B  | cc65 software stack |
| RAM    | $6000-$7FFF | 8KB   | Variables, BSS, heap |

**Important architectural detail**: The NES CPU address space is:
- $0000-$07FF: 2KB internal RAM (mirrored at $0800-$1FFF)
- $2000-$2007: PPU registers (mirrored every 8 bytes up to $3FFF)
- $4000-$4017: APU and I/O registers
- $4020-$FFFF: Cartridge space (ROM, extra RAM, mapper registers)

The zero page ($0000-$00FF) is special on the 6502: instructions that reference it use only 1 byte for the address instead of 2, making them faster and smaller. cc65 uses a few zero-page locations for the software stack pointer and temporary variables.

#### SEGMENTS section

Maps logical segments to physical memory:

| Segment  | Memory | Type | Content |
|----------|--------|------|---------|
| ZEROPAGE | ZP     | rw   | cc65 runtime zero-page variables |
| HEADER   | HEADER | ro   | iNES header (generated by nes.lib crt0) |
| STARTUP  | ROM0   | ro   | crt0 initialization code (from nes.lib) |
| CODE     | ROM0   | ro   | Compiled C functions |
| RODATA   | ROM0   | ro   | Read-only data (const arrays like anim_tiles) |
| DATA     | ROM0/RAM | rw | Initialized variables (stored in ROM, copied to RAM at startup) |
| VECTORS  | ROMV   | rw   | Interrupt vector table |
| CHARS    | CHR    | rw   | CHR-ROM tile graphics |
| BSS      | RAM    | bss  | Uninitialized variables (zeroed at startup) |

The DATA segment has both `load` (ROM0) and `run` (RAM) addresses. The initial values are stored in ROM, and the crt0 startup copies them to RAM before calling `main()`. This is why variables like `unsigned char x = 120` work correctly.

#### FEATURES section

Configures cc65's constructor/destructor system. This allows library code to register initialization functions that run before `main()`. Not actively used in our code, but required by nes.lib.

---

### Makefile - Build System

The build process has three stages:

1. **cc65**: Compiles C source to 6502 assembly (`.c` -> `.s`)
2. **ca65**: Assembles into object files (`.s` -> `.o`)
3. **ld65**: Links object files with the runtime library and linker config to produce the ROM (`.o` -> `.nes`)

The `-t nes` flag tells cc65/ca65 to target the NES platform, which affects register sizes, calling conventions, and available library functions.

---

### assets/ - Graphics Data

#### CHR files (.chr)

Raw binary files containing NES tile graphics. Each file is exactly 8192 bytes (8KB), containing 256 tiles.

Each tile is 16 bytes, encoding an 8x8 pixel image:
```
Bytes 0-7:   Bit plane 0 (low bit of each pixel's color)
Bytes 8-15:  Bit plane 1 (high bit of each pixel's color)
```

For each pixel, the two bit planes combine: `(plane1_bit << 1) | plane0_bit` gives a value 0-3. Value 0 is transparent (for sprites) or background color. Values 1-3 select from the assigned palette.

Tools for editing: YY-CHR, NES Screen Tool (NESST), or Tilemap Studio.

#### NAM files (.nam)

Nametable data - 1024 bytes defining a background screen:
- First 960 bytes: 30 rows x 32 columns of tile indices (which tile from the pattern table goes in each position)
- Last 64 bytes: Attribute table (assigns palettes to 2x2 tile groups)

#### PAL files (.pal)

Palette data - 16 bytes defining 4 palettes of 4 colors each. Each byte is an NES color value ($00-$3F).

---

## NES development concepts for teaching

### The frame loop

The NES renders at 60 frames per second (NTSC). The CPU has approximately 29,780 cycles per frame to do all game logic. The PPU draws the screen automatically from top to bottom, and there's a short "vertical blank" (vblank) period after it finishes the last scanline where it's safe to update video memory. `waitvsync()` blocks until this vblank period.

### Why 8-bit?

All variables are `unsigned char` (0-255) because the 6502 is an 8-bit CPU. Using `int` (16-bit) generates much slower code since every operation requires multiple instructions. This is a great teaching point about how hardware constraints affect programming.

### Memory-mapped I/O

There are no special "write to hardware" instructions. Instead, hardware devices appear at specific memory addresses. Writing `PPU_MASK = 0x1E` is literally the same as writing to a memory location - the hardware intercepts it. This is how most embedded systems work and is a fundamental computer architecture concept.

### Hexadecimal

The code uses hex extensively (0x3F, 0x12, etc.). NES development is a practical context for learning hex:
- Memory addresses are in hex
- Color values are in hex
- Tile indices map to a hex grid
- Hardware register bits are easier to read in hex

### Limitations as creative constraints

The NES's limitations (256 colors but only 25 on screen, 64 sprites max, 8 per scanline, 32KB code, etc.) force creative problem-solving. Commercial NES games achieved remarkable results within these constraints. These limitations make good design challenges for students.

---

## Future development roadmap

### Immediate next steps
1. **Background tiles**: Load a nametable to display platforms. Use the existing `.nam` placeholder files as a starting point.
2. **Tile-based collision**: Check the player's position against the background tile map to detect floors and walls.
3. **NMI handler + OAM DMA**: Replace direct OAM writes with a proper NMI interrupt handler that uses DMA ($4014) for reliable sprite updates. This requires a custom startup in assembly (reset.s) to replace nes.lib's crt0.

### Medium-term goals (Zelda 2 features)
4. **Horizontal scrolling**: Update PPU_SCROLL each frame, swap nametables when crossing screen boundaries.
5. **Enemies**: Add enemy sprites with patrol AI and player-enemy collision.
6. **Sword attack**: Add an attack animation and hitbox when pressing A/B.
7. **Health/damage system**: Track player and enemy HP, implement knockback.

### Advanced goals
8. **Sound effects**: Write to the APU registers ($4000-$4013) for square wave, triangle, and noise channels.
9. **Music**: Implement a simple music engine or use an existing one (like FamiTone).
10. **Bank switching**: Move to Mapper 1 (MMC1) for more code and graphics space.
11. **Overworld map**: Zelda 2's signature feature - a top-down map that transitions to side-scrolling action scenes.

---

## Useful references

- **NESdev Wiki** (nesdev.org/wiki): The definitive NES technical reference
- **cc65 documentation**: cc65.github.io/doc
- **NES color palette**: Search "NES palette" for visual charts of all 64 color values
- **NES Screen Tool (NESST)**: For editing tiles, nametables, and palettes
- **YY-CHR**: Another tile editor, good for viewing and editing CHR files
- **FCEUX debugger**: The emulator has built-in debugging tools (PPU viewer, nametable viewer, hex editor) - very useful for understanding what's happening
