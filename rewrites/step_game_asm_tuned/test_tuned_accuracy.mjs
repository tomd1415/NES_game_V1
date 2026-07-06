import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot } from '../../asm-lab/harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');

const tunedSteps = [
  'Step_1_Player_Movement',
  'Step_2_Background_Level',
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

  // Same BSS layout as the modular/generated baseline: x,y,pad,jump/jmp_time,
  // facing, walk frame, walk tick start at $6000 for these small steps.
  compareRange(`${step} WRAM player state`, generated, tuned, cpuRead, 0x6000, 8);

  // Palette writes are PPU-visible setup behavior.
  compareRange(`${step} palette`, generated, tuned, ppuRead, 0x3F00, 0x20);

  // Player is eight sprites = 32 OAM bytes. This catches draw path drift.
  compareRange(`${step} player OAM`, generated, tuned, oamRead, 0, 32);

  // Step 2 also loads a background; compare first screen tiles.
  if (step.includes('Step_2')) {
    for (let i = 0; i < 960; i++) {
      assertEq(`${step} nametable tile ${i}`, tuned.ntTile(0, i), generated.ntTile(0, i));
    }
  }

  console.log(`OK: ${step} tuned ASM matches generated behavior smoke test`);
}

console.log('All tuned ASM smoke tests passed.');
