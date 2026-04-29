#!/usr/bin/env node
// Unified Builder regression runner.
//
// Runs every smoke-test suite in sequence, plus a few invariant checks
// that would be awkward to duplicate inside each suite:
//
//   1. Syntax-check every JS file in tools/tile_editor_web that we
//      ship (assembler, modules, validators, sprite-render, the
//      shared storage module, and the inline scripts of builder.html
//      / sprites.html / index.html / behaviour.html / code.html).
//   2. Byte-identical-ROM invariant: Step_Playground's baseline ROM
//      hash must match after swapping the Builder's
//      platformer.c template in (no modules ticked).  That's the
//      "Builder additions don't leak into a no-modules project"
//      guarantee.
//   3. The individual smoke scripts, each of which spawns its own
//      playground server on a unique port.
//
// Exits 0 if every step passes, 1 on the first failure.  Can be
// invoked as `node tools/builder-tests/run-all.mjs` from the repo
// root, or `./tools/builder-tests/run-all.mjs`.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');
const STEP = path.join(ROOT, 'steps', 'Step_Playground');
const TEMPLATE = path.join(WEB, 'builder-templates', 'platformer.c');

// --- Step 1: JS syntax check -------------------------------------------
function check(label, fn) {
  process.stdout.write(label + ' ... ');
  try {
    fn();
    console.log('OK');
    return true;
  } catch (e) {
    console.log('FAIL');
    console.error('  ' + (e.message || e));
    return false;
  }
}

let anyFail = false;

// Standalone JS files — use `node --check`.
const standalone = [
  'storage.js', 'feedback.js', 'sprite-render.js',
  'builder-assembler.js', 'builder-modules.js', 'builder-validators.js',
  'play-pipeline.js', 'emulator.js', 'help.js',
  'tour.js',
];
for (const f of standalone) {
  const full = path.join(WEB, f);
  if (!fs.existsSync(full)) continue;  // tour.js etc. may be optional
  const ok = check('syntax ' + f, () => {
    const r = spawnSync('node', ['--check', full], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr.trim() || r.stdout.trim());
  });
  if (!ok) anyFail = true;
}

// Inline <script> bodies in the HTML pages.  Regex-extract, write to
// /tmp, then node --check each one.  (These are the heavyweight scripts
// that define the pages' entire behaviour.)
function extractInline(file) {
  const src = fs.readFileSync(path.join(WEB, file), 'utf8');
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m; let i = 0;
  while ((m = re.exec(src)) !== null) {
    const p = path.join('/tmp', `chk_${file.replace('.html', '')}_${i++}.js`);
    fs.writeFileSync(p, m[1]);
    out.push(p);
  }
  return out;
}
for (const page of ['builder.html', 'sprites.html', 'index.html',
                    'behaviour.html', 'code.html']) {
  const chunks = extractInline(page);
  chunks.forEach((p, idx) => {
    const ok = check('syntax ' + page + '[' + idx + ']', () => {
      const r = spawnSync('node', ['--check', p], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(r.stderr.trim() || r.stdout.trim());
    });
    if (!ok) anyFail = true;
  });
}

// Python server syntax.
check('syntax tools/playground_server.py', () => {
  const r = spawnSync('python3',
    ['-m', 'py_compile', path.join(ROOT, 'tools', 'playground_server.py')],
    { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr.trim() || r.stdout.trim());
}) || (anyFail = true);

console.log('');

// --- Step 2: fix-specific regression guards ---------------------------
//
// Cheap regex assertions on the templates + server so pupil-reported
// bugs we've already fixed don't silently regress in a later refactor.
// Each check explains the bug it guards against — if you touch one of
// the call-outs, update (or remove) the guard deliberately.

function readTwoTemplates() {
  return [
    { name: 'Step_Playground main.c',
      body: fs.readFileSync(path.join(STEP, 'src', 'main.c'), 'utf8') },
    { name: 'builder platformer.c template',
      body: fs.readFileSync(TEMPLATE, 'utf8') },
  ];
}

// Guard: OAM DMA is still the sprite-render path.  Regressing to the
// old per-byte `OAM_DATA = x;` writes inside vblank causes mid-screen
// corruption on real hardware / fceux because the writes overrun the
// ~2273-cycle NTSC vblank budget for complex scenes.  See the
// "Sprite pipeline — OAM DMA" entry in changelog-implemented.md.
check('invariant: both templates use OAM DMA (not per-byte OAM_DATA writes)', () => {
  for (const t of readTwoTemplates()) {
    if (!/oam_buf\[oam_idx\+\+\]\s*=/.test(t.body)) {
      throw new Error(t.name + ': missing oam_buf shadow writes (DMA pipeline reverted?)');
    }
    if (!/OAM_DMA\s*=\s*0x02/.test(t.body)) {
      throw new Error(t.name + ': missing `OAM_DMA = 0x02` inside vblank');
    }
    // No bare `OAM_DATA = ...;` assignments outside the #define line
    // (the macro definition uses spaces, writes use `=`).
    const badOamData = t.body.match(/OAM_DATA\s*=\s*[a-zA-Z0-9_]/g) || [];
    // The #define keeps `OAM_DATA` in the source but doesn't have
    // `OAM_DATA = <identifier>` syntax — this regex only matches
    // assignments.  Any match = a real write snuck back in.
    if (badOamData.length) {
      throw new Error(t.name + ': ' + badOamData.length +
        ' raw OAM_DATA write(s) — should be oam_buf writes');
    }
  }
}) || (anyFail = true);

// Guard: climbing blocks on solid ground / walls unless the target
// cell is also a LADDER.  Before the 2026-04-24 fix, climbing UP
// decremented py unconditionally and pupils could walk through floors.
check('invariant: ladder climb checks target-cell behaviour in both templates', () => {
  for (const t of readTwoTemplates()) {
    // Both up and down branches should probe behaviour_at on their
    // target row and honour a LADDER / SOLID_GROUND tie-break.
    if (!/up_ladder\s*=.*BEHAVIOUR_LADDER/s.test(t.body)) {
      throw new Error(t.name + ': ladder climb-up guard missing (up_ladder LADDER check)');
    }
    if (!/dn_ladder\s*=.*BEHAVIOUR_LADDER/s.test(t.body)) {
      throw new Error(t.name + ': ladder climb-down guard missing (dn_ladder LADDER check)');
    }
    if (!/if \(up_ladder \|\| !up_solid\)/.test(t.body)) {
      throw new Error(t.name + ': up-climb tie-break `up_ladder || !up_solid` missing');
    }
  }
}) || (anyFail = true);

// Guard: the native-fceux branch launches the just-built ROM via
// a dedicated file, not the stale shared game.nes.  Before the fix,
// tempdir-built ROMs were discarded and fceux loaded whatever an
// earlier `make` had left on disk.
check('invariant: playground_server.py native launch uses _play_latest.nes', () => {
  const body = fs.readFileSync(path.join(ROOT, 'tools', 'playground_server.py'),
                               'utf8');
  if (!/_play_latest\.nes/.test(body)) {
    throw new Error('native launch path must write to _play_latest.nes');
  }
  // The pre-fix bug was `Popen([FCEUX_PATH, STEP_DIR / "game.nes"])`.
  // After the fix, Popen is given `latest_rom`.  Catch the regression
  // by requiring the current shape.
  if (!/Popen\(\s*\[\s*FCEUX_PATH\s*,\s*str\(latest_rom\)/s.test(body)) {
    throw new Error('native launch should Popen FCEUX_PATH with latest_rom, not a stale path');
  }
}) || (anyFail = true);

// Guard: PlayPipeline.capabilities() probes /health, not /capabilities.
// The wrong endpoint (/capabilities) 404'd silently and disabled the
// Local-fceux option on every page — fixed 2026-04-24.
check("invariant: play-pipeline.js capabilities() probes /health", () => {
  const body = fs.readFileSync(path.join(WEB, 'play-pipeline.js'), 'utf8');
  if (!/fetch\('\/health'/.test(body)) {
    throw new Error("capabilities() must fetch '/health' (was '/capabilities', " +
      'which 404s and disables Local mode everywhere)');
  }
  if (/fetch\('\/capabilities'/.test(body)) {
    throw new Error("capabilities() must not fetch '/capabilities' " +
      '(wrong endpoint — use /health)');
  }
}) || (anyFail = true);

// Guard: scroll.c's streaming blocks must not contain bare `continue`
// statements.  When the one-per-vblank cap turned the outer `while`s
// into `if`s, the leftover `continue`s became a compile error for any
// pupil project that actually scrolls (BG_WORLD_COLS > 32 or
// BG_WORLD_ROWS > 30) — but the byte-identical baseline tests the
// 32x30 no-scroll path where those blocks are compiled out by `#if`,
// so the error didn't surface here until a pupil hit /play on a wide
// project.  This guard checks the literal source text.
check('invariant: scroll.c has no bare `continue` in streaming blocks', () => {
  // Strip block + line comments before the check so "continue;" inside
  // the explanatory comment (describing the bug this guard exists for)
  // doesn't trigger a false positive.
  const raw = fs.readFileSync(path.join(STEP, 'src', 'scroll.c'), 'utf8');
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g,       ' ');
  // Exception: `continue` is legal inside `for`/`while` bodies.  The
  // ones that bit us were at the top level of the `if ((cam_x >> 3)
  // != (prev_cam_x >> 3)) { ... }` blocks, i.e. outside any loop in
  // this file.  scroll.c has no legitimate `continue` in its current
  // form, so the guard treats any occurrence as a regression.
  const m = /\bcontinue\s*;/.exec(src);
  if (m) {
    throw new Error('scroll.c contains a bare `continue` near offset ' +
      m.index + ' — remove it or wrap the surrounding code in a real loop');
  }
}) || (anyFail = true);

// Guard: the PPU/OAM register macros must stay `volatile`.  Without
// the qualifier cc65 elides the `PPU_CTRL = +32 stride` write that
// precedes the column burst in scroll_stream, and the 30-tile column
// smears across one nametable row each scroll-step (full-screen
// corruption on any 2×1+ project).  Discovered 2026-04-25 via FCEUX
// PPU-Viewer; closed the parked C2 scroll-flicker bug.
check('invariant: PPU register macros are volatile', () => {
  const files = [
    path.join(STEP, 'src', 'scroll.c'),
    path.join(STEP, 'src', 'main.c'),
    path.join(ROOT, 'tools', 'tile_editor_web', 'builder-templates', 'platformer.c'),
  ];
  for (const f of files) {
    const raw = fs.readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g,       ' ');
    // Match the literal pattern these files used before the fix.
    // `*((unsigned char*)0x20XX)` without `volatile` is the hazard.
    const m = /\*\s*\(\s*\(\s*unsigned\s+char\s*\*\s*\)\s*0x[0-9A-Fa-f]+\s*\)/.exec(raw);
    if (m) {
      throw new Error(path.relative(ROOT, f) +
        ' has a non-volatile PPU/OAM macro near offset ' + m.index +
        ' — keep `(*(volatile unsigned char*)0xNNNN)` or cc65 will elide stride writes');
    }
  }
}) || (anyFail = true);

console.log('');

// Guard: every editor page that loads storage.js must instantiate
// the storage wrapper via `createTileEditorStorage(...)`.  audio.html
// shipped 2026-04-26 referencing `Storage.loadCurrent()` without
// calling the factory — `Storage` resolved to the browser's
// built-in Web Storage interface, the call threw silently inside
// the IIFE, and pupils saw "No project yet" even when projects
// existed (because state stayed null).  Cheap text-level guard so
// the same mistake can't ship undetected on a future page.
// 2026-04-27 — link from audio.html (and any future editor page) to
// pupil-facing docs goes through `/docs/<path>`, served by a custom
// branch in playground_server.py's do_GET because the static handler's
// directory is `tools/tile_editor_web/`, not the project root.  Guard
// so the route can't get accidentally removed: assert the server file
// has the `/docs/` branch + the `_docs_static` helper.
check('invariant: playground_server.py exposes /docs/ route for editor doc links', () => {
  const py = fs.readFileSync(path.join(ROOT, 'tools', 'playground_server.py'), 'utf8');
  if (!/parsed\.path\.startswith\(["']\/docs\/["']\)/.test(py)) {
    throw new Error("playground_server.py do_GET no longer matches '/docs/' — " +
      "audio.html's <a href=\"/docs/guides/AUDIO_GUIDE.md\"> will 404 again");
  }
  if (!/def _docs_static\(self,/.test(py)) {
    throw new Error("playground_server.py is missing _docs_static() — " +
      "the /docs/ route handler that serves files from project-root docs/");
  }
}) || (anyFail = true);

check('invariant: every page that loads storage.js calls createTileEditorStorage', () => {
  const pages = ['index.html', 'sprites.html', 'behaviour.html',
                 'builder.html', 'code.html', 'audio.html', 'gallery.html'];
  for (const p of pages) {
    const html = fs.readFileSync(path.join(WEB, p), 'utf8');
    const loadsStorage = /<script\s+src=["']storage\.js["']/i.test(html);
    if (!loadsStorage) continue;
    if (!/createTileEditorStorage\s*\(/.test(html)) {
      throw new Error(`${p} loads storage.js but never calls createTileEditorStorage(...)` +
        ' — Storage.loadCurrent will hit the browser\'s Web Storage interface and throw');
    }
  }
}) || (anyFail = true);

// T1.3 follow-up — duplicate-sprite must allocate fresh tile slots.
//
// Pre-2026-04-26 the duplicate-sprite handler did
// `JSON.parse(JSON.stringify(sp))` and pushed the result, which deep-
// cloned the sprite struct (cells, name, role, ...) but kept every
// cell's `tile` index pointing at the *shared* `state.sprite_tiles`
// entry.  Editing the duplicate's pixels then silently edited the
// original.  The fix allocates a fresh contiguous tile run via
// `findFreeTileRun(w*h, state)` and copies pixels into it.  This
// guard checks the handler text still does both — a pure source-text
// regression so the cheaper text-only fix doesn't get reverted by
// accident.  A behavioural test would need a JSDOM harness which the
// project doesn't currently have; if/when that lands this guard can
// be replaced with a real assertion.
check('invariant: btn-sprite-dup handler clones tile pixels (not just sprite struct)', () => {
  const html = fs.readFileSync(path.join(WEB, 'sprites.html'), 'utf8');
  const dupBlockMatch = html.match(/btn-sprite-dup'\)\.addEventListener\([\s\S]*?renderAll\(\);\s*\}\);/);
  if (!dupBlockMatch) {
    throw new Error("sprites.html: couldn't locate the btn-sprite-dup click handler" +
      ' — the regex needs updating if the structure changed');
  }
  const dupBlock = dupBlockMatch[0];
  if (!/findFreeTileRun\(/.test(dupBlock)) {
    throw new Error('btn-sprite-dup handler no longer calls findFreeTileRun(...) — ' +
      'duplicating a sprite will silently share tile pixels with the original ' +
      '(item 18 in docs/feedback/recently-observed-bugs.md regressed)');
  }
  if (!/clonePixels\(/.test(dupBlock)) {
    throw new Error('btn-sprite-dup handler no longer calls clonePixels(...) — ' +
      'duplicate sprite will reference original tile pixels by index ' +
      '(item 18 in docs/feedback/recently-observed-bugs.md regressed)');
  }
  if (!/state\.sprite_tiles\[\s*t\s*\]\s*=/.test(dupBlock)) {
    throw new Error('btn-sprite-dup handler no longer writes a fresh ' +
      'state.sprite_tiles[t] entry — the new tile slots will be empty and ' +
      'the duplicate will paint from a stale tile');
  }
}) || (anyFail = true);

// --- Step 3: byte-identical ROM invariant ------------------------------
//
// Step_Playground's stock main.c compiles to a baseline ROM.  Swapping
// in the Builder's platformer.c (with no modules ticked because no
// scene.inc is re-emitted by this test) should produce a ROM with the
// same sha1sum.  Guards the "Builder additions are strictly gated" rule.
check('invariant: Step_Playground ROM byte-identical after template swap', () => {
  const stockPath = path.join(STEP, 'src', 'main.c');
  const backup = fs.readFileSync(stockPath);
  // Build baseline first (ensure game.nes is up to date).
  execSync('make -s', { cwd: STEP, stdio: ['ignore', 'ignore', 'pipe'] });
  const baseline = execSync('sha1sum game.nes', { cwd: STEP }).toString().trim().split(/\s+/)[0];
  try {
    fs.writeFileSync(stockPath, fs.readFileSync(TEMPLATE));
    execSync('make -s clean', { cwd: STEP, stdio: ['ignore', 'ignore', 'ignore'] });
    execSync('make -s', { cwd: STEP, stdio: ['ignore', 'ignore', 'pipe'] });
    const swapped = execSync('sha1sum game.nes', { cwd: STEP }).toString().trim().split(/\s+/)[0];
    if (swapped !== baseline) {
      throw new Error('ROM hash drifted: baseline=' + baseline.slice(0, 12) +
        ' swapped=' + swapped.slice(0, 12));
    }
  } finally {
    fs.writeFileSync(stockPath, backup);
    execSync('make -s clean', { cwd: STEP, stdio: ['ignore', 'ignore', 'ignore'] });
    execSync('make -s', { cwd: STEP, stdio: ['ignore', 'ignore', 'pipe'] });
  }
}) || (anyFail = true);

console.log('');

// --- Step 4: run each smoke suite -------------------------------------
//
// Each `.mjs` file in tools/builder-tests (excluding this runner)
// spawns its own server on a unique port and exits 0 on success.
// We run them one-at-a-time so ports don't collide.
const suites = fs.readdirSync(__dirname)
  .filter(f => f.endsWith('.mjs') && f !== path.basename(__filename))
  .sort();
for (const suite of suites) {
  const full = path.join(__dirname, suite);
  process.stdout.write('suite ' + suite + ' ... ');
  const r = spawnSync('node', [full], { encoding: 'utf8' });
  if (r.status === 0) {
    // Print just the last line (summary) so the runner's output
    // stays scannable.
    const lines = (r.stdout || '').trim().split('\n');
    const last = lines[lines.length - 1] || 'ok';
    console.log('OK — ' + last);
  } else {
    console.log('FAIL (exit ' + r.status + ')');
    console.error((r.stdout || '').split('\n').slice(-15).join('\n'));
    console.error((r.stderr || '').split('\n').slice(-15).join('\n'));
    anyFail = true;
  }
}

console.log('');
if (anyFail) {
  console.error('❌ One or more checks failed.');
  process.exit(1);
} else {
  console.log('✅ All Builder regression checks pass.');
}
