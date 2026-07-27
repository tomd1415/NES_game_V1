#!/usr/bin/env node
// Engine v77 — enemy-vs-enemy separation, the last open slice of feedback #30
// ("enemy sprites pass through solids AND through each other").  The solids half
// shipped 2026-06-17 as bw_sprite_blocked(); this covers the AABB pass.
//
// The scenario is built so the collision is unavoidable and self-evident: two
// identical walkers on an open floor, both seeded moving RIGHT (every walker is),
// with a wall only on the right.  The right-hand one turns at the wall and comes
// back into the left-hand one, head on.
//
//   floor ───────────────────────────────────────────█ wall
//            A →              B →  ...turns...  ← B  █
//
// The load-bearing part is the CONTROL run: with the box unticked the same two
// walkers must be seen to pass clean through each other.  Without that, "they
// never overlapped" could just mean the scenario never made them meet, and the
// real assertion would be vacuous.
globalThis.NES_TARGET_ENGINE = 77;

import * as H from './lib/render-harness.mjs';

const PORT = 18853;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const FLOOR_ROW = 28;
const WALL_COL  = 20;             // x = 160
const STAND_Y   = FLOOR_ROW * 8 - 16;   // 2x2 sprite resting on the floor = 208
const A_X = 64, B_X = 128;
const SPRITE_PX = 16;             // 2x2 sprite = 16px wide

// Floor all the way along, plus a wall column on the right at the walkers' own
// body rows (26-27) — that is what bw_sprite_blocked probes, so the wall has to
// be beside them, not merely on the floor row.
function walledBackground() {
  const cols = 32, rows = 30;
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let c = 0; c < cols; c++) beh[FLOOR_ROW][c] = 1;      // SOLID_GROUND
  for (const r of [26, 27]) beh[r][WALL_COL] = 2;            // WALL
  return {
    name: 'bg', dimensions: { screens_x: 1, screens_y: 1 },
    nametable: Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ tile: 0, palette: 0 }))),
    behaviour: beh,
  };
}

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

const INSTANCES = [
  { id: 'e0', spriteIdx: 1, x: A_X, y: STAND_Y, ai: 'walker' },
  { id: 'e1', spriteIdx: 1, x: B_X, y: STAND_Y, ai: 'walker' },
];

// `bump` null = the Globals module absent entirely (the byte-identical baseline).
function makeState(bump) {
  const s = {
    name: 'bump', version: 1, universal_bg: 0x0F,
    sprites: [
      { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
      { role: 'enemy', name: 'baddie', width: 2, height: 2, cells: H.mkCells(2, 2) },
    ],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x30, 0x10, 0x20] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [walledBackground()],
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0,
    builder: win.BuilderDefaults(),
  };
  s.builder.modules.scene.enabled = true;
  s.builder.modules.scene.config.instances = INSTANCES.map((o) => ({ ...o }));
  if (bump === null) delete s.builder.modules.globals;
  else s.builder.modules.globals = { enabled: true, config: { enemyBump: bump } };
  return s;
}

// --- 1) codegen gating (no build needed) ------------------------------------
{
  const off = win.BuilderAssembler.assemble(makeState(null), tpl);
  if (!/bw_bump/.test(off)) ok('Globals absent emits no separation code (byte-identical baseline safe)');
  else bad('Globals absent STILL emitted bw_bump* — the golden ROM would change');

  const ticked0 = win.BuilderAssembler.assemble(makeState(false), tpl);
  if (!/bw_bump/.test(ticked0)) ok('Globals ticked but box off emits no separation code');
  else bad('enemyBump=false still emitted bw_bump* — the toggle does not gate');

  const on = win.BuilderAssembler.assemble(makeState(true), tpl);
  if (/static const unsigned char bw_bump_idx\[2\] = \{ 0, 1 \}/.test(on)) {
    ok('box on emits the participation table for both walkers');
  } else bad('box on did NOT emit bw_bump_idx[2] = { 0, 1 }');
  if (/#define BW_BUMP_COUNT 2/.test(on)) ok('box on emits BW_BUMP_COUNT 2');
  else bad('box on did NOT emit BW_BUMP_COUNT 2');
  // The turn-around half: each walker must consume and clear its own flag.
  if (/if \(bw_bumped\[0\]\) \{ bw_bumped\[0\] = 0; bw_dir_0 = -bw_dir_0; \}/.test(on) &&
      /if \(bw_bumped\[1\]\) \{ bw_bumped\[1\] = 0; bw_dir_1 = -bw_dir_1; \}/.test(on)) {
    ok('each walker consumes and clears its own bump flag');
  } else bad('walker blocks do not consume bw_bumped[] — enemies would grind together, not turn');
  // Under NES_ASM_AI the C blocks vanish, so the pass must flip the ASM's own byte.
  if (/ss_ai_state\[bwa\] = -ss_ai_state\[bwa\]/.test(on)) {
    ok('emits the NES_ASM_AI direction flip (ASM build turns too)');
  } else bad('no ss_ai_state flip — walkers would never turn in the default ASM build');

  // A design authored at v77 must still build byte-identically on an older target.
  window.NES_TARGET_ENGINE = 76;
  const v76 = win.BuilderAssembler.assemble(makeState(true), tpl);
  if (!/bw_bump/.test(v76)) ok('v76 target degrades the feature (no separation code)');
  else bad('v76 target still emitted bw_bump* — the engine-version gate is broken');
  window.NES_TARGET_ENGINE = 77;
}

// --- 2) behavioural (real ROM) ---------------------------------------------
// Both build paths matter and they turn the walker by DIFFERENT mechanisms, so
// each is run for real:
//   * default — `ss_ai_type[` in the emitted C makes the server pick NES_ASM_AI,
//     so ai_update() (6502) moves the walkers and the C AI blocks are compiled
//     out.  Nothing consumes bw_bumped[]; the pass flips ss_ai_state[] instead.
//   * PLAYGROUND_NO_ASM=1 — the pure-C fallback, where the walker's own block
//     runs and consumes bw_bumped[].
// A green codegen assertion cannot tell these apart, and the ASM one is the one
// pupils actually ship.
// Returns the closest the two walkers ever got, plus A's travel after the meeting.
async function run(bump, port) {
  const s = makeState(bump);
  s.engineVersion = 77;
  const r = await H.buildRom(port, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 16, y: STAND_Y },
    sceneSprites: INSTANCES.map((o) => ({ spriteIdx: o.spriteIdx, x: o.x, y: o.y })),
    mode: 'browser', customMainC: win.BuilderAssembler.assemble(s, tpl),
  });
  if (!r.ok) {
    bad('bump=' + bump + ' project did not compile at stage ' + r.stage + ':\n' +
      String(r.log || '').slice(-1500));
    return null;
  }
  const h = H.openRom(r.romBytes);
  h.frames(12);
  const ax = () => H.oamSprite(h.nes, 4).x;     // player 2x2 takes OAM 0-3
  const bx = () => H.oamSprite(h.nes, 8).x;
  let minGap = Math.abs(bx() - ax());
  let aAtMeeting = null, moved = false;
  const a0 = ax(), b0 = bx();
  for (let f = 0; f < 140; f++) {
    h.frames(1);
    const gap = Math.abs(bx() - ax());
    if (gap < minGap) minGap = gap;
    if (aAtMeeting === null && gap <= SPRITE_PX + 2) aAtMeeting = ax();
    if (ax() !== a0 || bx() !== b0) moved = true;
  }
  return { minGap, aAtMeeting, aEnd: ax(), moved, a0, b0 };
}

// Assert the ON behaviour for whichever build path `label` describes.
function checkOn(on, label) {
  if (!on) return;
  if (!on.moved) {
    bad(label + ': neither walker moved (x stuck at ' + on.a0 + '/' + on.b0 + ') — separation froze the AI');
    return;
  }
  if (on.minGap >= SPRITE_PX - 4) ok(label + ': the walkers never stand inside each other (closest ' + on.minGap + 'px, bodies are ' + SPRITE_PX + 'px)');
  else bad(label + ': they still overlapped (closest ' + on.minGap + 'px, bodies are ' + SPRITE_PX + 'px) — separation is not working');

  // The turn-around, not just the nudge: A was walking right, so after the
  // meeting it must end up LEFT of where it met B.  Push-apart alone would
  // leave it grinding forward at the contact point instead.
  if (on.aAtMeeting === null) {
    bad(label + ': the walkers never even got close (no meeting frame) — scenario broke');
  } else if (on.aEnd < on.aAtMeeting - 8) {
    ok(label + ': the bumped walker turns around and leaves (x ' + on.aAtMeeting + ' -> ' + on.aEnd + ')');
  } else {
    bad(label + ': the bumped walker did not turn away (met at x ' + on.aAtMeeting +
      ', ended at ' + on.aEnd + ') — it is grinding at the contact point, the 1px jitter #30 complains about');
  }
}

// Default (ASM AI) path — the one pupils ship.
const { srv } = await H.startServer(PORT);
try {
  // Control FIRST: prove the scenario really does drive them into each other,
  // so the ON run's "never overlapped" means something.
  const off = await run(false, PORT);
  if (off) {
    if (!off.moved) bad('control: neither walker moved (x stuck at ' + off.a0 + '/' + off.b0 + ') — AI never ran, test is meaningless');
    else if (off.minGap <= 4) ok('control (box off, ASM AI): the two walkers pass clean through each other (closest ' + off.minGap + 'px apart)');
    else bad('control (box off, ASM AI): they never overlapped (closest ' + off.minGap + 'px) — the scenario does not collide, so the ON assertion would be vacuous');
  }
  checkOn(await run(true, PORT), 'box on, ASM AI (ss_ai_state flip)');
} catch (e) {
  bad('threw (ASM path): ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

// Pure-C fallback — the walker's own block consumes bw_bumped[] here.
const { srv: srvC } = await H.startServer(PORT + 1, { PLAYGROUND_NO_ASM: '1' });
try {
  checkOn(await run(true, PORT + 1), 'box on, pure C (bw_bumped flag)');
} catch (e) {
  bad('threw (C path): ' + (e && e.stack || e));
} finally {
  await H.stopServer(srvC);
}

if (failed) process.exit(1);
console.log('\nEnemy-vs-enemy separation (engine v77, #30) test complete.');
