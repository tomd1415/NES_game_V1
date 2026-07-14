# nes_core — the embedded NES core

A small PyO3 binding around [`tetanes-core`](https://crates.io/crates/tetanes-core)
so the native Studio can run a ROM **inside its own CRT stage**, with audio,
instead of shelling out to FCEUX.

## Why this core

`tetanes-core` is **MIT OR Apache-2.0**, so the app stays permissively licensed.
Every mature libretro core (fceumm, nestopia, quicknes) and Mesen are GPL, and
would have forced GPL onto the whole product. `nes-py` has no APU; `cynes`
emulates the APU but emits no samples. Audio is non-negotiable here — the Studio
has a whole SOUND mode.

The core has no C or system dependencies, so this builds to a self-contained
`manylinux` abi3 wheel. **Target machines need no Rust, no compiler and no apt
packages** — which is the whole point for locked-down school images.

## API

Deliberately core-neutral — it exposes pixels and samples, nothing about tetanes.
Swapping the core should mean rewriting only `src/lib.rs`.

```python
from nes_core import Nes

nes = Nes(44100.0)                       # must match the QAudioSink sample rate
nes.load_rom(open("game.nes","rb").read())
nes.set_button(1, "right", True)         # player 1|2; up/down/left/right/a/b/start/select
pixels, samples = nes.clock_frame()      # 256x240 RGBA bytes, and this frame's f32 audio
```

## Two traps, both load-bearing

1. **Do not use tetanes' `clock_frame_into()`.** It does
   `audio_samples.copy_from_slice(&audio[..audio_samples.len()])`, which panics
   unless your buffer length exactly equals the samples produced — and NES
   samples-per-frame varies (733/734/735 at 44.1 kHz). We call `clock_frame()` +
   `frame_buffer_into()` and copy a variable-length `audio_samples()`.

2. **Alpha is zero.** tetanes leaves the fourth byte at 0, so
   `QImage.Format_RGBA8888` renders a fully transparent (white) screen. Use
   **`QImage.Format_RGBX8888`**, which treats it as padding and forces opaque.

## Measured

Against the real gallery ROM, release build:

- **119 fps** — 8.43 ms/frame against a 16.67 ms budget, i.e. ~2x headroom.
- Audio: 733.5 samples/frame at 44.1 kHz (expected 735).
- Qt blit + 2x scale costs 0.26 ms/frame, so Python can comfortably drive the loop.

## Build

Needs Rust >= 1.85 (`tetanes-core`'s MSRV) on the *build* machine only.

```bash
pip install maturin
maturin build --release --out dist
pip install dist/nes_core-*.whl
```

The built wheel is vendored in `dist/` so the app can be installed without a Rust
toolchain.

## Licences

This crate is MIT. It links `tetanes-core` (MIT OR Apache-2.0); we take the MIT
arm. Attribution is the one obligation MIT imposes — keep the upstream licence
text vendored alongside the wheel.
