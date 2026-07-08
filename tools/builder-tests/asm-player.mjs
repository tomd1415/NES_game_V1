#!/usr/bin/env node
// ASM engine — Phase 2c: the TOP-DOWN player update on hand-written 6502.
//
// player_asm.s (td_update) is the 4-way top-down move+collision, linked only
// under NES_ASM_PLAYER (a test toggle, PLAYGROUND_ASM_PLAYER; NOT shipped). Its
// logic is proven in asm-lab (functions/td_update); this proves the WIRED build:
// a 2-screen top-down world with a moving player (holds RIGHT+DOWN, scrolls
// across the world, bumps walls), dual-built pure C (PLAYGROUND_NO_ASM=1) vs the
// ASM player (PLAYGROUND_ASM_PLAYER=1), matched-tick comparing the real u16
// player px/py. Any diff is a real bug in the wired td_update.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as H from './lib/render-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const jsnes = require(path.join(H.ROOT, 'tools', 'tile_editor_web', 'jsnes.min.js'));

const PORT_C = 18788, PORT_A = 18789;
let failed = false;
const ok = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const win = H.loadBuilderModules();
new Function(fs.readFileSync(path.join(H.WEB, 'engine-version.js'), 'utf8'))();  // target latest engine
const tpl = H.readTemplate();

function makeState() {
  const cols = 64, rows = 30;              // 2 screens wide -> SCROLL_BUILD (u16 px/py)
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  // scattered WALL blocks the diagonally-moving player bumps into (no floor —
  // top-down has no gravity).
  for (const [c, r] of [[12, 6], [12, 7], [20, 12], [21, 12], [34, 9], [34, 10], [48, 16], [30, 20]])
    beh[r][c] = 2;
  const bg = {
    name: 'bg', dimensions: { screens_x: 2, screens_y: 1 },
    nametable: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
    behaviour: beh,
  };
  const sprites = [{ role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) }];
  const s = {
    name: 'tdplayer', version: 1, universal_bg: 0x21, sprites,
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x0F, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [bg], behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = 'topdown';
  return s;
}

const TICK = 0x0710, PX = 0x0712, PY = 0x0714;
function withProbe(mainC) {
  const inj = '{static unsigned int _tk; ++_tk;'
    + `(*(unsigned char*)${TICK})=(unsigned char)(_tk&0xFF);(*(unsigned char*)${TICK + 1})=(unsigned char)(_tk>>8);`
    + `(*(unsigned char*)${PX})=(unsigned char)px;(*(unsigned char*)${PX + 1})=(unsigned char)(px>>8);`
    + `(*(unsigned char*)${PY})=(unsigned char)py;(*(unsigned char*)${PY + 1})=(unsigned char)(py>>8);} `;
  return mainC.replace('while (oam_idx < 256) {', inj + 'while (oam_idx < 256) {');
}

const boot = (b) => { const n = new jsnes.NES({ onFrame() {}, onAudioSample() {} }); n.loadROM(b.toString('binary')); return n; };
const rd16 = (n, a) => (n.cpu.mem[a] & 0xFF) | ((n.cpu.mem[a + 1] & 0xFF) << 8);
const stepMove = (n) => {
  n.buttonDown(1, H.BTN.RIGHT); n.buttonDown(1, H.BTN.DOWN);
  n.frame();
  n.buttonUp(1, H.BTN.RIGHT); n.buttonUp(1, H.BTN.DOWN);
};

const srvC = await H.startServer(PORT_C, { PLAYGROUND_NO_ASM: '1' });
const srvA = await H.startServer(PORT_A, { PLAYGROUND_ASM_PLAYER: '1' });
try {
  const s = makeState();
  const mainC = win.BuilderAssembler.assemble(s, tpl);
  if (!/#define BW_GAME_STYLE 1/.test(mainC)) bad('not a top-down build (BW_GAME_STYLE != 1) — server gate would not engage');
  const payload = {
    state: s, playerSpriteIdx: 0, playerStart: { x: 24, y: 24 }, mode: 'browser',
    customMainC: withProbe(mainC),
    sceneSprites: [],
  };
  const rc = await H.buildRom(PORT_C, payload);
  const ra = await H.buildRom(PORT_A, payload);
  if (!rc.ok) bad(`C build failed (${rc.stage}): ` + String(rc.log || '').slice(-400));
  else if (!ra.ok) bad(`ASM build failed (${ra.stage}): ` + String(ra.log || '').slice(-400));
  else if (rc.romBytes.equals(ra.romBytes)) bad('ASM ROM == C ROM (NES_ASM_PLAYER did not engage)');
  else {
    const c = boot(rc.romBytes), a = boot(ra.romBytes);
    let bootF = 0;
    while (bootF < 400 && (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000)) { stepMove(c); stepMove(a); bootF++; }
    if (rd16(c, TICK) > 60000 || rd16(a, TICK) > 60000) bad('game loop never started (tick stuck at init)');

    let diffs = 0, firstDiff = '', compared = 0;
    const pxStart = rd16(c, PX), pyStart = rd16(c, PY);
    let pxMax = pxStart, pyMax = pyStart;
    for (let step = 0; step < 20000 && compared < 300; step++) {
      const tc = rd16(c, TICK), ta = rd16(a, TICK);
      if (tc > 60000 || ta > 60000) { bad('tick overflowed before enough samples'); break; }
      if (tc !== ta) { if (tc < ta) stepMove(c); else stepMove(a); continue; }
      const cpx = rd16(c, PX), apx = rd16(a, PX), cpy = rd16(c, PY), apy = rd16(a, PY);
      if (cpx !== apx || cpy !== apy) { diffs++; if (!firstDiff) firstDiff = `tick ${tc}: C(${cpx},${cpy}) A(${apx},${apy})`; }
      if (cpx > pxMax) pxMax = cpx;
      if (cpy > pyMax) pyMax = cpy;
      compared++;
      stepMove(c); stepMove(a);
    }

    if (compared < 250) bad(`too few matched-tick samples (${compared}) — harness did not run`);
    else if (pxMax <= pxStart + 8 || pyMax <= pyStart + 8) bad(`player did not move diagonally (px ${pxStart}->${pxMax}, py ${pyStart}->${pyMax})`);
    else if (pxMax < 256) bad(`player never crossed to screen 2 (px max ${pxMax}) — u16 path not exercised`);
    else if (diffs === 0)
      ok('td player update (NES_ASM_PLAYER): C ≡ ASM player px/py at every matched tick over '
        + `${compared} ticks of 4-way scroll motion (px ${pxStart}->${pxMax} across the boundary, py ${pyStart}->${pyMax}, wall bumps)`);
    else bad(`divergence — ${diffs} px/py diffs (first: ${firstDiff}) over ${compared} matched ticks`);
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srvC.srv);
  await H.stopServer(srvA.srv);
}

if (failed) process.exit(1);
console.log('\nasm-player: the ASM td_update drives the top-down player identically to the C player update.');
