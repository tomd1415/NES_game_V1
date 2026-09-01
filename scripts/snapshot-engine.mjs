#!/usr/bin/env node
/*
 * snapshot-engine.mjs — freeze the current NES engine as tools/engines/v<N>/.
 *
 * The "engine" is the set of sources that determine ROM output: the C
 * templates, the assembler, and the cc65 project (src/cfg/Makefile/assets).
 * A snapshot lets a future engine rebuild a game with the engine it was
 * authored for (rollback / compatibility fallback). Snapshots are immutable
 * once written — a fix goes into a new version.
 *
 * Content is read from **git HEAD**, not the working tree, so that both
 * snapshotting and --check are deterministic regardless of a dirty tree.
 * Therefore all engine files must be committed before snapshotting a version.
 *
 * That is still the right behaviour, but the reason originally given for it has
 * expired and is corrected here rather than left to mislead: it said the build
 * server "regenerates several src/ files per-compile (behaviour.c, bg_world.*,
 * scene.inc, main.c, level.nam …)", i.e. that the working tree could not be
 * trusted. `_build_rom()` now builds inside a `tempfile.TemporaryDirectory` on
 * both the C and the ASM path, so a /play leaves the tree clean. Determinism is
 * the reason to read from HEAD; a self-dirtying build is no longer one.
 *
 * The consequence to keep in mind is unchanged and is the thing people trip on:
 * --check compares HEAD against the manifest, so a green result says nothing
 * about uncommitted work. See "The limitation, stated plainly" in
 * tools/builder-tests/README.md.
 *
 * Usage:
 *   node scripts/snapshot-engine.mjs            # snapshot the current version
 *   node scripts/snapshot-engine.mjs --check    # verify the snapshot vs HEAD
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINES = join(ROOT, 'tools', 'engines');

// The engine file-set. Directories are walked; build artifacts and ROMs are
// excluded so a snapshot is source, not output.
const INCLUDE_DIRS = [
  'tools/tile_editor_web/builder-templates',
  'steps/Step_Playground/src',
  'steps/Step_Playground/cfg',
  'steps/Step_Playground/assets',
  // v76 — the server's ROM codegen, extracted into a package and now covered.
  // Until v76 the snapshot was 30 files with no Python in it at all, so a
  // change to the code that emits most of the ROM could not make this gate go
  // red (F7). See the note below for what is still outside.
  'tools/nes_studio_core',
];
const INCLUDE_FILES = [
  'tools/tile_editor_web/builder-assembler.js',
  'tools/tile_editor_web/builder-modules.js',
  'tools/tile_editor_web/engine-version.js',
  'steps/Step_Playground/Makefile',
];
// NOTE (updated v76): the E-V2 follow-up is now done for the codegen itself.
// The ROM-emitting entry points in tools/playground_server.py —
// build_behaviour_c, build_scene_inc, build_project_inc, build_bg_world_h and
// build_bg_world_c — are each a one-line delegation into tools/nes_studio_core,
// which IS snapshotted as of v76.
//
// What is still outside the snapshot: playground_server.py itself. It remains a
// large file mixing HTTP serving with the request handling that assembles those
// codegen calls, and it is still versioned only by git. If those delegations are
// ever inlined back, this gate silently narrows again — that is the failure mode
// to watch for, and it is why the delegation is spelled out here by name.
const EXCLUDE_RE =
  /(^|\/)(build|dist|node_modules|__pycache__)(\/|$)|\.nes$|\.o$|\.pyc$/;

function walk(dir, acc) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = relative(ROOT, p);
    if (EXCLUDE_RE.test(rel)) continue;
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(rel);
  }
  return acc;
}
function engineFiles() {
  const files = [];
  for (const d of INCLUDE_DIRS) walk(join(ROOT, d), files);
  for (const f of INCLUDE_FILES) if (existsSync(join(ROOT, f))) files.push(f);
  return files.sort();
}
// Read a path's committed (HEAD) bytes; null if not tracked.
function headBytes(rel) {
  const r = spawnSync('git', ['-C', ROOT, 'show', 'HEAD:' + rel], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}
function sha1(buf) { return createHash('sha1').update(buf).digest('hex'); }
function version() { return readFileSync(join(ENGINES, 'ENGINE_VERSION'), 'utf8').trim(); }

function main() {
  const check = process.argv.includes('--check');
  const v = version();
  const outDir = join(ENGINES, 'v' + v);
  const files = engineFiles();

  if (check) {
    const manPath = join(outDir, 'manifest.json');
    if (!existsSync(manPath)) { console.error('No snapshot for v' + v + ' at ' + outDir); process.exit(1); }
    const man = JSON.parse(readFileSync(manPath, 'utf8'));
    const bySha = Object.fromEntries(man.files.map((f) => [f.path, f.sha1]));
    let drift = 0;
    let compared = 0;

    // Direction 1: everything on disk must match the snapshot.
    const onDisk = new Set(files);
    for (const rel of files) {
      const buf = headBytes(rel);
      if (buf === null) continue; // uncommitted new file — ignore until committed
      compared++;
      // A committed file absent from the manifest lands here too: bySha[rel] is
      // undefined and never equals a real hash, so additions are caught. (`main`'s
      // note, kept — this branch had the behaviour and not the sentence.)
      if (bySha[rel] !== sha1(buf)) { console.error('DRIFT (vs HEAD): ' + rel); drift++; }
    }

    // Direction 2: everything the snapshot lists must still be there — in BOTH
    // senses, because a file can go missing in two independent ways and each one
    // hides from the other check.
    //
    //   * gone from disk, still in HEAD — e.g. moved aside mid-work. Direction 1
    //     walks the filesystem, so it simply never visits the file.
    //   * still on disk, gone from HEAD — e.g. `git rm --cached` then commit. Now
    //     direction 1 DOES visit it, but headBytes() returns null and the loop
    //     skips it as "an uncommitted new file".
    //
    // The second was live until 2026-08-07 and is the nastier of the two: an
    // engine source leaves version control, so it is absent from any fresh clone,
    // and the gate said "✓ ... (40 of 41 files compared)" and exited 0. The count
    // told you; nothing failed.
    for (const { path: rel } of man.files) {
      const missingFromDisk = !onDisk.has(rel);
      const missingFromHead = headBytes(rel) === null;
      if (!missingFromDisk && !missingFromHead) continue;
      const where = missingFromDisk && missingFromHead
        ? 'not on disk and not in HEAD'
        : missingFromDisk
          ? 'not on disk'
          : 'not in HEAD — it is still on disk but no longer tracked';
      console.error(`MISSING (in the v${v} snapshot, ${where}): ` + rel);
      drift++; // once per file, however many ways it has gone missing
    }

    // Direction 3: the ARCHIVE itself must contain what its manifest promises.
    //
    // Directions 1 and 2 both look at the LIVE engine sources. Neither ever opens the
    // frozen copy under tools/engines/v<N>/, so a snapshot could list a file it does not
    // actually contain and this gate would still print "41 of 41 files compared, 0
    // missing" — which is precisely what happened. Bare `.gitignore` patterns
    // (`scene.inc`, `game.chr`, `level.nam`) matched at any depth, including inside the
    // archive, so `git add` silently declined those three in EVERY snapshot v1..v77.
    // The bytes for v1-v75 are now gone from disk as well as from git: those archives
    // are permanently incomplete, and the point of an archive is to rebuild a game with
    // the engine it was authored for.
    // Read the frozen copy out of HEAD, NOT off the filesystem. The first version of
    // this check used existsSync() and passed here while the files were untracked --
    // present on disk, absent from every fresh clone. That is the same mistake as F5
    // (the ROM fixtures) and the same one this direction exists to catch, made inside
    // the fix for it. On-disk existence is not archival.
    let absent = 0;
    const relTo = outDir.slice(ROOT.length + 1);
    for (const { path: rel, sha1: want } of man.files) {
      const frozen = headBytes(relTo + '/' + rel);
      if (frozen === null) {
        console.error(`ABSENT FROM THE ARCHIVE (v${v}): ` + rel + ' — the manifest lists it, but ' + relTo + '/' + rel + ' is not in HEAD, so a fresh clone does not get it');
        absent++;
        continue;
      }
      if (sha1(frozen) !== want) {
        console.error(`ARCHIVE CORRUPT (v${v}): ` + rel + ' — the frozen copy does not match the sha1 the manifest records for it');
        absent++;
      }
    }
    if (absent) { console.error(`\n${absent} file(s) the v${v} manifest promises are missing from or wrong in tools/engines/v${v}/. A snapshot that cannot be read back is not a snapshot.`); process.exit(1); }

    if (drift) { console.error(`\n${drift} engine file(s) differ from or are missing against the v${v} snapshot. Bump ENGINE_VERSION + snapshot again.`); process.exit(1); }
    // Report what was actually compared, not the manifest's length. The old
    // message printed man.files.length regardless, so it read as a stronger
    // check than it was.
    console.log(`✓ v${v} snapshot matches HEAD (${compared} of ${man.files.length} files compared, 0 missing).`);
    return;
  }

  if (existsSync(join(outDir, 'manifest.json'))) {
    console.error(`Snapshot v${v} already exists (immutable). Bump tools/engines/ENGINE_VERSION first.`);
    process.exit(1);
  }
  const manifest = { version: Number(v), files: [] };
  let skipped = 0;
  for (const rel of files) {
    const buf = headBytes(rel);
    if (buf === null) { console.warn('  (skip, not committed) ' + rel); skipped++; continue; }
    const dst = join(outDir, rel);
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, buf);
    manifest.files.push({ path: rel, sha1: sha1(buf) });
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✓ Snapshotted engine v${v}: ${manifest.files.length} files → ${relative(ROOT, outDir)}`
    + (skipped ? ` (${skipped} uncommitted skipped — commit then re-snapshot)` : ''));
}

main();
