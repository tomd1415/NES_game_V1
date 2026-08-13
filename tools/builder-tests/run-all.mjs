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
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Every suite that boots playground_server.py inherits this env, so the pupil-
// accounts store (T4.2) writes to a throwaway temp DB for the whole run rather
// than creating the real tools/accounts.db.  (accounts.mjs sets its own.)
if (!process.env.PLAYGROUND_ACCOUNTS_DB) {
  process.env.PLAYGROUND_ACCOUNTS_DB = path.join(os.tmpdir(), 'pg-suite-accounts.db');
  for (const s of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(process.env.PLAYGROUND_ACCOUNTS_DB + s); } catch {}
  }
}
// Every spawned server inherits this, so a developer's local .env (join code,
// admin secret…) can never leak into a test run and make it environment-
// dependent.  Suites set the exact env they need explicitly.
process.env.PLAYGROUND_SKIP_DOTENV = '1';

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

// Standalone JS files — use `node --check`. Enumerated from disk at RUNTIME,
// deliberately, rather than hand-listed.
//
// This used to be a list of 14 filenames followed by
// `if (!fs.existsSync(full)) continue;` — two silent-coverage bugs in four lines.
// A module added to the editor was simply never checked, and a module renamed
// dropped off the list without anything going red. Measured on 2026-08-07: 18 of
// the 32 shipped modules were unchecked, including *every* Studio mode module
// (studio-world.js, studio-tiles.js, studio-chars.js, studio-ui.js …) — which is
// exactly where the feature work happens.
//
// Enumerating the directory means the check covers whatever is actually there.
// Vendored bundles are the only exclusion and they are identifiable by name
// (`*.min.js` — jsnes and CodeMirror), so there is no second list to keep in step
// with the first. All 32 pass today, so widening this cost nothing to adopt.
const shipped = fs.readdirSync(WEB)
  .filter(f => f.endsWith('.js') && !f.endsWith('.min.js'))
  .sort();
// An empty enumeration must not read as "all clear" — that is the same
// silent-success shape this block was written to remove.
if (shipped.length === 0) {
  check('shipped JS modules found', () => {
    throw new Error(`no non-vendored .js files under ${WEB} — wrong path, or the glob broke`);
  });
  anyFail = true;
}
for (const f of shipped) {
  const ok = check('syntax ' + f, () => {
    const r = spawnSync('node', ['--check', path.join(WEB, f)], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr.trim() || r.stdout.trim());
  });
  if (!ok) anyFail = true;
}

// Engine versioning: ENGINE_VERSION matches engine-version.js, and the
// current engine snapshot is intact (no drift from live sources).
check('engine version constants agree', () => {
  const num = fs.readFileSync(path.join(ROOT, 'tools', 'engines', 'ENGINE_VERSION'), 'utf8').trim();
  const js = fs.readFileSync(path.join(WEB, 'engine-version.js'), 'utf8');
  const m = js.match(/NES_ENGINE_VERSION\s*=\s*(\d+)/);
  if (!m) throw new Error('engine-version.js: NES_ENGINE_VERSION not found');
  if (m[1] !== num) throw new Error(`ENGINE_VERSION (${num}) != engine-version.js (${m[1]})`);
}) || (anyFail = true);
check('engine snapshot matches live sources', () => {
  const r = spawnSync('node', [path.join(ROOT, 'scripts', 'snapshot-engine.mjs'), '--check'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || '').trim());
}) || (anyFail = true);

// Port hygiene: the Studio E2E server and the builder suites draw from the same
// range, and a collision between them fails SILENTLY. playground_server.py, on
// finding a *working* playground server already on its port, prints
// "already running -- nothing to do" and returns 0 — it never binds, and it
// discards the env the caller set (PLAYGROUND_ACCOUNTS_DB, PLAYGROUND_PORT…).
// The suite then runs green against a server it did not configure. Nothing goes
// red, so this drifted for a long time with only a doc note to catch it — which
// is the point: if two lists must agree, something has to fail when they don't.
// Reading the port out of playwright.config.js rather than hardcoding it keeps
// this honest if the E2E port ever moves.
//
// KNOWN LIMIT, stated rather than papered over: this scans for the port as a
// *literal*. `enemy-bump.mjs` derives its second port as `PORT + 1`, so a suite
// whose base literal happened to be one below the E2E port would slip past.
// That is not the case today (18853 -> 18854) and the arithmetic form is rare,
// but a green result here means "no suite names the port", not "no suite can
// bind it". See docs/guides/TEST-SERVERS.md for the full port map.
check('no builder-test suite claims the Studio E2E port', () => {
  const cfg = fs.readFileSync(path.join(ROOT, 'playwright.config.js'), 'utf8');
  const pm = cfg.match(/STUDIO_TEST_PORT\s*\|\|\s*(\d+)/);
  if (!pm) throw new Error('playwright.config.js: could not read the default STUDIO_TEST_PORT');
  const e2ePort = pm[1];
  const hit = new RegExp('(?<![\\d.])' + e2ePort + '(?![\\d.])');
  const offenders = [];
  for (const f of fs.readdirSync(__dirname).sort()) {
    if (!f.endsWith('.mjs') || f === 'run-all.mjs') continue;
    // Strip comments first: a suite may legitimately *mention* the port in a
    // note about this very clash, and a guard that trips on prose is decoration.
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ');
    if (hit.test(src)) offenders.push(f);
  }
  if (offenders.length) {
    throw new Error(
      `port ${e2ePort} belongs to the Studio E2E server (playwright.config.js) ` +
      `but is also claimed by: ${offenders.join(', ')}\n` +
      '  Give each suite a free port above the current highest, staying under 19000.\n' +
      '  docs/guides/TEST-SERVERS.md has the map and the grep that finds it — do\n' +
      '  not guess, the suites spell the port several ways (PORT, PORT_C/_A/_D, an\n' +
      '  inline startServer(...), and PORT + 1 in enemy-bump.mjs).');
  }
}) || (anyFail = true);

// Playwright browser builds are keyed to the Playwright VERSION, and the dev
// container bakes Chromium in at image-build time (cdn.playwright.dev is a
// rotating CDN, so runtime allowlisting is unreliable — see the Dockerfile).
// If package-lock.json floats to a new Playwright and the image is not rebuilt,
// `npx playwright test` dies with "Executable doesn't exist at
// .../chromium_headless_shell-<N>" — a confusing failure a long way from its
// cause. Catch the drift here instead. Skipped when the devcontainer is absent.
check('devcontainer Playwright pin matches package-lock.json', () => {
  const dockerfile = path.join(ROOT, '.devcontainer', 'Dockerfile');
  const lockPath = path.join(ROOT, 'package-lock.json');
  if (!fs.existsSync(dockerfile) || !fs.existsSync(lockPath)) return;   // not applicable
  const df = fs.readFileSync(dockerfile, 'utf8');
  const m = df.match(/^ARG\s+PLAYWRIGHT_VERSION=([0-9][^\s]*)/m);
  if (!m) throw new Error('.devcontainer/Dockerfile: ARG PLAYWRIGHT_VERSION not found');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const pkg = (lock.packages || {})['node_modules/@playwright/test'];
  if (!pkg || !pkg.version) throw new Error('package-lock.json: @playwright/test not resolved');
  if (pkg.version !== m[1]) {
    throw new Error(
      `Playwright drift: package-lock.json has ${pkg.version} but ` +
      `.devcontainer/Dockerfile bakes browsers for ${m[1]}.\n` +
      `  Fix: set ARG PLAYWRIGHT_VERSION=${pkg.version} and rebuild the dev container.`);
  }
}) || (anyFail = true);

// BUILDER_GUIDE.md admits it documents only some of the Builder modules, and
// tables the rest so the gap reads as a gap rather than as "these do not exist".
// That note ends: "if that count has moved, this table has gone stale, which is
// exactly the failure this note exists to make visible."
//
// Nothing made it visible. It named the failure and left it to the next reader to
// notice — which is the "a doc note is not a check" lesson that the 18790 port
// clash already taught this project once. So: check it.
//
// Both directions, and the arithmetic between them:
//   a) the claimed total must equal the modules that actually exist
//   b) documented + tabled must equal that total (no module unaccounted for)
//   c) every module the table names must really exist (no phantom rows)
// It deliberately does NOT try to verify which 10 are "documented" — that would
// mean parsing prose for coverage, and a confident number built on fragile
// parsing is worse than an honest one maintained by hand.
check('invariant: BUILDER_GUIDE module coverage matches builder-modules.js', () => {
  const guide = fs.readFileSync(path.join(ROOT, 'docs', 'guides', 'BUILDER_GUIDE.md'), 'utf8');
  const claim = guide.match(/documents\s+(\d+)\s+of\s+the\s+(\d+)\s+modules that exist/);
  if (!claim) {
    throw new Error('BUILDER_GUIDE.md: the "documents N of the M modules that exist" ' +
      'sentence is gone or reworded — this check reads its numbers, so update both together');
  }
  const documented = Number(claim[1]);
  const claimedTotal = Number(claim[2]);

  // Scope the table to its own section so other tables in the guide cannot match.
  const secStart = guide.indexOf('### Modules this section does not cover yet');
  if (secStart < 0) throw new Error('BUILDER_GUIDE.md: the "does not cover yet" section is gone');
  const secEnd = guide.indexOf('\n## ', secStart);
  const section = guide.slice(secStart, secEnd < 0 ? undefined : secEnd);
  const tabled = [...section.matchAll(/^\|\s*`([a-zA-Z0-9_-]+)`\s*\|/gm)].map(m => m[1]);

  const src = fs.readFileSync(path.join(WEB, 'builder-modules.js'), 'utf8');
  const actual = [...new Set([...src.matchAll(/modules\['([a-zA-Z0-9_-]+)'\]/g)].map(m => m[1]))];
  // An empty enumeration must not read as agreement — it would make (a) and (c)
  // trivially satisfiable and the whole check decoration.
  if (actual.length === 0) {
    throw new Error(`no modules['<name>'] declarations found in builder-modules.js — ` +
      'the declaration form changed, and this check cannot see anything');
  }

  if (claimedTotal !== actual.length) {
    throw new Error(
      `BUILDER_GUIDE.md says ${claimedTotal} modules exist; builder-modules.js has ` +
      `${actual.length} (${actual.sort().join(', ')}).\n` +
      '  Update the count AND the "does not cover yet" table in ' +
      'docs/guides/BUILDER_GUIDE.md — a new module is undocumented until it is listed.');
  }
  if (documented + tabled.length !== claimedTotal) {
    throw new Error(
      `BUILDER_GUIDE.md accounts for ${documented} documented + ${tabled.length} tabled ` +
      `= ${documented + tabled.length}, but claims ${claimedTotal} exist. ` +
      'Every module must be either written up or listed as not-yet-written-up.');
  }
  const phantom = tabled.filter(m => !actual.includes(m));
  if (phantom.length) {
    throw new Error(
      `BUILDER_GUIDE.md tables module(s) that do not exist: ${phantom.join(', ')}.\n` +
      '  Renamed or removed in builder-modules.js without updating the guide.');
  }
}) || (anyFail = true);

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
// Enumerated from disk, for the same reason the .js list above is — and this was
// the half that got left behind. The .js fix landed 2026-08-07 after finding 18 of
// 32 shipped modules silently unchecked; this hand-list sat one screen further
// down naming five pages when there are eight.
//
// Measured 2026-08-12, before the change: audio.html (~22 kB of inline JS) and
// gallery.html (~7.8 kB) were never syntax-checked at all. studio.html has zero
// bare <script> blocks — every one carries src= — so listing it costs nothing
// today, but that is luck rather than design and it is the primary front-end.
//
// Enumerating means a new page is covered the day it appears, and a renamed one
// cannot drop out silently, which is exactly how audio.html and gallery.html were
// missed: nothing went red when they were added.
const pages = fs.readdirSync(WEB).filter(f => f.endsWith('.html')).sort();
// A page with no bare <script> is legitimate (studio.html), so an empty CHUNK
// list is fine — an empty PAGE list is not, and would silently check nothing.
if (pages.length === 0) {
  check('HTML pages found', () => {
    throw new Error(`no .html files under ${WEB} — wrong path, or the glob broke`);
  });
  anyFail = true;
}
let inlineBlocks = 0;
for (const page of pages) {
  const chunks = extractInline(page);
  inlineBlocks += chunks.length;
  chunks.forEach((p, idx) => {
    const ok = check('syntax ' + page + '[' + idx + ']', () => {
      const r = spawnSync('node', ['--check', p], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(r.stderr.trim() || r.stdout.trim());
    });
    if (!ok) anyFail = true;
  });
}
// The pages list being non-empty is not enough. extractInline finds blocks with a
// regex, and if that regex ever stops matching — a `<script >` spelling it does
// not expect, a build step that moves the bodies out — every page yields zero
// chunks, zero checks run, and the whole block passes in silence with all eight
// pages present. That is the "nothing matched" pole: the offender list is empty
// every day, whether the detector works or not.
//
// Seven blocks exist today across eight pages (studio.html has none by design).
// Asserting merely "> 0" would still be satisfied by a regex that found one and
// missed six, but a floor of one is what can be stated without hard-coding a
// number that rots; the planted-error fixture recorded above is what proves the
// detector actually works.
if (inlineBlocks === 0) {
  check('inline <script> blocks found', () => {
    throw new Error(
      `no inline <script> blocks found across ${pages.length} HTML page(s) in ${WEB}.\n` +
      '  Every page having none is possible but has never been true here — far more\n' +
      '  likely the extraction regex stopped matching, in which case this whole\n' +
      '  section was checking nothing.');
  });
  anyFail = true;
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
  // Match the ASSIGNMENT, not the bare filename. `_play_latest.nes` also appears
  // in the comment three lines above it in playground_server.py, explaining why a
  // dedicated file is used — so a test for the bare string passes on the prose
  // that documents the fix, exactly as the B6i dialogue guard once did. Deleting
  // the code would leave this green. Code-shaped patterns cannot appear in prose,
  // which is cheaper and safer here than stripping Python comments (a naive `#`
  // strip would also cut `#` inside string literals).
  if (!/latest_rom\s*=\s*STEP_DIR\s*\/\s*"_play_latest\.nes"/.test(body)) {
    throw new Error('native launch path must assign latest_rom = STEP_DIR / "_play_latest.nes" ' +
      '— a bare mention of the filename is not evidence; it appears in a comment too');
  }
  // The pre-fix bug was `Popen([FCEUX_PATH, STEP_DIR / "game.nes"])`.
  // After the fix, Popen is given `latest_rom`.  Catch the regression
  // by requiring the current shape.
  if (!/Popen\(\s*\[\s*FCEUX_PATH\s*,\s*str\(latest_rom\)/s.test(body)) {
    throw new Error('native launch should Popen FCEUX_PATH with latest_rom, not a stale path');
  }
}) || (anyFail = true);

// T7.6c — asm/C scene-emitter parity guard.  The asm /play path is
// deliberately a subset (single-player, no Builder modules), but the two
// emitters MUST agree on the shared contract they both keep: the role codes
// and the player/scene identifier names that "carry across" the pedagogy.
// This fails loudly if a future rename in one emitter silently desyncs the
// other (it does NOT force feature parity — that gap is by design).
check('invariant: asm + C scene emitters share role codes + ss_* identifiers', () => {
  const py = fs.readFileSync(path.join(ROOT, 'tools', 'playground_server.py'), 'utf8');
  // 1) Role codes come from ONE source rendered into both paths (T7.6a):
  //    a single ROLE_TABLE, and both emitters call _role_defs().
  if (!/ROLE_TABLE\s*=\s*\[/.test(py)) {
    throw new Error('ROLE_TABLE single-source role table missing (did T7.6a regress?)');
  }
  if ((py.match(/_role_defs\(/g) || []).length < 3) {
    // 1 def + 2 call sites (asm ".define", C "#define").
    throw new Error('both scene emitters must render roles via _role_defs() — a path stopped using it');
  }
  // The 11 role names must all be present in the shared table.
  for (const role of ['PLAYER', 'NPC', 'ENEMY', 'ITEM', 'TOOL', 'POWERUP',
                      'PICKUP', 'PROJECTILE', 'DECORATION', 'OTHER', 'HUD']) {
    if (!new RegExp('"' + role + '"').test(py)) {
      throw new Error('role code ' + role + ' missing from ROLE_TABLE');
    }
  }
  // 2) Both emitters must define the shared scene identifiers the pedagogy
  //    relies on (names carry across asm<->C).  Grep each emitter's body.
  const asmBody = py.slice(py.indexOf('def build_scene_asminc'), py.indexOf('def build_scene_inc'));
  const cBody   = py.slice(py.indexOf('def build_scene_inc'));
  const shared = ['player_tiles', 'player_attrs', 'NUM_STATIC_SPRITES',
    'ss_x', 'ss_y', 'ss_w', 'ss_h', 'ss_role', 'ss_offset'];
  for (const id of shared) {
    if (!asmBody.includes(id)) throw new Error('asm emitter missing shared identifier ' + id);
    if (!cBody.includes(id))   throw new Error('C emitter missing shared identifier ' + id);
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

// Guard: the C engine template must be fetched with an engine-version cache key.
// Without it a bumped engine can serve a stale platformer.c from an HTTP/proxy
// cache while the version reads current — the "ROM still flickers after the
// engine was fixed" trap (v69 debugging).  The `?v=` + version stamp makes a new
// engine a new URL that can't resolve to an older cached template.
check("invariant: play-pipeline.js version-stamps the template fetch", () => {
  const body = fs.readFileSync(path.join(WEB, 'play-pipeline.js'), 'utf8');
  if (!/builder-templates\/platformer\.c['"]\s*\+\s*\(\s*ev/.test(body)) {
    throw new Error('loadTemplate() must cache-bust the template with the engine ' +
      "version (fetch 'builder-templates/platformer.c' + (ev ? '?v='+ev : '')) — " +
      'else a stale cached template survives an engine bump.');
  }
  if (!/NES_ENGINE_VERSION/.test(body)) {
    throw new Error('loadTemplate() must derive the cache key from NES_ENGINE_VERSION.');
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

// `if (!trigger) continue;` is how a guard stops guarding without anyone noticing
// (LESSONS.md §4 — "nothing found" and "never ran" must not look the same). If the
// <script src="storage.js"> spelling ever changes — a bundler, type="module", a
// different filename — every page is skipped, the loop body never runs, and this
// prints OK having checked nothing. So the trigger's own hit-count is asserted.
//
// studio.html is exempt BY NAME rather than by a pattern: it does load storage.js,
// but calls createTileEditorStorage from studio.js instead of inline, so requiring
// the call in the page would be a false failure. Naming it means a NEW page cannot
// drift into the exemption by resembling it.
const STORAGE_INIT_EXTERNAL = ['studio.html'];   // init lives in a module, not inline
check('invariant: every page that loads storage.js calls createTileEditorStorage', () => {
  const pages = fs.readdirSync(WEB).filter(f => f.endsWith('.html')).sort();
  let triggered = 0;
  for (const p of pages) {
    const html = fs.readFileSync(path.join(WEB, p), 'utf8');
    if (!/<script\s+src=["']storage\.js["']/i.test(html)) continue;
    triggered++;
    if (STORAGE_INIT_EXTERNAL.includes(p)) continue;
    if (!/createTileEditorStorage\s*\(/.test(html)) {
      throw new Error(`${p} loads storage.js but never calls createTileEditorStorage(...)` +
        ' — Storage.loadCurrent will hit the browser\'s Web Storage interface and throw');
    }
  }
  if (triggered === 0) {
    throw new Error(
      `no page under ${WEB} matched <script src="storage.js"> — the trigger, not the\n` +
      '  pages. Every page was skipped and this guard checked nothing. Either the tag\n' +
      '  spelling changed, or storage.js is no longer loaded that way.');
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

// Private emulators must convert the ROM bytes to a binary string.
//
// The shared play pipeline (play-pipeline.js `decodeRomBase64`) hands the
// page's `onRom` callback a *Uint8Array*.  jsnes `loadROM` wants a *binary
// string* — internally it does `data.indexOf("NES")`, which returns -1 on a
// typed array, so it throws "Not a valid NES ROM." (surfaced in the UI as
// "Emulator callback failed: not a valid NES ROM").  Pages that drive their
// own jsnes instance instead of `NesEmulator.open(...)` (sprites.html and
// code.html) must convert via String.fromCharCode before loadROM.  Both
// regressed here once: openEmulator received the raw Uint8Array.  Pure
// source-text guard until a JSDOM/emulator harness exists.
// Same self-disabling shape as the storage guard above, and the same fix. The
// `.loadROM(` test IS the selector for "this page drives its own emulator", so
// the pages are enumerated rather than hand-listed — a NEW page that grows a
// private emulator is then covered on arrival instead of being invisible — and
// the selector's hit-count is asserted, because if `.loadROM(` stops appearing
// (renamed, wrapped, moved into a module) every page is skipped and this prints
// OK having checked nothing.
check('invariant: private-emulator pages convert ROM bytes to a binary string for jsnes', () => {
  const pages = fs.readdirSync(WEB).filter(f => f.endsWith('.html')).sort();
  let triggered = 0;
  for (const p of pages) {
    const html = fs.readFileSync(path.join(WEB, p), 'utf8');
    if (!/\.loadROM\s*\(/.test(html)) continue;   // no private emulator → nothing to guard
    triggered++;
    if (!/String\.fromCharCode\(/.test(html)) {
      throw new Error(`${p}: drives its own jsnes.loadROM but never converts the ROM ` +
        'Uint8Array to a binary string (String.fromCharCode) — the in-browser ' +
        '"Play in NES" will throw "Not a valid NES ROM."');
    }
  }
  if (triggered === 0) {
    throw new Error(
      `no page under ${WEB} calls .loadROM( — the selector, not the pages. Every page\n` +
      '  was skipped and this guard checked nothing. sprites.html and code.html drove\n' +
      '  their own jsnes instance when this was written; if that moved into a module,\n' +
      '  this guard has to follow it rather than silently pass.');
  }
}) || (anyFail = true);

// --- Web-feedback fixes 2026-06-17 -------------------------------------
//
// Guards for the three "ready to fix" web-form feedback bugs.  See
// docs/feedback/web-feedback-2026-06.md and
// docs/plans/current/2026-06-17-web-feedback-fixes.md.

// B-4 (feedback F5, bug 33): the win / death tint must never set the
// greyscale bit (0x01) together with a colour-emphasis bit (0x20 / 0x80).
// jsnes floods the whole screen solid green/blue in that combination —
// its startFrame takes a `switch(f_color)` path only when f_dispType=1 —
// so 0x1F|0x20 turned every trigger green.  0x1E (rendering on, no
// greyscale) keeps the intended subtle red/blue emphasis on jsnes + hardware.
// Updated 2026-06-18 (Sprint 2): the win/death tints moved OUT of the modules
// and INTO the engine (platformer.c "[engine] Game-over tint") — so the
// PPU_MASK constant lives in compiled, reviewable code, not an emitted string.
// Guard both halves: no module string-emits a tint any more, and the engine's
// tint keeps the greyscale bit OFF (0x1E, never 0x1F).
check('invariant: game-over tint is engine-owned and uses 0x1E (no greyscale bit)', () => {
  const mods = fs.readFileSync(path.join(WEB, 'builder-modules.js'), 'utf8');
  const tpl = fs.readFileSync(TEMPLATE, 'utf8');
  if (/PPU_MASK\s*=\s*0x1[EF]\s*\|\s*0x[0-9A-Fa-f]+/.test(mods)) {
    throw new Error('builder-modules.js still string-emits a PPU_MASK tint — the ' +
      'win/death tint moved into the engine (platformer.c) so the constant is ' +
      'compiled, not typed into a string (architecture review §S1/§S2)');
  }
  if (/PPU_MASK\s*=\s*0x1F\s*\|\s*0x[0-9A-Fa-f]+/.test(tpl)) {
    throw new Error('platformer.c sets the greyscale bit (0x1F) with emphasis — ' +
      'jsnes floods the whole screen green/blue; use 0x1E | 0xNN (web-feedback bug 33)');
  }
  if (!/PPU_MASK = 0x1E \| 0x20/.test(tpl) || !/PPU_MASK = 0x1E \| 0x80/.test(tpl)) {
    throw new Error('platformer.c is missing the engine-owned win (0x1E|0x20) / ' +
      'death (0x1E|0x80) game-over tint');
  }
}) || (anyFail = true);

// B-1 (feedback F1 + F10, bug 30): walker + chaser enemy AI must probe
// solid tiles via bw_sprite_blocked() so enemies turn at walls instead of
// walking through them.  The helper goes into the declarations slot; both
// AI kinds call it.
check('invariant: scene enemy AI probes solids via bw_sprite_blocked', () => {
  const mods = fs.readFileSync(path.join(WEB, 'builder-modules.js'), 'utf8');
  if (!/static unsigned char bw_sprite_blocked\(/.test(mods)) {
    throw new Error('builder-modules.js no longer emits the bw_sprite_blocked() helper — ' +
      'walker/chaser enemies will walk through walls again (web-feedback bug 30)');
  }
  if (!/bw_sprite_blocked\(ss_x\[/.test(mods)) {
    throw new Error('scene walker/chaser AI no longer calls bw_sprite_blocked(...) — ' +
      'enemies will ignore SOLID_GROUND / WALL tiles (web-feedback bug 30)');
  }
}) || (anyFail = true);

// B-8 (feedback F16, bug 38): the Sprites page must warn when an assigned
// walk/jump animation has frames that aren't the player size, because the
// server silently drops those frames (JUMP_FRAME_COUNT 0 → jump plays walk).
check('invariant: sprites.html warns on player-size animation frame mismatch', () => {
  const html = fs.readFileSync(path.join(WEB, 'sprites.html'), 'utf8');
  if (!/animFrameSizeMismatch\s*\(/.test(html) || !/anim-assign-warn/.test(html)) {
    throw new Error('sprites.html no longer computes the animation size-mismatch warning — ' +
      'a wrong-size jump animation will silently play as walk (web-feedback bug 38)');
  }
}) || (anyFail = true);

// 2026-06-21 production-only report: projects with only a Player sprite used
// to skip creation of the entire Scene preview because it was wrapped in
// `if (placeable.length > 0)`.  That hid the background as well as the Player
// start marker, even though dragging Player 1/2 is useful before any NPC or
// Enemy exists.  Keep the canvas unconditional; only empty-area placement is
// meant to be disabled when there is no non-player sprite to add.
check('invariant: Builder scene preview renders with only a Player sprite', () => {
  const html = fs.readFileSync(path.join(WEB, 'builder.html'), 'utf8');
  const start = html.indexOf('function renderSceneInstances(');
  const end = html.indexOf('function renderSceneInstanceRow(', start);
  if (start < 0 || end < 0) {
    throw new Error('could not locate renderSceneInstances() in builder.html');
  }
  const scene = html.slice(start, end);
  const createAt = scene.indexOf("preview = document.createElement('div')");
  if (createAt < 0) {
    throw new Error('Builder Scene no longer creates its preview canvas');
  }
  const oldGate = scene.lastIndexOf('if (placeable.length > 0)', createAt);
  if (oldGate >= 0) {
    throw new Error('Builder Scene preview is gated on a non-player sprite — ' +
      'Player-only projects will hide the background and Player start again');
  }
  if (!/if \(placeable\.length === 0\) return;/.test(html)) {
    throw new Error('empty-area Scene clicks must remain guarded when no ' +
      'non-player sprite exists');
  }
}) || (anyFail = true);

// B-2 (feedback F1b + F23, bug 31): dialogue must render real letters, not
// garbage, on any project.  As of 2026-06-18 the server seeds a built-in font
// into blank bg tiles when dialogue is on (Sprint 3), the assembler uppercases
// text to match it, and a validator warns about characters outside the font.
// Guard all three so the fix can't silently regress.
check('invariant: dialogue ships a built-in font + uppercases + warns on unsupported chars', () => {
  const server = fs.readFileSync(path.join(ROOT, 'tools', 'playground_server.py'), 'utf8');
  if (!/_seed_dialogue_font\(/.test(server) || !/_DIALOGUE_FONT/.test(server)) {
    throw new Error('playground_server.py no longer seeds a dialogue font — dialogue on a ' +
      'project with no painted font will show garbage again (web-feedback bug 31)');
  }
  const mods = fs.readFileSync(path.join(WEB, 'builder-modules.js'), 'utf8');
  if (!/toUpperCase\(\)/.test(mods.slice(mods.indexOf('function strToBytes')))) {
    throw new Error('builder-modules.js strToBytes no longer uppercases dialogue text — ' +
      'lowercase input will miss the uppercase built-in font and render as garbage');
  }
  const v = fs.readFileSync(path.join(WEB, 'builder-validators.js'), 'utf8');
  if (!/dialogue-unsupported-chars/.test(v) || !/function dialogueUnsupportedChars\(/.test(v)) {
    throw new Error('builder-validators.js no longer warns about unsupported dialogue ' +
      'characters (web-feedback bug 31 follow-up)');
  }
}) || (anyFail = true);

// 2026-06-18 — the dialogue font character set is defined in THREE places that
// must agree: `_DIALOGUE_FONT` (playground_server.py — the actual CHR font),
// `DIALOGUE_GLYPH_CHARS` (index.html — the editor's reserved-letter-tile
// marking), and `SUPPORTED` (builder-validators.js — the unsupported-char
// warning).  The editor set omits space (the blank background tile); the other
// two include it.  Guard that the NON-SPACE sets are identical so they can't
// silently drift (e.g. adding a glyph to the font but not reserving its tile).
check('invariant: dialogue font char set agrees across server, editor + validator', () => {
  const server = fs.readFileSync(path.join(ROOT, 'tools', 'playground_server.py'), 'utf8');
  const idx = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  const val = fs.readFileSync(path.join(WEB, 'builder-validators.js'), 'utf8');
  const serverChars = new Set();
  let m; const re = /"(.)"\s*:\s*_glyph\(/g;
  while ((m = re.exec(server))) serverChars.add(m[1]);
  const idxM = idx.match(/DIALOGUE_GLYPH_CHARS\s*=\s*"([^"]*)"/);
  const valM = val.match(/SUPPORTED\s*=\s*"([^"]*)"/);
  if (serverChars.size === 0 || !idxM || !valM) {
    throw new Error('could not locate _DIALOGUE_FONT / DIALOGUE_GLYPH_CHARS / SUPPORTED ' +
      '— did one get renamed?');
  }
  const norm = chars => Array.from(chars).filter(c => c !== ' ').sort().join('');
  const a = norm(serverChars), b = norm(idxM[1]), c = norm(valM[1]);
  if (a !== b || a !== c) {
    throw new Error('dialogue font char sets drifted (non-space):\n' +
      '  _DIALOGUE_FONT       = ' + a + '\n' +
      '  DIALOGUE_GLYPH_CHARS = ' + b + '\n' +
      '  SUPPORTED            = ' + c);
  }
}) || (anyFail = true);

console.log('');

// --- Step 3: byte-identical ROM invariant (golden-hash form) -----------
//
// FROZEN GOLDEN HASHES — regenerate DELIBERATELY (procedure below) only when
// the engine source legitimately changes.  A surprise mismatch here means a
// code change altered the no-modules ROM — confirm that was intended before
// re-pinning.
//
// Arc D Sprint 4 prep (T4.1/T4.2): the old check compiled TWO different files
// (stock 779-line main.c vs the 1473-line platformer.c template) and asserted
// equal bytes.  That only works while CFLAGS is empty — `-Os` makes cc65 pick
// different inline/register choices per file, so the two diverge even though
// they're semantically equal on the no-modules path.  Re-founding each file on
// its OWN golden hash lets `-Os` be flipped (CFLAGS=-Os in the Makefile) without
// the cross-file equality firing.  THE FLIP ITSELF IS LEFT TO A HUMAN — it needs
// an FCEUX/Mesen timing A/B pass (scroll bursts live on the vblank budget).
//
// Regeneration procedure (when the engine legitimately changes, or when the
// CFLAGS optimisation level changes): `make -s` each config, read
// `sha1sum game.nes`, paste below, and note WHY in the commit.
//   -Os values (current; Makefile CFLAGS = -Os).
//   No-opt values were 00e156fb69cc390fb2e6669379dad335fae8992c (both) —
//   restore these AND set Makefile `CFLAGS =` to revert -Os.
const GOLDEN_STOCK    = '1730448eca6d4857d3468407b33e41de7806bf99';
const GOLDEN_TEMPLATE = '1730448eca6d4857d3468407b33e41de7806bf99';

// Advisory: the template with no modules must add NOTHING over the stock
// engine.  (Held under both no-opt and -Os — the template's extra blocks are
// #if-gated out at no-modules — so it's a cross-file guarantee worth keeping.)
check('invariant: goldens equal (template adds nothing at no-modules)', () => {
  if (GOLDEN_STOCK !== GOLDEN_TEMPLATE) {
    throw new Error('GOLDEN_STOCK !== GOLDEN_TEMPLATE — the template no longer ' +
      'compiles to the same bytes as stock at no-modules; confirm intended.');
  }
}) || (anyFail = true);

check('invariant: Step_Playground stock ROM matches golden hash', () => {
  execSync('make -s clean', { cwd: STEP, stdio: ['ignore', 'ignore', 'ignore'] });
  execSync('make -s', { cwd: STEP, stdio: ['ignore', 'ignore', 'pipe'] });
  const got = execSync('sha1sum game.nes', { cwd: STEP }).toString().trim().split(/\s+/)[0];
  if (got !== GOLDEN_STOCK) {
    throw new Error('stock ROM hash drifted: got=' + got.slice(0, 12) +
      ' golden=' + GOLDEN_STOCK.slice(0, 12) + ' — a change altered the stock ' +
      'engine ROM; confirm it was intended, then re-pin GOLDEN_STOCK.');
  }
}) || (anyFail = true);

check('invariant: template (no modules) ROM matches golden hash', () => {
  const stockPath = path.join(STEP, 'src', 'main.c');
  const backup = fs.readFileSync(stockPath);
  try {
    fs.writeFileSync(stockPath, fs.readFileSync(TEMPLATE));
    execSync('make -s clean', { cwd: STEP, stdio: ['ignore', 'ignore', 'ignore'] });
    execSync('make -s', { cwd: STEP, stdio: ['ignore', 'ignore', 'pipe'] });
    const got = execSync('sha1sum game.nes', { cwd: STEP }).toString().trim().split(/\s+/)[0];
    if (got !== GOLDEN_TEMPLATE) {
      throw new Error('template (no-modules) ROM hash drifted: got=' + got.slice(0, 12) +
        ' golden=' + GOLDEN_TEMPLATE.slice(0, 12) + ' — a template change altered ' +
        'the no-modules ROM; confirm it was intended, then re-pin GOLDEN_TEMPLATE.');
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
// An empty suite list must not read as success — and this is the enumeration it
// matters most for. Without this guard the loop below runs zero times, `anyFail`
// stays false, and the runner prints "✅ All Builder regression checks pass"
// having executed NONE of the 114 suites, golden byte-identical ROM hashes
// included. Measured 2026-08-12 by pointing the filter at an extension that
// matches nothing: 0 suites, exit 0, green headline, with only the 38 syntax
// checks and 21 invariants actually run.
//
// This is the mirror image of the `shipped.length === 0` guard added above for
// the syntax enumeration — same file, same shape, and this half was missed.
//
// KNOWN LIMIT: it catches "none", not "fewer than there should be". A filter
// that broke down to three suites would still pass. Any floor here would be a
// hand-maintained number that drifts, which is the failure mode this file is
// already full of lessons about; the honest guard is the one that cannot go
// stale.
if (suites.length === 0) {
  check('builder-test suites found', () => {
    throw new Error(`no *.mjs suites found in ${__dirname} — wrong directory, or the filter broke`);
  });
  anyFail = true;
}
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
