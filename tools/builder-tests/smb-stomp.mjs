// SMB Goomba stomp — behavioural (smb-enemies.mjs only checks codegen/compile).
// The signature SMB mechanic: dropping onto a Goomba defeats it. We confine the
// Goomba in a 2-tile wall pen so it can't wander out from under the falling
// player (determinism) and drop the player straight onto it.
//
// Detection: the player renders as OAM sprites 0-3, the single scene sprite
// (the Goomba) as 4-7. On a stomp the engine sets ss_y = 0xFF (builder-modules
// ~line 601), parking the Goomba's top cell (sprite 4) off-screen. So the
// Goomba is "alive" while sprite 4's Y is on-screen and "defeated" once it goes
// off-screen (≥ 0xEF). (Its bottom row wraps to y≈7 when parked — which is why
// a naive on-screen count only drops by 2, not 4; we check the top cell.)
import * as H from './lib/render-harness.mjs';

const PORT = 18867;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

globalThis.NES_TARGET_ENGINE = 9;

const GOOMBA_CELL = 4;                           // first scene-sprite OAM slot
const goombaY = (nes) => H.oamSprite(nes, GOOMBA_CELL).y;
const alive   = (nes) => goombaY(nes) < 0xEF;    // on-screen ⇒ not yet defeated

function makeState(win) {
  const rows = 30, cols = 32, FLOOR = 25;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) beh[FLOOR][c] = 1;         // SOLID_GROUND floor
  // Pen: walls flank the Goomba's 2-tile spot (cols 15-16) at body height.
  for (let r = FLOOR - 2; r < FLOOR; r++) { beh[r][14] = 2; beh[r][17] = 2; }
  const s = {
    name: 'smb-stomp', version: 1, universal_bg: 0x22,
    sprites: [
      { role: 'player', name: 'hero',  width: 2, height: 2, cells: H.mkCells(2, 2) },
      { role: 'enemy',  name: 'goomba', width: 2, height: 2, cells: H.mkCells(2, 2) },
    ],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x30, 0x10, 0x20] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [{
      name: 'bg', dimensions: { screens_x: 1, screens_y: 1 },
      nametable: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
      behaviour: beh,
    }],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0,
    builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config.type = 'smb';
  if (s.builder.modules.behaviour_walls) s.builder.modules.behaviour_walls.enabled = true;
  // Goomba stands on the floor in the pen (cols 15-16 → x=120, y = 25*8-16 = 184).
  s.builder.modules.scene.config.instances = [{ id: 1, spriteIdx: 1, x: 120, y: 184, ai: 'goomba', speed: 1 }];
  const p1 = s.builder.modules.players.submodules.player1;
  p1.config = Object.assign({}, p1.config, { startX: 120, startY: 150 });   // directly above the Goomba
  return s;
}

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

const { srv } = await H.startServer(PORT);
try {
  const s = makeState(win);
  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 120, y: 150 },
    sceneSprites: [{ spriteIdx: 1, x: 120, y: 184, ai: 'goomba', speed: 1 }],
    mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl), targetEngine: 9,
  });
  if (!r.ok) { bad('SMB stomp build failed at stage ' + r.stage + ' ' + ((r.log || '').slice(-400))); }
  else {
    const h = H.openRom(r.romBytes);
    h.frames(8);                              // both actors on screen, player still falling
    if (alive(h.nes)) ok('Goomba is alive and on screen before the stomp (y=' + goombaY(h.nes) + ')');
    else bad('Goomba was already off-screen before the stomp (y=' + goombaY(h.nes) + ') — setup wrong');

    // Let the player fall onto the Goomba.
    let defeated = false;
    for (let i = 0; i < 60 && !defeated; i++) { h.nes.frame(); if (!alive(h.nes)) defeated = true; }
    if (defeated) ok('dropping on the Goomba defeats it — its sprite is parked off-screen (stomp works)');
    else bad('Goomba survived the drop (top cell still at y=' + goombaY(h.nes) + ') — stomp did not fire');

    // And it stays defeated (doesn't respawn a frame later).
    h.frames(30);
    if (!alive(h.nes)) ok('the Goomba stays defeated'); else bad('Goomba reappeared after the stomp (y=' + goombaY(h.nes) + ')');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nSMB Goomba-stomp behavioural test complete.');
