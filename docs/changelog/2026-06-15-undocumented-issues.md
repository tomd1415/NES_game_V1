# Undocumented issue sweep - 2026-06-15

Follow-up review after the existing
[`2026-06-15-bug-sweep.md`](2026-06-15-bug-sweep.md).  The earlier
sweep already documents the deferred >2x2 scroll streamer, the
`screen-shake-on-landing` snippet, the CHR-bank/header mismatch, and the
dialogue scroll-position follow-up, so those are not repeated here.

Verification performed:

- `node tools/builder-tests/run-all.mjs` passes when allowed to use the
  local test servers.
- The shipped asm starter still builds through the `customMainAsm` path.
- A small asm build that references `ROLE_HUD` fails with
  `Symbol 'ROLE_HUD' is undefined`, confirming the C/asm include drift
  below.

## Newly documented open issues

### 1. Audio page disables music-only preview

The backend and shared play pipeline now support song-only projects:
`play-pipeline.js` sends `audioSongsAsm` when songs exist, and the
server auto-stubs the missing sfx side.  However `audio.html` disables
the Preview button whenever `state.audio.sfx` is missing, even if songs
are present.

Impact: pupils who upload only a song cannot preview it from the Audio
page, despite the build pipeline being able to compile and play a
music-only ROM.

Likely fix: in `tools/tile_editor_web/audio.html`, enable Preview when
`songs.length > 0`, not only when an sfx pack exists.  Keep the no-song
case disabled.

References:

- `tools/tile_editor_web/audio.html` - `previewBtn.disabled = !state.audio.sfx`
- `tools/tile_editor_web/play-pipeline.js` - song-only payload support

### 2. Code and Sprites page emulators are silent for audio projects

The shared emulator (`tools/tile_editor_web/emulator.js`) wires
`onAudioSample` into Web Audio and is used by Builder, Backgrounds,
Behaviour, and Audio preview.  The duplicated emulators in
`code.html` and `sprites.html` construct `jsnes.NES` without an
`onAudioSample` callback.  `sprites.html` even carries a comment saying
audio is silent for v1.

Impact: audio-enabled projects can sound correct on Builder/Audio but
appear broken or silent when launched from Code or the Sprites
Playground dialog.

Likely fix: retire the duplicated Code/Sprites emulator implementations
or port the shared emulator's audio ring-buffer path into them.

References:

- `tools/tile_editor_web/code.html` - `new jsnes.NES({ onFrame, ... })`
  without audio
- `tools/tile_editor_web/sprites.html` - `onAudioSample: silence for v1`
- `tools/tile_editor_web/emulator.js` - working shared audio path

### 3. Code page browser emulator cannot control Player 2

The shared emulator maps the I/J/K/L cluster plus O/U/1/2 to controller
2.  The Code page's private emulator only maps controller 1 and always
calls `buttonDown(1, ...)` / `buttonUp(1, ...)`.

Impact: a P2-enabled project can compile from the Code page, but Player
2 is uncontrollable in the in-browser Code preview.  Builder,
Backgrounds, and Behaviour do not have this problem because they use the
shared emulator.

Likely fix: either switch Code page preview to `NesEmulator.open(...)`
or mirror the shared emulator's controller-2 mapping.

References:

- `tools/tile_editor_web/code.html` - `EMU_KEY_MAP` and `buttonDown(1, ...)`
- `tools/tile_editor_web/emulator.js` - `mapCode()` returns `pad: 2`
  for P2 keys

### 4. `scene.asminc` omits `ROLE_HUD`

`build_scene_inc()` emits `#define ROLE_HUD 10` for C, and
`ROLE_CODES` can encode HUD sprites as role 10.  `build_scene_asminc()`
only defines roles 0..9 (`ROLE_PLAYER` through `ROLE_OTHER`), so asm
code cannot use the `ROLE_HUD` name even though `ss_role` can contain
that value.

Impact: asm pupils filtering `ss_role` by `ROLE_HUD` get a ca65 build
error.  The equivalent C code compiles.

Likely fix: add `.define ROLE_HUD 10` to `build_scene_asminc()` and add
a regression guard for C/asm role-code parity.

References:

- `tools/playground_server.py` - `build_scene_asminc()` role table
- `tools/playground_server.py` - `build_scene_inc()` includes `ROLE_HUD`

### 5. Code page build-log links do not recognise asm files

`renderBuildLog()` only linkifies diagnostics matching `.c`, `.h`, or
`.inc`.  ca65 diagnostics for Code-page asm builds use `src/main.s(...)`
and may also point at `.asminc` files.

Impact: asm errors still appear in the log, but pupils cannot click the
file/line location to jump to the failing line.

Likely fix: extend the regex to include `.s`, `.asm`, and `.asminc`.

Reference:

- `tools/tile_editor_web/code.html` - build-log regex

### 6. Builder feedback loses its page tag

`builder.html` mounts the shared feedback widget with `page: 'builder'`,
but the server allow-list only accepts `index`, `sprites`,
`behaviour`, and `code`.  The submission is still saved, but the page
field is blanked.

Impact: teacher triage cannot distinguish Builder feedback from
unknown-page feedback in `/feedback`.

Likely fix: add `builder` to `FEEDBACK_PAGES`; consider adding any
future pages that mount `feedback.js`.

References:

- `tools/tile_editor_web/builder.html` - feedback mount uses
  `page: 'builder'`
- `tools/playground_server.py` - `FEEDBACK_PAGES`

### 7. Non-`/play` POST handlers do not guard bad `Content-Length`

`/play` catches non-numeric `Content-Length` and returns clean JSON.
The feedback and gallery POST handlers still call `int(...)` directly.

Impact: malformed requests to `/feedback`, `/feedback/handled`,
`/gallery/publish`, or `/gallery/remove` can throw out of the handler
instead of returning the same clean `400` JSON shape used by `/play`.
This is low risk for normal browser use, but it is inconsistent with
the hardened `/play` path.

Likely fix: share a small request-body reader across POST handlers, or
copy the `/play` `try/except ValueError` guard into these endpoints.

References:

- `tools/playground_server.py` - `_feedback()`
- `tools/playground_server.py` - `_gallery_publish_response()`
- `tools/playground_server.py` - `_gallery_remove_response()`

