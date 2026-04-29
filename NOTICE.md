# Third-party notices

This project (the NES Game Editor) is licensed under the MIT License
— see [LICENSE](LICENSE).  Several third-party components are
bundled or relied on; their original copyright notices and licences
are reproduced below.

## Bundled in this repository

### jsnes (in-browser NES emulator)

[`tools/tile_editor_web/jsnes.min.js`](tools/tile_editor_web/jsnes.min.js)

- Upstream: <https://github.com/bfirsh/jsnes>
- Licence: MIT
- Used by every editor page's embedded "▶ Play" dialog and by the
  Builder's preview-capture for the gallery.

### CodeMirror (code editor)

[`tools/tile_editor_web/codemirror.min.js`](tools/tile_editor_web/codemirror.min.js)
and the matching `codemirror-*.min.js` / `codemirror.min.css` files.

- Upstream: <https://codemirror.net/>
- Licence: MIT
- Used by the Code editor page.

### FamiStudio sound engine

`tools/audio/famistudio/famistudio_ca65.s` and
`tools/audio/famistudio/famistudio_cc65.h` are vendored verbatim from
<https://github.com/BleuBleu/FamiStudio> (`SoundEngine/`).  Shipped in
Phase 4.3 — see
[`docs/plans/archive/2026-04-26-audio.md`](docs/plans/archive/2026-04-26-audio.md)
for the implementation plan and
[`docs/guides/AUDIO_GUIDE.md`](docs/guides/AUDIO_GUIDE.md) for the
pupil-facing walkthrough.

- Upstream: <https://famistudio.org/>
- Author: Mathieu Gauthier (with substantial code from Shiru's
  FamiTone2)
- Licence (per the file headers): *"Copying and distribution of this
  file, with or without modification, are permitted in any medium
  without royalty provided the copyright notice and this notice are
  preserved in all source code copies. This file is offered as-is,
  without any warranty."*
- Used by the optional Audio module to play music + sound effects
  inside pupil ROMs.

The FamiStudio repository's *root* `LICENSE` is MIT.  The `ThirdParty/`
directory inside the FamiStudio repo includes some LGPL/GPL components
(NesSndEmu, NotSoFatso, ShineMp3) used by the FamiStudio desktop
**editor**; we do **not** vendor or link against any of those — only
the permissively-licensed `SoundEngine/` files.

## Build-time dependencies (not bundled)

### cc65 / ca65 / ld65 (NES toolchain)

- Upstream: <https://cc65.github.io/>
- Licence: zlib-style (permissive)
- Required to compile pupil ROMs.  Not redistributed by this project;
  pupils install it on their own machine.

### FCEUX (optional native emulator)

- Upstream: <https://fceux.com/>
- Licence: GPL-2.0
- Optional — the playground server detects whether `fceux` is on
  PATH and uses it for the *Local* play mode.  Not redistributed.

### FamiStudio desktop (separate install)

- Upstream: <https://famistudio.org/>
- Licence: MIT (root); LGPL/GPL for some `ThirdParty/` components
  used only by the editor binary.
- Pupils install FamiStudio separately to author music; we never
  redistribute the editor.  Only the FamiStudio sound-engine files
  are bundled (see above), and those carry the more-permissive
  notice quoted above.
