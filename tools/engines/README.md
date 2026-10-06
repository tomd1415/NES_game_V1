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
  `manifest.json` (`{version, files:[{path, sha1}]}`). Created by
  `node scripts/snapshot-engine.mjs`.

## Workflow to release a new engine version

1. Make the engine change (templates / assembler / cc65 project).
2. Bump `ENGINE_VERSION` **and** `engine-version.js` (same integer).
3. Add a `CHANGELOG.md` entry describing Added / Changed / Breaking.
4. **Commit.** See the warning below — this step is not optional.
5. `node scripts/snapshot-engine.mjs` to freeze the new `v<N>/`.
6. `node scripts/snapshot-engine.mjs --check` verifies the snapshot matches
   the **committed** sources (run in CI / before shipping).

> ### ⚠ Both commands read committed (HEAD) bytes, not your working tree
>
> This is deliberate — it keeps `--check` deterministic while a `/play` is
> rewriting `steps/Step_Playground/src/` underneath it — but it has teeth:
>
> * **Snapshotting before committing freezes the OLD code.** A file you have
>   *modified* is written into `v<N>/` at its committed bytes, with no warning.
>   (A brand-new, never-committed file at least prints `(skip, not committed)`.)
>   You get a `v<N>/` that claims to be the new engine and contains the previous
>   one — and `--check` then compares HEAD against that same HEAD-derived
>   manifest and cheerfully agrees. Snapshots are **immutable**, so the only way
>   out is to bump again to `v<N+1>`.
> * **An uncommitted engine edit cannot make `--check` go red.** Run it after
>   committing, not before, or it blesses work it never looked at. (Verified by
>   deliberately breaking it three ways on 2026-08-06 — see
>   [`docs/LESSONS-LEARNT.md`](../../docs/LESSONS-LEARNT.md).)
>
> **⚠ What a snapshot covers changed at v76 — two eras, not comparable.**
>
> | Snapshots | Cover |
> | --- | --- |
> | **v1 – v75** | JS + cc65 sources only. **19–30 files (it grew with the engine), no Python.** |
> | **v76 – v79** *(`main`'s, taken in the 2026-09-02 merge)* | as v1 – v75: **30 files each, no Python.** |
> | **v80 onward** *(on this branch)* | the above **plus `tools/nes_studio_core/`**, the server's ROM codegen (41 files). |
>
> **Do not read this boundary as a version range.** A snapshot covers the Python
> codegen **iff its own `manifest.json` lists files under `tools/nes_studio_core/`**.
> That is the definition; any version number quoted here is a *result*, and results go
> stale. Ask the artefacts:
>
> ```bash
> for m in tools/engines/v*/manifest.json; do
>   python3 -c "import json,sys; d=json.load(open(sys.argv[1])); \
>     print(sys.argv[1].split('/')[2], len(d['files']), \
>     'python' if any(f['path'].startswith('tools/nes_studio_core/') for f in d['files']) else 'NO-python')" "$m"
> done
> ```
>
> Checked 2026-10-06, that returns Python for **v80 – v84** and none for v76 – v79. It
> returned Python for v76 alone until the 2026-09-02 merge, which took `main`'s v76 – v79
> (30-file snapshots, no Python) and dropped this branch's own v76 – v78; see the top of
> [`CHANGELOG.md`](CHANGELOG.md) and
> [`docs/handoffs/2026-08-12-main-divergence-and-the-v76-collision.md`](../../docs/handoffs/2026-08-12-main-divergence-and-the-v76-collision.md).

> **That collision is now checked, not just described.** `main-manifests.json` records
> the sha1 of every `vN/manifest.json` on `main` at a named commit, and
> `tools/builder-tests/lib/snapshot-collisions.mjs` (run by `run-all.mjs` as *engine
> snapshot numbers do not collide with main*) asserts the colliding set is **exactly**
> the record's `expected_collisions` — `v76, v77, v78` before the 2026-09-02 merge,
> empty since (record taken at `origin/main @ 1c399c0`, with v80 – v84 listed as
> local-only). A **new** collision reddens it, and so does a collision that has been
> *resolved* without updating the record, so the list cannot quietly go stale after the
> port-forward renumbers ours. Refresh with `--update` after fetching `main`, and read
> the diff: a version moving from identical to colliding is an event.

> Up to v79 the codegen that emits most of the ROM was **outside** the snapshot,
> so two matching snapshots in that range say nothing about whether it changed.
> Treat v1–v79 as records of the templates and cc65 project, not as full records
> of what produced a ROM. The gap cannot be repaired — those directories are
> immutable. See
> [`docs/design/engine-versioning.md`](../../docs/design/engine-versioning.md)
> and the superseded local ~~v76~~ entry in [`CHANGELOG.md`](CHANGELOG.md).

This scheme began at **v1** (baseline) with the first engine feature — per-door
destinations — shipping as **v2**, always snapshotting v1 first so every v1 game
keeps a working fallback. The engine is now well past that; see
[`CHANGELOG.md`](CHANGELOG.md) (newest entry first) for what shipped in each
version. The authoritative current number is `ENGINE_VERSION` in this directory —
deliberately not repeated here, because a hard-coded version in prose goes stale
the next time one ships.

See [`docs/design/engine-versioning.md`](../../docs/design/engine-versioning.md).
