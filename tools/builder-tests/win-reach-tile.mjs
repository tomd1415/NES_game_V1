// Win condition (reach a trigger tile) — behavioural. Nearly every game uses
// win_condition, but it was only ever codegen-tested. On a win the engine sets
// bw_won (green screen tint) and zeroes walk_speed/climb_speed, freezing the
// player (builder-modules.js ~2450). We walk the player right and compare where
// it stops: onto a TRIGGER strip it freezes early (the win); with no trigger it
// runs to the right-edge clamp. The gap proves the win actually fired + froze.
import * as H from './lib/render-harness.mjs';

const PORT = 18868;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

function makeState(win, { trigger }) {
  const rows = 30, cols = 32, FLOOR = 25;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) beh[FLOOR][c] = 1;                     // floor
  if (trigger) for (let r = 22; r < FLOOR; r++) { beh[r][25] = 5; beh[r][26] = 5; }   // TRIGGER strip
  const s = {
    name: 'win-reach', version: 1, universal_bg: 0x0F,
    sprites: [{ role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) }],
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
  s.builder.modules.game.config.type = 'platformer';
  const wc = s.builder.modules.win_condition;
  wc.enabled = true;
  wc.config = Object.assign({}, wc.config, { type: 'reach_tile', behaviourType: 'trigger' });
  const p1 = s.builder.modules.players.submodules.player1;
  p1.config = Object.assign({}, p1.config, { startX: 32, startY: 176 });
  return s;
}

const win = H.loadBuilderModules();
const tpl = H.readTemplate();
const px = (h) => H.oamSprite(h.nes, 0).x;

// Hold RIGHT until the player stops for 20 frames; return where it stopped.
async function walkUntilStuck(port, trigger) {
  const s = makeState(win, { trigger });
  const r = await H.buildRom(port, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 32, y: 176 }, sceneSprites: [],
    mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl),
  });
  if (!r.ok) { bad('build (trigger=' + trigger + ') failed at stage ' + r.stage); return null; }
  const h = H.openRom(r.romBytes);
  h.frames(30);
  h.hold(H.BTN.RIGHT);
  let prev = -1, stuck = 0, x = -1;
  for (let i = 0; i < 340 && stuck < 20; i++) { h.nes.frame(); x = px(h); stuck = (x === prev) ? stuck + 1 : 0; prev = x; }
  h.release(H.BTN.RIGHT);
  return x;
}

const { srv } = await H.startServer(PORT);
try {
  const winX  = await walkUntilStuck(PORT, true);    // stops on the trigger (won)
  const edgeX = await walkUntilStuck(PORT, false);   // runs to the screen edge
  if (winX != null && edgeX != null) {
    console.log('  froze at: trigger = ' + winX + 'px, no-trigger control = ' + edgeX + 'px');
    if (winX > 32) ok('the player walked toward the trigger (reached ' + winX + 'px)'); else bad('player did not move');
    if (winX < edgeX - 16) ok('reaching the trigger freezes the player early — the win fired (' + winX + ' < edge ' + edgeX + ')');
    else bad('the trigger did not stop the player before the screen edge (trigger ' + winX + ' vs edge ' + edgeX + ')');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nWin-condition (reach-tile) behavioural test complete.');
