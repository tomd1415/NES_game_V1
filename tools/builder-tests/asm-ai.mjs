#!/usr/bin/env node
// ASM engine generator — Phase 2b: the scene-sprite AI-UPDATE loop on ASM.
//
// The per-enemy AI update (walker/patrol/… movement) and its collision probe
// bw_sprite_blocked now have a hand-written 6502 twin: ai_update + the probe in
// ai_asm.s. They are NOT shipped to pupils — the server links them only under
// PLAYGROUND_ASM_AI (a test toggle); the C per-instance AI blocks are #ifndef'd
// out so flag-off is byte-identical.
//
// This builds a walled pen with two WALKERs (turning at an interior WALL and at
// the world edge), a PATROL (bouncing on its own ±40px counter), a CHASER
// (seeking the player on X+Y, blocked by the floor on its descent), and a FLYER
// (hovering ±20px in Y around its home while drifting toward the player in X,
// passing through walls), then dual-builds it pure C (PLAYGROUND_NO_ASM=1) vs
// the ASM engine + AI helper (PLAYGROUND_ASM_AI=1) and asserts they move
// IDENTICALLY.
//
// == Why we compare RAM ss_x, not OAM, and by matched-tick, not by frame ==
// The two builds have different per-frame CPU cost, so once the scene is heavy
// enough one of them drops frames the other doesn't — their game-loop "tick"
// counters then advance at DIFFERENT RATES. A lockstep frame-by-frame OAM diff
// (the old approach) breaks the moment that happens: it either mis-aligns the
// phase, or catches the one-frame sprite-DMA lag and reports a phantom
// divergence. So instead we (1) mirror each enemy's real ss_x/ss_y into known
// RAM at the tick point — RAM is written synchronously with the AI update, with
// no DMA lag — and (2) walk the two builds by MATCHED TICK (advance whichever is
// behind), comparing the mirrored positions only when both sit on the same tick.
// That is rate-independent and DMA-independent: at equal tick both builds have
// run the AI the same number of times, so identical AI ⇒ identical ss_x/ss_y.
// Any diff is a real bug in the ASM ai_update.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as H from './lib/render-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const jsnes = require(path.join(H.ROOT, 'tools', 'tile_editor_web', 'jsnes.min.js'));

const PORT_C = 18798, PORT_A = 18799;
let failed = false;
const ok = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const win = H.loadBuilderModules();
// Target the CURRENT engine. builder-modules.js degrades patrol + flyer to a
// plain walker when NES_TARGET_ENGINE < 10 (and loadBuilderModules doesn't set
// it), so without this the patrol/flyer AI would silently never be emitted —
// the ai_update type 3/4 dispatch would go untested. engine-version.js sets
// NES_ENGINE_VERSION + NES_TARGET_ENGINE on the shared global.
new Function(fs.readFileSync(path.join(H.WEB, 'engine-version.js'), 'utf8'))();
const tpl = H.readTemplate();

// A 1x1 world with a floor + solid WALL columns, so a floor-walking enemy turns
// at a real SOLID/WALL tile (the behaviour_at probe path), not just the edge.
function walledBackground(wallCols) {
  const cols = 32, rows = 30, floorRow = 26;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) beh[floorRow][c] = 1;               // SOLID_GROUND floor
  for (const wc of wallCols) for (let r = floorRow - 1; r >= floorRow - 8; r--) beh[r][wc] = 2; // WALL
  return {
    name: 'bg', dimensions: { screens_x: 1, screens_y: 1 },
    nametable: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
    behaviour: beh,
  };
}

// Two walkers penned between the walls / edges (turn at a wall + the world
// edge), a patrol that turns on its own ±40px counter (no collision), and a
// chaser placed far up-and-RIGHT of the player (110,200) so it seeks LEFT +
// DOWN — a ~60/76-frame journey that is still in flight when sampling begins
// (past the 40-frame boot), exercising the px/py compares, the Y-axis step, and
// the blocked path (the wall stops its X, the floor stops its descent).
const INSTANCES = [
  { id: 'w0', spriteIdx: 1, x: 64, y: 200, ai: 'walker', speed: 2 },
  { id: 'w1', spriteIdx: 1, x: 150, y: 200, ai: 'walker', speed: 1 },
  { id: 'p0', spriteIdx: 1, x: 200, y: 200, ai: 'patrol', speed: 2 },
  { id: 'c0', spriteIdx: 1, x: 240, y: 40, ai: 'chaser', speed: 2 },
  // Flyer: home Y = 80, hovers 60..100; placed far LEFT (x=20, speed 1) so its
  // RIGHT drift toward the player (px=110) is still in flight past the boot.
  { id: 'f0', spriteIdx: 1, x: 20, y: 80, ai: 'flyer', speed: 1 },
];

function makeState() {
  const sprites = [
    { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
    { role: 'enemy', name: 'goomba', width: 2, height: 2, cells: H.mkCells(2, 2) },
  ];
  const s = {
    name: 'ai', version: 1, universal_bg: 0x21, sprites,
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [walledBackground([14, 24])],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = 'platformer';
  s.builder.modules.scene.config.instances = INSTANCES.map((it) => ({ ...it }));
  return s;
}

// Mirror the frame tick (u16 @ 0x0710) + each enemy's ss_x (@ 0x0712+i) and
// ss_y (@ 0x0712+N+i) into known RAM at the tick point. ss_x/ss_y exist in BOTH
// builds (they are the scene position arrays), so the SAME injected C compiles
// either way — no flag-gated symbols referenced here.
const N = INSTANCES.length;
const XBASE = 0x0712, YBASE = XBASE + N;
function withProbe(mainC) {
  let inj = '{static unsigned int _tk; ++_tk;'
    + '(*(unsigned char*)0x0710)=(unsigned char)(_tk&0xFF);(*(unsigned char*)0x0711)=(unsigned char)(_tk>>8);';
  for (let i = 0; i < N; i++) inj += `(*(unsigned char*)${XBASE + i})=(unsigned char)ss_x[${i}];`;
  for (let i = 0; i < N; i++) inj += `(*(unsigned char*)${YBASE + i})=(unsigned char)ss_y[${i}];`;
  inj += '} ';
  return mainC.replace('while (oam_idx < 256) {', inj + 'while (oam_idx < 256) {');
}

const boot = (b) => { const n = new jsnes.NES({ onFrame() {}, onAudioSample() {} }); n.loadROM(b.toString('binary')); return n; };
const rd = (n, a) => n.cpu.mem[a] & 0xFF;
const rd16 = (n, a) => (n.cpu.mem[a] & 0xFF) | ((n.cpu.mem[a + 1] & 0xFF) << 8);
const TICK = 0x0710;
const xs = (n) => { const a = []; for (let i = 0; i < N; i++) a.push(rd(n, XBASE + i)); return a; };
const ys = (n) => { const a = []; for (let i = 0; i < N; i++) a.push(rd(n, YBASE + i)); return a; };

const srvC = await H.startServer(PORT_C, { PLAYGROUND_NO_ASM: '1' });
const srvA = await H.startServer(PORT_A, { PLAYGROUND_ASM_AI: '1' });
try {
  const s = makeState();
  const mainC = win.BuilderAssembler.assemble(s, tpl);
  // Guard: assert the real patrol (4) + chaser (2) + flyer (3) types were emitted
  // — not silently degraded to walker (1). A 0-diff pass alone would NOT catch a
  // degrade (both builds run the same walker), so check the table directly.
  const tm = mainC.match(/ss_ai_type\[\d+\][^;]*=\s*\{([^}]*)\}/);
  const types = tm ? tm[1].split(',').map((v) => v.trim()) : [];
  for (const [t, name] of [['4', 'patrol'], ['3', 'flyer'], ['2', 'chaser']])
    if (!types.includes(t)) bad(`ss_ai_type has no ${name} (${t}) — instance degraded? types=[${types}]`);
  const payload = {
    state: s, playerSpriteIdx: 0, playerStart: { x: 110, y: 200 }, mode: 'browser',
    customMainC: withProbe(mainC),
    sceneSprites: INSTANCES.map((it) => ({ spriteIdx: it.spriteIdx, x: it.x, y: it.y })),
  };
  const rc = await H.buildRom(PORT_C, payload);
  const ra = await H.buildRom(PORT_A, payload);
  if (!rc.ok) bad(`C build failed (${rc.stage})`);
  else if (!ra.ok) bad(`ASM build failed (${ra.stage}): ` + String(ra.log || '').slice(-500));
  else if (rc.romBytes.equals(ra.romBytes)) bad('ASM ROM == C ROM (NES_ASM_AI did not engage)');
  else {
    const c = boot(rc.romBytes), a = boot(ra.romBytes);
    for (let i = 0; i < 40; i++) { c.frame(); a.frame(); }   // boot past reset/BSS clear

    // Matched-tick walk: step whichever build is behind on the tick counter, and
    // compare the mirrored ss_x/ss_y only when both sit on the same tick.
    let diffs = 0, firstDiff = -1, compared = 0;
    const start = xs(c);                 // w0/w1/p0/c0 X at first compare
    const startY = ys(c);                // …and Y (for the chaser's descent)
    let w0min = 255, w0turned = false;   // a walker turned = its X reversed off a peak/trough
    let pMin = 255, pMax = 0, pBounced = false; // patrol swings both ways
    let cChasedX = false, cChasedY = false;     // chaser closed on the player in X and Y
    let fyMin = 255, fyMax = 0, fHovered = false; // flyer swung through its Y band
    let fDriftedX = false;                        // flyer drifted toward the player in X
    let moved = false;
    for (let step = 0; step < 12000 && compared < 300; step++) {
      const tc = rd16(c, TICK), ta = rd16(a, TICK);
      if (tc > 60000 || ta > 60000) { bad('tick counter overflowed before enough samples'); break; }
      if (tc !== ta) { if (tc < ta) c.frame(); else a.frame(); continue; }
      // both on the same tick -> compare AI output
      const cx = xs(c), ax = xs(a), cy = ys(c), ay = ys(a);
      for (let i = 0; i < N; i++) {
        if (cx[i] !== ax[i] || cy[i] !== ay[i]) { diffs++; if (firstDiff < 0) firstDiff = tc; }
      }
      // motion / turn / bounce evidence, tracked on the C build's positions
      if (cx.some((v, i) => v !== start[i])) moved = true;
      if (cx[0] < w0min) w0min = cx[0]; else if (cx[0] > w0min + 6) w0turned = true; // w0 went left then came back right
      if (cx[2] < pMin) pMin = cx[2];
      if (cx[2] > pMax) pMax = cx[2];
      if (pMax - pMin > 60) pBounced = true;  // patrol swept a wide arc (both directions)
      if (cx[3] < start[3] - 8) cChasedX = true;   // chaser moved LEFT toward px
      if (cy[3] > startY[3] + 8) cChasedY = true;   // chaser moved DOWN toward py
      if (cy[4] < fyMin) fyMin = cy[4];             // flyer Y hover band
      if (cy[4] > fyMax) fyMax = cy[4];
      if (fyMax - fyMin >= 20) fHovered = true;     // swung through the ±? band
      if (cx[4] > start[4] + 8) fDriftedX = true;   // flyer drifted RIGHT toward px
      compared++;
      c.frame(); a.frame();
    }

    if (compared < 250) bad(`too few matched-tick samples (${compared}) — harness did not run`);
    else if (!moved) bad('enemies never moved — test exercised nothing');
    else if (!w0turned) bad('walker never turned — the bw_sprite_blocked path was not exercised');
    else if (!pBounced) bad('patrol never swung both ways — the patrol path was not exercised');
    else if (!cChasedX) bad('chaser never closed on the player in X — the chaser X path was not exercised');
    else if (!cChasedY) bad('chaser never closed on the player in Y — the chaser Y path was not exercised');
    else if (!fHovered) bad('flyer never swung through its Y band — the flyer hover path was not exercised');
    else if (!fDriftedX) bad('flyer never drifted toward the player in X — the flyer drift path was not exercised');
    else if (diffs === 0)
      ok('ai_update (walker + chaser + flyer + patrol) + bw_sprite_blocked: C ≡ ASM ss_x/ss_y at every '
        + `matched tick over ${compared} ticks of motion (incl. wall/edge turns, patrol bounce, chaser `
        + 'X+Y seek, flyer Y-hover + X-drift)');
    else bad(`divergence — ${diffs} position byte-diffs (first at tick ${firstDiff}) over ${compared} matched ticks`);
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srvC.srv);
  await H.stopServer(srvA.srv);
}

if (failed) process.exit(1);
console.log('\nasm-ai: the ASM ai_update (walker + chaser + flyer + patrol) drives enemy positions identically to the C AI.');
