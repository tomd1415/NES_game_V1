# FamiStudio sound engine — vendored

The two source files in this directory (`famistudio_ca65.s`,
`famistudio_cc65.h`) are vendored verbatim from the FamiStudio
project's `SoundEngine/` directory.  They run inside every pupil's
NES ROM whenever the optional Audio module is enabled.

- **Version vendored:** 4.5.0 (see [VERSION.txt](VERSION.txt))
- **Upstream:** <https://github.com/BleuBleu/FamiStudio>
- **Project home:** <https://famistudio.org/>
- **Author:** Mathieu Gauthier (with substantial code from Shiru's
  FamiTone2 sound engine — see the comments at the top of
  `famistudio_ca65.s`)

## Licence

The two engine files carry their own permissive notice at the top of
each file:

> Copying and distribution of this file, with or without
> modification, are permitted in any medium without royalty provided
> the copyright notice and this notice are preserved in all source
> code copies. This file is offered as-is, without any warranty.

This is more permissive than MIT — we're allowed to redistribute,
modify, and sublicense, provided the copyright notice + this notice
stay in place.  Both file headers are preserved in the vendored
copies.

The FamiStudio repository's *root* `LICENSE` is MIT (Copyright (c)
2019 BleuBleu); a copy is in [`LICENSE`](LICENSE) for completeness.

## What we did NOT vendor

The FamiStudio repository contains a `ThirdParty/` directory with
LGPL/GPL components (NesSndEmu, NotSoFatso, ShineMp3) used only by
the **desktop editor**.  We do **not** vendor or link against any
of those — the engine files here are entirely self-contained and
copyleft-free.

## Refreshing this copy

When a new FamiStudio release ships, run:

```
tools/audio/famistudio/sync.sh /path/to/FamiStudio/repo
```

It overwrites `famistudio_ca65.s` and `famistudio_cc65.h` with the
upstream versions and bumps `VERSION.txt`.  Do **not** edit these
files by hand — local changes are clobbered on every sync.

## Also in this directory — `famistudio_crt0.s`

`famistudio_crt0.s` is a **derivative** of cc65 v2.18's
[`libsrc/nes/crt0.s`](https://github.com/cc65/cc65/blob/V2.18/libsrc/nes/crt0.s)
(BSD-licensed; copyright Groepaz / Hitmen and Ullrich von
Bassewitz).  We replace cc65's stock NES crt0 only when
`USE_AUDIO=1` because cc65's stock NMI handler offers no project-
level hook — without our copy, `famistudio_update` cannot fire
from the hardware vblank interrupt.  See the file header for the
full reasoning.

The cc65 source carries the standard zlib-style "altered source
versions must be plainly marked" notice; the modifications we
make (a single `jsr _famistudio_update` in the NMI handler plus
explanatory comments) are flagged at the top of the file.

cc65 itself is not vendored here — we still rely on the
system-installed `cc65 v2.18` package for the rest of `nes.lib`.
This file is the *only* part of cc65 that lives in our tree.
