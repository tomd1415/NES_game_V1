# Porting `main`'s engine advances forward — the real shape of work-list item 5

*Written 2026-08-27, after the merge attempt of 2026-08-14 was aborted. It replaces
that item's framing ("merge `origin/main`, resolve the collisions") with what the work
actually is, and corrects two claims of mine that made it look bigger than it is.*

## The state, measured rather than remembered

`main` is **133 commits** ahead. Of the 78 engine snapshots on this branch, **75 are
byte-identical to `main`'s** and exactly three collide — `v76`, `v77`, `v78`. That is
now asserted, not described: `tools/engines/main-manifests.json` plus
`tools/builder-tests/lib/snapshot-collisions.mjs`, wired into `run-all.mjs`. So the fork
is at v75 and the damage is three versions wide; both were previously stated from memory
of what each side had bumped.

`main` has since published a **v79** as well, so this branch's next free number is
**v80** — and it will not stay free either. Renumbering is not a one-off: it is a race
this branch loses a little more every week it stays diverged.

## Correcting myself: the blocker is narrower than I published

The 2026-08-14 abort note, the handoff and `.mc-outbox.md` all say that three of `main`'s
engine advances are absent from `tools/nes_studio_core/`, and list the v75 per-room
fallbacks and the `nes_asm_pdraw` gating among them. **Both of those are present.** I
grepped for `_scene_is_perroom` — the server's name, with the leading underscore — and
the port calls it `scene.scene_is_perroom`. Likewise `nes_asm_pdraw` exists, as
`AsmFeatures.player_draw` in `preparation.py`.

That is §1's *"a search pattern narrower than the thing it searches for"*, made while
writing up a merge abort, against a port whose whole point was renaming things as they
moved. The conclusion it supported still holds — taking "ours" **would** delete `main`'s
#37 fix — but the reason is one missing *term*, not three missing features.

## What is actually absent, version by version

| `main` | What it is | Shared files (git can merge) | `playground_server.py` half | In our port? |
| --- | --- | --- | --- | --- |
| **v76** (#37) | Player 1's OAM cursor can wrap or overrun | `pdraw_asm.s`, `platformer.c`, `builder-validators.js`, `_rom-equiv.mjs`, new suite `render-p1-oam-cursor.mjs` | +34: compute `_pd_oam_fits` and AND it into the `nes_asm_pdraw` decision | **no** — `player_draw` has no OAM-fits term |
| **v77** (#30) | Enemies can stand inside each other | `builder-modules.js`, `studio-style.js`, `enemy-bump.mjs`, an E2E spec | none | no |
| **v78** (#31) | Dialogue box flashes the screen | `builder-modules.js` (399 lines), `round2-dialogue.mjs`, `render-dialogue-noflash.mjs`, `_rom-equiv.mjs` | none | no |
| **v79** (#14 Step 2) | Multi-screen rooms lose their own entities | new suite `perroom-wide-gate.mjs` | +29: `_scene_is_perroom`'s restriction moves from "x and y ≤ 255" to "y ≤ 238, x ignored" | **no** — ours is still the v75 form |

**Two of the four need Python work at all, and it is about fifty lines between them.**
v77 and v78 touch only files this branch shares with `main` and never diverged on; the
core does not duplicate `builder-modules.js` (it only refers to it in two comments).

*One coupling to check rather than assume when porting v78:*
`nes_studio_core/graphics.py:266` pins a dialogue palette to "BW_DIALOG_PALETTE in
builder-modules.js". A 399-line change to that file is exactly where such a pin comes
loose, and nothing checks it.

## The order, and what each step has to prove

Each step is one commit, its own engine version, its own snapshot, and does not start
until the previous one's proof is in hand.

1. **v80 = `main`'s v76 (#37).** Apply the shared files, then add the `_pd_oam_fits`
   term to `select_asm_features`. *Proof:* an 8×8 player with the background status bar
   must not select `NES_ASM_PDRAW`, and must with a 2×2 player — asserted at the
   `AsmFeatures` level, plus `main`'s own `render-p1-oam-cursor.mjs` running green here.
   Both goldens unchanged; `_rom-equiv` re-pinned only if the heart-loop change comes
   with it, and isolated first the way `main` isolated it.
2. **v81 = `main`'s v77 (#30)** and **v82 = `main`'s v78 (#31)**, in that order — both
   shared-file only. *Proof:* their suites, `main`'s and ours, and the dialogue-palette
   coupling above checked explicitly.
3. **v83 = `main`'s v79 (#14 Step 2).** Move `scene_is_perroom`'s restriction. *Proof:*
   a two-screen-wide room with per-room entities builds per-room rather than falling
   back, and an entity at y=239 is still refused — `main`'s `perroom-wide-gate.mjs`.
4. **Then merge.** With the engine advances already here, `playground_server.py` stops
   being a conflict with an empty side and becomes an ordinary one.

After each step: `snapshot-engine.mjs --check` green, the collision checker green with
the record refreshed via `--update`, and the 110-suite pass before the last step rather
than after each.

## What this needs from the owner

* **Agreement on the shape.** This is four engine versions ported one at a time, not a
  conflict resolution — and each bump is a number `main` may also take, so the renumber
  at the end is not optional.
* **Whether to port `main`'s new work at all, or move this branch's native work onto
  `main` instead.** Not asked before, and it may be the cheaper direction: the native
  app's code is almost entirely under `native/`, which `main` does not have. That would
  make the engine question disappear rather than be answered four times. It is a bigger
  decision than the one this document plans for, which is why it is written down here
  rather than acted on.
