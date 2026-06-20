// BR-06 — every page's in-browser emulator must map the Player 2 keys to
// controller 2.  The Sprites page shipped a private emulator whose key map
// only had Player 1 entries and hard-coded controller 1, so a co-op ROM was
// uncontrollable when launched from Sprites.  This guards that all three
// emulator implementations (the shared emulator.js used by Builder /
// Backgrounds / Behaviour, plus the private maps in code.html and sprites.html)
// expose the same two-controller mapping.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const WEB  = path.join(ROOT, 'tools', 'tile_editor_web');

function fail(msg) { console.error('FAIL:', msg); process.exit(1); }

// The canonical Player 2 keys (shared emulator.js + Code page).
const P2_KEYS = ['KeyI', 'KeyJ', 'KeyK', 'KeyL', 'KeyO', 'KeyU', 'Digit1', 'Digit2'];

// In a `{ pad, button }` key-map (code.html / sprites.html) each P2 key must
// have an entry binding it to pad 2.  In emulator.js's switch each P2 key's
// `case` must `return { pad: 2, ... }`.  Both reduce to: the key appears near a
// `pad: 2`.  We check the key token is followed (within a short window) by
// `pad: 2`.
function assertP2(src, label, keyToken) {
  // Match  'KeyI': { pad: 2   OR   case 'KeyI': return { pad: 2
  const re = new RegExp("'" + keyToken + "'[^\\n]*pad:\\s*2");
  if (!re.test(src)) fail(`${label}: ${keyToken} is not bound to Player 2 (pad 2)`);
}

const targets = [
  { file: 'emulator.js',   label: 'shared emulator.js' },
  { file: 'code.html',     label: 'code.html private emulator' },
  { file: 'sprites.html',  label: 'sprites.html private emulator' },
];

for (const t of targets) {
  const src = fs.readFileSync(path.join(WEB, t.file), 'utf8');
  for (const k of P2_KEYS) assertP2(src, t.label, k);
  console.log(`✓ ${t.label} maps all ${P2_KEYS.length} Player 2 keys to controller 2`);
}

// The two private emulators must dispatch via the entry's pad, not a hard-coded
// controller 1.  Guard against a regression to `buttonDown(1, ...)`.
for (const file of ['code.html', 'sprites.html']) {
  const src = fs.readFileSync(path.join(WEB, file), 'utf8');
  if (/buttonDown\(\s*1\s*,/.test(src) || /buttonUp\(\s*1\s*,/.test(src)) {
    fail(`${file}: emulator still hard-codes controller 1 in buttonDown/Up`);
  }
  if (!/buttonDown\(\s*m\.pad\s*,/.test(src)) {
    fail(`${file}: emulator does not dispatch buttonDown via the mapped pad`);
  }
  console.log(`✓ ${file} dispatches input through the mapped controller, not a fixed pad 1`);
}

console.log('\nBR-06 emulator-p2-keys: all checks passed');
