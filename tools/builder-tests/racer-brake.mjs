#!/usr/bin/env node
// Arc E §3 (E3-5) — top-down racer brake (DOWN).
//
// Holding DOWN sheds speed much faster than coasting friction, so a pupil can
// slow for a corner.  (Full reverse is deferred — it needs a signed-speed
// refactor; brake floors at 0.)  Asserts the car builds speed under accelerate,
// then DOWN bleeds it off far quicker than friction and brings it to a stop.
import * as H from './lib/render-harness.mjs';

const PORT = 18843;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };
const RACER_BRAKE = 40, RACER_FRICTION = 8;   // must match the engine defaults

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

function makeState() {
  const cols = 64, rows = 60;
  const nt = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ tile: 1, palette: 0 })));
  const beh = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
  const s = {
    name: 'racer-brake', version: 1, universal_bg: 0x0F,
    sprites: [{ role: 'player', name: 'car', width: 2, height: 2, cells: H.mkCells(2, 2) }],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x21, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [{ name: 'bg', dimensions: { screens_x: 2, screens_y: 2 }, nametable: nt, behaviour: beh }],
    behaviour_types: [...H.BEHAVIOUR_TYPES],
    selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config = { type: 'racer', racerTopSpeed: 4 };  // max 768
  return s;
}

const { srv } = await H.startServer(PORT);
try {
  const s = makeState();
  const asm = win.BuilderAssembler.assemble(s, tpl);
  let c = asm.replace('while (oam_idx < 256) {',
    '(*(unsigned char*)0x0705)=(unsigned char)(racer_speed&0xFF);(*(unsigned char*)0x0706)=(unsigned char)(racer_speed>>8);' +
    'while (oam_idx < 256) {');
  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 120, y: 200 }, mode: 'browser', customMainC: c });
  if (!r.ok) { bad('racer-brake ROM did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1800)); }
  else {
    const h = H.openRom(r.romBytes);
    const spd = () => h.nes.cpu.mem[0x705] + 256 * h.nes.cpu.mem[0x706];

    const toMax = () => { h.hold(H.BTN.A); for (let i = 0; i < 80; i++) h.frames(1); h.release(H.BTN.A); };
    const framesToStop = (brake) => {
      let g = 0;
      if (brake) h.hold(H.BTN.DOWN);
      while (spd() > 0 && g < 300) { h.frames(1); g++; }
      if (brake) h.release(H.BTN.DOWN);
      return g;
    };

    h.frames(200);
    toMax();
    const s0 = spd();
    if (s0 > 400) ok('accelerate builds real speed (speed=' + s0 + ' 8.8)');
    else bad('did not build enough speed to test braking (speed=' + s0 + ')');

    // Coast to a stop (friction only), then re-accelerate and brake to a stop.
    // Comparing stop-times is robust to input latency (both pay the same cost).
    const gCoast = framesToStop(false);
    toMax();
    const gBrake = framesToStop(true);
    if (gBrake > 0 && spd() === 0) ok('braking brings the car to a full stop (' + gBrake + ' frames)');
    else bad('braking did not stop the car (speed=' + spd() + ', frames=' + gBrake + ')');
    if (gBrake * 2 < gCoast) ok('braking stops far faster than coasting (' + gBrake + ' vs ' + gCoast + ' frames)');
    else bad('braking not clearly faster than friction (brake ' + gBrake + ', coast ' + gCoast + ')');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nRacer brake (E3-5) test complete.');
