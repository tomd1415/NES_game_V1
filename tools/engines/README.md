# tools/engines — NES-engine versions & snapshots

This directory version-controls the **NES engine** so we always know which
engine produced which ROM, and can rebuild old games with the engine they
were authored for.

- **`ENGINE_VERSION`** — the current engine version (an integer). Source of
  truth; kept in lock-step with `tools/tile_editor_web/engine-version.js`
  (the client) and read by the build server + snapshot script.
- **`CHANGELOG.md`** — one entry per version (newest first): Added / Changed
  (migration) / Breaking.
- **`v<N>/`** — an immutable snapshot of engine v`N`'s sources plus a
  `manifest.json` (`{version, created, files:[{path, sha1}]}`). Created by
  `node scripts/snapshot-engine.mjs`.

## Workflow to release a new engine version

1. Make the engine change (templates / assembler / cc65 project).
2. Bump `ENGINE_VERSION` **and** `engine-version.js` (same integer).
3. Add a `CHANGELOG.md` entry describing Added / Changed / Breaking.
4. `node scripts/snapshot-engine.mjs` to freeze the new `v<N>/`.
5. `node scripts/snapshot-engine.mjs --check` verifies the snapshot matches
   the live sources (run in CI / before shipping).

This scheme began at **v1** (baseline) with the first engine feature — per-door
destinations — shipping as **v2**, always snapshotting v1 first so every v1 game
keeps a working fallback. The engine is now well past that; see
[`CHANGELOG.md`](CHANGELOG.md) for the current version (v72 at the time of writing)
and every step in between.

See [`docs/design/engine-versioning.md`](../../docs/design/engine-versioning.md).
