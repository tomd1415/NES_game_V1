#!/usr/bin/env node
// ASM engine — a REALISTIC composite A/B: a scrolling 2-screen platformer with a
// MOVING player (holds RIGHT, runs across both screens) and all four generic
// enemy types, dual-built pure C (PLAYGROUND_NO_ASM=1) vs the shipped default
// (ASM AI v30 + ASM scene-draw v31 both engage). The synthetic asm-ai* suites
// keep the player still; asm-ab covers player motion on the universal engine;
// this closes the gap where ALL of it runs together — player scroll physics +
// the ASM ai_update + the ASM draw loop — heavy enough that the two builds drop
// frames at different rates. We compare by MATCHED TICK (mirror the real u16
// player px/py and every enemy ss_x/ss_y into RAM at the tick point, advance the
// build that is behind, compare only at equal tick). Any diff is a real bug.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as H from './lib/render-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const jsnes = require(path.join(H.ROOT, 'tools', 'tile_editor_web', 'jsnes.min.js'));

const PORT_C = 18790, PORT_A = 18791;
let failed = false;
const ok = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const win = H.loadBuilderModules();
new Function(fs.readFileSync(path.join(H.WEB, 'engine-version.js'), 'utf8'))();  // target latest engine
const tpl = H.readTemplate();

// One of every generic AI type, spread across the two screens so the running
// player meets them; several sit past x=255 (u16/scroll positions).
const INSTANCES = [
  { spriteIdx: 1, x: 200, y: 196, ai: 'walker', speed: 2 },
  { spriteIdx: 1, x: 470, y: 196, ai: 'chaser', speed: 1 },
  { spriteIdx: 1, x: 300, y: 90,  ai: 'flyer',  speed: 1 },
  { spriteIdx: 1, x: 360, y: 196, ai: 'patrol', speed: 2 },
];
const N = INSTANCES.length;

function makeState() {
  const cols = 64, rows = 30, floorRow = 26;   // 2 screens wide
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) beh[floorRow][c] = 1;   // flat floor — no walls, so the player runs clean across both screens
  const bg = {
    name: 'bg', dimensions: { screens_x: 2, screens_y: 1 },
    nametable: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
    behaviour: beh,
  };
  const sprites = [
    { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
    { role: 'enemy', name: 'goomba', width: 2, height: 2, cells: H.mkCells(2, 2) },
  ];
  const s = {
    name: 'realproj', version: 1, universal_bg: 0x21, sprites,
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [bg], behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = 'platformer';
  s.builder.modules.scene.config.instances = INSTANCES.map((it) => ({ ...it }));
  return s;
}

// RAM mirror: tick(2) + player px(2) py(2) + each enemy ss_x(2)/ss_y(2).
const TICK = 0x0710, PX = 0x0712, PY = 0x0714, EXBASE = 0x0716, EYBASE = EXBASE + 2 * N;
function withProbe(mainC) {
  let inj = '{static unsigned int _tk; ++_tk;'
    + `(*(unsigned char*)${TICK})=(unsigned char)(_tk&0xFF);(*(unsigned char*)${TICK + 1})=(unsigned char)(_tk>>8);`
    + `(*(unsigned char*)${PX})=(unsigned char)px;(*(unsigned char*)${PX + 1})=(unsigned char)(px>>8);`
    + `(*(unsigned char*)${PY})=(unsigned char)py;(*(unsigned char*)${PY + 1})=(unsigned char)(py>>8);`;
  for (let i = 0; i < N; i++)
    inj += `(*(unsigned char*)${EXBASE + 2 * i})=(unsigned char)ss_x[${i}];(*(unsigned char*)${EXBASE + 2 * i + 1})=(unsigned char)(ss_x[${i}]>>8);`;
  for (let i = 0; i < N; i++)
    inj += `(*(unsigned char*)${EYBASE + 2 * i})=(unsigned char)ss_y[${i}];(*(unsigned char*)${EYBASE + 2 * i + 1})=(unsigned char)(ss_y[${i}]>>8);`;
  inj += '} ';
  return mainC.replace('while (oam_idx < 256) {', inj + 'while (oam_idx < 256) {');
}

const boot = (b) => { const n = new jsnes.NES({ onFrame() {}, onAudioSample() {} }); n.loadROM(b.toString('binary')); return n; };
const rd16 = (n, a) => (n.cpu.mem[a] & 0xFF) | ((n.cpu.mem[a + 1] & 0xFF) << 8);
// Advance one frame with RIGHT held (constant input -> identical at every tick).
const stepRight = (n) => { n.buttonDown(1, H.BTN.RIGHT); n.frame(); n.buttonUp(1, H.BTN.RIGHT); };
const exs = (n) => { const a = []; for (let i = 0; i < N; i++) a.push(rd16(n, EXBASE + 2 * i)); return a; };
const eys = (n) => { const a = []; for (let i = 0; i < N; i++) a.push(rd16(n, EYBASE + 2 * i)); return a; };

const srvC = await H.startServer(PORT_C, { PLAYGROUND_NO_ASM: '1' });
const srvA = await H.startServer(PORT_A, {});   // shipped default: ASM AI + scene both engage
try {
  const s = makeState();
  const mainC = win.BuilderAssembler.assemble(s, tpl);
  const tm = mainC.match(/ss_ai_type\[\d+\][^;]*=\s*\{([^}]*)\}/);
  const types = tm ? tm[1].split(',').map((v) => v.trim()) : [];
  for (const [t, name] of [['4', 'patrol'], ['3', 'flyer'], ['2', 'chaser'], ['1', 'walker']])
    if (!types.includes(t)) bad(`ss_ai_type has no ${name} (${t}) — instance degraded? types=[${types}]`);
  const payload = {
    state: s, playerSpriteIdx: 0, playerStart: { x: 24, y: 196 }, mode: 'browser',
    customMainC: withProbe(mainC),
    sceneSprites: INSTANCES.map((it) => ({ spriteIdx: it.spriteIdx, x: it.x, y: it.y })),
  };
  const rc = await H.buildRom(PORT_C, payload);
  const ra = await H.buildRom(PORT_A, payload);
  if (!rc.ok) bad(`C build failed (${rc.stage}): ` + String(rc.log || '').slice(-400));
  else if (!ra.ok) bad(`ASM build failed (${ra.stage}): ` + String(ra.log || '').slice(-400));
  else if (rc.romBytes.equals(ra.romBytes)) bad('ASM ROM == C ROM (shipped ASM did not engage)');
  else {
    const c = boot(rc.romBytes), a = boot(ra.romBytes);
    // Warm up (holding RIGHT) until both builds' game loop is running.
    let bootF = 0;
    while (bootF < 400 && (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000)) { stepRight(c); stepRight(a); bootF++; }
    if (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000) bad('game loop never started (tick stuck at init)');

    let diffs = 0, firstDiff = '', compared = 0;
    const pxStart = rd16(c, PX);
    let pxMax = pxStart, enemyMoved = false;
    const ex0 = exs(c);
    for (let step = 0; step < 20000 && compared < 300; step++) {
      const tc = rd16(c, TICK), ta = rd16(a, TICK);
      if (tc > 60000 || ta > 60000) { bad('tick overflowed before enough samples'); break; }
      if (tc !== ta) { if (tc < ta) stepRight(c); else stepRight(a); continue; }
      const pcx = rd16(c, PX), pax = rd16(a, PX), pcy = rd16(c, PY), pay = rd16(a, PY);
      if (pcx !== pax || pcy !== pay) { diffs++; if (!firstDiff) firstDiff = `player@${tc} C(${pcx},${pcy}) A(${pax},${pay})`; }
      const cx = exs(c), ax = exs(a), cy = eys(c), ay = eys(a);
      for (let i = 0; i < N; i++)
        if (cx[i] !== ax[i] || cy[i] !== ay[i]) { diffs++; if (!firstDiff) firstDiff = `enemy${i}@${tc} C(${cx[i]},${cy[i]}) A(${ax[i]},${ay[i]})`; }
      if (pcx > pxMax) pxMax = pcx;
      if (cx.some((v, i) => v !== ex0[i])) enemyMoved = true;
      compared++;
      stepRight(c); stepRight(a);
    }

    if (compared < 250) bad(`too few matched-tick samples (${compared}) — harness did not run`);
    else if (pxMax <= pxStart + 8) bad(`player never ran right (px ${pxStart} -> ${pxMax}) — input/scroll not exercised`);
    else if (pxMax < 256) bad(`player never crossed to screen 2 (px max ${pxMax}) — u16 scroll not exercised`);
    else if (!enemyMoved) bad('enemies never moved — AI not exercised');
    else if (diffs === 0)
      ok('real composite (2-screen scroll, moving player + walker/chaser/flyer/patrol, ASM AI+draw): '
        + `C ≡ ASM player px/py + enemy ss_x/ss_y at every matched tick over ${compared} ticks `
        + `(player ran ${pxStart}->${pxMax}, across the screen boundary)`);
    else bad(`divergence — ${diffs} diffs (first: ${firstDiff}) over ${compared} matched ticks`);
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srvC.srv);
  await H.stopServer(srvA.srv);
}

if (failed) process.exit(1);
console.log('\nasm-realproj: the shipped ASM engine (AI + draw) matches pure C on a scrolling, moving-player level.');
