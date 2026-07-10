// A wide level too varied to compress must FAIL GRACEFULLY, not crash (feedback:
// a >4-screen level returned HTTP 500 with a Python traceback). The column-dedup
// index is 1 byte, so a >8-screen world with >=256 distinct columns can neither
// compress nor fit NROM raw. That case used to raise ValueError deep in codegen
// ("byte must be in range(0, 256)") -> a 500 the pupil couldn't act on. Now the
// server rejects it up front with a clear, kid-readable message.
//
// This builds a 12-screen level whose every column is unique and asserts:
//   1. the build returns ok:false (a handled failure, NOT a crash);
//   2. the message explains it's too big / too many columns (actionable);
//   3. it is NOT a Python traceback / ValueError (the old crash signature).
import fs from 'node:fs';
import path from 'node:path';
import * as H from './lib/render-harness.mjs';

const WEB = H.WEB;
function fail(m) { console.error('FAIL:', m); process.exit(1); }
function assert(c, m) { if (!c) fail(m); }

globalThis.window = globalThis;
new Function(fs.readFileSync(path.join(WEB, 'engine-version.js'), 'utf8'))();
globalThis.NES_TARGET_ENGINE = globalThis.NES_ENGINE_VERSION;
for (const f of ['sprite-render.js', 'builder-assembler.js', 'builder-modules.js',
    'builder-validators.js', 'default-state.js', 'studio-starter.js']) {
  new Function(fs.readFileSync(path.join(WEB, f), 'utf8'))();
}
const tpl = fs.readFileSync(path.join(WEB, 'builder-templates', 'platformer.c'), 'utf8');

const SX = 12, WCOLS = 32 * SX;                 // 12 screens wide, 1 tall
function makeState() {
  const s = window.StudioStarter.createRunner();
  const bg = s.backgrounds[0];
  bg.dimensions = { screens_x: SX, screens_y: 1 };
  bg.nametable = []; bg.behaviour = [];
  for (let r = 0; r < 30; r++) {
    const nt = [], bh = [];
    for (let c = 0; c < WCOLS; c++) {
      // Encode the column index into the top two rows so EVERY column differs
      // -> WCOLS (384) unique columns, well over the 255 one-byte-index limit.
      let t = 0;
      if (r === 0) t = c & 0xFF;
      else if (r === 1) t = (c >> 8) & 0xFF;
      else if (r >= 28) t = 1;                   // floor
      nt.push({ tile: t, palette: 0 }); bh.push(r >= 28 ? 1 : 0);
    }
    bg.nametable.push(nt); bg.behaviour.push(bh);
  }
  return s;
}

const port = 18869;
const srv = await H.startServer(port, {});
let r;
try {
  r = await H.buildRom(port, {
    state: makeState(), playerSpriteIdx: 0, playerStart: { x: 24, y: 200 },
    sceneSprites: [], mode: 'browser',
    customMainC: window.BuilderAssembler.assemble(makeState(), tpl),
    targetEngine: globalThis.NES_TARGET_ENGINE,
  });
} finally { await H.stopServer(srv.srv); }

const log = String(r.log || '');
assert(r.ok === false, 'a too-varied wide level should fail, not build (ok=' + r.ok + ')');
console.log('✓ wide too-varied level returns a handled failure (ok:false), not a crash');

assert(!/Traceback|ValueError|byte must be in range/i.test(log),
  'failure is a raw Python traceback / ValueError — the old crash, not a friendly message:\n' + log.slice(0, 400));
console.log('✓ the failure is not a Python traceback / ValueError');

assert(/too big|too many|columns|screens wide/i.test(log),
  'failure message is not the friendly "too big / too many columns" guidance:\n' + log.slice(0, 400));
console.log('✓ the failure explains the level is too big + how to fix it');

console.log('\nWide-too-varied graceful-rejection regression complete.');
