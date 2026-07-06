#!/usr/bin/env node
// Basic-platformer stomp (bug #15 — "no way to kill an enemy").  With the
// Damage module's "jump on enemies to defeat them" option ON, a player falling
// onto an enemy from above defeats it (parks at y=0xFF) and bounces off instead
// of taking damage.  Gated #ifdef BW_STOMP_DEFEAT, so OFF is byte-identical —
// this test proves BOTH: ON defeats + bounces, OFF leaves the enemy alive.
import * as H from './lib/render-harness.mjs';

const PORT = 18869;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const ENEMY = { x: 120, y: 208 };     // static enemy resting on the floor
const START = { x: 120, y: 150 };     // player starts directly above it

function makeState(win, stomp, start) {
  var st = start || START;
  const rows = 30, cols = 32;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) beh[28][c] = 1;            // SOLID_GROUND floor
  const s = {
    name: 'stomp', version: 1, universal_bg: 0x0F,
    sprites: [
      { role: 'player', name: 'hero',  width: 2, height: 2, cells: H.mkCells(2, 2) },
      { role: 'enemy',  name: 'baddie', width: 2, height: 2, cells: H.mkCells(2, 2) },
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
  // Damage module ON with HP so PLAYER_HP_ENABLED; toggle the stomp option.
  const p1 = s.builder.modules.players.submodules.player1;
  p1.config = Object.assign({}, p1.config, { startX: st.x, startY: st.y, maxHp: 3 });
  s.builder.modules.damage.enabled = true;
  s.builder.modules.damage.config = Object.assign({}, s.builder.modules.damage.config,
    { amount: 1, invincibilityFrames: 20, stompDefeat: stomp, stompBounce: 12 });
  s.builder.modules.scene.enabled = true;
  s.builder.modules.scene.config.instances = [
    { id: 'e0', spriteIdx: 1, x: ENEMY.x, y: ENEMY.y, ai: 'static', speed: 1 },
  ];
  return s;
}

const win = H.loadBuilderModules();
const tpl = H.readTemplate();
const { srv } = await H.startServer(PORT);
try {
  // ---- Build A: stomp ON — the fall defeats the enemy + bounces the player.
  {
    const s = makeState(win, true);
    const r = await H.buildRom(PORT, {
      state: s, playerSpriteIdx: 0, playerStart: START,
      sceneSprites: [{ spriteIdx: 1, x: ENEMY.x, y: ENEMY.y }],
      mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl),
    });
    if (!r.ok) {
      bad('stomp-ON build failed at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1200));
    } else {
      const h = H.openRom(r.romBytes);
      h.frames(4);
      let defeated = false, defeatFrame = -1, playerY = [];
      for (let f = 0; f < 80; f++) {
        h.frames(1);
        const ey = H.oamSprite(h.nes, 4).y;
        playerY.push(H.oamSprite(h.nes, 0).y);
        if (!defeated && ey >= 0xEF) { defeated = true; defeatFrame = f; }
      }
      if (defeated) ok('stomp ON — enemy defeated (parked) after falling onto it (frame ' + defeatFrame + ')');
      else bad('stomp ON — enemy never defeated (still on screen)');
      // Bounce: after the stomp the player rises (a smaller Y) before settling.
      if (defeated) {
        const minAfter = Math.min(...playerY.slice(defeatFrame));
        const atDefeat = playerY[defeatFrame];
        if (minAfter < atDefeat - 2) ok('stomp ON — player bounces up after the stomp (y ' + atDefeat + ' → ' + minAfter + ')');
        else bad('stomp ON — player did not bounce (y stayed ' + atDefeat + ', min ' + minAfter + ')');
      }
      const alive = H.oamSprite(h.nes, 0).y < 0xEF;
      if (alive) ok('stomp ON — player survives the stomp (on screen)');
      else bad('stomp ON — player vanished (unexpected)');
    }
  }

  // ---- Build B: stomp OFF — the same fall leaves the enemy alive (it hurts).
  {
    const s = makeState(win, false);
    const r = await H.buildRom(PORT, {
      state: s, playerSpriteIdx: 0, playerStart: START,
      sceneSprites: [{ spriteIdx: 1, x: ENEMY.x, y: ENEMY.y }],
      mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl),
    });
    if (!r.ok) {
      bad('stomp-OFF build failed at stage ' + r.stage);
    } else {
      const h = H.openRom(r.romBytes);
      h.frames(4);
      let everDefeated = false;
      for (let f = 0; f < 80; f++) {
        h.frames(1);
        if (H.oamSprite(h.nes, 4).y >= 0xEF) everDefeated = true;
      }
      if (!everDefeated) ok('stomp OFF — enemy is NOT defeated by the same fall (gate works)');
      else bad('stomp OFF — enemy got defeated without the option (gate broken)');
    }
  }

  // ---- Build C: stomp ON, but a SIDE approach on the ground hurts (the
  // stomp is directional — feet must be near the enemy's top). A too-loose
  // condition would wrongly defeat an enemy the player merely walks into.
  {
    const SIDE = { x: 60, y: 208 };   // player on the floor, left of the enemy
    const s = makeState(win, true, SIDE);
    const r = await H.buildRom(PORT, {
      state: s, playerSpriteIdx: 0, playerStart: SIDE,
      sceneSprites: [{ spriteIdx: 1, x: ENEMY.x, y: ENEMY.y }],
      mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl),
    });
    if (!r.ok) {
      bad('stomp side-approach build failed at stage ' + r.stage);
    } else {
      const h = H.openRom(r.romBytes);
      h.frames(6);
      h.hold(H.BTN.RIGHT);
      let contacted = false, defeated = false;
      for (let f = 0; f < 100; f++) {
        h.frames(1);
        const p = H.oamSprite(h.nes, 0), e = H.oamSprite(h.nes, 4);
        // horizontal overlap of the two 16px boxes (both on the floor row)
        if (p.x + 16 > ENEMY.x && p.x < ENEMY.x + 16 && e.y < 0xEF) contacted = true;
        if (e.y >= 0xEF) defeated = true;
      }
      h.release(H.BTN.RIGHT);
      if (contacted) ok('side-approach — player reached the enemy on the ground');
      else bad('side-approach — player never overlapped the enemy (test setup off)');
      if (!defeated) ok('side-approach — walking into the enemy does NOT stomp it (hurts instead)');
      else bad('side-approach — a side touch wrongly defeated the enemy (stomp not directional)');
    }
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nBasic-platformer stomp (bug #15) test complete.');
