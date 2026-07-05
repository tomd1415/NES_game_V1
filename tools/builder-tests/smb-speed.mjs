// SMB Speed preset — behavioural (locks the walk-speed fix the user reported:
// "changing the player walk speed makes no difference"). smb-jump.mjs only
// checks the emitted #define; this drives real ROMs and measures how far the
// player actually travels. A 1-screen level means no camera scroll, so the
// player's OAM X equals its world X.
import * as H from './lib/render-harness.mjs';

const PORT = 18866;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

globalThis.NES_TARGET_ENGINE = 9;   // SMB features need engine ≥ 3

function makeState(win, speed) {
  const s = {
    name: 'smb-speed', version: 1, universal_bg: 0x22,
    sprites: [{ role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) }],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x30, 0x10, 0x20] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [H.flatBackground(1, 1, 25)],   // 1 screen, floor at row 25 (y=200)
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0,
    builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = 'smb';
  s.builder.modules.game.config.smbSpeed = speed;
  const p1 = s.builder.modules.players.submodules.player1;
  p1.config = Object.assign({}, p1.config, { startX: 24, startY: 176 });
  return s;
}

const win = H.loadBuilderModules();
const tpl = H.readTemplate();
const px = (h) => H.oamSprite(h.nes, 0).x;

async function walkDistance(srvPort, speed, { run = false, frames = 16 } = {}) {
  const s = makeState(win, speed);
  const r = await H.buildRom(srvPort, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 24, y: 176 }, sceneSprites: [],
    mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl), targetEngine: 9,
  });
  if (!r.ok) { bad('SMB speed=' + speed + ' build failed at stage ' + r.stage); return null; }
  const h = H.openRom(r.romBytes);
  h.frames(40);                       // fall + settle on the floor
  const x0 = px(h);
  h.hold(H.BTN.RIGHT);
  if (run) h.hold(H.BTN.B);
  for (let i = 0; i < frames; i++) h.nes.frame();
  const dist = px(h) - x0;
  h.release(H.BTN.RIGHT);
  if (run) h.release(H.BTN.B);
  return dist;
}

const { srv } = await H.startServer(PORT);
try {
  const d1 = await walkDistance(PORT, 1);
  const d5 = await walkDistance(PORT, 5);
  if (d1 != null && d5 != null) {
    console.log('  walk distance over 16 frames: Speed 1 = ' + d1 + 'px, Speed 5 = ' + d5 + 'px');
    if (d1 > 0) ok('Speed 1 still walks (' + d1 + 'px) — movement works'); else bad('Speed 1 did not move the player');
    if (d5 > d1) ok('Speed 5 walks meaningfully farther than Speed 1 — the preset changes real speed'); else bad('Speed 5 (' + d5 + ') was not faster than Speed 1 (' + d1 + ')');
  }

  // Within one preset, holding B (run) must cover more ground than walking.
  const walk3 = await walkDistance(PORT, 3, { run: false });
  const run3  = await walkDistance(PORT, 3, { run: true });
  if (walk3 != null && run3 != null) {
    console.log('  Speed 3 over 16 frames: walk = ' + walk3 + 'px, run (B) = ' + run3 + 'px');
    if (run3 > walk3) ok('running (B held) is faster than walking at the same preset'); else bad('run (' + run3 + ') was not faster than walk (' + walk3 + ')');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nSMB speed-preset behavioural test complete.');
