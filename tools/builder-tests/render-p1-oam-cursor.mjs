#!/usr/bin/env node
// Item #37 — Player 1's OAM write cursor must never wrap or overrun.
//
// Two distinct defects, both silent (no crash, just corruption) and both in the
// "random mess on screen / froze for no reason" class pupils reported:
//
//  A. ASM path (NES_ASM_PDRAW, the DEFAULT for scroll builds). draw_player
//     tracks the cursor in Y — 8-bit. A 64-cell (8x8) player spans exactly 256
//     bytes, so the closing `sty _oam_idx` stored 256 mod 256 = 0. The player's
//     pixels were written correctly, but oam_idx came back 0, so P2 / scene /
//     spawn / HUD all thought the buffer was empty and drew over the player —
//     and their `oam_idx > 252` guards never tripped. With the background
//     status bar on (BW_SMB_HUD_BG starts the player at byte 4) the player's
//     own last cells also wrapped onto oam_buf[0..3], wiping the sprite-0
//     split marker that holds the status bar over the scrolling playfield.
//
//  B. C path (bob enabled, or PLAYGROUND_NO_PDRAW). oam_idx is a real
//     `unsigned int` there, and the P1 loop had NO bound — so 8x8 + the
//     background status bar drove it to 260 and wrote 4 bytes past
//     oam_buf[255] into $0300. A genuine out-of-bounds RAM write.
//
// Fixes: the template gained a compile-time-gated bound (BW_P1_OAM_FITS — it
// compiles out, byte-identical, whenever the player provably fits), and the
// build no longer selects the ASM draw unless the span ends strictly inside
// the page (`< 256`, not `<= 256`). On this branch that decision lives in
// tools/nes_studio_core/preparation.py's select_asm_features, not in
// playground_server.py as `main`'s copy of this comment says — the codegen was
// extracted out of the server here. The boundary note travelled with it.
//
// Probe: capture oam_idx immediately after P1's draw, plus the compile-time
// PLAYER_W/PLAYER_H. jsnes fills RAM with 0xFF on reset, so a 0x5A marker byte
// proves the probe actually executed rather than reading uninitialised memory.

import fs from 'node:fs';
import path from 'node:path';
import * as H from './lib/render-harness.mjs';
import { testPort } from './lib/test-port.mjs';

let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

const win = H.loadBuilderModules();
// The background status bar is an engine-v58+ feature; assemble at the repo's
// current engine so the module actually emits BW_SMB_HUD_BG.
globalThis.NES_TARGET_ENGINE = Number(
  fs.readFileSync(path.join(H.ROOT, 'tools', 'engines', 'ENGINE_VERSION'), 'utf8').trim());
const tpl = H.readTemplate();

// Unique anchor: the first line of the Player 2 block, i.e. immediately after
// P1's draw loop. (The bare `#if PLAYER2_ENABLED...` line appears twice.)
const ANCHOR = '#if PLAYER2_ENABLED && BW_GAME_STYLE != 3\n        /* --- Player 2 ---';
const PROBE =
  '(*(unsigned char*)0x0710) = 0x5A;' +
  '(*(unsigned char*)0x0711) = (unsigned char)(oam_idx & 0xFF);' +
  '(*(unsigned char*)0x0712) = (unsigned char)(oam_idx >> 8);' +
  '(*(unsigned char*)0x0713) = (unsigned char)PLAYER_W;' +
  '(*(unsigned char*)0x0714) = (unsigned char)PLAYER_H;\n';

function makeState(w, h, hudBg) {
  const s = {
    name: 'p1-oam-cursor', version: 1, universal_bg: 0x0F,
    sprites: [{ role: 'player', name: 'hero', width: w, height: h, cells: H.mkCells(w, h) }],
    sprite_tiles: H.blankPool(), bg_tiles: H.blankPool(),
    sprite_palettes: Array.from({ length: 4 }, () => ({ slots: [0x16, 0x27, 0x30] })),
    bg_palettes: Array.from({ length: 4 }, () => ({ slots: [0x30, 0x10, 0x20] })),
    animations: [], animation_assignments: { walk: null, jump: null }, nextAnimationId: 1,
    backgrounds: [H.flatBackground(2, 1, 28)],   // 2 screens => SCROLL_BUILD => ASM draw eligible
    behaviour_types: H.BEHAVIOUR_TYPES, selectedBgIdx: 0,
    builder: win.BuilderDefaults(),
  };
  const m = s.builder.modules;
  m.game.config.type = 'smb';                 // BW_SMB_HUD_BG needs the SMB game type
  m.smbhud.enabled = true;
  m.smbhud.config.background = hudBg;
  m.players.submodules.player1.config.maxHp = 3;
  m.damage.enabled = true;
  return s;
}

async function measure(port, w, h, hudBg) {
  const s = makeState(w, h, hudBg);
  let c = win.BuilderAssembler.assemble(s, tpl);
  const hudBgOn = /#define BW_SMB_HUD_BG 1/.test(c);
  if (hudBg && !hudBgOn) return { err: 'BW_SMB_HUD_BG was requested but not emitted' };
  if ((c.split(ANCHOR).length - 1) !== 1) return { err: 'probe anchor is no longer unique' };
  c = c.replace(ANCHOR, PROBE + ANCHOR);

  const r = await H.buildRom(port, {
    state: s, playerSpriteIdx: 0, playerStart: { x: 40, y: 120 },
    mode: 'browser', customMainC: c,
  });
  if (!r.ok) return { err: 'build failed at ' + r.stage + ':\n' + String(r.log || '').slice(-1200) };

  const em = H.openRom(r.romBytes);
  em.frames(60);
  if (em.nes.cpu.mem[0x710] !== 0x5A) return { err: 'probe never executed (player draw not reached)' };
  return {
    oamIdx: em.nes.cpu.mem[0x711] + 256 * em.nes.cpu.mem[0x712],
    pw: em.nes.cpu.mem[0x713], ph: em.nes.cpu.mem[0x714],
    base: hudBgOn ? 4 : 0,
  };
}

// A correct cursor: every cell written that fits, nothing past the buffer, and
// the cursor left where the next writer should continue from.
function check(label, res, w, h) {
  if (res.err) { bad(label + ': ' + res.err); return; }
  if (res.pw !== w || res.ph !== h) {
    bad(`${label}: expected a ${w}x${h} player, engine compiled ${res.pw}x${res.ph}`);
    return;
  }
  const want = Math.min(res.base + w * h * 4, 256);
  if (res.oamIdx > 256) bad(`${label}: oam_idx=${res.oamIdx} — wrote PAST oam_buf[255]`);
  else if (res.oamIdx !== want) {
    bad(`${label}: oam_idx=${res.oamIdx}, expected ${want} ` +
        `(base ${res.base} + ${w * h} cells x4, capped at 256). ` +
        (res.oamIdx < res.base + 4 ? 'Looks like the 8-bit Y cursor wrapped.' : ''));
  } else ok(`${label}: oam_idx=${res.oamIdx} (base ${res.base}, ${w}x${h} player)`);
}

// --- Path 1: the DEFAULT server config (ASM draw eligible) -----------------
{
  const PORT = testPort(18871);
  const { srv } = await H.startServer(PORT);
  try {
    // Small player: comfortably inside the page, keeps the ASM draw. Control —
    // proves the probe and the ASM path still work normally.
    check('ASM-eligible, 2x2 + background HUD', await measure(PORT, 2, 2, true), 2, 2);
    // 64 cells, no status bar: span is exactly 256, so `sty` used to wrap the
    // cursor to 0 and everything after drew over the player.
    check('ASM-eligible, 8x8 no background HUD', await measure(PORT, 8, 8, false), 8, 8);
    // 64 cells + the split marker: 260. Used to wrap to 4 AND wipe the marker.
    check('ASM-eligible, 8x8 + background HUD', await measure(PORT, 8, 8, true), 8, 8);
  } catch (e) {
    bad('default-path threw: ' + (e && e.stack || e));
  } finally { await H.stopServer(srv); }
}

// --- Path 2: the pure-C draw (PLAYGROUND_NO_PDRAW=1) -----------------------
// Also the path any build with the character bob takes.
{
  const PORT = testPort(18872, 1);
  const { srv } = await H.startServer(PORT, { PLAYGROUND_NO_PDRAW: '1' });
  try {
    check('C draw, 8x8 + background HUD', await measure(PORT, 8, 8, true), 8, 8);
  } catch (e) {
    bad('C-path threw: ' + (e && e.stack || e));
  } finally { await H.stopServer(srv); }
}

// --- The validator should stop this reaching the engine in the first place --
{
  const V = win.BuilderValidators;
  const has = (s, id) => (V.validate(s) || []).some((f) => f && f.id === id);

  const s64 = makeState(8, 8, true);          // 64 cells + split marker = 65
  if (has(s64, 'player-oam-overflow')) {
    ok('validator blocks an 8x8 player when the background status bar takes slot 0');
  } else {
    bad('validator allows 8x8 + background status bar (65 hardware sprites)');
  }

  const s64plain = makeState(8, 8, false);    // 64 cells, no marker = exactly 64
  if (has(s64plain, 'player-oam-overflow')) {
    bad('validator wrongly blocks a plain 8x8 player (exactly 64 is allowed)');
  } else {
    ok('validator still allows a plain 8x8 player (exactly 64 hardware sprites)');
  }

  const s63 = makeState(7, 9, true);          // 63 cells + marker = 64, fits
  if (has(s63, 'player-oam-overflow')) {
    bad('validator wrongly blocks 7x9 + background status bar (63 + 1 = 64, fits)');
  } else {
    ok('validator allows 7x9 + background status bar (63 + marker = 64)');
  }
}

if (failed) process.exit(1);
console.log('\nitem-37 P1 OAM cursor test complete.');
