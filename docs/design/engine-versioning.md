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
- **E-V3 — Advisor.**
  - `changelog.json` + the in-Studio "what changed since your engine" panel.

**The first engine feature (per-door) becomes engine v2:** snapshot v1
first, ship per-door as v2 with a CHANGELOG entry, so every existing v1 game
is guaranteed a working fallback. That is the whole point of building this
before the feature.

## Guardrails

- v1 snapshot must reproduce today's golden-ROM hashes bit-for-bit (it is a
  copy of the live engine) — verified by running `builder-tests` against it.
- Snapshots are never edited after release; fixes go into a new version.
- `engineVersion` is additive to the project schema (old saves default to 1).
