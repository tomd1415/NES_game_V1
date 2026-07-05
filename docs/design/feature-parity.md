# Feature parity — what the Studio must not lose

> Compiled from a code audit of `tools/tile_editor_web/` (2026-07-05,
> `redesign/ui-ux`). This is the parity yardstick referenced by
> [`phased-plan.md`](phased-plan.md): **an old page retires only when its
> replacing mode(s) cover every line below** — or a line is consciously
> dropped and the decision recorded in `decisions/`.
>
> The biggest risk in collapsing seven mature pages into one Studio is
> not the new build; it is silently losing features the pages already
> have. This file makes that loss impossible to miss.

## Page → mode mapping

| Old page | Replaced by |
| -------- | ----------- |
| `index.html` (Backgrounds) | WORLD (nametable/metatiles) + TILES (8×8 editor) + PALS (BG palettes) |
| `sprites.html` | CHARS (sprites/animations) + TILES (8×8 editor) + PALS (sprite palettes) |
| `builder.html` | RULES (module tree) + WORLD (entity placement) + chrome (▶ PLAY, publish) |
| `behaviour.html` | WORLD (tile-type painting) + RULES (reactions matrix) |
| `audio.html` | SOUND |
| `code.html` | CODE |
| `gallery.html` | Home / Gallery screen |

---

## Backgrounds page (`index.html`)

**Nametable editing**
- [ ] Multiple named backgrounds per project: new / duplicate / rename / delete (delete blocked on last)
- [ ] Screen layouts: 1×1, 2×1, 1×2, 2×2 (scrolling worlds)
- [ ] Tools: paint tile · paint palette (2×2 block) · erase · flood fill · palette rectangle (drag) · select region (drag)
- [ ] Region copy/paste (buttons + Ctrl+C/V, hover-anchored paste)
- [ ] Zoom 1×–4×; resizable canvas area; hover cell coordinates
- [ ] Grid options: fine 8×8 grid (G), 2×2 attribute-chunk lines, line width, grid colour — persisted
- [ ] Universal background colour swatch (keyboard-accessible dialog)
- [ ] Pop-out floating tileset window (draggable, resizable, own zoom, previews in selected palette)
- [ ] Full-screen NES-aspect preview (F)
- [ ] Clear whole background (undoable)

**Metatile (16×16) mode** — Arc E §1, shipped
- [ ] Promote 8×8 background → metatile blocks (dedup into starter library); revert to 8×8
- [ ] Block library strip: select + click/drag-stamp whole blocks
- [ ] Block mini-editor: pick tile per corner; per-block palette (0–3) + behaviour — correct-by-construction attribute granularity
- [ ] New / delete block (cells fall back to block 0; last block protected)
- [ ] Client `expand` mirrors server `_expand_metatile_bg` byte-for-byte (preview = built ROM)

**Tileset panel**
- [ ] 16×16 grid of 256 BG tiles; empty slots show hex index; usage stats
- [ ] Drag-to-swap tiles with automatic remap of every nametable reference

**Tile editor (8×8)** *(consolidates into TILES mode with the sprites-page twin)*
- [ ] Paint with 4-value pen; Shift/right-click eyedropper; preview-palette choice; per-tile name; show-numbers overlay
- [ ] Ops: clear, flip H/V, rotate, duplicate-to-free-slot, copy, paste
- [ ] Keys: `[`/`]` step, arrows move selection, D/C/V/R/H/Shift+H/Del

**Dialogue glyph reservation** *(appears only when the dialogue module is on)*
- [ ] Reserved letter-tile slots rendered distinctly; conflict banner when painted over; per-slot "this is my art" confirm
- [ ] Reserved 🔒 BG palette 3 (read-only) for dialogue text

## Sprites page (`sprites.html`)

**Sprite management**
- [ ] New / duplicate / delete / rename; role filter; list with thumbnails + role chips
- [ ] Roles (all 11): player, npc, enemy, item, tool, powerup, pickup, projectile, decoration, hud, other
- [ ] "Flying (ignore gravity)" per-sprite flag
- [ ] Dimensions W×H in tiles (1–8 each), cells preserved on resize; auto-allocate tiles on grow

**Composition & drawing**
- [ ] Browse vs Paint mode toggle (M) — prevents accidental edits
- [ ] Tools: pencil, flood fill (crosses cell boundaries), line, rect outline/fill, circle outline/fill, select marquee — with live drag previews
- [ ] Marquee ops: copy/paste, rotate CW/CCW, flip H/V, scale ×2 / ÷2, clear, drag-to-move floating selection
- [ ] Per-cell attributes — **already true OAM shape**: tile, palette, flipH, flipV, priority (behind-BG), empty
- [ ] Minimap with per-cell palette pills; cell state banner with suggested next action
- [ ] Zoom 4×–32×, checkerboard + transparent-bg theme, cell/pixel grids
- [ ] Shared-tile conflict dialog: "also used by…" → Cancel / **Duplicate first** / Change everywhere
- [ ] Tile swap (drag) rewrites every sprite cell, animation frame *and* nametable reference
- [ ] Tileset colour-coding: free / in this sprite / shared / orphan; usage counts; right-click jump-to-user
- [ ] Pop-out tileset + pop-out palette windows (position persisted)

**Animations**
- [ ] Animation list: new / duplicate / rename / delete; fps (1–60); frame strip with reorder + remove
- [ ] Preview player with preview-only fps override
- [ ] Tagging (role × style: walk/jump/idle/die/attack/custom) with auto-wiring into walk/jump/attack assignments
- [ ] Explicit walk/jump/attack assignment dropdowns (the server-facing contract)
- [ ] Frame-size-mismatch warning (mismatched frames are dropped at build)
- [ ] Inline animation strip on the composition canvas ("start an animation with this sprite")

**Palettes & exports**
- [ ] SP0–SP3 editing (slot 0 locked transparent); master-grid hover preview; drag-drop assign; recent colours
- [ ] Read-only BG-palette reference panel
- [ ] Exports: `sprites.inc` (OAM byte arrays), `sprites.h` (externs + OAM bit macros)
- [ ] Partial import: sprites + sprite palettes + sprite tiles only (backgrounds untouched)

## Builder page (`builder.html`)

**Module tree** (all shipped, all config fields)
- [ ] Game type: 🏃 Platformer · 🧭 Top-down · 🏃‍➡️ Auto-runner (+autoscroll speed) · 🏎 Racer (+top speed, laps 1–9, ordered checkpoints 1–2) — one engine, `BW_GAME_STYLE` 0–3
- [ ] Globals: gravity, jump speed, walk-bob
- [ ] Player 1: start X/Y, walk speed, jump height, max HP, attack button (A/B → tagged Attack animation)
- [ ] Player 2: full config; controller 2; shared-keyboard mapping; "assist mode" (P1 invincible + P2 mortal) is a valid state
- [ ] Scene: instance list — click-to-place / drag on world preview, per-instance sprite, x/y, AI (static/walker/chaser), speed, per-NPC "💬 says" text; auto-place fallback when empty
- [ ] Pickups; Spawn effect on trigger (sprite + TTL); Damage (amount, i-frames, **checkpoints** with respawn HP, hit-effect sprite + TTL); HUD hearts; Doors (spawn X/Y, target background −1…9 = room swap); Dialogue (3×28 chars, proximity, pause, auto-close, per-NPC overrides, auto-seeded font); Walls-from-behaviour-map; Win condition (reach-tile × type, or collect-all-pickups)
- [ ] World preview canvas: all screens rendered with real art, screen-boundary lines, player-start handles

**Build & publish**
- [ ] Validators — all 29 rules, severity error/warn, per-problem jump-to-fix (this **is** the "Needs attention" engine)
- [ ] Live `main.c` preview; build log (last lines of cc65 output)
- [ ] ▶ Play (browser jsnes / native fceux, capability-gated); ⬇ ROM download
- [ ] 📤 Publish to gallery: title/description/handle, auto-captured preview PNG (60-frame headless run)
- [ ] Eject to Code (one-way `customMainC` handoff) — see quirks below
- [ ] ↻ Reset modules; byte-identical golden-ROM contract when defaults untouched

## Behaviour page (`behaviour.html`)

- [ ] Tile-type painting per background: 7 builtins (none, solid_ground, wall, platform, door, trigger, ladder) + **1 custom slot** (own colour + name)
- [ ] Tools: pencil, flood fill, rectangle, eraser; find-same highlight; show-tiles overlay; 16×16 snap; zoom 1×–6×
- [ ] **Sprite-reactions matrix**: per sprite × per tile-type → ignore / block / land / land_top / bounce / exit / call_handler; hero vs non-hero defaults
- [ ] Per-game-type slot overloading (trigger=checkpoint 1, ladder=checkpoint 2, slot 7=spike/finish) — a teaching hazard to fix, but the *capability* must survive

## Audio page (`audio.html`)

- [ ] FamiStudio `.s`/`.asm` song upload (button + drag-drop), per-song default star, remove
- [ ] One sfx pack (up to 128 slots) with slot listing
- [ ] Starter pack fetch (`/starter/audio`); remove-all
- [ ] ROM-size audit vs 32 KB budget with warning threshold
- [ ] Preview-song selector + Play in NES without visiting Builder

## Code page (`code.html`)

- [ ] CodeMirror C editor (dracula, active line, autocomplete over generated symbols, Ctrl+Space)
- [ ] **Guided mode** (only marked editable regions writable, region-jump chips) vs **Advanced mode** (whole file)
- [ ] Language toggle: C (`main.c`, cc65) / **6502 asm** (`main.s`, ca65) with separate autosaves
- [ ] Lessons library (server `/lessons`: difficulty, goals, hints, snapshot-before-load)
- [ ] Snippets library (server `/snippets`: insert-at-cursor, region-fit matching)
- [ ] Symbols reference dialog + hover tooltips (`palettes.inc`, `scene.inc` contract)
- [ ] Restore-default starter (snapshot first); build pill + full build log
- [ ] Redirect-to-Builder unless the project is ejected (`?stay=1` escape hatch)

## Gallery page (`gallery.html`)

- [ ] Card grid from `/gallery/list`: preview PNG, title, @handle, date, description
- [ ] ▶ Play in shared emulator; ⬇ ROM; ⬇ Project (remix — download the project JSON)
- [ ] Remove (currently unauthenticated — Phase 4 hardens this)

## Site-wide chrome & services

**Projects & persistence** (`storage.js`, `project-menu.js`)
- [ ] Multi-project catalog: switch / rename / new-with-template (platformer, top-down) / duplicate / delete
- [ ] Autosave on every change; snapshots every 30 s (keeps 8; help text says 5 — fix the text); emergency backups every 5 min (keeps 5); final save + snapshot on unload
- [ ] Reason-tagged snapshots (`auto_30s`, `before_import`, `before_recovery`, …); recovery dialog restores any slot **after snapshotting current state first**
- [ ] Optional auto-download `.json` backup every 5 min; Ctrl+S force save+snapshot; save-status dot
- [ ] Legacy→v2 migration with downloadable pre-upgrade backup; cross-tab catalog reconciliation; per-page flush hooks (debounced edits flushed before reload/switch)
- [ ] In-memory undo/redo (distinct from snapshots) on Backgrounds/Sprites/Behaviour

**Import / export**
- [ ] Full-project JSON save/open (round-trip)
- [ ] Partial imports: background-only, sprites-only
- [ ] Exports: `.chr` (8 KB, both pattern tables), `.nam` (960+64 B/screen), `.pal` (32 B), `my_tiles.txt` (Python cc65 pipeline), everything-at-once
- [ ] *(export-only today — Phase 3 adds matching imports + round-trip tests)*

**Play pipeline & emulator** (`play-pipeline.js`, `emulator.js`)
- [ ] Server `/play` cc65 compile → **real .nes ROM** (browser jsnes or native fceux, capability-probed, localhost-gated)
- [ ] Stub-player injection so brand-new projects build; state migration + audio packaging in the request
- [ ] Two-player keyboard maps (P1 arrows+F/D/Enter/RShift; P2 IJKL+O/U/1/2) sized for two pupils on one keyboard
- [ ] Emulator controls — the Studio needs the **union**: pause (P), reset (R), fullscreen (F), mute, close, P2 legend when wired (today split across three emulator variants; no gamepad/save-state support exists anywhere)

**Accounts** (`account-menu.js` + server, shipped P1/P2)
- [ ] Optional sign-in (silently absent if server lacks it); create-account gated on class **join code**; one-time **recovery code**; username-only (no real names/email)
- [ ] ☁ Save to account; ☁ Open from account (always additive — copies to a *new* local project)

**Inclusive chrome**
- [ ] Accessibility controls on every page: text size 100–175 %, high-contrast theme (persisted prefs)
- [ ] Help dialog per page (quick start, keyboard, NES rules, saving, FAQ) + cross-page help tabs
- [ ] First-run spotlight tours (replaced by quests — retire deliberately, not accidentally)
- [ ] Feedback form (category / message / optional name / optional project attach → `/feedback`)
- [ ] Cookie/storage notice; no tracking

## Known quirks worth fixing during the port (not preserving)

- Snapshot count: code keeps 8, user-facing text says 5 — align the text.
- "Eject to Code" silently leaves the Builder UI live but inert — replace with an explicit ejected state + return path (plan §1.5).
- Behaviour-slot overloading per game type (trigger/ladder/slot 7) — label per game type now, de-overload later (plan §3.4).
- Gallery Remove is unauthenticated (plan §4.2).
- Shared emulator lacks pause/reset/fullscreen that the Sprites/Code emulators have — consolidate to the union, not the intersection.
- Doors all share one spawn/target (plan §4.5).
