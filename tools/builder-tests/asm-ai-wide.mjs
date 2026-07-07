#!/usr/bin/env node
// ASM engine generator — Phase 2b: the AI-UPDATE loop in the SS_POS_WIDE
// (u16-position) world, the last A/B gap for the scene-AI ASM.
//
// asm-ai.mjs proves the ai_update ASM (walker/chaser/flyer/patrol) on the
// common 1x1 fast path, where ss_x/ss_y/px/py are u8. But a project whose world
// is bigger than one screen builds with SCROLL_BUILD (px/py -> u16) and, once a
// scene sprite is placed past the first screen (world x/y > 255), SS_POS_WIDE
// (ss_x/ss_y -> u16). The ASM then takes its `.if SS_POS_WIDE` branches:
// add_speed / sub_speed(_y) do 16-bit position math, ch_load_x/y read the u16
// px/py, and fly_set_y does a 16-bit signed home+foff. Those branches were
// written but, until now, never A/B-verified. This does it.
//
// KEY SIMPLIFICATION: the scene AI runs in WORLD space, independent of the
// camera. We don't need real scroll streaming/rendering to compare it — we just
// place the enemies at high world-X (some straddling the 256 byte-boundary, so
// the hi-byte carry/borrow paths fire), mirror their full u16 ss_x/ss_y into RAM
// at the tick point, and walk the two builds by MATCHED TICK exactly like
// asm-ai.mjs. The collision probe (bw_sprite_blocked) takes u8 args, so it
// truncates the position identically in BOTH C and ASM — width-independent — so
// the only thing under test here is the 16-bit position arithmetic.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as H from './lib/render-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const jsnes = require(path.join(H.ROOT, 'tools', 'tile_editor_web', 'jsnes.min.js'));

const PORT_C = 18796, PORT_A = 18797;
let failed = false;
const ok = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const win = H.loadBuilderModules();
// Target the CURRENT engine so patrol + flyer aren't degraded to walker
// (builder-modules.js does that when NES_TARGET_ENGINE < 10, and
// loadBuilderModules doesn't set it). Without this the patrol/flyer wide paths
// would never be emitted or tested.
new Function(fs.readFileSync(path.join(H.WEB, 'engine-version.js'), 'utf8'))();
const tpl = H.readTemplate();

// Enemies in a 2-screen-wide world (512px). Placements are WORLD coords; several
// sit past x=255 (forces SS_POS_WIDE) and the patrol straddles the 256 boundary
// so add_speed's carry and sub_speed's borrow across the hi byte both fire. The
// player sits at world x=350 so the chaser + flyer seek through the 256+ range.
const INSTANCES = [
  { id: 'w0', spriteIdx: 1, x: 300, y: 192, ai: 'walker', speed: 2 },
  { id: 'p0', spriteIdx: 1, x: 250, y: 192, ai: 'patrol', speed: 2 }, // 210..290, straddles 256
  // Chaser + flyer sit far RIGHT and move at speed 1 so their LEFT seek toward
  // px=350 is still in flight well past the scroll build's ~37-frame world-init.
  { id: 'c0', spriteIdx: 1, x: 470, y: 60,  ai: 'chaser', speed: 1 }, // seeks px=350,py -> LEFT+DOWN
  { id: 'f0', spriteIdx: 1, x: 500, y: 80,  ai: 'flyer',  speed: 1 }, // home 80, drifts LEFT to px
];
const PLAYER = { x: 350, y: 192 };

function makeState() {
  const sprites = [
    { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
    { role: 'enemy', name: 'goomba', width: 2, height: 2, cells: H.mkCells(2, 2) },
  ];
  const s = {
    name: 'aiwide', version: 1, universal_bg: 0x21, sprites,
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [H.flatBackground(2, 1, 26)],       // 2 screens wide -> SCROLL_BUILD
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = 'platformer';
  s.builder.modules.scene.config.instances = INSTANCES.map((it) => ({ ...it }));
  return s;
}

// Mirror the frame tick (u16 @ 0x0710) + each enemy's FULL u16 ss_x and ss_y
// (2 bytes each) into known RAM at the tick point. ss_x/ss_y are u16 here, so we
// capture both bytes; ss_x[]/ss_y[] exist in both builds, so the same injected C
// compiles either way.
const N = INSTANCES.length;
const XBASE = 0x0712, YBASE = XBASE + 2 * N;   // 2 bytes per coord
function withProbe(mainC) {
  let inj = '{static unsigned int _tk; ++_tk;'
    + '(*(unsigned char*)0x0710)=(unsigned char)(_tk&0xFF);(*(unsigned char*)0x0711)=(unsigned char)(_tk>>8);';
  for (let i = 0; i < N; i++)
    inj += `(*(unsigned char*)${XBASE + 2 * i})=(unsigned char)ss_x[${i}];(*(unsigned char*)${XBASE + 2 * i + 1})=(unsigned char)(ss_x[${i}]>>8);`;
  for (let i = 0; i < N; i++)
    inj += `(*(unsigned char*)${YBASE + 2 * i})=(unsigned char)ss_y[${i}];(*(unsigned char*)${YBASE + 2 * i + 1})=(unsigned char)(ss_y[${i}]>>8);`;
  inj += '} ';
  return mainC.replace('while (oam_idx < 256) {', inj + 'while (oam_idx < 256) {');
}

const boot = (b) => { const n = new jsnes.NES({ onFrame() {}, onAudioSample() {} }); n.loadROM(b.toString('binary')); return n; };
const rd = (n, a) => n.cpu.mem[a] & 0xFF;
const rd16 = (n, a) => (n.cpu.mem[a] & 0xFF) | ((n.cpu.mem[a + 1] & 0xFF) << 8);
const TICK = 0x0710;
const xs = (n) => { const a = []; for (let i = 0; i < N; i++) a.push(rd16(n, XBASE + 2 * i)); return a; };
const ys = (n) => { const a = []; for (let i = 0; i < N; i++) a.push(rd16(n, YBASE + 2 * i)); return a; };

const srvC = await H.startServer(PORT_C, { PLAYGROUND_NO_ASM: '1' });
const srvA = await H.startServer(PORT_A, { PLAYGROUND_ASM_AI: '1' });
try {
  const s = makeState();
  const mainC = win.BuilderAssembler.assemble(s, tpl);
  // Guard: assert the real patrol (4) + chaser (2) + flyer (3) types were emitted
  // (see asm-ai.mjs) — a 0-diff pass alone can't tell a degraded walker apart.
  const tm = mainC.match(/ss_ai_type\[\d+\][^;]*=\s*\{([^}]*)\}/);
  const types = tm ? tm[1].split(',').map((v) => v.trim()) : [];
  for (const [t, name] of [['4', 'patrol'], ['3', 'flyer'], ['2', 'chaser']])
    if (!types.includes(t)) bad(`ss_ai_type has no ${name} (${t}) — instance degraded? types=[${types}]`);
  const payload = {
    state: s, playerSpriteIdx: 0, playerStart: { x: PLAYER.x, y: PLAYER.y }, mode: 'browser',
    customMainC: withProbe(mainC),
    sceneSprites: INSTANCES.map((it) => ({ spriteIdx: it.spriteIdx, x: it.x, y: it.y })),
  };
  const rc = await H.buildRom(PORT_C, payload);
  const ra = await H.buildRom(PORT_A, payload);
  if (!rc.ok) bad(`C build failed (${rc.stage}): ` + String(rc.log || '').slice(-500));
  else if (!ra.ok) bad(`ASM build failed (${ra.stage}): ` + String(ra.log || '').slice(-500));
  else if (rc.romBytes.equals(ra.romBytes)) bad('ASM ROM == C ROM (NES_ASM_AI did not engage)');
  else {
    const c = boot(rc.romBytes), a = boot(ra.romBytes);
    // A scroll build spends ~37 frames streaming the initial world before its
    // game loop (and the injected tick) starts, and the two builds can take
    // slightly different times — so warm up until BOTH ticks have left their
    // 0xFFFF init value rather than a fixed count.
    let bootF = 0;
    while (bootF < 400 && (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000)) { c.frame(); a.frame(); bootF++; }
    if (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000) bad('game loop never started (tick stuck at init)');

    let diffs = 0, firstDiff = -1, compared = 0;
    const start = xs(c);
    let pMin = 9999, pMax = 0, pStraddled = false;  // patrol crossed the 256 byte-boundary
    let cMoved = false, fMoved = false, moved = false;
    let sawWide = false;                              // some position actually exceeded 255
    for (let step = 0; step < 16000 && compared < 300; step++) {
      const tc = rd16(c, TICK), ta = rd16(a, TICK);
      if (tc > 60000 || ta > 60000) { bad('tick counter overflowed before enough samples'); break; }
      if (tc !== ta) { if (tc < ta) c.frame(); else a.frame(); continue; }
      const cx = xs(c), ax = xs(a), cy = ys(c), ay = ys(a);
      for (let i = 0; i < N; i++) {
        if (cx[i] !== ax[i] || cy[i] !== ay[i]) { diffs++; if (firstDiff < 0) firstDiff = tc; }
      }
      if (cx.some((v, i) => v !== start[i])) moved = true;
      if (cx.some((v) => v > 255) || cy.some((v) => v > 255)) sawWide = true;
      if (cx[1] < pMin) pMin = cx[1];             // patrol X band
      if (cx[1] > pMax) pMax = cx[1];
      if (pMin < 256 && pMax >= 256) pStraddled = true;
      if (cx[2] < start[2] - 8) cMoved = true;    // chaser drifted LEFT toward px
      if (cx[3] < start[3] - 8) fMoved = true;    // flyer drifted LEFT toward px
      compared++;
      c.frame(); a.frame();
    }

    if (compared < 250) bad(`too few matched-tick samples (${compared}) — harness did not run`);
    else if (!sawWide) bad('no position ever exceeded 255 — SS_POS_WIDE arithmetic was not exercised');
    else if (!moved) bad('enemies never moved — test exercised nothing');
    else if (!pStraddled) bad('patrol never crossed the 256 byte-boundary — the hi-byte carry/borrow was not exercised');
    else if (!cMoved) bad('chaser never closed on the player — the wide chaser path was not exercised');
    else if (!fMoved) bad('flyer never drifted toward the player — the wide flyer path was not exercised');
    else if (diffs === 0)
      ok('ai_update SS_POS_WIDE (u16 ss_x/ss_y): C ≡ ASM at every matched tick over '
        + `${compared} ticks of world-space motion (incl. patrol carry/borrow across 256, chaser + flyer seek)`);
    else bad(`divergence — ${diffs} position word-diffs (first at tick ${firstDiff}) over ${compared} matched ticks`);
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srvC.srv);
  await H.stopServer(srvA.srv);
}

if (failed) process.exit(1);
console.log('\nasm-ai-wide: the ASM ai_update drives u16 world-space enemy positions identically to the C AI.');
