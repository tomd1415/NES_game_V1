#!/usr/bin/env node
// Render regression — the optional "character bob" actually bobs (R-10).
//
// When the Globals module's "Bob up and down when walking" is on, the player
// sprite hops 1px on alternate walk frames while grounded. This drives a real
// ROM: hold RIGHT and watch the player's OAM Y — with bob on it oscillates by
// 1px; with bob off it's rock-steady. Also checks the byte-identical gate (the
// macro is emitted only when the option is on).
//
// See docs/plans/current/2026-06-18-arc-c-tier2-backlog.md (R-10).

import * as H from './lib/render-harness.mjs';

const PORT = 18825;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

function makeState(win, bob) {
  const s = {
    name: 'bob', version: 1, universal_bg: 0x0F,
    sprites: [{ role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) }],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x30, 0x10, 0x20] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [H.flatBackground(1, 1, 28)],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0,
    builder: win.BuilderDefaults(),
  };
  // globals isn't pre-populated in BuilderDefaults (pupils add it on enable),
  // so construct the module entry the way the editor would.
  s.builder.modules.globals = {
    enabled: true,
    config: { gravityPx: 1, jumpSpeedPx: 2, bobWhenWalking: bob },
  };
  return s;
}

// Hold RIGHT for n frames and return the set of distinct player OAM Y values.
function walkYValues(h, frames) {
  const ys = [];
  h.hold(H.BTN.RIGHT);
  for (let i = 0; i < frames; i++) { h.nes.frame(); ys.push(H.oamSprite(h.nes, 0).y); }
  h.release(H.BTN.RIGHT);
  return ys;
}

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

// Gate check (assembled C), no server needed.
const cOn  = win.BuilderAssembler.assemble(makeState(win, true), tpl);
const cOff = win.BuilderAssembler.assemble(makeState(win, false), tpl);
// Match the emitted define at line start (the template also mentions the macro
// inside a comment, which must not count).
if (/^#define BW_BOB_WHEN_WALKING 1/m.test(cOn)) ok('bob ON emits BW_BOB_WHEN_WALKING 1');
else bad('bob ON did not emit BW_BOB_WHEN_WALKING');
if (!/^#define BW_BOB_WHEN_WALKING 1/m.test(cOff)) ok('bob OFF omits the macro (byte-identical gate)');
else bad('bob OFF unexpectedly emitted BW_BOB_WHEN_WALKING');

const { srv } = await H.startServer(PORT);
try {
  for (const bob of [true, false]) {
    const s = makeState(win, bob);
    const r = await H.buildRom(PORT, {
      state: s, playerSpriteIdx: 0, playerStart: { x: 60, y: 120 }, sceneSprites: [],
      mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl),
    });
    if (!r.ok) { bad('bob=' + bob + ' did not compile at stage ' + r.stage); continue; }
    const h = H.openRom(r.romBytes);
    h.frames(120);                       // settle on the floor
    const yRest = H.oamSprite(h.nes, 0).y;
    const ys = walkYValues(h, 24);       // walk right for 24 frames
    const distinct = [...new Set(ys)].sort((a, b) => a - b);
    if (bob) {
      // Oscillates between the rest Y and rest Y + 1 (and nothing wilder).
      const oscillates = distinct.length === 2 && (distinct[1] - distinct[0]) === 1;
      if (oscillates) ok('bob ON: player Y oscillates 1px while walking (' + distinct.join('/') + ')');
      else bad('bob ON: expected a 1px 2-value oscillation, got Y values ' + JSON.stringify(distinct));
    } else {
      const steady = distinct.length === 1;
      if (steady) ok('bob OFF: player Y is steady while walking (' + distinct[0] + ')');
      else bad('bob OFF: player Y should not move vertically, got ' + JSON.stringify(distinct) + ' (rest ' + yRest + ')');
    }
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nCharacter-bob render smoke-test complete.');
