# Fix plan for undocumented issues - 2026-06-15

Companion to
[`2026-06-15-undocumented-issues.md`](2026-06-15-undocumented-issues.md)
and the remaining-work section of
[`2026-06-15-bug-sweep.md`](2026-06-15-bug-sweep.md).

## Implementation status (updated 2026-06-15)

**Issues 1–7 are now fixed and verified.**  Issues 8–11 remain deferred
(architectural or needing a design/UX decision — see the per-item notes
and the deferred list in `2026-06-15-bug-sweep.md`).

| # | Issue | Status | File(s) |
| - | ----- | ------ | ------- |
| 1 | Audio page music-only preview | ✅ fixed | `audio.html` |
| 2 | Code/Sprites emulator audio | ✅ fixed | `code.html`, `sprites.html` |
| 3 | Code page Player 2 controls | ✅ fixed | `code.html` |
| 4 | `ROLE_HUD` asm parity | ✅ fixed | `playground_server.py` |
| 5 | Clickable asm build-log locations | ✅ fixed | `code.html` |
| 6 | Builder feedback page tag | ✅ fixed | `playground_server.py` |
| 7 | Bad `Content-Length` handling | ✅ fixed | `playground_server.py` |
| 8 | Scroll streamer beyond 2×2 | ⏸ deferred (T3.1/T3.2) | engine |
| 9 | `screen-shake-on-landing` snippet | ⏸ deferred (engine plumbing vs byte-identical baseline) | engine/snippet |
| 10 | `nes.cfg` CHR/header mismatch | ⏸ deferred (would change ROM bytes / break byte-identical test) | `cfg/nes.cfg` |
| 11 | Dialogue text position while scrolled | ⏸ deferred (needs UX decision; camera-snap half already fixed) | engine |

**What changed for 1–7:**

- **1** — `audio.html` `render()` now sets `previewBtn.disabled = false`
  whenever songs exist (was `!state.audio.sfx`), so song-only projects
  preview.  No-song case still disabled.
- **2** — `code.html` and `sprites.html` now build `jsnes.NES` with a
  `sampleRate` + `onAudioSample` ring buffer and drain it through a
  `ScriptProcessorNode`, mirroring the shared `emulator.js` path.  Audio
  starts in `openEmulator` (the Play-click gesture) and is torn down in
  `closeEmulator`.  Purely additive — video/input unchanged.
- **3** — `code.html` `EMU_KEY_MAP` entries became `{pad, button}` and
  gained the shared P2 keys (`IJKL` move, `O`=A, `U`=B, `1`=Start,
  `2`=Select); `onEmuKey` dispatches with `m.pad`.  P1 (arrows/WASD/ZX)
  unchanged; the controls hint gained a P2 line.
- **4** — `build_scene_asminc()` now emits `.define ROLE_HUD 10`, matching
  `build_scene_inc()`.  Verified: C and asm role tables are now identical.
- **5** — the build-log regex accepts `.s`, `.asm`, `.asminc` as well as
  `.c/.h/.inc`, so ca65 diagnostics are clickable.
- **6** — `FEEDBACK_PAGES` gained `"builder"` (the only page that mounted
  the widget with an unlisted tag; audio/gallery don't mount it).
- **7** — a shared `Handler._read_json_body(max_bytes)` helper now wraps
  the `int(Content-Length)` in `try/except ValueError`; `/feedback`,
  `/feedback/handled`, `/gallery/publish`, and `/gallery/remove` use it.
  `/play` kept its own (already-hardened) guard.

**Verification:** `node tools/builder-tests/run-all.mjs` passes (incl. the
byte-identical-ROM invariant); a C/asm `ROLE_*` parity check passes; and a
live malformed-`Content-Length` POST to all four handlers now returns a
clean `400` instead of throwing.  Issues 1/2/3/5 are browser-UI changes
with no headless harness — syntax-checked and code-reviewed; manual
browser confirmation recommended (preview a song-only project; play an
audio project from Code and Sprites; drive P2 from the Code preview).

---

The remainder of this document is the original repair plan (kept for the
deferred items 8–11 and the regression-test ideas).

## Goals

- Fix the seven newly documented open issues and the previously known
  unfixed issues from the earlier bug sweep.
- Keep the high-risk architectural items staged separately from the
  smaller editor/server fixes.
- Prefer shared emulator and server helpers over more duplicated page
  logic.
- Add regression coverage for each issue so the same drift does not
  return quietly.

## Proposed fix order

### 1. Audio page music-only preview

Problem: Audio preview is disabled unless an sfx pack exists, even
though song-only builds now work.

Fix:

- In `tools/tile_editor_web/audio.html`, enable `btn-preview` when
  `state.audio.songs.length > 0`.
- Keep it disabled when no songs exist.
- Keep the server-side song-only auto-stub path unchanged.

Regression test:

- Add a text or browser-state guard that checks Audio preview is not
  tied to `state.audio.sfx`.
- Extend `tools/builder-tests/audio.mjs` or add a small static guard in
  `run-all.mjs` that fails if `audio.html` contains
  `previewBtn.disabled = !state.audio.sfx`.

### 2. Code and Sprites page emulator audio

Problem: Code and Sprites use private emulator implementations that do
not wire `onAudioSample`, so audio projects are silent there.

Fix:

- Prefer routing Code and Sprites preview through
  `tools/tile_editor_web/emulator.js` if the page UX can stay intact.
- If a full swap is too risky, copy the shared emulator's Web Audio
  ring-buffer path into both private emulators as an interim fix.
- Keep the shared emulator as the long-term source of truth.

Regression test:

- Add static guards that fail if `code.html` or `sprites.html`
  constructs `new jsnes.NES(...)` without `onAudioSample`.
- Add an end-to-end smoke later, if Playwright coverage is added, that
  builds an audio-enabled ROM from Builder, Code, and Sprites and
  verifies the emulator path receives audio samples.

### 3. Code page Player 2 controls

Problem: Code preview sends all keyboard input to controller 1. Player 2
cannot be controlled from that page.

Fix:

- Extend `tools/tile_editor_web/code.html` with the same controller-2
  mappings as the shared emulator:
  `I/J/K/L` for movement, `O` for A, `U` for B, `1` for Start, `2` for
  Select.
- Change the key handling so mapped keys carry both `pad` and `button`,
  then call `buttonDown(mapped.pad, mapped.button)` and
  `buttonUp(mapped.pad, mapped.button)`.

Regression test:

- Add a static guard in `tools/builder-tests/run-all.mjs` checking
  `code.html` contains controller-2 mappings and calls `buttonDown(2`
  or equivalent pad-aware dispatch.
- If the Code page later moves to the shared emulator, replace this
  guard with a check that it calls `NesEmulator.open(...)`.

### 4. `ROLE_HUD` parity for asm includes

Problem: C `scene.inc` exposes `ROLE_HUD`, but asm `scene.asminc` does
not.

Fix:

- Add `.define ROLE_HUD 10` to `build_scene_asminc()` in
  `tools/playground_server.py`.
- Keep the value aligned with `ROLE_CODES` and `build_scene_inc()`.

Regression test:

- Add a server-level test or `run-all.mjs` guard that compares role
  constants emitted by `build_scene_inc()` and `build_scene_asminc()`.
- Add a targeted asm build test that includes `scene.asminc` and
  references `ROLE_HUD`.

### 5. Clickable asm build-log locations

Problem: Code page build-log linkification only recognises C-style
files (`.c`, `.h`, `.inc`), so asm errors are not clickable.

Fix:

- Update `renderBuildLog()` in `tools/tile_editor_web/code.html` to
  recognise `.s`, `.asm`, and `.asminc` diagnostics as well.
- Keep existing C diagnostics clickable.

Regression test:

- Add a static guard that the build-log regex includes asm extensions.
- Better: extract the log-line parser into a tiny testable helper and
  assert these all linkify:
  - `src/main.c(12): Error: ...`
  - `src/main.s(12): Error: ...`
  - `src/scene.asminc(12): Error: ...`

### 6. Builder feedback page tag

Problem: Builder feedback is saved, but the server strips
`page: "builder"` because `builder` is missing from the allow-list.

Fix:

- Add `builder` to `FEEDBACK_PAGES` in `tools/playground_server.py`.
- Consider adding `audio` and `gallery` only if those pages mount
  `feedback.js` later.

Regression test:

- Add a lightweight server test for `/feedback` that posts
  `page: "builder"` and verifies the saved record keeps that page value.
- If avoiding filesystem writes in the main suite, add a static guard
  that every `Feedback.mountInto(... page: "...")` value appears in
  `FEEDBACK_PAGES`.

### 7. Consistent bad `Content-Length` handling

Problem: `/play` handles non-numeric `Content-Length` cleanly, but
feedback and gallery POST handlers call `int(...)` directly.

Fix:

- Add a shared helper such as `_read_json_body(max_bytes)` on the
  request handler.
- Use it from `/play`, `/feedback`, `/feedback/handled`,
  `/gallery/publish`, and `/gallery/remove`.
- Preserve current response shapes where possible:
  - `/play`: `{ ok: false, stage: "input", log: "..." }`
  - feedback/gallery: `{ ok: false, error: "..." }`

Regression test:

- Add server tests that send malformed or missing `Content-Length` to:
  - `/feedback`
  - `/feedback/handled`
  - `/gallery/publish`
  - `/gallery/remove`
- Verify each returns HTTP 400 with JSON, not an uncaught handler
  traceback.

## Previously known unfixed issues

These were already documented before the newer seven-issue sweep.  They
are included here so the repair plan covers all known open bugs in one
place.

### 8. Scroll streamer beyond the 2x2 cap

Problem: the current scroll engine is safe for the editor's present 2x2
limit because each visible nametable is pre-loaded, but the streamer is
not correct for larger worlds.  Known defects: row streaming reads the
wrong source columns, door swaps keep streaming from the old
background's world data, and newly streamed rows/columns do not stream
matching attribute bytes.

Fix:

- Extend the server-generated world data from one active
  `bg_world_tiles[]` / `bg_world_attrs[]` pair to per-background world
  arrays, or to pointer tables that can be swapped cheaply.
- Add `scroll_set_active_bg(n)` or an equivalent API in `scroll.c` so
  door transitions change the streamer's active tile/attribute sources.
- Re-prime `prev_cam_x` / `prev_cam_y` after a door-triggered room swap
  so the first streamed row/column after the swap does not reuse stale
  camera state.
- Rewrite row and column streaming source math so source coordinates are
  derived from absolute world tile coordinates, not always columns
  `0..31`.
- Add attribute streaming for the affected 4x4-tile attribute cells.
  Keep it cycle-budgeted so a tile burst plus attribute update cannot
  overrun vblank.

Regression test:

- Add server-generation tests for 3x1, 1x3, and 3x3 artificial worlds
  even if the UI still caps pupils at 2x2.
- Add a pathological multi-screen state where every screen uses unique
  tile IDs and palette IDs, then assert streamed source offsets point to
  the expected world screen.
- Add a door-swap test with two backgrounds whose same coordinates use
  different tile IDs; after `load_background_n()` and
  `scroll_set_active_bg()`, subsequent stream reads must come from the
  target background.
- Add a PPU-level or emulator screenshot regression when practical:
  scroll across a boundary and verify the newly revealed tiles and
  palettes match the source world.

### 9. `screen-shake-on-landing` snippet has no visible effect

Problem: the snippet writes `PPU_SCROLL` during active rendering.  The
engine then overwrites scroll state during its normal vblank path, so no
shake is visible.

Fix:

- Add a small engine-owned shake offset, for example
  `shake_x`, `shake_y`, and `shake_timer`, guarded so no-module builds
  stay byte-identical if required.
- Apply the offset only where the engine writes the final scroll values:
  the non-scroll `PPU_SCROLL = 0` path, `scroll_apply_ppu()`, and the
  lesson file that exposes the same snippet surface.
- Rewrite `snippets/screen-shake-on-landing.c` so it sets the shared
  shake timer/offset instead of writing PPU registers directly.
- Clamp the final scroll values so shaking near the world edge does not
  expose garbage nametable space.

Regression test:

- Add a snippet compile test that inserts `screen-shake-on-landing.c`
  into the starter and confirms it still builds.
- Add a static guard that the snippet no longer writes `PPU_SCROLL`
  directly.
- Add a small source guard that final scroll writes include the shake
  offset in both scroll and non-scroll paths.

### 10. `nes.cfg` CHR-region/header mismatch

Problem: `steps/Step_Playground/cfg/nes.cfg` declares a 16 KB CHR
region, while the iNES header advertises 8 KB.  The extra 8 KB is the
unused `NESfont`.  Current emulators tolerate it, but it is not a clean
ROM description.

Fix options:

- Preferred: remove the unused `NESfont` dependency from the no-audio
  and audio crt0 paths, then shrink the `CHR` memory region to 8 KB so
  the linker output and iNES header agree.
- Lower-risk fallback: keep the linker layout as-is but post-patch the
  iNES CHR bank count to match the emitted ROM.  This is less clean
  because it blesses the unused 8 KB instead of removing it.
- Re-check all `cfg/nes.cfg` copies under root and `steps/*/cfg/` so
  the fix does not only apply to Step_Playground.

Regression test:

- Add a ROM-header test that compares iNES byte 5 (CHR bank count)
  against the actual CHR payload size after the 16-byte header and PRG
  banks.
- Run the baseline byte-identical test only where byte identity is still
  expected; this conformance fix may intentionally change ROM bytes.
- Build the root sample, Step_Playground no-audio, and Step_Playground
  audio-enabled ROMs to catch crt0/linker regressions.

### 11. Dialogue text position while scrolled

Problem: the camera-snap part of the dialogue bug is fixed, but
dialogue text still writes to fixed nametable coordinates.  In a
scrolled world, that can put the text in the wrong on-screen location.

Fix:

- Choose the intended UX first:
  - world-anchored dialogue, where the text appears near the NPC in the
    scrolled world; or
  - HUD-style dialogue, where the text appears at a fixed screen row.
- For world-anchored text, compute the visible nametable address from
  `cam_x`, `cam_y`, row, and column before writing text.
- For HUD-style text, use a proper split/HUD strategy rather than
  writing fixed NT0 coordinates while the camera points elsewhere.
- Keep `draw_text()` and `clear_text_row()` restoring scroll via
  `scroll_apply_ppu()` after any PPU writes.

Regression test:

- Add a scrolling dialogue smoke test with a 2x1 or 1x2 world and an
  NPC away from the origin; verify opening dialogue does not move the
  camera and the text lands in the intended visible position.
- Add a source guard that dialogue helpers do not leave final
  `PPU_SCROLL = 0` writes in `SCROLL_BUILD`.
- Add a visual/manual checklist until automated PPU assertions exist:
  open dialogue at origin, near a horizontal boundary, and near a
  vertical boundary.

## Full verification before closing

Run:

```sh
node tools/builder-tests/run-all.mjs
```

Then run targeted checks that may not fit the existing suite yet:

- Build a `customMainAsm` ROM that references `ROLE_HUD`.
- Preview a song-only project from the Audio page.
- Preview an audio-enabled project from Builder, Code, and Sprites.
- Preview a P2-enabled project from the Code page and confirm P2 input
  reaches controller 2.
- Build artificial 3x1, 1x3, and 3x3 scroll-world fixtures if the
  scroll-streamer work is included.
- Verify dialogue in a scrolled world after the dialogue follow-up.
- Verify ROM header/CHR-size consistency if the `nes.cfg` conformance
  work is included.

## Suggested commit grouping

1. Audio preview and emulator parity.
2. Code page P2 controls and asm build-log linkification.
3. `scene.asminc` role parity.
4. Feedback/server request hardening.
5. Screen-shake snippet support.
6. Dialogue scrolled-position follow-up.
7. Scroll-streamer architecture beyond 2x2.
8. CHR/header conformance cleanup.
