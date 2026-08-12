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
>   [`docs/guides/LESSONS_LEARNT.md`](../../docs/guides/LESSONS_LEARNT.md).)
>
> **⚠ What a snapshot covers changed at v76 — two eras, not comparable.**
>
> | Snapshots | Cover |
> | --- | --- |
> | **v1 – v75** | JS + cc65 sources only. **30 files, no Python.** |
> | **v76 onward** *(on this branch)* | the above **plus `tools/nes_studio_core/`**, the server's ROM codegen. |
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
> On this branch today that returns Python for **v76 only**. It will *not* stay that
> way: `main` has since published v76, v77 and v78 as 30-file snapshots with **no**
> Python, and its v76 is a different snapshot from this branch's. Merging `main` makes
> any sentence of the form "v76 onward includes the codegen" false for three published
> versions — see
> [`docs/handoffs/2026-08-12-main-divergence-and-the-v76-collision.md`](../../docs/handoffs/2026-08-12-main-divergence-and-the-v76-collision.md).

> Up to v75 the codegen that emits most of the ROM was **outside** the snapshot,
> so two matching snapshots in that range say nothing about whether it changed.
> Treat v1–v75 as records of the templates and cc65 project, not as full records
> of what produced a ROM. The gap cannot be repaired — those directories are
> immutable. See
> [`docs/design/engine-versioning.md`](../../docs/design/engine-versioning.md)
> and the v76 entry in [`CHANGELOG.md`](CHANGELOG.md).

This scheme began at **v1** (baseline) with the first engine feature — per-door
destinations — shipping as **v2**, always snapshotting v1 first so every v1 game
keeps a working fallback. The engine is now well past that; see
[`CHANGELOG.md`](CHANGELOG.md) for the current version (**v76** as of 2026-08-06;
read `ENGINE_VERSION` rather than trusting this line) and every step in between.

See [`docs/design/engine-versioning.md`](../../docs/design/engine-versioning.md).
