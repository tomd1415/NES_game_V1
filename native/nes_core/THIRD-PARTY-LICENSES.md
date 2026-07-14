# Third-party licences

`nes_core` is MIT (see the repository `LICENSE`). It statically links the
following, whose attribution notices must ship with any distribution of the wheel.

## tetanes-core

The embedded NES emulator. Licensed **MIT OR Apache-2.0**; we take the MIT arm.

Source: <https://github.com/lukexor/tetanes> · <https://crates.io/crates/tetanes-core>

```
MIT License

Copyright (c) 2021 Luke Petherbridge <me@lukeworks.tech>

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## PyO3

The Python binding layer. Licensed **Apache-2.0**.

Source: <https://github.com/PyO3/pyo3> — full licence text at
<https://www.apache.org/licenses/LICENSE-2.0>

## Transitive Rust dependencies

`tetanes-core`'s dependency tree (`bitflags`, `flate2`, `rand`, `serde`,
`thiserror`, `tracing`, `bincode`, `cfg-if`, `dirs`, …) is uniformly MIT and/or
Apache-2.0. There is **no GPL or LGPL anywhere in the tree** — that is the reason
this core was chosen over every libretro option. Regenerate the full list with:

```bash
cargo install cargo-license && cargo license
```

> Keeping this file accurate is a licence obligation, not housekeeping. If the
> core is ever swapped, re-check it: every mature libretro NES core (fceumm,
> nestopia, quicknes — GPLv2; Mesen — GPLv3) would relicense this product.
