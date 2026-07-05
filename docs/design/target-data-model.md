# Target data model — tile-first, and mostly already here

> The handover's §3–§5 define what "correct" means: a **shared pattern
> table as the single source of truth**, with everything else pointing at
> it by index. This doc states that model and — crucially — maps it
> against what `tools/tile_editor_web/` **already stores today**, so the
> phased plan can be honest about how much is *keep/verify* versus
> *build*.
>
> Headline: the current seven-page build is **already substantially
> tile-first.** The handover warns against the *prototype's* regression
> (monolithic 16×16 blocks that own their pixels), not against the
> current app. The handover even says so: *"The original site already had
> this right… the correct move is to bring the shared-tileset model back
> and put the new UX on top of it."* The new UX is the work; the data
> model is mostly recovery + tightening.

## The target model (from the handover, §4)

```
PatternTable { tiles: Tile[512] }          // each Tile = 8×8, values 0–3
Palettes     { backdrop, bg[4][3], sp[4][3] }
Block        { tiles:[tl,tr,bl,br], palette }   // 2×2 REFERENCES + BG palette
Metasprite   { cells:[{tile,palette,flipH,flipV,dx,dy}], w,h }
Animation    { frames:[metaspriteId], fps, tag }
Screen       { nametable:[32×30 tileIdx], attr:[16×15 palIdx] }
Entity       { metaspriteId, role, x, y, behaviour }   // placed in a Screen
```

**One editor, three lenses.** The 8×8 tile editor is the primitive; the
block editor and metasprite editor are *assemblers* that pick tiles and
palettes; the world editor stamps blocks/entities. All read/write the
same tile store.

## What the current build already stores

From `tools/tile_editor_web/default-state.js`, `metatiles.js`,
`sprite-render.js`:

| Target concept | Current representation | Status |
| -------------- | ---------------------- | ------ |
| **Pattern tables** | `bg_tiles[256]` + `sprite_tiles[256]`, each `{ name, pixels: 8×8 of 0–3 }` | ✅ Present — two shared 256-tile pools |
| **Palettes** | `universal_bg` (backdrop) + `bg_palettes[4].slots[3]` + `sprite_palettes[4].slots[3]`, indices into the 64-colour set | ✅ Present, hardware-shaped |
| **Block (metatile)** | `metatiles.js`: `{ tiles:[TL,TR,BL,BR], palette, behaviour }`; server `_expand_metatile_bg` consumes the same shape | ✅ Present — exactly the target Block, plus a `behaviour` (tile-type) field |
| **Metasprite** | sprite `sp.cells[r][c]` referencing the `sprite_tiles` pool (per `sprite-render.js`) | ✅ Present — sprites are already cell layouts of shared-tile references, not private bitmaps |
| **Animation** | `animations[]` + `animation_assignments{ walk, jump, attack }` | ✅ Present |
| **Screen / nametable** | `backgrounds[].nametable = 32×30 of { tile, palette }`, multi-screen via `dimensions.screens_x/y` | ⚠️ Present but palette is per-8×8-cell, not per-2×2 quadrant — see gaps |
| **Entity placement** | entities/roles carried in builder/behaviour state | ✅ Present (consolidation needed across modes) |

## The real gaps (this is the P0 work)

The model is mostly right. What's genuinely missing or wrong:

1. **Attribute-table granularity.** The nametable stores a palette *per
   8×8 tile*. Real NES chooses BG palette *per 2×2-tile (16×16px)
   quadrant* — a `16×15` attribute grid. The 16×16 **metatile** mode is
   already correct (one palette per 2×2 block); the legacy 8×8 mode lets
   a pupil colour at a granularity the hardware can't honour. **Fix:**
   make per-quadrant attribute the source of truth, show the quadrant
   grid at the point of colouring, and treat per-8×8 palette as a
   compile-time lie to remove. *(This is the pupil's [`notes.md`](notes.md)
   "set the colour palettes / override per tile" question, answered
   honestly.)*

2. **A first-class 8×8 tile editor.** The pixel data and helpers exist,
   but there is **no dedicated mode** to draw and manage the 512 tiles as
   the primitive — with `[`/`]` stepping, flip/rotate/copy-paste,
   drag-to-swap that rewrites references, and a live "used by" readout.
   The prototype wrongly folds tile drawing into CHARS. **Build** the
   TILES mode (handover §5); recover the old shared-tileset editor's
   shortcuts.

3. **Explicit OAM detail on metasprite cells.** Cells reference tiles;
   verify/complete per-cell `flipH/flipV` + `palette`, and 8×8 vs 8×16
   sprite mode, so cells are true OAM entries.

4. **Real budgets.** With shared tiles, `CHR 214/256` is meaningful.
   **Build** a live CHR-budget meter and an **8-sprites-per-scanline**
   visualiser, wired into the validator as teachable limits.

5. **Round-trippable exports.** `.chr` / `.nam` / `.pal` and the cc65
   C/asm must serialise the real structures directly (no on-the-way-out
   reconstruction), with a matching import.

## Invariants to enforce in the model

So the tool can't teach a lie (see [`design-principles.md`](design-principles.md) §2):

- Tiles are 8×8, values 0–3 only; pools are capped at 256 each and the
  cap is *visible*.
- Palettes are 3 colours from the 64-colour set; colour 0 is the shared
  backdrop (BG) / transparent (sprites) and cannot be painted with.
- BG palette assignment is per 2×2 quadrant, full stop.
- Editing a tile propagates to every reference; swapping tiles rewrites
  references; deleting a referenced tile warns with "used by…" +
  *Duplicate first*.
- A metasprite that would put >8 sprites on a scanline is flagged, not
  silently allowed.

---

*See* [`ui-architecture.md`](ui-architecture.md) *for which mode edits
each structure, and* [`phased-plan.md`](phased-plan.md) *for the order.*
