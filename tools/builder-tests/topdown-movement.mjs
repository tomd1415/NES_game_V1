// Top-down behavioural test (bug #26 — top-down was only codegen/compile
// tested, never driven). Builds a real top-down ROM and, in jsnes, verifies
// the four-way movement + no-gravity that distinguishes top-down from the
// platformer engine, plus wall collision. Reads the player's OAM position.
import * as H from './lib/render-harness.mjs';

const PORT = 18865;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

function makeState(win, { wallCol = -1 } = {}) {
  const rows = 30, cols = 32;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  if (wallCol >= 0) for (let r = 0; r < rows; r++) beh[r][wallCol] = 2;   // WALL column
  const s = {
    name: 'topdown-move', version: 1, universal_bg: 0x0F,
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
  s.builder.modules.game.config.type = 'topdown';
  if (s.builder.modules.behaviour_walls) s.builder.modules.behaviour_walls.enabled = true;
  const p1 = s.builder.modules.players.submodules.player1;
  p1.config = Object.assign({}, p1.config, { startX: 120, startY: 120 });
  return s;
}

const win = H.loadBuilderModules();
const tpl = H.readTemplate();
const px = (h) => H.oamSprite(h.nes, 0).x;
const py = (h) => H.oamSprite(h.nes, 0).y;
function pressN(h, btn, n) { h.hold(btn); for (let i = 0; i < n; i++) h.nes.frame(); h.release(btn); h.frames(2); }

const { srv } = await H.startServer(PORT);
try {
  // --- Open field: four-way movement + no gravity ---
  {
    const s = makeState(win, {});
    const r = await H.buildRom(PORT, {
      state: s, playerSpriteIdx: 0, playerStart: { x: 120, y: 120 }, sceneSprites: [],
      mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl),
    });
    if (!r.ok) { bad('top-down build failed at stage ' + r.stage); }
    else {
      const h = H.openRom(r.romBytes);
      h.frames(30);
      const x0 = px(h), y0 = py(h);

      // No gravity: idle for 40 frames → vertical position must not drift.
      h.frames(40);
      if (py(h) === y0) ok('no gravity — the player holds its Y when idle (' + y0 + ')');
      else bad('player drifted vertically while idle (' + y0 + ' → ' + py(h) + ') — gravity leaked into top-down');

      pressN(h, H.BTN.RIGHT, 20);
      if (px(h) > x0) ok('RIGHT moves the player right (' + x0 + ' → ' + px(h) + ')');
      else bad('RIGHT did not increase X (' + x0 + ' → ' + px(h) + ')');

      const xr = px(h);
      pressN(h, H.BTN.LEFT, 40);
      if (px(h) < xr) ok('LEFT moves the player left (' + xr + ' → ' + px(h) + ')');
      else bad('LEFT did not decrease X (' + xr + ' → ' + px(h) + ')');

      const y1 = py(h);
      pressN(h, H.BTN.DOWN, 20);
      if (py(h) > y1) ok('DOWN moves the player down (' + y1 + ' → ' + py(h) + ')');
      else bad('DOWN did not increase Y (' + y1 + ' → ' + py(h) + ') — four-way vertical missing');

      const yd = py(h);
      pressN(h, H.BTN.UP, 40);
      if (py(h) < yd) ok('UP moves the player up (' + yd + ' → ' + py(h) + ')');
      else bad('UP did not decrease Y (' + yd + ' → ' + py(h) + ') — four-way vertical missing');
    }
  }

  // --- Wall collision: a WALL column stops rightward movement ---
  {
    const WALL_COL = 20;                     // wall at tile col 20 → pixel x 160
    const s = makeState(win, { wallCol: WALL_COL });
    const r = await H.buildRom(PORT, {
      state: s, playerSpriteIdx: 0, playerStart: { x: 120, y: 120 }, sceneSprites: [],
      mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl),
    });
    if (!r.ok) { bad('top-down wall build failed at stage ' + r.stage); }
    else {
      const h = H.openRom(r.romBytes);
      h.frames(30);
      const x0 = px(h);
      pressN(h, H.BTN.RIGHT, 80);            // shove hard into the wall
      const xEnd = px(h);
      if (xEnd > x0 && xEnd < WALL_COL * 8) {
        ok('wall stops the player: moved right (' + x0 + ' → ' + xEnd + ') but stayed left of the wall at x=' + (WALL_COL * 8));
      } else if (xEnd >= WALL_COL * 8) {
        bad('player tunnelled through the wall (x=' + xEnd + ' ≥ wall x=' + (WALL_COL * 8) + ')');
      } else {
        bad('player did not move toward the wall (' + x0 + ' → ' + xEnd + ')');
      }
    }
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nTop-down movement behavioural test complete.');
