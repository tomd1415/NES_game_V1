// The shipped "SMB showcase" starter (StudioStarter.createSmb) must be a
// valid, compilable game: smb game style (engine v3 physics), Goomba + Koopa
// actor AIs (v4), HP/damage, dialogue, a ladder, a warp door and a winnable
// goal trigger.  Guards the sample game a pupil loads from the picker.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = new URL('../..', import.meta.url).pathname;
const WEB = path.join(ROOT, 'tools', 'tile_editor_web');
const PORT = 18785;

globalThis.window = globalThis;
globalThis.NES_TARGET_ENGINE = 4;
globalThis.NES_ENGINE_VERSION = 4;
for (const f of ['sprite-render.js', 'builder-assembler.js', 'builder-modules.js',
    'builder-validators.js', 'default-state.js', 'studio-starter.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
const tpl = fs.readFileSync(path.join(WEB, 'builder-templates/platformer.c'), 'utf8');

// The registry offers both starters, and the SMB one is v4.
{
  const list = window.StudioStarter.list();
  if (!list.some(s => s.id === 'basics') || !list.some(s => s.id === 'smb')) {
    console.error('FAIL: StudioStarter.list() missing basics/smb', list.map(s => s.id));
    process.exit(1);
  }
  console.log('✓ StudioStarter.list() offers both starters (basics + smb)');
}

const s = window.StudioStarter.createSmb({ name: 'SMB Showcase' });

// It targets the smb game style, stamps the engine, and wires the v4 enemies.
{
  if (s.builder.modules.game.config.type !== 'smb') { console.error('FAIL: not smb game type'); process.exit(1); }
  const ais = s.builder.modules.scene.config.instances.map(i => i.ai);
  if (!ais.includes('goomba') || !ais.includes('koopa')) { console.error('FAIL: missing goomba/koopa', ais); process.exit(1); }
  if (s.engineVersion !== 4) { console.error('FAIL: engineVersion not stamped 4:', s.engineVersion); process.exit(1); }
  console.log('✓ SMB showcase: smb style + Goomba + Koopa, engineVersion 4');
}

// It validates cleanly (no error-severity problems) — a winnable sample.
{
  const probs = window.BuilderValidators.validate(s);
  const errs = probs.filter(p => p.severity === 'error');
  if (errs.length) { console.error('FAIL: SMB showcase has validation errors:', errs.map(p => p.id)); process.exit(1); }
  console.log('✓ SMB showcase validates with no errors');
}

// And it compiles via cc65 with the v3+v4 features active.
const out = window.BuilderAssembler.assemble(s, tpl);
for (const re of [/#define BW_SMB_JUMP 1/, /#define BW_SMB_TOUCH/]) {
  if (!re.test(out)) { console.error('FAIL: assembled starter missing', re); process.exit(1); }
}
const srv = spawn('python3', [path.join(ROOT, 'tools', 'playground_server.py')],
  { env: { ...process.env, PLAYGROUND_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
await sleep(1500);
try {
  const r = await (await fetch(`http://127.0.0.1:${PORT}/play`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: s, playerSpriteIdx: 0, playerStart: { x: 16, y: 200 },
      sceneSprites: [], mode: 'browser', customMainC: out, targetEngine: 4 }),
  })).json();
  if (!r.ok) { console.error('FAIL compile: SMB showcase rejected:', r.stage); console.error((r.log || '').slice(-2500)); process.exit(2); }
  console.log('✓ SMB showcase starter compiles via cc65 (' + r.size + ' bytes, engine v' + r.engineVersion + ')');
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}
console.log('\nSMB showcase starter smoke-test complete.');
