// Unit harness for read_controller. jsnes button codes are A=0,B=1,Select=2,
// Start=3,Up=4,Down=5,Left=6,Right=7 — the same order the controller shifts
// out, so a pressed code c lands in bit (7-c) of the result byte. For each
// combo we boot fresh, hold those buttons, run, and assert ref==asm==model.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM = path.join(__dirname, '..', '..', 'build', 'rc.nes');

const NAMES = ['A', 'B', 'Select', 'Start', 'Up', 'Down', 'Left', 'Right'];
const combos = [
  [],                 // nothing
  [0],                // A -> 0x80
  [7],                // Right -> 0x01
  [0, 3, 7],          // A + Start + Right -> 0x91
  [4, 5, 6, 7],       // U D L R -> 0x0F
  [0, 1, 2, 3, 4, 5, 6, 7], // all -> 0xFF
  [1, 2],             // B + Select -> 0x60
];
const model = (codes) => codes.reduce((v, c) => v | (1 << (7 - c)), 0) & 0xFF;

const r = makeReporter('read_controller unit');
let allGood = true;
for (const combo of combos) {
  const h = boot(ROM);
  for (const c of combo) h.nes.buttonDown(1, c);
  if (!h.frameUntil(0x0300, 0xAA)) { r.bad('driver did not finish for combo ' + JSON.stringify(combo)); allGood = false; continue; }
  const ref = h.rd(0x0308), asm = h.rd(0x0309), want = model(combo);
  const label = combo.length ? combo.map((c) => NAMES[c]).join('+') : '(none)';
  if (asm === ref && ref === want) {
    r.ok(`${label} -> 0x${want.toString(16).padStart(2, '0')} (ref==asm==model)`);
  } else {
    allGood = false;
    r.bad(`${label}: ref=0x${ref.toString(16)} asm=0x${asm.toString(16)} model=0x${want.toString(16)}`);
  }
}
if (allGood) r.done('read_controller: ASM candidate is behaviourally identical to the C reference.');
else r.done();
