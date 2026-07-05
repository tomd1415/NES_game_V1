// Native-fceux play gating — PlayPipeline.nativeStatus().
//
// Native "Local (fceux)" runs fceux on the SERVER's desktop, so it's only
// useful to the viewer when the page is served from this same machine.  This
// asserts the gating: usable only when fceux is present AND the host is local;
// disabled (with a clear label) on a hosted instance even when fceux is
// installed — the pupil-reported "won't run in fceux on production" case.
import fs from 'node:fs';
import path from 'node:path';

const WEB = new URL('../../tools/tile_editor_web', import.meta.url).pathname;
let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

// Load play-pipeline.js into a Node sandbox (same pattern as shared-play.mjs).
globalThis.window = globalThis;
globalThis.location = { hostname: 'localhost' };
new Function(fs.readFileSync(path.join(WEB, 'play-pipeline.js'), 'utf8'))();
const P = globalThis.PlayPipeline;
if (!P || typeof P.nativeStatus !== 'function') { console.error('FAIL: nativeStatus not exported'); process.exit(1); }

// nativeStatus reads location.hostname at call time, so we just retarget it.
function at(hostname, caps) { globalThis.location.hostname = hostname; return P.nativeStatus(caps); }

let s = at('localhost', { fceux: true });
if (s.usable && s.label === 'Local (fceux)') ok('localhost + fceux → usable');
else bad('localhost + fceux: ' + JSON.stringify(s));

s = at('127.0.0.1', { fceux: true });
if (s.usable) ok('127.0.0.1 + fceux → usable');
else bad('127.0.0.1 + fceux: ' + JSON.stringify(s));

s = at('spritemaker.co.uk', { fceux: true });
if (!s.usable && /host machine only/.test(s.label)) ok('remote host + fceux → disabled ("host machine only")');
else bad('remote host + fceux should be disabled: ' + JSON.stringify(s));

s = at('192.168.1.50', { fceux: true });
if (!s.usable) ok('LAN IP + fceux → disabled (server-side fceux is invisible to the pupil)');
else bad('LAN IP + fceux should be disabled: ' + JSON.stringify(s));

s = at('localhost', { fceux: false });
if (!s.usable && /not installed/.test(s.label)) ok('no fceux → disabled ("not installed")');
else bad('no fceux: ' + JSON.stringify(s));

s = at('spritemaker.co.uk', { fceux: false });
if (!s.usable) ok('remote host + no fceux → disabled');
else bad('remote + no fceux: ' + JSON.stringify(s));

if (failed) { console.error('\nnative-status: FAILURES above'); process.exit(1); }
console.log('\nnative-status: all checks passed');
