# Design principles — the approved direction

> Distilled from **NES Studio – Design Handover.dc.html** (the direction
> document) and **SpriteMaker Studio.dc.html** (the approved-look
> prototype). These are the principles the redesign is *measured
> against*. When a phase decision is unclear, this file is the
> tie-breaker.

The handover is blunt about its own two halves, and so is this doc:

- The prototype's **look, tone and overall UX are the approved
  direction.** Build on this vocabulary — don't re-open these decisions.
- The prototype's **data model and several core mechanics are
  deliberately simplified and, in places, wrong about how the NES
  works.** Those are rebuilt on the real tile-first model — see
  [`target-data-model.md`](target-data-model.md).

This document is only about the first half: the enduring intent.

---

## 1. What to keep (do not re-open)

These are settled. Protect them; don't relitigate them phase to phase.

- **One unified workspace.** A mode rail on the left, a contextual dock,
  the game running on a "TV" in the centre, a quest log on the right.
  This single game-first studio replaces the old seven loosely-connected
  pages and is *the* core win. See [`ui-architecture.md`](ui-architecture.md).
- **Game-first, never a blank canvas.** Boot straight into a working,
  editable starter game. This removes the "I don't know how to start"
  paralysis pupils reported. Every game type ships a starter.
- **Learn-by-doing, not by pop-up.** The self-ticking **Quest Log** and
  the **"Needs attention"** validator (with *Fix →* / *Show me* jumps)
  replace the intro dialogs pupils skipped. Extend this model; never
  revert to modal tutorials.
- **Progress safety.** Autosave on every change, minute snapshots +
  a snapshot-before-Play, and a **Time Machine** that snapshots *before*
  restoring. "Work is very unlikely to be lost" is a hard guarantee —
  carry it into the accounts/server-save work and never regress it.
- **NES-authentic surface.** The whole UI is drawn from the 64-colour
  NES system palette, with CRT framing and pixel type. This is
  deliberate and liked. Keep it — including the app's own chrome.
- **Graduated depth.** Code is one click away; an Advanced level exists
  for pupils who already read C. The *principle* is right; §4 is how it's
  structured.

## 2. NES constraints the tool must always enforce

These are non-negotiable truths of the hardware. If the tool lets a
pupil build something that violates one, it is teaching a lie. Bake them
into the model so they *can't* be broken, and explain them where they
bite.

| Constraint | Rule |
| ---------- | ---- |
| **Colour** | 64-colour system palette; 1 shared backdrop + 4 background + 4 sprite palettes of **3 colours each**. No free RGB anywhere — including the app's own chrome. |
| **Tiles** | 8×8, 2 bits/pixel; 256 background + 256 sprite. The budget is real and visible. |
| **Attributes** | Background palette is chosen per **2×2-tile (16×16px) quadrant** — not per tile. Show the quadrant grid where colour is applied. |
| **Sprites** | 64 total, 8×8 or 8×16, one palette + flip bits each; **8 per scanline** before flicker/drop-out. |
| **Sprite colour 0** | Always transparent — you cannot draw with it. Outlines need a real colour. |
| **References everywhere** | Reuse is the craft. Editing a tile propagates to every reference; swapping tiles rewrites references. |

## 3. Everything references shared tiles

The single most important principle, and the one the prototype gets
wrong. On real hardware, **pixels live in one shared place (the pattern
tables) and everything else points at them**: the nametable points at
tiles, blocks are 2×2 arrangements of tile references, metasprites are
layouts of tile references, animation swaps tile indices.

- *Edit-a-tile-changes-everywhere is a feature, not a bug* — but surface
  it. When a shared tile is about to be edited from two places, show an
  "also used by…" notice with a one-click *Duplicate first*.
- *Budgets become real and teachable.* "CHR 214/256" means something
  because blocks and metasprites consume shared tiles. Wire it into the
  quest/validator layer as a positive challenge ("reuse tiles to fit the
  cartridge").
- *Exports stop being fabricated.* `.chr` / `.nam` / `.pal` and the
  cc65 C/asm serialise the real structures directly.

Full spec in [`target-data-model.md`](target-data-model.md).

## 4. Keeping it calm: progressive disclosure

The redesign fixed "too many pages" but can trend toward "too much on
one page". The tool must serve KS2 beginners *and* KS5 pupils writing C.
The answer is progressive disclosure, not more tabs. Standing rules:

1. **Expertise levels.** A single **Beginner → Maker → Advanced** switch
   (per pupil, teacher-settable per class).
   - *Beginner:* blocks, characters, play, quests.
   - *Maker:* palettes, tile types, the 8×8 tile sheet, animations.
   - *Advanced:* raw C/asm, CHR banks, attribute bytes.
   - Higher levels **reveal** tools; they never rearrange the ones
     already learned.
2. **Contextual tools.** Show the common two tools; tuck the rest behind
   a "more tools" affordance. Surface a tool when its target is
   selected, hide it otherwise.
3. **One job per dock.** Each mode's dock teaches one idea. When a dock
   grows a second job (e.g. characters + background tiles crammed
   together, as the prototype does), that's a signal to split the mode
   or move the second job where it belongs.

The measuring stick: **"Could a confused KS3 pupil ignore this control
and still finish a game?"** If yes, it belongs behind a level or a
disclosure.

## 5. Built to grow

The UI and UX must expand to a *complete* NES game maker without
becoming cluttered. Concretely, when adding any feature:

- Default to few, reveal on demand. Every Advanced-only control is
  invisible to a Year-7 on their first lesson.
- Growing lists (Rules cards, tile sheet, game types) get search /
  grouping *before* they become a wall, and only show what's relevant to
  the current game type.
- New primitives get an in-context jump-in (e.g. "edit the tiles of this
  block") so depth is discoverable, not a separate wall to find.

---

*Companion docs:* [`ui-architecture.md`](ui-architecture.md) ·
[`target-data-model.md`](target-data-model.md) ·
[`phased-plan.md`](phased-plan.md) — the roadmap that turns these
principles into sequenced work.
