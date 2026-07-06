import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot } from '../../asm-lab/harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');

const tunedSteps = [
  'Step_1_Player_Movement',
  'Step_2_Background_Level',
  'Step_3_Enemies_And_Items',
  'Step_4_Dialogue',
  'Step_5_Multi_NPC_Dialogue',
];

function runMake(dir) {
  execFileSync('make', ['-B'], { cwd: dir, stdio: 'ignore' });
}

function assertEq(label, got, want) {
  if (got !== want) {
    throw new Error(`${label}: want 0x${want.toString(16)}, got 0x${got.toString(16)}`);
  }
}

function compareRange(label, a, b, read, start, count) {
  for (let i = 0; i < count; i++) {
    assertEq(`${label} +${i}`, read(a, start + i), read(b, start + i));
  }
}

function cpuRead(h, addr) {
  return h.rd(addr);
}

function ppuRead(h, addr) {
  return h.rdPPU(addr);
}

function oamRead(h, index) {
  return h.rdOAM(index);
}

for (const step of tunedSteps) {
  const generatedDir = path.join(root, 'rewrites/step_game_asm_generated', step);
  const tunedDir = path.join(root, 'rewrites/step_game_asm_tuned', step);

  runMake(generatedDir);
  runMake(tunedDir);

  const generated = boot(path.join(generatedDir, 'game.nes'));
  const tuned = boot(path.join(tunedDir, 'game.nes'));

  generated.frames(20);
  tuned.frames(20);

  // Step 1/2 have 8 bytes of player state in WRAM. Step 3 has 28 bytes of
  // enemy/item DATA followed by 8 bytes of player state. Step 4 adds dialogue
  // state/NPC/prev_pad. Step 5 adds active_npc and a second NPC.
  const wramBytes = step.includes('Step_5')
    ? 43
    : (step.includes('Step_4') ? 40 : (step.includes('Step_3') ? 36 : 8));
  compareRange(
    `${step} WRAM game state`,
    generated,
    tuned,
    cpuRead,
    0x6000,
    wramBytes
  );

  // Palette writes are PPU-visible setup behavior.
  compareRange(`${step} palette`, generated, tuned, ppuRead, 0x3F00, 0x20);

  // Step 1/2 draw the player only: 8 sprites = 32 OAM bytes.
  // Step 3 draws player + 2 enemies + 4 gems + heart: 21 sprites = 84 bytes.
  // Step 4 adds one 2x2 NPC: 25 sprites = 100 bytes.
  // Step 5 has two 2x2 NPCs: 29 sprites = 116 bytes.
  const oamBytes = step.includes('Step_5')
    ? 116
    : (step.includes('Step_4') ? 100 : (step.includes('Step_3') ? 84 : 32));
  compareRange(
    `${step} visible OAM`,
    generated,
    tuned,
    oamRead,
    0,
    oamBytes
  );

  // Steps 2+ load a background; compare first screen tiles.
  if (!step.includes('Step_1')) {
    for (let i = 0; i < 960; i++) {
      assertEq(`${step} nametable tile ${i}`, tuned.ntTile(0, i), generated.ntTile(0, i));
    }
  }

  console.log(`OK: ${step} tuned ASM matches generated behavior smoke test`);
}

console.log('All tuned ASM smoke tests passed.');
