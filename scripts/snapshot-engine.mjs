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
 * Content is read from **git HEAD**, not the working tree, because the build
 * server regenerates several src/ files per-compile (behaviour.c, bg_world.*,
 * scene.inc, main.c, level.nam …). Reading from HEAD makes both snapshotting
 * and --check deterministic regardless of a dirty working tree. Therefore all
 * engine files must be committed before snapshotting a version.
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
      if (bySha[rel] !== sha1(buf)) { console.error('DRIFT (vs HEAD): ' + rel); drift++; }
    }

    // Direction 2: everything the snapshot lists must still be there.
    //
    // Without this the gate could not see a DELETION at all: the loop above
    // walks the filesystem, so a file that no longer exists is simply never
    // visited, and --check stayed green while an engine source vanished.
    // Verified by moving steps/Step_Playground/cfg/nes.cfg aside — the gate
    // reported "✓ ... (41 files)" with 40 files present.
    for (const { path: rel } of man.files) {
      if (onDisk.has(rel)) continue;
      console.error('MISSING (in snapshot, not on disk): ' + rel);
      drift++;
    }

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
