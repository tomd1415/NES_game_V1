# UI architecture — the unified workspace

> The target information architecture for the redesign, taken from
> **SpriteMaker Studio.dc.html**. This describes *shape and layout*; the
> principles behind it live in [`design-principles.md`](design-principles.md)
> and the underlying data in [`target-data-model.md`](target-data-model.md).
>
> The prototype's structure is approved. Where the prototype conflicts
> with a hardware truth, this doc follows the truth and flags it.

## Three top-level screens

The app has three screens, not seven pages:

1. **Home / Gallery** — the arcade. Showcase carts picked by the teacher,
   then "all games", each with ▶ PLAY. Publish affordance for the pupil's
   own cart. This is where a pupil lands.
2. **Studio** — the single game-editing workspace (the heart of the app,
   below).
3. **Teacher dashboard** — class overview, moderation queue, showcase
   pinning. Mocked in the prototype; made real in a later phase.

## The Studio: four regions

```
┌──────┬───────────────┬───────────────────────────┬──────────────┐
│ MODE │  CONTEXTUAL   │        THE "TV"           │  QUEST LOG   │
│ RAIL │     DOCK      │  (game always running,    │      +       │
│      │ (mode-specific│   CRT-framed, editable    │   NEEDS      │
│ WORLD│  tools/lists) │   in place)               │  ATTENTION   │
│ CHARS│               │                           │              │
│ TILES│               │  stage toolbar shows the  │  self-ticking│
│ PALS │               │  common 2 tools; "more"   │  quests +    │
│ RULES│               │  reveals the rest         │  validator   │
│ SOUND│               │                           │  with Fix →  │
│ CODE │               │                           │  / Show me   │
└──────┴───────────────┴───────────────────────────┴──────────────┘
   top chrome: project name · ▶ PLAY · Save/snapshot · Time Machine · level switch (Beginner/Maker/Advanced)
```

- **Mode rail (left).** Pixel-icon buttons, one per mode. Switching mode
  changes the dock and the stage toolbar, never the surrounding chrome.
- **Contextual dock (middle-left).** One job per mode (principle §4.3).
  Holds that mode's lists and tools.
- **The TV (centre).** The game is *always running and editable in
  place* — you paint onto the live screen, not a separate canvas.
  CRT-framed. A stage toolbar sits above it showing the common tools;
  the rest hide behind "more tools" and appear when their target is
  selected.
- **Quest log + Needs-attention (right).** Self-ticking quests and the
  validator. Findings carry *Fix →* (jump + act) and *Show me* (jump +
  highlight) actions. This is the tutorial system — no modal pop-ups.

## Modes

The prototype ships six modes. The handover adds a seventh — a
first-class **TILES** mode — because the prototype wrongly folds 8×8 tile
drawing into CHARS ("draw your characters *and background tiles*"),
which violates "one job per dock" and hides the fundamental NES
primitive. The target rail:

| Mode | Job | Replaces (old page) | Min. level |
| ---- | --- | ------------------- | ---------- |
| **WORLD** | Stamp blocks & entities onto the live screen; set tile *type* (solid/platform/ladder/spike/door/win) with per-tile override; assemble the level. | `index.html` (backgrounds) + `builder.html` | Beginner |
| **CHARS** | The list of every character (metasprite) + roles. Draw/redraw a character by *assembling* shared tiles. | `sprites.html` | Beginner |
| **TILES** *(new)* | The missing primitive: draw & manage the 8×8 tiles in the two pattern tables. Everything else references what's made here. | *(new — recover the old shared-tileset editor)* | **Maker** |
| **PALS** | Backdrop + 4 BG + 4 sprite palettes of 3, chosen from the 64-colour set; "used by" readouts. | palette panels, scattered today | Maker |
| **RULES** | How the game behaves — movement, damage, win condition, and the sprite-reactions matrix. Card-based; changes apply on next ▶ PLAY. | `behaviour.html` | Beginner (basic) / Maker (matrix) |
| **SOUND** | Music & SFX. | `audio.html` | Maker |
| **CODE** | The real C (and, at Advanced, 6502 asm) the game compiles to. Read-first; editable at Advanced. | `code.html` | Advanced |

Notes on specific modes:

- **WORLD** is where the pupil's [`notes.md`](notes.md) questions land:
  *tile-type per block with a per-tile override* (the ⚙ type tool),
  *palette painting via the real attribute table* (the 🎨 tool), and an
  **Assembly view** that shows how blocks/screens are built from shared
  tiles. The "world page where elements come together" is this mode.
- **CHARS role assignment** — where a character's role (Player / Enemy /
  Pickup / NPC / …) is set. The prototype shows the role but the
  handover flags that *where you assign it* must be obvious; it belongs
  in the CHARS dock next to the character.
- **TILES** is gated behind Maker and is reachable *in context* via
  "edit the tiles of this block/sprite" jump-ins from WORLD and CHARS,
  so it's discoverable without being a wall of 256 squares on lesson one.

## Chrome (persistent across modes)

- **Project name + Save/snapshot state** — reflects the autosave &
  snapshot guarantees.
- **▶ PLAY** — snapshots first, then runs the current project in the TV
  via the emulator.
- **Time Machine** — snapshot-before-restore history.
- **Expertise-level switch** — Beginner / Maker / Advanced. Reveals
  modes and tools; never rearranges learned ones.

## Anti-clutter mechanics (how the layout stays calm)

Restating [`design-principles.md`](design-principles.md) §4 as concrete
layout rules the implementation must honour:

- The stage toolbar renders **two tools by default**; "more tools"
  discloses the rest. Selection-dependent tools are hidden until their
  target is selected.
- A mode whose dock is doing two jobs is a bug to split (the prototype's
  CHARS dock, which carries both characters and background tiles, is the
  worked example — background tiles move to TILES).
- Rules cards are filtered to the current game type and gain
  search/grouping before they become a wall.

---

*Next:* [`target-data-model.md`](target-data-model.md) for what each
mode reads and writes, then [`phased-plan.md`](phased-plan.md) for the
order we build it in.
