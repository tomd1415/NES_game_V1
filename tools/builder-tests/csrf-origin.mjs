// CSRF Origin-check (defence-in-depth on top of SameSite=Lax): state-changing
// routes that authenticate via the session cookie reject requests whose Origin
// is provably cross-site.  The hot /play path and non-cookie routes are exempt.
// Uses node:http directly because undici (global fetch) strips the forbidden
// `Origin` request header.
import { spawn } from 'node:child_process';
import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 18863;
const HOST = `127.0.0.1:${PORT}`;
const DB = path.join('/tmp', `csrf-${process.pid}.db`);
const GALLERY = path.join('/tmp', `csrf-${process.pid}`);
const ALLOWED = 'https://games.example.org';

let failed = false;
const ok = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };

for (const f of [DB, DB + '-wal', DB + '-shm']) { try { fs.unlinkSync(f); } catch {} }
try { fs.rmSync(GALLERY, { recursive: true, force: true }); } catch {}

const srv = spawn('python3', [path.join(ROOT, 'tools', 'playground_server.py')], {
  env: { ...process.env,
    PLAYGROUND_SKIP_DOTENV: '1',
    PLAYGROUND_PORT: String(PORT),
    PLAYGROUND_ACCOUNTS_DB: DB,
    PLAYGROUND_JOIN_CODE: 'OPEN',
    PLAYGROUND_ADMIN_SECRET: 'teach',
    PLAYGROUND_GALLERY_DIR: GALLERY,
    PLAYGROUND_ALLOWED_ORIGINS: ALLOWED,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let srvlog = '';
srv.stdout.on('data', d => { srvlog += d; });
srv.stderr.on('data', d => { srvlog += d; });

// Raw request with arbitrary headers; returns {status, json}.
function req(method, p, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body !== undefined ? JSON.stringify(body) : null;
    const h = { 'Content-Type': 'application/json', ...headers };
    if (data) h['Content-Length'] = Buffer.byteLength(data);
    const r = http.request({ host: '127.0.0.1', port: PORT, method, path: p, headers: h }, (res) => {
      let buf = '';
      res.on('data', c => { buf += c; });
      res.on('end', () => { let j = null; try { j = JSON.parse(buf); } catch {} resolve({ status: res.statusCode, json: j }); });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
const code = (r) => r.json && r.json.code;

await sleep(1600);
try {
  // 1. Cross-site Origin on a cookie-authed route → blocked before auth runs.
  let r = await req('POST', '/gallery/remove', { headers: { Origin: 'http://evil.example' }, body: { slug: 'whatever' } });
  if (r.status === 403 && code(r) === 'bad_origin') ok('cross-site Origin on /gallery/remove → 403 bad_origin'); else bad('cross Origin not blocked: ' + r.status + ' ' + JSON.stringify(r.json));

  // 2. Same-site Origin (matches Host) → CSRF passes; falls through to auth (401 anon).
  r = await req('POST', '/gallery/remove', { headers: { Origin: `http://${HOST}` }, body: { slug: 'whatever' } });
  if (code(r) !== 'bad_origin') ok('same-Host Origin passes the CSRF check (got ' + (code(r) || r.status) + ')'); else bad('same-Host Origin wrongly blocked');

  // 3. No Origin/Referer at all (curl-style) → allowed through.
  r = await req('POST', '/gallery/remove', { body: { slug: 'whatever' } });
  if (code(r) !== 'bad_origin') ok('no Origin/Referer → allowed (non-browser client)'); else bad('missing Origin wrongly blocked');

  // 4. Reverse-proxy case: Origin = public host, X-Forwarded-Host advertises it.
  r = await req('POST', '/gallery/remove', {
    headers: { Origin: 'https://games.school.internal', 'X-Forwarded-Host': 'games.school.internal' },
    body: { slug: 'whatever' } });
  if (code(r) !== 'bad_origin') ok('proxied request (Origin == X-Forwarded-Host) → allowed'); else bad('proxied X-Forwarded-Host not honoured');

  // 5. Explicit allowlist origin → allowed even if it != Host.
  r = await req('POST', '/gallery/remove', { headers: { Origin: ALLOWED }, body: { slug: 'whatever' } });
  if (code(r) !== 'bad_origin') ok('PLAYGROUND_ALLOWED_ORIGINS entry → allowed'); else bad('allowlist origin wrongly blocked');

  // 6. Referer fallback: cross-site Referer, no Origin → blocked.
  r = await req('POST', '/gallery/remove', { headers: { Referer: 'http://evil.example/x' }, body: { slug: 'whatever' } });
  if (r.status === 403 && code(r) === 'bad_origin') ok('cross-site Referer (no Origin) → 403 bad_origin'); else bad('cross Referer not blocked: ' + r.status);

  // 7. /me/projects POST (cookie-authed) is protected too.
  r = await req('POST', '/me/projects', { headers: { Origin: 'http://evil.example' }, body: { name: 'x', blob: '{}' } });
  if (r.status === 403 && code(r) === 'bad_origin') ok('cross-site Origin on /me/projects → 403 bad_origin'); else bad('/me/projects not protected: ' + r.status);

  // 8. /play is NOT CSRF-protected (no ambient credential to forge).
  r = await req('POST', '/play', { headers: { Origin: 'http://evil.example' }, body: {} });
  if (code(r) !== 'bad_origin') ok('/play is exempt from the Origin check (got ' + (code(r) || r.status) + ')'); else bad('/play wrongly CSRF-blocked');

  // 9. /feedback (anonymous, no cookie auth) is exempt.
  r = await req('POST', '/feedback', { headers: { Origin: 'http://evil.example' }, body: { category: 'bug', message: 'hi' } });
  if (code(r) !== 'bad_origin') ok('/feedback is exempt from the Origin check'); else bad('/feedback wrongly CSRF-blocked');
} catch (e) {
  bad('threw: ' + (e && e.message));
  console.error(srvlog.slice(-1200));
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
  for (const f of [DB, DB + '-wal', DB + '-shm']) { try { fs.unlinkSync(f); } catch {} }
  try { fs.rmSync(GALLERY, { recursive: true, force: true }); } catch {}
}
if (failed) process.exit(1);
console.log('\nCSRF Origin-check tests complete.');
