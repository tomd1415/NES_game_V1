// Every game-style starter (StudioStarter) must be a complete, VALID, and
// COMPILABLE game — so "all styles can be selected and fully work". Builds each
// plain starter via /play and asserts it validates with no errors + compiles.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = new URL('../..', import.meta.url).pathname;
const WEB = path.join(ROOT, 'tools', 'tile_editor_web');
const PORT = 18871;
let failed = false;
const ok = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

globalThis.window = globalThis;
globalThis.NES_TARGET_ENGINE = 9;
globalThis.NES_ENGINE_VERSION = 9;
for (const f of ['sprite-render.js', 'builder-assembler.js', 'builder-modules.js',
    'builder-validators.js', 'default-state.js', 'studio-starter.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
const tpl = fs.readFileSync(path.join(WEB, 'builder-templates/platformer.c'), 'utf8');

// The registry offers all five styles.
const listIds = window.StudioStarter.list().map(s => s.id);
for (const id of ['basics', 'smb', 'topdown', 'runner', 'racer']) {
  if (listIds.includes(id)) ok('picker offers "' + id + '"'); else bad('picker missing "' + id + '" (' + listIds.join(',') + ')');
}

const STYLES = [
  { id: 'basics',  make: () => window.StudioStarter.create(),        type: undefined },
  { id: 'smb',     make: () => window.StudioStarter.createSmb(),     type: 'smb' },
  { id: 'topdown', make: () => window.StudioStarter.createTopdown(), type: 'topdown' },
  { id: 'runner',  make: () => window.StudioStarter.createRunner(),  type: 'runner' },
  { id: 'racer',   make: () => window.StudioStarter.createRacer(),   type: 'racer' },
];

function playerStart(s) {
  try { var c = s.builder.modules.players.submodules.player1.config; return { x: c.startX | 0, y: c.startY | 0 }; }
  catch (e) { return { x: 24, y: 176 }; }
}

const srv = spawn('python3', [path.join(ROOT, 'tools', 'playground_server.py')],
  { env: { ...process.env, PLAYGROUND_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
await sleep(1600);
try {
  for (const style of STYLES) {
    const s = style.make();
    if (style.type && (!s.builder.modules.game.config || s.builder.modules.game.config.type !== style.type)) {
      bad(style.id + ': game type is not ' + style.type); continue;
    }
    // No error-severity validator problems (warnings are fine).
    const errs = (window.BuilderValidators.validate(s) || []).filter(p => p.severity === 'error');
    if (errs.length) { bad(style.id + ': validation errors → ' + errs.map(p => p.id).join(', ')); continue; }

    const out = window.BuilderAssembler.assemble(s, tpl);
    const r = await (await fetch(`http://127.0.0.1:${PORT}/play`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: s, playerSpriteIdx: 0, playerStart: playerStart(s), sceneSprites: [], mode: 'browser', customMainC: out, targetEngine: 9 }),
    })).json();
    if (!r.ok) { bad(style.id + ': did not compile (stage ' + r.stage + ') ' + ((r.log || '').slice(-300))); continue; }
    ok(style.id + ' starter: no validator errors, compiles via cc65 (' + r.size + ' bytes)');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
}

if (failed) process.exit(1);
console.log('\nStyle-starters smoke-test complete.');
