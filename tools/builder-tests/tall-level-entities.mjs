#!/usr/bin/env node
/*
 * tall-level-entities.mjs — what an entity in the LOWER half of a tall level
 * actually does, measured against a list of the holes that exist today.
 *
 * WHY THIS EXISTS
 * ---------------
 * In an ordinary single-room 1x2 level — no multi-room, no per-room, the default
 * configuration a pupil gets by making their level taller — entities below a
 * certain `y` stop working, in two different ways with two different boundaries:
 *
 *   - a chaser or flyer at y >= 239 never runs its AI      (measured 2026-08-21)
 *   - an enemy at y >= 240 cannot damage the player at all (measured 2026-08-27)
 *
 * Both look completely normal on screen, which is what makes them expensive: the
 * pupil sees an enemy standing there and no error anywhere. The cause is one
 * design decision — "parked / defeated / consumed" is encoded as a COORDINATE
 * (`ss_y = 0xFF`), so every guard asks "is this entity's y past the sentinel?",
 * and a legitimately-placed entity in a tall level answers yes. #14 Step 3
 * replaces the sentinel and removes both.
 *
 * THIS SUITE IS THE HARNESS, WRITTEN BEFORE THE FIX
 * -------------------------------------------------
 * It does not assert the bugs are gone. It asserts the CURRENT behaviour exactly,
 * as a known-failures list, so that:
 *
 *   - a NEW y that stops working fails the suite (a regression), and
 *   - a listed y that STARTS working ALSO fails the suite (the list is stale).
 *
 * The second half is the point and is easy to leave out. Without it the list
 * quietly becomes permanent and the suite ends up enforcing the bugs — so when
 * Step 3 lands, this suite goes red until KNOWN_HOLES is emptied, which is the
 * intended way to find out it worked.
 *
 * THE POSITIVE CONTROL IS NOT OPTIONAL
 * ------------------------------------
 * Every case here is "did the player get hurt / did the enemy move", and the
 * quiet way to pass is a fixture where nothing could ever happen: two of these
 * measurements were voided that way before the control caught them. Once the
 * player and the enemy were at different `x` and never overlapped; once the
 * player's spawn `y` turned out to be CLAMPED TO 200 however high it was set, so
 * a player asked for at y=239 was really at 200 and never reached anything. Both
 * produced a clean "no damage" that meant nothing.
 *
 * So WORKING_CONTROL below must come out working, and the suite fails loudly if
 * it does not — before any hole is reported, because a fixture that cannot
 * demonstrate the good case cannot be trusted about the bad ones. It is also why
 * the player is DRIVEN DOWN with the D-pad rather than spawned in place.
 *
 * Port 18898 (next free above 18897 — docs/guides/TEST-SERVERS.md).
 */
import * as H from './lib/render-harness.mjs';
import { testPort } from './lib/test-port.mjs';

// The runner ASSIGNS this suite's port (BUILDER_TEST_PORT); the literal is only the
// standalone fallback. `main` picked a free number by hand and cited TEST-SERVERS.md;
// this branch removed the choice instead, because three separate recounts of "which
// port does each suite use" kept finding a spelling the last one missed. Both halves
// survive the merge: main's number stays as the fallback, run-all assigns the real one.
const PORT = testPort(18898);
const E_TILE = 21;                 // the static enemy (damage probe)
const cell = (t) => ({ tile: t, palette: 0, empty: false });

// The player is driven down this column; the damage probe sits in it, the AI
// probe sits well clear so a moving chaser cannot confuse the damage result.
const COL_X = 60;
const AI_X  = 200;
const MAX_HP = 5;

// Every `y` probed. 150 is the control; 238/239/240 straddle the two boundaries
// (the AI guard is `< 0xEF` i.e. < 239, the damage guard is `>= 240`); 400 is
// deep in the lower screen, where a pupil building a tall level actually works.
const PROBE_YS = [150, 238, 239, 240, 400];
const WORKING_CONTROL = 150;

// The holes that exist TODAY. Exact match: an entry that starts working fails
// this suite just as loudly as a new one appearing. Keyed `<y>:<probe>`.
const KNOWN_HOLES = new Map([
  ['239:ai',     'chaser AI guard is `ss_y[i] < 0xEF` (239), so a legitimate y=239 reads as parked'],
  ['240:ai',     'same guard, one row lower'],
  ['400:ai',     'same guard, deep in the lower screen'],
  ['240:damage', 'damage loop guard is `if (ss_y[i] >= 240) continue;` (builder-modules.js)'],
  ['400:damage', 'same guard, deep in the lower screen'],
]);

let failed = 0;
const fail = (msg) => { console.log('FAIL ' + msg); failed++; };
const ok   = (msg) => console.log('  ok ' + msg);

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

function mkState(y, which) {
  const cols = 32, rows = 60;                 // 1 screen wide, 2 screens tall
  const nt = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ tile: 1, palette: 0 })));
  const beh = Array.from({ length: rows }, () => Array(cols).fill(0));
  const s = {
    name: 'tall', version: 1, universal_bg: 0x0F,
    sprites: [
      { role: 'player', name: 'hero', width: 2, height: 2, cells: H.mkCells(2, 2) },
      { role: 'enemy',  name: 'dmg',  width: 1, height: 1, cells: [[cell(E_TILE)]] },
      { role: 'enemy',  name: 'ai',   width: 1, height: 1, cells: [[cell(E_TILE + 1)]] },
    ],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x21, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [{ name: 'bg', dimensions: { screens_x: 1, screens_y: 2 },
                    nametable: nt, behaviour: beh }],
    behaviour_types: [...H.BEHAVIOUR_TYPES],
    selectedBgIdx: 0, builder: win.BuilderDefaults(),
  };
  s.builder.modules.game.config = { type: 'topdown' };
  s.builder.modules.scene.enabled = true;
  s.builder.modules.damage.enabled = true;      // emits the `ss_y >= 240` loop
  const p1 = s.builder.modules.players.submodules.player1.config;
  p1.maxHp = MAX_HP;
  // PLAYER_X/PLAYER_Y come from THIS config, not from the buildRom payload —
  // setting only the payload leaves the player at the default x and the probes
  // never touch. Spawn y stays at 120 deliberately: it is clamped to 200 anyway
  // and the player is walked down instead.
  p1.startX = COL_X; p1.startY = 120; p1.walkSpeed = 2;
  // ONE probe per build, deliberately. The first version put both in the same
  // level and the damage result was contaminated: where the chaser's AI still
  // runs it reaches the player and hurts them itself, so `damage=yes` did not
  // mean the STATIC enemy had damaged anyone. The meta-test caught it — widening
  // the damage guard left y=238 still reporting damage, which was the chaser.
  s.builder.modules.scene.config.instances = which === 'damage'
    ? [{ id: 1, spriteIdx: 1, x: COL_X, y, ai: 'static', speed: 0, bg: 0 }]
    : [{ id: 2, spriteIdx: 2, x: AI_X,  y, ai: 'chaser', speed: 2, bg: 0 }];
  return s;
}

// Read hp, py and the AI enemy's ss_x straight out of engine RAM. Everything the
// verdict rests on is a number the engine wrote, not a pixel or an OAM slot.
const POKE =
  '(*(unsigned char*)0x0710)=(unsigned char)player_hp;'
  + '(*(unsigned char*)0x0714)=(unsigned char)((unsigned int)py&0xFF);'
  + '(*(unsigned char*)0x0715)=(unsigned char)((unsigned int)py>>8);'
  + '(*(unsigned char*)0x0716)=(unsigned char)((unsigned int)ss_x[0]&0xFF);'
  + '(*(unsigned char*)0x0717)=(unsigned char)((unsigned int)ss_x[0]>>8);'
  + '(*(unsigned char*)0x0711)=0x5A;'
  + 'while (oam_idx < 256) {';

async function probe(y, which) {
  const s = mkState(y, which);
  const main = win.BuilderAssembler.assemble(s, tpl)
    .replace('while (oam_idx < 256) {', POKE);
  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: COL_X, y: 120 },
    sceneSprites: s.builder.modules.scene.config.instances
      .map((i) => ({ spriteIdx: i.spriteIdx, x: i.x, y: i.y, bg: i.bg })),
    mode: 'browser', customMainC: main,
  });
  if (!r.ok) return { buildFailed: r.stage || 'unknown' };

  const h = H.openRom(r.romBytes);
  const m = h.nes.cpu.mem;
  const rd = (lo) => m[lo] + 256 * m[lo + 1];
  for (let f = 0; f < 30; f++) h.nes.frame();
  // The poke sentinel proves the instrumentation compiled in and ran. Without it
  // a ROM that never reached the draw loop reads as "hp never dropped".
  if (m[0x711] !== 0x5A) return { pokeNeverRan: true };

  const aiX0 = rd(0x716);
  let minHp = m[0x710], maxPy = rd(0x714), aiMoved = false;
  h.nes.buttonDown(1, H.BTN.DOWN);
  for (let f = 0; f < 600; f++) {
    h.nes.frame();
    if (rd(0x714) > maxPy) maxPy = rd(0x714);
    if (m[0x710] < minHp) minHp = m[0x710];
    if (rd(0x716) !== aiX0) aiMoved = true;
  }
  h.nes.buttonUp(1, H.BTN.DOWN);

  return {
    // Did the player's box actually reach the probe's row? If not, "no damage"
    // says nothing about the guard and the case must not be scored.
    reached: maxPy + 16 >= y,
    maxPy,
    works: which === 'damage' ? minHp < MAX_HP : aiMoved,
  };
}

const { srv } = await H.startServer(PORT);
try {
  const results = new Map();          // `${y}:${which}` -> result
  for (const y of PROBE_YS) {
    for (const which of ['damage', 'ai']) {
      const key = `${y}:${which}`;
      const r = await probe(y, which);
      if (r.buildFailed) { fail(`${key}: build failed at ${r.buildFailed}`); continue; }
      if (r.pokeNeverRan) { fail(`${key}: the RAM poke never ran — every verdict here would be meaningless`); continue; }
      if (which === 'damage' && !r.reached) {
        fail(`${key}: the player only reached py=${r.maxPy}, so it never touched the probe — a fixture problem, not an engine result`);
        continue;
      }
      results.set(key, r);
      console.log(`  y=${String(y).padStart(3)} ${which.padEnd(6)} ${r.works ? 'works' : 'BROKEN'}` +
        (which === 'damage' ? `   (player reached py=${r.maxPy})` : ''));
    }
  }

  // ---- the positive control, before anything else is believed --------------
  const cd = results.get(`${WORKING_CONTROL}:damage`);
  const ca = results.get(`${WORKING_CONTROL}:ai`);
  if (!cd || !ca) {
    fail(`the control at y=${WORKING_CONTROL} produced no result at all — nothing below can be trusted`);
  } else if (!cd.works || !ca.works) {
    fail(`the control at y=${WORKING_CONTROL} does not work (damage=${cd.works}, ai=${ca.works}) — ` +
         'the fixture cannot demonstrate the GOOD case, so it cannot be believed about the bad ones. ' +
         'Two earlier versions of this measurement failed exactly here: once the player and the probe ' +
         'were at different x, once the player spawn was clamped away from the probe.');
  } else {
    ok(`control y=${WORKING_CONTROL}: an enemy there both damages and chases`);
  }

  // ---- exact match against the known holes ---------------------------------
  const seen = new Set();
  for (const [key, r] of results) {
    const which = key.split(':')[1];
    const listed = KNOWN_HOLES.has(key);
    if (listed) seen.add(key);
    if (!r.works && !listed) {
      fail(`NEW HOLE ${key} — an entity there no longer ${which === 'ai' ? 'runs its AI' : 'damages the player'}, ` +
           'and that is not in KNOWN_HOLES. Either a regression, or a hole that was always there and is only now covered.');
    } else if (r.works && listed) {
      fail(`STALE ENTRY ${key} — this is listed as broken but WORKS now. If #14 Step 3 landed, ` +
           'delete the entry (and the others it fixed); the list must never outlive the bugs in it.');
    }
  }
  for (const key of KNOWN_HOLES.keys()) {
    if (!seen.has(key)) {
      fail(`KNOWN_HOLES names ${key}, which this run never scored — the entry is unreachable, ` +
           'so it is protecting nothing. Fix PROBE_YS or drop the entry.');
    }
  }
  if (!failed) {
    ok(`${KNOWN_HOLES.size} known holes, all still exactly as recorded — ` +
       'this suite goes RED when #14 Step 3 fixes them, which is how you will know it worked');
  }
} finally {
  await H.stopServer(srv);
}

console.log('');
if (failed) { console.error(`tall-level-entities: ${failed} failure(s).`); process.exit(1); }
console.log('tall-level-entities: complete.');
