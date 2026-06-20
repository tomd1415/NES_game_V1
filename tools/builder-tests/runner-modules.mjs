#!/usr/bin/env node
// Arc E §2 — the auto-runner must coexist with the other Builder modules.
//
// The runner shares the platformer vertical block and adds its own per-frame
// camera/respawn logic, all #if BW_GAME_STYLE == 2-gated.  This guards that a
// runner game with the common modules ON (HP + damage + HUD + pickups + win)
// still ASSEMBLES + COMPILES + RUNS — i.e. nothing a module emits clashes with
// the runner branch — and keeps auto-scrolling with them on.  (Dialogue is
// deliberately excluded: it's disabled in runner builds, covered by runner.mjs.)
import * as H from './lib/render-harness.mjs';

const PORT = 18838;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const win = H.loadBuilderModules();
const tpl = H.readTemplate();

function makeState() {
  const cols = 128, rows = 30;
  const nt = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ tile: 1, palette: 0 })));
  const beh = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, () => (r === 28 ? 1 : 0)));
  beh[27][90] = 7;     // spike (slot 7)
  beh[20][60] = 5;     // a trigger tile → satisfies a reach_tile win condition
  const s = {
    name: 'runner-modules', version: 1, universal_bg: 0x0F,
    sprites: [
      { role: 'player', name: 'hero',  width: 2, height: 2, cells: H.mkCells(2, 2) },
      { role: 'enemy',  name: 'bad',   width: 2, height: 2, cells: H.mkCells(2, 2) },
      { role: 'pickup', name: 'coin',  width: 1, height: 1, cells: H.mkCells(1, 1) },
      { role: 'hud',    name: 'heart', width: 1, height: 1, cells: H.mkCells(1, 1) },
    ],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x21, 0x10, 0x30] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [{ name: 'bg', dimensions: { screens_x: 4, screens_y: 1 }, nametable: nt, behaviour: beh }],
    behaviour_types: [...H.BEHAVIOUR_TYPES, { id: 7, name: 'spike' }], selectedBgIdx: 0,
    builder: win.BuilderDefaults(),
  };
  const m = s.builder.modules;
  m.game.config = { type: 'runner', autoscrollSpeed: 2 };
  m.players.submodules.player1.enabled = true;
  m.players.submodules.player1.config.maxHp = 3;
  m.damage.enabled = true;
  m.hud.enabled = true;
  m.pickups.enabled = true;
  m.win_condition.enabled = true;   // default reach_tile → needs the trigger tile above
  m.scene.config.instances = [
    { id: 'e', spriteIdx: 1, x: 200, y: 200, ai: 'walker' },
    { id: 'p', spriteIdx: 2, x: 260, y: 200, ai: 'static' },
  ];
  return s;
}

const s = makeState();

// 1. No validator *errors* (a broken fixture would be the wrong signal).
const errs = win.BuilderValidators.validate(s).filter(p => p.severity === 'error');
if (errs.length) bad('runner+modules fixture has validator errors: ' + errs.map(e => e.id).join(', '));
else ok('runner + HP/damage/HUD/pickups/win has no validator errors');

const { srv } = await H.startServer(PORT);
try {
  // Mirror cam_x to confirm it still auto-scrolls with modules on.
  let c = win.BuilderAssembler.assemble(s, tpl).replace('while (oam_idx < 256) {',
    '(*(unsigned char*)0x0700)=(unsigned char)(cam_x&0xFF);(*(unsigned char*)0x0701)=(unsigned char)(cam_x>>8);while (oam_idx < 256) {');
  const r = await H.buildRom(PORT, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 64, y: 120 },
    sceneSprites: [{ spriteIdx: 1, x: 200, y: 200 }, { spriteIdx: 2, x: 260, y: 200 }],
    mode: 'browser', customMainC: c });
  if (!r.ok) {
    bad('runner + modules did not compile at stage ' + r.stage + ':\n' + String(r.log || '').slice(-1800));
  } else if (r.romBytes.subarray(0, 4).toString('latin1') !== 'NES\x1a') {
    bad('runner + modules did not return a valid iNES ROM');
  } else {
    ok('runner + HP/damage/HUD/pickups/win compiles to a real ROM (' + r.size + ' bytes)');
    const h = H.openRom(r.romBytes);
    const camX = () => h.nes.cpu.mem[0x700] + 256 * h.nes.cpu.mem[0x701];
    let guard = 0; while (camX() > 5000 && guard < 240) { h.frames(1); guard++; }
    const a = camX(); h.frames(40); const b = camX();
    if (b > a) ok('runner still auto-scrolls with all modules on (cam_x ' + a + ' → ' + b + ')');
    else bad('runner stopped auto-scrolling with modules on (cam_x ' + a + ' → ' + b + ')');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
console.log('\nRunner + modules compatibility test complete.');
