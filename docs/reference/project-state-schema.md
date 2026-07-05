# Project-state schema (reference)

**What this is:** the single reference for the **project state** — the JSON
object that represents one whole game project. It is created, migrated,
validated, saved (localStorage + accounts DB + gallery), edited by both the
**Studio** and the seven legacy pages, compiled to a ROM by the assembler +
server, and round-tripped through import/export.

**Status:** code-verified 2026-07-05 against `tools/tile_editor_web/*` and
`tools/playground_server.py`. Line numbers drift — treat citations as "start
here", not gospel. If you change the shape, update this file **and** grep the
citations below.

> **Golden rule:** storage `JSON.stringify`s the state object *verbatim* — no
> field filtering on save (`storage.js:292`). Every top-level field (including
> legacy and editor-only ones) round-trips through save/load, export/import,
> the accounts DB blob, and the gallery `project.json`. So **any field you add
> is permanent data** the whole system carries forever. Add deliberately.

---

## ⚠️ Three independent version counters — do not conflate

| Counter | Value today | Meaning | Bumped when |
|---|---|---|---|
| `state.version` | **1** (frozen) | **State-schema** version | Effectively never — migrations are additive so old projects stay loadable (`index.html:1730`). A mismatch is *rejected* by `validateState` (`index.html:2019`). |
| `state.engineVersion` | **9** (advisory) | Which C/ROM **engine** the design was authored for — provenance only | Stamped on new Studio projects from `NES_ENGINE_VERSION` (`studio-starter.js:349`); updated by the Studio "Update this game" advisor (`studio.js:1082`). |
| `state.builder.version` | **1** | The **module-tree** shape inside `state.builder` | Re-seeded if `!== 1` (`studio.js:123`, `builder-modules.js:2501`). |

**The codegen gate is NOT `state.engineVersion`.** The active engine for a build
is the page global **`window.NES_TARGET_ENGINE`**, resolved at page load
(`engine-version.js:23-25`):

- **Studio** loads `engine-version.js` (`studio.html:491`) → `NES_TARGET_ENGINE = NES_ENGINE_VERSION = 9` → targets the **latest** engine.
- The **seven old pages do NOT load `engine-version.js`** → `NES_TARGET_ENGINE`
  is undefined → codegen falls back to **v1** via `(window.NES_TARGET_ENGINE) || 1`
  (`builder-modules.js:146, 530, 1181, …`). This is why the legacy pages are
  pinned to engine v1.

`state.engineVersion` records intent/provenance; it does not select the engine
at build time. Keep `NES_ENGINE_VERSION` (`engine-version.js:17`) in lock-step
with `tools/engines/ENGINE_VERSION` — the test suite fails if they disagree
(see [`../design/engine-versioning.md`](../design/engine-versioning.md)).

---

## Top-level fields

The canonical factory is `DefaultState.create` (`default-state.js:45-67`);
`StudioStarter` (`studio-starter.js`) paints richer starters on top. Each old
page also has its own `createDefaultState()` emitting a subset. Confirmed
against a real published `project.json`.

### Core (from `default-state.js`)

| Field | Type | Purpose | ROM? |
|---|---|---|---|
| `version` | int (=1) | State-schema version (see above) | no |
| `name` | string | Project display name | no |
| `template` | `'platformer'\|'topdown'` | Starter template kind | no |
| `movement` | `'platformer'\|'fourway'` | Derived movement style | via builder |
| `universal_bg` | int 0..0x3F | NES backdrop colour (palette entry 0) | **yes** |
| `bg_palettes` | array[4] `{slots:[3]}` | 4 background sub-palettes | **yes** |
| `sprite_palettes` | array[4] `{slots:[3]}` | 4 sprite sub-palettes | **yes** |
| `sprite_tiles` | array[256] `{name,pixels[8][8]}` | CHR pool → pattern table $0000 | **yes** |
| `bg_tiles` | array[256] `{name,pixels[8][8]}` | CHR pool → pattern table $1000 | **yes** |
| `backgrounds` | array `{name,dimensions:{screens_x,screens_y},nametable,behaviour?,tileMode?,metatiles?}` | Named scenes sharing the tile pools | **yes** |
| `selectedBgIdx` | int | Active background index | picks active bg only |
| `sprites` | array `{name,role,width,height,cells[[{tile,palette,flipH,flipV,priority,empty}]]}` | Metasprite definitions | **yes** |
| `animations` | array `{id,name,frames[],fps,role,style}` | Frame animations | **yes** |
| `animation_assignments` | `{walk,jump,attack}` (anim id or null) | Which anim drives each engine action | **yes** |
| `nextAnimationId` | int | Monotonic anim-id allocator | no |
| `metadata` | `{created,modified}` ISO | Timestamps | no |

Per-background fields `behaviour` (collision grid), `tileMode:'16x16'` and
`metatiles[]` live **inside** `backgrounds[]`, not at top level
(`studio.js:161-166`, `playground_server.py:919-948`).

### Added by specific pages / migrations (not in `default-state.js`)

| Field | Type | Owner | Evidence | ROM? |
|---|---|---|---|---|
| `engineVersion` | int | Studio starter / engine advisor | `studio-starter.js:349`, `studio.js:1082` | no (advisory) |
| `builder` | `{version:1, modules:{…}}` | Builder page / Studio Rules+Style | `builder-modules.js:2499` | **yes** |
| `behaviour_types` | array `{id,name,colour,builtin}` | Behaviour page | `behaviour.html:667` | **yes** |
| `behaviour_reactions` | array (per-sprite `{behId:action}`) | Behaviour page | `behaviour.html:723` | **yes** |
| `audio` | `{songs:[{asm,symbol,…}], sfx:{asm,symbol}\|null, defaultSongIdx}` | Audio page | `audio.html:378` | **yes** (client-side, see below) |
| `customMainC` | string \| null | Code page / Studio Code | `index.html:1805`, `studio-code.js:84` | **yes** when set |
| `ejected` | bool | Studio Code (raw-C eject) | `studio-code.js:84`, `studio.js:273` | gates customMainC |
| `bg_glyph_confirmed` | array | index.html (dialogue-letter warning) | `index.html:1702` | no |
| `currentLesson` | string \| null | lesson tracker | `index.html:1809` | no |

Server-only transients (`_racer_rot`, `_racer_digits`) are injected during a
build and never persisted (`playground_server.py:1518,1538`).

---

## What reaches the ROM vs editor-only

**Emitted to ROM** (server codegen `playground_server.py`, + client assembler):

- `sprite_tiles`+`bg_tiles` (or legacy `tiles`) → CHR (`build_chr:816`).
- `backgrounds`/`selectedBgIdx`/`nametable` + per-bg `behaviour`/`metatiles` →
  nametable/attribute/collision (`build_nam:903`, `_expand_metatile_bg:919`).
- `bg_palettes`/`sprite_palettes`/`universal_bg` → palette includes
  (`build_palettes_inc:1003`).
- `sprites`+`animations`+`animation_assignments` → scene/sprite/anim tables
  (`build_scene_asminc:1066`).
- `builder.modules` → gameplay codegen (game type, doors, scene AI, racer)
  (`:728,1277,1290,1460`), walked in fixed `MODULE_ORDER`
  (`builder-assembler.js:121`).
- `behaviour_types`/`behaviour_reactions` → collision reaction tables.
- `audio.songs[].asm` / `audio.sfx.asm` reach the ROM **not** via server `state`
  reads but as separate `payload.audioSongsAsm/audioSfxAsm` strings assembled
  client-side (`play-pipeline.js:284-326`).

**Editor-only (never a byte of ROM):** `name`, `metadata`, `version`,
`nextAnimationId`, `bg_glyph_confirmed`, `currentLesson`, `ejected`,
`engineVersion` (provenance only — the gate is `NES_TARGET_ENGINE`). Studio
view state (`currentMode`, `currentLevel`, `viewScreen`) is in-memory only —
it lives in `studio.js:45-52` module locals, **not** on `state`.

---

## Studio vs legacy-page ownership

The Studio is a **superset** editor — it reads/writes every field. The useful
direction is which fields a front-end *preserves but never edits* (round-trips
only), so a change on one side survives a save on the other:

| Field | Editor of record | Just preserved by |
|---|---|---|
| `builder` | Builder page + Studio Rules/Style | every old page (`index.html:1824` "Builder owns `state.builder`, but every page preserves it") |
| `behaviour_types` / `behaviour_reactions` | Behaviour page + Studio Chars | index.html / sprites.html (`index.html:1819`) |
| `audio` | Audio page + Studio Sound | index/sprites/behaviour/code |
| `customMainC` | Code page + Studio Code | every other page |
| `bg_glyph_confirmed`, `currentLesson` | index.html (legacy concepts) | Studio (carried, rarely touched) |

Studio module → field map: `studio-world.js` (backgrounds/selectedBgIdx/bg
behaviour), `studio-chars.js` (sprites/animations/assignments/reactions),
`studio-tiles.js` (tile pools), `studio-pals.js` (palettes/universal_bg),
`studio-style.js`+`studio-rules.js` (`builder.modules`), `studio-sound.js`
(audio), `studio-code.js` (customMainC/ejected).

---

## Migration

`migrateState` is **additive back-fill + legacy re-wrap; it never bumps
`version`.** Invoked centrally on **load** in `storage.js:259` (inside
`parseSlot`) and on the Studio play path (`play-pipeline.js:118`). Four
implementations exist, richest first:

- **`index.html:1732-1831`** — splits legacy single `tiles` pool →
  `sprite_tiles`+`bg_tiles`; wraps legacy top-level `nametable`/`dimensions`
  into `backgrounds[]` then deletes them; back-fills `bg_glyph_confirmed`,
  `customMainC`, `currentLesson`, `template`, `movement`; calls
  `migrateBuilderFields` (`:1833`), `migrateBehaviourFields` (`:1957`),
  `MetatileLib.migrate` (`:1829`), `relocateCustomSlotSixForLadder` (`:1917`).
- **`sprites.html:2803`** — same core + the animations block (`animations`,
  `animation_assignments`, `nextAnimationId`, role/style tags).
- **`behaviour.html:743`** — same core + `migrateBehaviourFields`.
- **`studio.js:110-127`** — leanest: ensures arrays exist, **reseeds a full
  `StudioStarter.create()` if backgrounds are blank/corrupt** (`:114`), runs
  `MetatileLib.migrate`, seeds `builder` via `BuilderDefaults()` if
  `builder.version !== 1`.

Pattern: idempotent guards (`if (!Array.isArray(...))`); delete a legacy field
only *after* successfully re-wrapping it.

---

## Validation

Two layers. **Schema `validateState`** runs on load in `parseSlot`
(`storage.js:260`) — an invalid slot is **silently discarded**, so a bad save
can vanish. Strictness varies by page: `index.html:2017` is strictest (version
match, 256×8×8 tile pools each pixel 0..3, exactly 4+4 palettes of 3 slots
0..0x3F, non-empty backgrounds, valid `selectedBgIdx`); `sprites.html:2787` is
looser (accepts legacy shapes); `behaviour.html:836` and `studio.js:128` do
minimal existence checks.

**Builder semantic validators** (`builder-validators.js`): a `VALIDATORS` array
of pure `(state) → null|{id,severity,message,fix,jumpTo}` functions run by
`BuilderValidators.validate(state)` (`:783`); any `severity:'error'` disables
Play (`hasErrors:798`). `jumpTo` points at the old page that owns the fix.
(Sprint 4 expands these — see the trust-and-hardening plan.)

---

## Persistence surfaces

| Where | Key / location | Notes |
|---|---|---|
| **localStorage catalog** | `nes_tile_editor.projects.v2` | `{version:2, activeId, projects:[{id,name,created,modified}], migratedAt}` (`storage.js:64`) |
| **localStorage state slot** | `nes_tile_editor.project.<id>.current` | full state, verbatim (`storage.js:292`) |
| **localStorage snapshots/backups** | `…project.<id>.snap.<ts>` / `.backup.<ts>` | capped 8 / 5 (`storage.js:326-357`) |
| **localStorage prefs** | `nes_tile_editor.prefs.v1` | app-wide UI prefs (`storage.js:369`) |
| **Accounts DB** | SQLite `tools/accounts.db`, table `projects(id,user_id,name,blob,size,updated_at)` | `blob` = serialized state, opaque to server, capped `PROJECT_BLOB_MAX = 4 MB` (`accounts.py:186,361,36`) |
| **Gallery entry** | `tools/gallery/<slug>/{rom.nes,preview.png,project.json,metadata.json}` | `project.json` = raw state; `metadata.json` = `{title,description,pupil_handle,owner,owner_name,source_page,ts,rom_size,preview_size}` (`playground_server.py:3142`) |
| **Import/export** | `.nesgame.json` (or `.json`) | `JSON.stringify(state,null,2)`, re-run through migrate+validate on import (`index.html:2183,4377`) |

Storage never validates *which* fields are present on **save** — it only
migrate+validates on **load** (`storage.js:255-264`).

---

## Deprecated fields still round-tripped

- **`tiles`** — pre-split single CHR pool. Migrated to `sprite_tiles`+`bg_tiles`
  then deleted (`index.html:1738`), but the **server still accepts it** as a
  CHR fallback (`playground_server.py:830`).
- **top-level `nametable` + `dimensions`** — pre-`backgrounds[]` shape. Wrapped
  into `backgrounds[0]` then deleted (`index.html:1801`); server keeps a read
  fallback (`:851`).
- **behaviour slot 6 legacy custom type** — remapped to slot 7 when the Ladder
  builtin claimed slot 6 (`relocateCustomSlotSixForLadder`, `index.html:1917`).
- **`animation_assignments` originally `{walk,jump}`** — `attack` added later,
  back-filled (`sprites.html:2885`).
- **`events` builder-module id** — dead placeholder, removed from `MODULE_ORDER`
  (`builder-assembler.js:118`).

---

## When you change the schema — checklist

1. Add/rename in the factory (`default-state.js`) **and** any old-page
   `createDefaultState()` that needs it.
2. Add a back-fill branch to **every** `migrateState` (index/sprites/behaviour/
   studio) so old saves gain the field without a `version` bump.
3. Extend `validateState` only if the field is *required* — remember an invalid
   save is silently discarded.
4. If it reaches the ROM, wire it in the server codegen / assembler **and** bump
   the engine version + snapshot (gate new behaviour off-by-default so golden
   ROMs stay byte-identical — see
   [`../design/engine-versioning.md`](../design/engine-versioning.md)).
5. Note here whether it is ROM-emitted or editor-only, and who owns it.
