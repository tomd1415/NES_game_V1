// Engine v70 — SMB background status bar NMI-driven push (the "header flickers
// after the first screen" fix).  Guards the three ways this hard-won feature has
// broken before, all invisible to a compile-only smoke test:
//
//   1. link:   HUD_NMI links src/hud_crt0.o, which .imports _hud_present /
//              _hud_ready — a compile/link regression here fails the build.
//   2. freeze: the reverted cut never enabled the NMI (PPU_CTRL bit 7) and later
//              paced the main loop on waitvsync/$2002 which raced the NMI's own
//              sprite-0 $2002 poll — either hangs the game (screen frozen on the
//              boot image, "no sprites").  Caught by requiring the framebuffer to
//              actually ADVANCE while holding right.
//   3. garbage: an unguarded NMI OAM DMA copied a half-built oam_buf on a lag
//              frame -> jsnes rendered all 64 OAM slots as garbage.  Caught by
//              requiring a sane on-screen sprite count.
//
// Gated on the SMB bg-HUD scroll build, so it exercises exactly the HUD_NMI path
// the server links for a real showcase level.  jsnes only (always available); the
// FCEUX sky-backdrop count lives in the manual repro notes.
import fs from 'node:fs';
import path from 'node:path';
import * as H from './lib/render-harness.mjs';

const WEB = H.WEB;
const PORT = 18796;

globalThis.window = globalThis;
globalThis.global = globalThis;
for (const f of ['engine-version.js', 'sprite-render.js', 'builder-assembler.js',
                 'builder-modules.js', 'builder-validators.js', 'default-state.js',
                 'studio-starter.js', 'play-pipeline.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}

function fail(msg) { console.error('FAIL: ' + msg); process.exit(1); }

// --- The stock SMB showcase starter (2 screens, bg HUD, enemies) -----------
const state = window.StudioStarter.createSmb({ name: 'hud-nmi-flicker' });
const bg = state.backgrounds[0];
const cols = bg.nametable[0].length;
// Fill the ground pits + make the player invincible so a plain hold-right walks
// the whole level (the point is to keep the camera scrolling with enemies on
// screen — the exact condition that used to flicker/freeze).
for (let x = 0; x < cols; x++) { bg.behaviour[28][x] = 1; bg.behaviour[29][x] = 1; }
const m = state.builder.modules;
if (m.players?.submodules?.player1) m.players.submodules.player1.config.maxHp = 99;
if (m.damage) m.damage.enabled = false;
if (m.dialogue) m.dialogue.enabled = false;
if (m.smbhud) { m.smbhud.enabled = true; (m.smbhud.config ||= {}).background = true; }

const tpl = fs.readFileSync(path.join(WEB, 'builder-templates/platformer.c'), 'utf8');
const customMainC = window.BuilderAssembler.assemble(state, tpl);

// Precondition: we must actually be exercising the bg-HUD split path (else the
// test would silently pass on a non-HUD build and guard nothing).
if (!/#define BW_SMB_HUD_BG 1/.test(customMainC)) {
  fail('assembled C has no BW_SMB_HUD_BG — test is not exercising the HUD split path');
}

const payload = window.PlayPipeline.buildPlayRequest(state, tpl, { customMainC });
const sceneCount = (payload.sceneSprites || []).length;
if (sceneCount < 1) fail('no sceneSprites derived — need on-screen enemies to load the scroll frame');

// --- Build (links hud_crt0.o for this scrolling bg-HUD project) -------------
const { srv } = await H.startServer(PORT);
let rom;
try {
  const r = await H.buildRom(PORT, payload);
  if (!r.ok) fail('build failed at stage ' + r.stage + '\n' + String(r.log || '').slice(-1500));
  rom = r.romBytes;
} finally {
  await H.stopServer(srv);
}

// --- jsnes behavioural checks ----------------------------------------------
function topBlips(hashes) {           // transient 1-frame changes = flicker
  let b = 0;
  for (let n = 1; n < hashes.length - 1; n++) {
    if (hashes[n] !== hashes[n - 1] && hashes[n] !== hashes[n + 1] && hashes[n - 1] === hashes[n + 1]) b++;
  }
  return b;
}
function topHash(fb) { let h = 0; for (let y = 0; y < 32; y++) for (let x = 0; x < 256; x++) h = (h * 131 + (fb[y * 256 + x] & 0xFFFFFF)) % 2147483647; return h; }
function fullHash(fb) { let h = 0; for (let k = 0; k < fb.length; k += 97) h = (h * 131 + (fb[k] & 0xFFFFFF)) % 2147483647; return h; }
function bootSprites(nes) { let n = 0; const mem = nes.ppu.spriteMem; for (let s = 0; s < 64; s++) if (mem[s * 4] < 239) n++; return n; }

const g = H.openRom(rom);
g.frames(80);
const boot = bootSprites(g.nes);
g.hold(H.BTN.RIGHT);
const full = new Set(), top = [];
for (let i = 0; i < 200; i++) { const fb = g.frame(); full.add(fullHash(fb)); top.push(topHash(fb)); }
const distinct = full.size;
const blips = topBlips(top);

// 2. garbage OAM DMA -> all 64 slots on screen.  Normal is ~32.
if (boot > 44) fail(`boot on-screen sprite count ${boot} (>44) — looks like a half-built OAM DMA (garbage)`);
// 3. freeze -> the framebuffer never changes while holding right.
if (distinct < 20) fail(`only ${distinct} distinct frames over 200 while holding right — game is frozen (NMI not firing / main loop hung)`);
// 4. broken split -> the fixed bar tears every frame.
if (blips > 20) fail(`HUD-region transient blips ${blips} (>20) — the sprite-0 split is not holding the bar steady`);

console.log(`hud-nmi-flicker: OK — bg-HUD scroll build links + runs; ${sceneCount} scene sprites, boot sprites ${boot}, ${distinct} distinct frames, ${blips} HUD blips (not frozen, not garbage, bar steady).`);
