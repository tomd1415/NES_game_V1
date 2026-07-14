# WASM browser emulator — spike & implementation plan

**Status:** exploratory / not scheduled. **Decision-gated** — do not build
speculatively; start at Phase 0 only when a concrete need appears.

**Context:** in-browser play currently uses **jsnes** (pure JavaScript) wrapped
by [`tools/tile_editor_web/emulator.js`](../../../tools/tile_editor_web/emulator.js).
This plan covers swapping/augmenting it with a **WebAssembly NES core** for
higher emulation accuracy, while keeping everything client-side. (Server-side
fceux streaming was considered and rejected — see the 2026-06-22 changelog
entry: heavy, laggy, mute, doesn't scale.)

---

## 1. Motivation and the decision gate

The games this maker emits are simple: NROM / mapper 0, stock PPU/APU usage
(see `steps/Step_Playground`). jsnes handles that class well and already has
audio + 2-player input. So **the accuracy payoff today is low**. Only pursue
this if one of these is genuinely true:

- a real jsnes rendering/timing/audio bug that pupils actually hit, that we
  can't fix in jsnes;
- we start emitting ROMs that use mappers/features jsnes mishandles (e.g. a
  future "bigger games" arc with bank-switching);
- we want features jsnes lacks and pupils would value: accurate APU/audio,
  save-states / rewind, deterministic frame timing.

**Phase 0 is a written decision gate** (below). If none of the above is
concrete, stop — jsnes + "⬇ Download ROM → local fceux" already covers the need.

## 2. Goals / non-goals

**Goals**

- Higher-accuracy emulation, still 100% client-side (zero install, scales to a
  whole class for free).
- Preserve what works: audio, P1/P2 input, the shared play UI, graceful
  fallback, and the headless test culture.
- A clean **fallback to jsnes** when WASM fails to load or underperforms.

**Non-goals**

- Server-side emulation / streaming (rejected).
- Networked play (parked).
- Bundling full RetroArch.

## 3. Candidate cores

Evaluate each against: **accuracy · WASM maturity · bundle size · audio · ⚠
license · maintenance · API ergonomics · perf on weak hardware** (old PCs /
Chromebook-class — the classroom reality).

| Core | Notes | Accuracy | License |
|---|---|---|---|
| **jsnes** (baseline) | keep as the fallback core | OK for mapper 0 | GPL — confirm version |
| **libretro `nestopia`** (wasm) | mature emscripten builds; accurate | High | GPL |
| **libretro `fceumm`** (wasm) | FCEUX-derived; matches our native fceux | High | GPL |
| **libretro `quicknes`** (wasm) | fast, smaller, less accurate | Medium | GPL |
| **Mesen2** (wasm) | most accurate; heaviest | Very high | GPL(v3) |
| **FCEUX** (emscripten) | parity with our native path; experimental | High | GPL |

**Licensing is the biggest gating factor.** The editor is distributed as static
files, so a GPL core imposes GPL obligations (offer corresponding source).

> **⚠ CORRECTION (2026-07-14).** Two claims in the paragraph that used to be here
> were wrong, and they inverted the conclusion:
>
> - **jsnes is Apache-2.0, not GPL** (verified at `github.com/bfirsh/jsnes`). The
>   table row below is also wrong. The project today is cleanly **MIT + Apache-2.0**.
>   So adding a GPL core would be *new* copyleft contamination, not "changes
>   little" — this is a real decision, not a formality.
> - **"A permissive NES core barely exists" is false.** `tetanes-core` (Rust) is
>   **MIT OR Apache-2.0**, actively maintained, with a full APU and a headless
>   sample-output API; `plastic_core` (MIT, Rust) is a second. The native app now
>   embeds tetanes-core — see
>   [`2026-07-14-native-build-plan.md`](2026-07-14-native-build-plan.md).
>
> If this spike is ever revived for the *web*, re-evaluate against a permissive
> WASM build of tetanes rather than assuming GPL is already conceded.

**Lean:** a single **libretro core (`nestopia` or `fceumm`)** loaded via a thin
JS glue file is the pragmatic balance (maintained, modest size, good audio).
**Mesen2** if maximum accuracy is the explicit goal. Decide in Phase 0 by
running the actual problem ROM through 2–3 candidates.

## 4. Architecture — the integration seam

`emulator.js` already isolates the emulator: it owns the dialog, CSS,
`mapCode()` (P1/P2 keyboard mapping), the Web Audio context, the mute UI and the
frame loop in `open(rom, opts)`. **Only the core (`jsnes.NES`) needs to change.**

Define a minimal **Core interface** and make `open()` talk to it:

```
Core {
  load(romBytes): void
  frame(): void                 // advance one frame
  framebuffer(): Uint8ClampedArray // 256x240 RGBA (or a known format we blit)
  setButton(pad /*1|2*/, button, pressed): void
  audio(): Float32Array | null  // PCM since last frame (or push to a ring buffer)
  reset(): void
  // optional: saveState()/loadState()
}
```

- **Step 1:** wrap the existing jsnes usage as `JsnesCore` implementing this
  interface — pure refactor, no behaviour change.
- **Step 2:** add `WasmCore` implementing the same interface over the chosen
  emscripten module.
- `open()` picks a core (feature-detect + opt-in), everything else (input,
  audio routing, canvas, mute) stays core-agnostic.

This refactor is independently valuable: it tidies `emulator.js` and enables
A/B + parity testing regardless of whether we ship the WASM core.

## 5. Wiring points (files to touch)

- `emulator.js` — introduce the Core interface; adapt the canvas blit (WASM
  framebuffer format may differ from jsnes) and the audio source (PCM →
  AudioWorklet). Reuse `mapCode()` unchanged, translating to the core's button
  constants.
- New assets — `core.wasm` + `core.js` glue (vendored, version-pinned) and a
  small loader. **Lazy-load** them only when the accurate core is selected.
- `jsnes.min.js` — stays (fallback core).
- `play-pipeline.js` — unchanged. `play()`'s browser branch still hands ROM
  bytes to `emulator.open`; the swap is *below* `open()`.
- Pages (index/sprites/behaviour/builder/code/audio/gallery) — unchanged; they
  use the shared emulator.
- `playground_server.py` — dev already serves `.wasm` as `application/wasm`
  (verified on Python 3.13). No change expected, but add an explicit
  `extensions_map['.wasm']='application/wasm'` belt-and-braces for older Pythons.
- **Production nginx** — ensure `mime.types` maps `.wasm → application/wasm`
  (modern nginx does), serve it without breaking the `Content-Type`, cache it,
  and deploy as a unit. (Same deploy discipline as the rest of the editor.)

## 6. Audio

WASM cores emit raw PCM. Route it through **Web Audio via an `AudioWorklet`**
(preferred; `ScriptProcessorNode` only as a fallback), matching jsnes's
sample-rate handling and keeping the existing mute UI. NES audio matters here
specifically — there's a whole Audio editor — so audio parity is a hard
requirement, not a nice-to-have.

## 7. Input

Reuse the existing P1/P2 keyboard scheme from `mapCode()` (arrows/F/D/Enter/…
for P1; I/K/J/L/O/U/… for P2), translating to the core's button constants. Keep
the behaviour the `emulator-p2-keys.mjs` test pins. Optional bonus: Gamepad API.

## 8. Testing (must match the project's test culture)

- **Headless ROM tests stay on jsnes-in-Node** (`render-harness.mjs`,
  `render-*.mjs`) — they validate *ROM behaviour*, independent of the browser
  core. No change, and the **byte-identical-ROM invariant is untouched** (this
  work never touches ROM generation).
- **New parity test:** run the same project ROM through `JsnesCore` and
  `WasmCore` for N frames and compare framebuffers at checkpoints (within a
  tolerance). Proves the swap is observably equivalent for *our* ROMs.
  emscripten modules run in Node, so this can be headless.
- **New Playwright smoke:** load a page, build+run a ROM with the WASM core,
  assert a non-blank frame, the audio context resumes, and P1/P2 input changes
  a pixel.
- **Perf gate:** measure 60 fps on a low-end (Chromebook-class) device; if the
  frame budget is blown, fall back to jsnes.

## 9. Rollout phases (rough effort)

- **Phase 0 — decision gate (~0.5d):** write the concrete jsnes gap; run the
  problem ROM through 2–3 candidates; pick one (or stop). Output: a short
  decision note appended here.
- **Phase 1 — Core refactor (~1d):** extract the Core interface; `JsnesCore`
  as default; ship with no behaviour change; unit-test the interface. *Low risk,
  worth doing opportunistically.*
- **Phase 2 — WasmCore video (~2–3d):** vendor + load the licence-cleared core;
  video only; behind a hidden flag; parity test green.
- **Phase 3 — audio (~1d):** AudioWorklet PCM path + mute parity.
- **Phase 4 — input + save-states (~1d):** P1/P2 wired; optional save/rewind.
- **Phase 5 — opt-in + fallback (~1d):** feature-detect WASM; add an "Accurate
  emulator (beta)" choice in the play UI; jsnes fallback; perf gate.
- **Phase 6 — harden + ship (~1d):** Playwright smoke; docs (TEACHER_GUIDE +
  changelog); decide default-on.

**Total if pursued:** ~1–1.5 weeks. Phases 0–1 are low-risk and independently
useful; everything after is gated on Phase 0 finding a real need.

## 10. Risks & mitigations

- **License (GPL) on a distributed editor** — *biggest gating risk.* Mitigation:
  confirm jsnes is already GPL (very likely), pick a GPL-compatible core, keep
  source available. If we are already GPL, this is a non-issue.
- **Bundle size on a school LAN** — lazy-load the core only when chosen; cache
  aggressively; pick a smaller core if size hurts.
- **Perf on weak hardware** — AudioWorklet not ScriptProcessor; perf gate +
  jsnes fallback; consider `quicknes` if accuracy can flex.
- **`.wasm` serving (dev + prod)** — explicit MIME mapping; verify nginx.
- **Test divergence (tests use jsnes, prod uses WASM)** — the parity test
  bridges it; keep jsnes as the headless oracle.
- **Maintenance of a vendored WASM blob** — pin a version; document the rebuild
  / update steps next to the asset.

## 11. Recommendation

Don't build speculatively. **Phase 1 (the Core refactor) is worth doing
opportunistically** — it cleans up `emulator.js` and unlocks A/B + parity tests
with zero user-facing change. Trigger **Phase 0** the moment a concrete jsnes
limitation is hit, then continue only if Phase 0 confirms the gap. Weight
**licensing** heavily in the core choice, and prefer the least-effort core that
closes the specific gap.
