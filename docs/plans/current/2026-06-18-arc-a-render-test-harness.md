# Arc A — Visual Render-Test Harness: Implementation Plan

> **Source.** Arc A of [`2026-06-18-next-phase-suggestions.md`](2026-06-18-next-phase-suggestions.md).
> A `.mjs` regression harness that boots compiled pupil ROMs in **jsnes**
> (headless, in Node) and asserts on **rendered output** — nametable tiles,
> OAM sprites, and the RGB framebuffer — closing the gap where
> `tools/builder-tests/run-all.mjs` only proves "the C compiled."

## 1. Goal & scope

### What the current suite proves
Every existing suite (`all-modules.mjs`, `chunk-a-hp-hud.mjs`, `dialogue-scroll.mjs`,
`shared-play.mjs`) loads the browser JS into a Node sandbox
(`globalThis.window = globalThis; new Function(fs.readFileSync(...))()`), builds a
`state` fixture, `POST /play` to a spawned `playground_server.py`, and asserts on
the **emitted C string** (`window.BuilderAssembler.assemble(s, tpl)`) or
**compile success** (`r.ok`, `r.size`, `r.stage`). The server already returns the
ROM bytes — `result["rom_b64"]` (browser mode) — and `dialogue-font.mjs:113`
decodes them to inspect **static CHR bytes**. But nothing **executes** the ROM.

### What it CANNOT prove (the bugs that reached pupils)
The three costliest pupil-reported bugs were all *runtime-visual* and invisible
to compile-only tests:
- **bug 33 (F5):** win/death tint flooded the screen green/blue — guarded today
  only by a *source-text* regex (`run-all.mjs` asserts `0x1E`, never `0x1F`); the
  regex can't see that the constant actually renders as a subtle emphasis, not a
  flood.
- **bug 31 (F1b/F23):** dialogue garbage — `dialogue-font.mjs` checks the glyph
  is non-zero in **CHR**, not that it **lands on screen** as readable pixels.
- **"I cannot see the text at all":** `dialogue-scroll.mjs` asserts the
  camera-relative C path is *present* and *compiles* — never that text pixels
  appear in the visible box on a scrolled map.

### Scope
A reusable `lib/render-harness.mjs` library + four backfill suites asserting on
the **rendered frame**: (1) dialogue text visible on a 2×1 scrolled map after
walking to an NPC + pressing B; (2) the win/death tint is a subtle emphasis, NOT
a full-screen flood; (3) a seeded font glyph renders as non-background pixels;
(4) a walker enemy stops at a wall (OAM X stays out of the wall column).
**Out of scope:** audio assertions, pixel-perfect golden images, any engine change.

## 2. Harness design — `tools/builder-tests/lib/render-harness.mjs`

ESM, no deps beyond Node built-ins + the repo's `jsnes.min.js`.

### 2.1 jsnes load (UMD via `createRequire`)
```js
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const jsnes = require(path.join(ROOT, 'tools/tile_editor_web/jsnes.min.js'));
// → { Controller, NES }  (verified empirically)
```
`loadROM` wants a **binary string** (the trap guarded for the browser pages —
`data.indexOf("NES")` returns -1 on a typed array), so the loader converts via
`String.fromCharCode` in ≤8 KB chunks (avoid the `apply` arg-count cap on 40 KB ROMs).

### 2.2 Server + build helpers (reuse the proven pattern)
- `startServer(port)` → spawn `python3 playground_server.py` with
  `PLAYGROUND_PORT`, pipe stdio into a `log`, caller awaits `sleep(1500)`.
- `loadBuilderModules(WEB)` → the `globalThis.window=globalThis; new Function(...)()`
  preamble for `sprite-render.js`, `builder-assembler.js`, `builder-modules.js`,
  `builder-validators.js`.
- `buildRom(port, payload)` → POST `/play`; on `r.ok` decode
  `Buffer.from(r.rom_b64,'base64')`. `payload` is the same object every suite
  sends (`{ state, playerSpriteIdx, playerStart, sceneSprites, mode:'browser', customMainC }`).

### 2.3 Emulator wrapper (frame-runner + input driver)
```js
export function openRom(jsnes, romBytes) {
  let lastFrame = null;
  const nes = new jsnes.NES({ onFrame: b => { lastFrame = b; }, onAudioSample: () => {} });
  nes.loadROM(toBinaryString(romBytes));
  return {
    nes,
    frame()        { nes.frame(); return lastFrame; },
    frames(n)      { for (let i=0;i<n;i++) nes.frame(); return lastFrame; },
    hold(btn)      { nes.buttonDown(1, btn); },
    release(btn)   { nes.buttonUp(1, btn); },
    tap(btn)       { nes.buttonDown(1, btn); nes.frame(); nes.buttonUp(1, btn); nes.frame(); },
    lastFrame()    { return lastFrame; },
  };
}
```
jsnes calls (verified empirically): `onFrame(buf)` hands back an **`Array(61440)`**
(256×240) of `0x00BBGGRR`; `nes.buttonDown(1, btn)` selects controller port 1;
`jsnes.Controller.BUTTON_B=1, BUTTON_RIGHT=7, BUTTON_A=0, BUTTON_UP=4, …`.

**Edge-trigger note (load-bearing):** the dialogue trigger is edge-detected
(`b_edge = (pad & 0x40) && !(bw_dialog_prev_b & 0x40)`), so a held B is consumed
on frame 1 — `tap(BUTTON_B)` (down → frame → up → frame) is the correct driver.

### 2.4 Readers
- **Nametable:** `nes.ppu.nameTable` is `Array(4)`, each `{ tile:Array(1024), attrib }`;
  `ntTile(nes, nt, row, col) = nameTable[nt].tile[row*32+col]`.
- **OAM:** `nes.ppu.spriteMem` is `Array(256)`, 64 sprites × `[Y, tile, attr, X]`
  (matching the engine's write order). `findSpriteByTile(nes, loTile, hiTile)`
  locates a sprite by tile range (robust to slot shifts from HUD/P2). Off-screen
  sprites clamp to `0xFF`.
- **Framebuffer:** `pixelAt(frame,x,y)=frame[y*256+x]`; `countNonBg(frame,x0,y0,x1,y1,bg)`;
  `dominantColor(...)` (modal colour + fraction, for the flood test);
  `distinctColors(...)`. The "background colour" is read empirically from a corner
  of the same frame so no jsnes palette RGB is hard-coded.
- Dialogue box screen region: rows 25.. → **y ≈ 200–216**, cols 2–29 → **x ≈ 16–240**.

## 3. Deterministic positioning (the hard problem)

The dialogue trigger fires only when, on a B-edge, the player and NPC **tile
centres** are within `BW_DIALOG_PROXIMITY` (default **2**, Manhattan). The
previous session's pain: physics makes the resting position non-obvious — gravity
pulls the player to the floor row (so resting `py` ≠ `playerStart.y`), and the
scene NPC also falls unless `ss_flying` is set.

**Options:** (A) flying NPC at the player's resting height + walk; (B) a test-only
teleport hook — **rejected** (adds test-only code to the byte-identical-gated
engine); (C) **both on a known flat floor, NPC flying, player started already
adjacent and at rest height — no walking.**

**Recommendation: Option C.** It uses only existing inputs (`playerStart`,
`sceneSprites` x/y, the sprite `flying` flag), needs no engine change, and deletes
the fragile horizontal-walk step. Resting Y is closed-form:
`py = foot_row<<3 - PLAYER_H<<3` (e.g. row-28 floor, 2×2 player → `py = 208`). A
flying NPC stays at its authored `ss_y` (set it = player resting `py` → `dy=0`),
placed 2 tiles right of the player centre. **Exact fixture:**
```js
behaviour[28][c] = 1 for all c;                 // SOLID_GROUND floor
const RESTING_PY = 28*8 - 2*8;                  // 208
playerStart = { x: 56, y: RESTING_PY };         // centre tile col 8
state.sprites[npcIdx].flying = true;            // → ss_flying[npc]=1
sceneSprites = [{ spriteIdx: npcIdx, x: 72, y: RESTING_PY }];  // centre tile 10, dx=2 → opens
state.builder.modules.dialogue.enabled = true;
// driver: h.frames(10); h.tap(BUTTON_B); h.frames(3);
```
Every quantity is a closed-form integer from the same shifts the engine uses — no
"walk N frames and hope." **(This deterministic-spawn helper is the de-risking
spike — task T4 — and the dependency that Arc B / Arc E lean on.)**

## 4. Regression suites to backfill

Each a standalone `.mjs` under `tools/builder-tests/` (unique ports 18784–18787),
importing `lib/render-harness.mjs`. `run-all.mjs`'s glob is non-recursive, so
`lib/` is **not** picked up as a suite — no filter change needed.

**(a) `render-dialogue-visible.mjs`** — the `dialogue-scroll.mjs` 2×1 state + the
Option-C positioning. Assert on the **framebuffer** (camera-correct):
`countNonBg(after, 16,200, 240,216, bg) > 150` (HELLO is hundreds of lit px) and
`< 30` before the press. Optional 1×1 cross-check: `ntTile(nes,0,25,2) === 0x48`
('H').

**(b) `render-tint-not-flood.mjs`** — a win-trigger or death fixture; after
`frames(60)`, assert `dominantColor(frame).fraction < 0.85` and
`distinctColors > 3`. This is exactly what the source-text guard literally cannot
do — it proves jsnes does NOT take the flood path.

**(c) `render-font-glyph.mjs`** — after opening the box, assert one glyph cell
(x∈[16,24), y∈[200,208)) has `8 ≤ lit ≤ 56` (a real letter, not blank or a solid
block) + `ntTile(nes,0,25,2) === 0x48`.

**(d) `render-walker-wall-stop.mjs`** — a walker enemy moving toward a `WALL`
column; track OAM X over ~200 frames, assert `maxX ≤ wallX - enemyW + 1` and
`maxX > enemyStartX` (it moved). Runtime counterpart to the `bw_sprite_blocked`
source guard.

## 5. Integration
`run-all.mjs` globs every top-level `.mjs` (except itself) and runs each in a
child process expecting exit 0 — the four `render-*.mjs` files auto-discover; the
`lib/` subdir is skipped. Cost ≈ **8 s** added (4 × ~1.5 s spawn + build +
emulate); optionally merge into one `render-all.mjs` later if CI time bites.
**Determinism:** jsnes is a cycle-stepped interpreter with no wall-clock/RNG — a
fixed ROM + fixed input → bit-reproducible frames; assertions use **thresholds**,
not golden images, so the only variability (jsnes palette RGB) doesn't flake. No
display/GPU, no `npm install`, no network.

## 6. Tasks, dependencies, risks

| # | Task | Effort | Depends |
|---|------|--------|---------|
| T1 | `lib/render-harness.mjs`: server + build helpers | 0.5 d | — |
| T2 | `lib`: `openRom` (jsnes load, frame/tap/hold) | 0.5 d | T1 |
| T3 | `lib`: readers (nt/OAM/framebuffer) | 0.5 d | T2 |
| T4 | **Positioning spike** (flying-NPC adjacent; confirm `tap(B)` opens box) | 0.5 d | T3 |
| T5 | `render-dialogue-visible.mjs` | 0.5 d | T4 |
| T6 | `render-tint-not-flood.mjs` | 0.5 d | T3 |
| T7 | `render-font-glyph.mjs` | 0.25 d | T4 |
| T8 | `render-walker-wall-stop.mjs` | 0.5 d | T3 |
| T9 | Wire into `run-all.mjs`; README | 0.25 d | T5–T8 |

**Critical path:** T1→T2→T3→**T4**→T5/T7; T6/T8 branch off T3. **≈ 4–4.5 days.**

**Risks:** (1) `String.fromCharCode.apply` arg cap → chunked conversion;
(2) resting-Y/proximity arithmetic must match the engine exactly (false failures)
→ T4 spike prints `px,py,ss_x,ss_y` and tunes once; (3) which OAM slot is the
NPC/enemy → `findSpriteByTile`, keep HUD/P2 off; (4) jsnes palette RGB
version-specific → all assertions relative; (5) scroll box lands NT0 or NT1 →
test (a) asserts framebuffer; (6) frames-for-tint-to-engage → T6 documents the
minimum; (7) the walk-to-NPC path itself is untested by Option C → optional
follow-up case holding RIGHT.
