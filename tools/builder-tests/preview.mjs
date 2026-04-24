// Quick smoke — Builder default state still compiles via cc65, and
// NesRender loads without DOM (so tests that exercise the preview
// canvas later can bootstrap it in a headless context).
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');
const STEP = path.join(ROOT, 'steps', 'Step_Playground');

globalThis.window = globalThis;
for (const f of ['sprite-render.js', 'builder-assembler.js',
    'builder-modules.js', 'builder-validators.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
if (!window.NesRender || !window.NesRender.drawSpriteIntoCtx) {
  console.error('FAIL: NesRender missing'); process.exit(1);
}
console.log('✓ NesRender loads headless');

const tpl = fs.readFileSync(path.join(WEB, 'builder-templates/platformer.c'), 'utf8');
const s = {
  name: 'smoke', sprites: [
    { role: 'player', name: 'hero',  width: 2, height: 2 },
    { role: 'enemy',  name: 'goomba', width: 2, height: 2 },
  ],
  animations: [],
  animation_assignments: { walk: null, jump: null },
  backgrounds: [{
    name: 'bg',
    dimensions: { screens_x: 1, screens_y: 1 },
    nametable: [],
    behaviour: (() => {
      const m = Array.from({ length: 30 }, () => Array(32).fill(0));
      for (let c = 0; c < 32; c++) m[28][c] = 1;
      m[20][20] = 5;
      return m;
    })(),
  }],
  behaviour_types: [
    { id: 0, name: 'none' }, { id: 1, name: 'solid_ground' },
    { id: 2, name: 'wall' }, { id: 3, name: 'platform' },
    { id: 4, name: 'door' }, { id: 5, name: 'trigger' },
    { id: 6, name: 'ladder' },
  ],
  selectedBgIdx: 0,
  builder: window.BuilderDefaults(),
};

const problems = window.BuilderValidators.validate(s);
if (window.BuilderValidators.hasErrors(problems)) {
  console.error('FAIL: default-state errors:', problems.map(p => p.id));
  process.exit(1);
}
const out = window.BuilderAssembler.assemble(s, tpl);
const stock = path.join(STEP, 'src', 'main.c');
const backup = fs.readFileSync(stock);
try {
  fs.writeFileSync(stock, out);
  const t0 = Date.now();
  execSync('make -s', { cwd: STEP, stdio: ['ignore', 'pipe', 'pipe'] });
  console.log('✓ Builder default output compiles in ' + (Date.now() - t0) + ' ms');
} catch (e) {
  console.error('FAIL: cc65 rejected default output');
  if (e.stderr) console.error(String(e.stderr).slice(-1500));
  process.exit(2);
} finally {
  fs.writeFileSync(stock, backup);
}

// Also confirm placing a scene instance works end-to-end.
s.builder.modules.scene.config.instances = [
  { id: 'a', spriteIdx: 1, x: 100, y: 120, ai: 'walker' },
  { id: 'b', spriteIdx: 1, x: 180, y: 120, ai: 'static' },
];
const out2 = window.BuilderAssembler.assemble(s, tpl);
try {
  fs.writeFileSync(stock, out2);
  execSync('make -s', { cwd: STEP, stdio: ['ignore', 'pipe', 'pipe'] });
  console.log('✓ scene with 2 instances (same sprite) compiles');
} catch (e) {
  console.error('FAIL: cc65 rejected scene output');
  if (e.stderr) console.error(String(e.stderr).slice(-1500));
  process.exit(2);
} finally {
  fs.writeFileSync(stock, backup);
}
console.log('\npreview smoke complete.');
