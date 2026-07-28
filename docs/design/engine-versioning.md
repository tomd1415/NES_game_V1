# NES-engine versioning, snapshots & compatibility

**Status:** design · **Date:** 2026-07-05 · **Owner task:** engine branch

## Why

Adding engine features (per-door destinations, 8×16 sprites, bigger worlds…)
means changing the C templates + assembler + server build that turn a
project into a ROM — the **engine**. When the engine changes, an old game
might build differently, or stop building. We need to:

1. **Know which engine produced which ROM** — a version number stamped on
   every build/project, so we can go back.
2. **Keep old engines runnable** — a *snapshot* of each engine version, so a
   game authored for v1 can still be built with v1 even after v2 ships.
3. **Fall back automatically** — the site identifies the engine a design was
   authored for and, if the newest engine can't build/run it, builds with the
   engine it targeted.
4. **Advise on upgrades** — tell the user what changed in the engine since
   their game was made, and what they may need to change to move it forward.

This de-risks every future engine change: we ship v2 boldly because v1 is
archived and every v1 game keeps working.

## Model

- **Engine = ** `tools/tile_editor_web/builder-templates/*.c` +
  `builder-assembler.js` + the ROM-emitting parts of `playground_server.py`
  + `steps/Step_Playground/` (the cc65 project) + `cfg/` + `src/`.
- **`ENGINE_VERSION`** — a single integer, bumped whenever a change alters
  ROM output or the project↔ROM contract. Source of truth: a constant the
  server and the JS both read (proposed `tools/engines/ENGINE_VERSION`).
- **Project stamp** — `state.engineVersion` records the engine a project was
  **authored/last-built** against. Written on save + on successful build.
  Absent ⇒ treat as v1 (the current shipped engine).
- **ROM stamp** — the build records the engine version in the returned build
  metadata, and (stretch) in a fixed ROM location / iNES trainer/comment so a
  downloaded `.nes` is self-identifying.

## Snapshots

Each released engine version is archived so it can be rebuilt later:

```
tools/engines/
  ENGINE_VERSION            # current integer, e.g. 2
  CHANGELOG.md              # human changelog, newest first (see below)
  v1/                       # frozen copy of the v1 engine sources
    builder-templates/ …
    manifest.json           # {version:1, created, files:[…], sha}
  v2/ …
```

The build server picks the engine directory by the project's target version:
`engineDir = tools/engines/v<targetVersion>/` (default = latest). A snapshot
is created by a `scripts/snapshot-engine.mjs` that copies the live engine
files into `v<N>/` and writes the manifest. Snapshots are immutable once
released.

### When to bump + snapshot (the rule)

Bump the version and snapshot **whenever a change could alter ROM output or the
project↔ROM contract** for *any* project. Concretely, do it when you touch:

- a C template in `tools/tile_editor_web/builder-templates/`,
- the assembler `tools/tile_editor_web/builder-assembler.js` or the module
  emitters in `builder-modules.js` (anything that changes emitted C/asm text),
- the cc65 project under `steps/Step_Playground/` or the server's codegen, or
- the project→state fields that feed any of the above (a new state field the
  engine reads, or a changed meaning for an existing one).

You do **not** bump for editor-only changes (UI, validators that only warn,
docs, tests) that cannot change a byte of any ROM.

**The safety lever:** new engine behaviour must be gated behind an
**off-by-default flag** (emitted only for the game type / target version that
needs it) so the preprocessor + cc65 strip it from every other project and the
golden ROMs stay **byte-identical**. If a change keeps all golden hashes
identical *and* adds no new state contract, it usually doesn't need a bump; if
you can't be sure, bump — snapshots are cheap, a broken rebuild-an-old-game
promise is not.

**Mechanics** (also in [`CLAUDE.md`](../../CLAUDE.md) and
[`tools/engines/README.md`](../../tools/engines/README.md)):

1. bump `tools/engines/ENGINE_VERSION` **and**
   `tools/tile_editor_web/engine-version.js` (keep the integers equal),
2. add a `tools/engines/CHANGELOG.md` entry (Added / Changed-migration /
   Breaking),
3. run `node scripts/snapshot-engine.mjs` to freeze `tools/engines/v<N>/`.

`node tools/builder-tests/run-all.mjs` fails if the two constants disagree or
the snapshot drifts from git HEAD — so `snapshot-engine.mjs --check` is
effectively mandatory in CI.

## Which engine a page targets (`NES_TARGET_ENGINE`) — implemented

Codegen (`builder-modules.js` / the template) gates every version-specific
feature on `window.NES_TARGET_ENGINE`:

- **The Studio** loads `engine-version.js`, which sets `NES_TARGET_ENGINE` to
  the **latest** — so it gets the newest engine.
- **The original seven pages** do **not** load `engine-version.js`; codegen
  treats an unset target as **v1**, so the stable multi-page site never emits
  newer-engine features and stays byte-identical to v1. (E.g. per-door is
  gated on `NES_TARGET_ENGINE >= 2`.)

`play-pipeline` sends `targetEngine` in the `/play` body; the server clamps it
to `[1, current]` and returns `engineVersion` / `engineLatest` for provenance.
Because v1↔v2 differ **only in client codegen** (per-door), this gate fully
pins the multi-page site to v1 today. The server-side snapshot build below is
the additional enforcement needed **once a future version changes the static
cc65 sources** (not just client codegen).

> **Update 2026-07-14 (engine now v72):** that "once" has arrived. Since v19/v20
> the engine moved its hot paths to hand-written 6502 (`steps/Step_Playground/src/*.s`
> plus regenerated `.c`), so versions now differ in the **static cc65 sources**,
> not only client codegen. `scripts/snapshot-engine.mjs` already freezes those
> sources under `tools/engines/v<N>/` (a v72 snapshot includes
> `steps/Step_Playground/src/`), so the "v1↔v2 only client codegen" framing above
> is historical and the snapshot capture the server rebuild depends on is in place.
> The build path that *selects* a frozen version's sources on `/play` remains the
> TODO called out in the next section.

## Build-time selection & fallback (server snapshot build — TODO for divergent versions)

On `/play` (and publish):
1. Determine `target = targetEngine (body) or state.engineVersion || 1`.
2. Try the **latest** engine. If it builds and passes a smoke check → use it,
   and if `target < latest` surface the upgrade advisor (below).
3. If the latest engine **fails** to build the project → retry with the
   **target** engine's snapshot. If that succeeds → use it and tell the user
   "built with your original engine (v<target>); upgrading needs changes."
4. If both fail → the existing build-error path.

(Step 2's "smoke check" can start as "the ROM built"; later, a headless run.)

## Changelog & upgrade advisor

`tools/engines/CHANGELOG.md` — one entry per version, newest first:

```
## v2 — 2026-07-05
### Added
- Per-door destinations: each Door tile can carry its own spawn/target.
### Changed / migration
- (none — v1 projects build identically; new fields are additive.)
### Breaking
- (none.)
```

Each entry is machine-readable enough (a small front-matter or a parallel
`changelog.json`) that the site can, when `target < latest`, show:
*"Your game was made with engine v1. Since then: per-door destinations were
added (optional). No changes needed."* — and, for breaking changes, a
concrete checklist.

## Phased plan (implement on the engine branch, before feature work)

- **E-V1 — Foundation (do first).**
  - Add `tools/engines/ENGINE_VERSION` (=1) + read it in server + JS.
  - Stamp `state.engineVersion` on save/build; return it in build metadata.
  - Snapshot the **current** engine as `v1/` + `manifest.json`.
  - Seed `CHANGELOG.md` with the v1 baseline.
  - Tests: version present on new projects; snapshot manifest matches live.
- **E-V2 — Selection & fallback.**
  - `snapshot-engine.mjs` script; server builds from `v<target>/`.
  - Latest-then-fallback build flow + the "built with original engine" notice.
- **E-V3 — Advisor. ✅ implemented.**
  - The Studio's ⚙ Engine chrome button shows the project's engine version and
    highlights when it's behind the latest. It opens an advisor modal that
    fetches `/engine/CHANGELOG.md` (a server route serving `tools/engines/`),
    lists the entries newer than the project's version ("what changed since
    your engine"), and offers **Update this game to v<latest>** (bumps
    `state.engineVersion`). Covered by `tools/studio-tests/engine.spec.js`.

**The first engine feature (per-door) becomes engine v2:** snapshot v1
first, ship per-door as v2 with a CHANGELOG entry, so every existing v1 game
is guaranteed a working fallback. That is the whole point of building this
before the feature.

## Guardrails

- v1 snapshot must reproduce today's golden-ROM hashes bit-for-bit (it is a
  copy of the live engine) — verified by running `builder-tests` against it.
- Snapshots are never edited after release; fixes go into a new version.
- `engineVersion` is additive to the project schema (old saves default to 1).
