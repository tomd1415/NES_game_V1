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
];
const INCLUDE_FILES = [
  'tools/tile_editor_web/builder-assembler.js',
  'tools/tile_editor_web/builder-modules.js',
  'tools/tile_editor_web/engine-version.js',
  'steps/Step_Playground/Makefile',
];
// NOTE: the build server (tools/playground_server.py) also performs ROM
// codegen (behaviour.c, CHR, palettes, scene.inc, …). It is a single large
// file mixing server + codegen, so it is not file-copied here yet; it is
// still versioned via git. Extracting its codegen into a snapshottable
// module is tracked as an E-V2 follow-up (see docs/design/engine-versioning.md).
const EXCLUDE_RE = /(^|\/)(build|dist|node_modules)(\/|$)|\.nes$|\.o$/;

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
    for (const rel of files) {
      const buf = headBytes(rel);
      if (buf === null) continue; // uncommitted new file — ignore until committed
      compared++;
      // A committed file absent from the manifest lands here too: bySha[rel] is
      // undefined and never equals a real hash, so additions are caught.
      if (bySha[rel] !== sha1(buf)) { console.error('DRIFT (vs HEAD): ' + rel); drift++; }
    }
    // ...and now the other direction, which used to be missing entirely.
    //
    // The loop above walks the LIVE enumeration, so it can only ever visit files
    // that still exist. A file the manifest lists which has since been deleted or
    // renamed was never visited, and the check passed. Verified 2026-08-12 by
    // moving steps/Step_Playground/src/asm_macros.inc aside: the gate printed
    // "✓ v78 snapshot matches HEAD (30 files)" and exited 0, with 29 files on
    // disk and the 30th unexamined. Losing an engine source is exactly what a
    // frozen snapshot exists to make impossible, so it has to be drift.
    const live = new Set(files);
    for (const f of man.files) {
      if (!live.has(f.path)) {
        console.error('MISSING (in the v' + v + ' snapshot, not in the engine any more): ' + f.path);
        drift++;
      }
    }
    if (drift) { console.error(`\n${drift} committed engine file(s) differ from the v${v} snapshot. Bump ENGINE_VERSION + snapshot again.`); process.exit(1); }
    // Report what was actually compared, not what the manifest claims to hold.
    // The old message said "(N files)" using the manifest's own count, so it read
    // identically whether 30 files were checked or none were.
    console.log(`✓ v${v} snapshot matches HEAD (${compared} compared, ${man.files.length} in the snapshot).`);
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
