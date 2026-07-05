// Route-level authorization for the gallery + feedback (Sprint 1, S1.5).
// Deny by default: a pupil may delete only their own gallery entry; a teacher
// (admin secret) may delete any / moderate anonymous entries; marking feedback
// handled needs the teacher secret.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 18862;
const BASE = `http://127.0.0.1:${PORT}`;
const DB = path.join('/tmp', `gallery-auth-${process.pid}.db`);
const GALLERY = path.join('/tmp', `gallery-auth-${process.pid}`);
const JOIN = 'OPEN-SESAME';
const ADMIN = 'teacher-admin-key';

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
    PLAYGROUND_JOIN_CODE: JOIN,
    PLAYGROUND_ADMIN_SECRET: ADMIN,
    PLAYGROUND_GALLERY_DIR: GALLERY,
    PLAYGROUND_AUTH_RATE_MAX: '50',
    PLAYGROUND_AUTH_RATE_WINDOW: '60',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let srvlog = '';
srv.stdout.on('data', d => { srvlog += d; });
srv.stderr.on('data', d => { srvlog += d; });

let ipc = 0;
async function req(method, p, { body, cookie, ip } = {}) {
  const headers = { 'X-Forwarded-For': ip || `10.2.${(ipc++ & 0xffff) >> 8}.${ipc & 0xff}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers['Cookie'] = cookie;
  const res = await fetch(BASE + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') };
}
const cookieFrom = (sc) => { if (!sc) return null; const m = /session=([^;]*)/.exec(sc); return m ? 'session=' + m[1] : null; };

// Minimal-but-valid rom (iNES magic) + preview (PNG magic) for publish.
const ROM_B64 = Buffer.concat([Buffer.from([0x4E, 0x45, 0x53, 0x1A]), Buffer.alloc(28)]).toString('base64');
const PNG_B64 = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(16)]).toString('base64');
function pubBody(title) {
  return { title, description: 'd', project: { name: title }, rom_b64: ROM_B64, preview_b64: PNG_B64, source_page: 'builder' };
}
async function signup(name, cookieHolder) {
  const r = await req('POST', '/auth/signup', { body: { username: name, password: 'two words ok', joinCode: JOIN } });
  if (r.status !== 200) throw new Error('signup ' + name + ' failed: ' + r.status + ' ' + JSON.stringify(r.json));
  return cookieFrom(r.setCookie);
}

await sleep(1600);
try {
  const cookieA = await signup('pupila', 1);
  const cookieB = await signup('pupilb', 1);
  ok('two pupils signed up');

  // Publish as pupil A (owner recorded) and anonymously (owner null).
  let r = await req('POST', '/gallery/publish', { body: pubBody('A game'), cookie: cookieA });
  if (r.status !== 200 || !r.json.slug) { bad('signed-in publish failed: ' + r.status + ' ' + JSON.stringify(r.json)); }
  const slugA = r.json && r.json.slug;
  r = await req('POST', '/gallery/publish', { body: pubBody('Anon game') });   // no cookie
  const slugAnon = r.json && r.json.slug;
  if (!slugA || !slugAnon) { bad('publish did not return slugs'); }
  else ok('published a signed-in entry + an anonymous entry');

  // --- List exposes `owned` (not raw owner ids) ---
  r = await req('GET', '/gallery/list', { cookie: cookieA });
  let entA = (r.json.entries || []).find(e => e.slug === slugA);
  let entAnon = (r.json.entries || []).find(e => e.slug === slugAnon);
  if (entA && entA.owned === true && entAnon && entAnon.owned === false) ok('owner sees `owned:true` on their entry, `false` on the anon entry');
  else bad('list owned flag wrong for owner: ' + JSON.stringify({ a: entA && entA.owned, anon: entAnon && entAnon.owned }));
  if (entA && !('owner' in entA)) ok('the raw numeric owner id is not leaked to the client'); else bad('list leaked raw owner id');

  r = await req('GET', '/gallery/list', { cookie: cookieB });
  entA = (r.json.entries || []).find(e => e.slug === slugA);
  if (entA && entA.owned === false) ok('a different pupil sees `owned:false` on it'); else bad('list owned flag wrong for non-owner: ' + JSON.stringify(entA && entA.owned));

  r = await req('GET', '/gallery/list');   // anonymous
  entA = (r.json.entries || []).find(e => e.slug === slugA);
  if (r.json.signed_in === false && entA && entA.owned === false) ok('an anonymous viewer sees `owned:false` everywhere'); else bad('anon list wrong: ' + JSON.stringify({ signed_in: r.json.signed_in, owned: entA && entA.owned }));

  // --- Deletes ---
  r = await req('POST', '/gallery/remove', { body: { slug: slugA } });   // anonymous
  if (r.status === 401) ok('anonymous cannot delete a signed-in entry → 401'); else bad('anon delete owned: expected 401, got ' + r.status + ' ' + JSON.stringify(r.json));

  r = await req('POST', '/gallery/remove', { body: { slug: slugA }, cookie: cookieB });   // wrong user
  if (r.status === 403 && r.json.code === 'not_owner') ok('a different pupil cannot delete it → 403 not_owner'); else bad('wrong-user delete: expected 403 not_owner, got ' + r.status + ' ' + JSON.stringify(r.json));

  r = await req('POST', '/gallery/remove', { body: { slug: slugA }, cookie: cookieA });   // owner
  if (r.status === 200) ok('the owner can delete their own entry → 200'); else bad('owner delete: expected 200, got ' + r.status + ' ' + JSON.stringify(r.json));

  r = await req('POST', '/gallery/remove', { body: { slug: slugAnon }, cookie: cookieB });   // anon entry, non-owner
  if (r.status === 403) ok('an anonymous entry is not deletable by a random pupil → 403'); else bad('anon-entry pupil delete: expected 403, got ' + r.status);

  r = await req('POST', '/gallery/remove', { body: { slug: slugAnon, admin_secret: ADMIN } });   // teacher
  if (r.status === 200) ok('a teacher (admin secret) can delete any entry → 200'); else bad('admin delete: expected 200, got ' + r.status + ' ' + JSON.stringify(r.json));

  r = await req('POST', '/gallery/remove', { body: { slug: slugA, admin_secret: 'WRONG' } });   // bad secret, no cookie
  if (r.status === 401 || r.status === 403) ok('a wrong teacher secret is rejected'); else bad('bad admin secret: expected 401/403, got ' + r.status);

  // --- Feedback handled state (teacher-only) ---
  r = await req('POST', '/feedback/handled', { body: { index: 1, handled: true } });   // no secret
  if (r.status === 403 && r.json.code === 'not_teacher') ok('feedback handled without the teacher secret → 403'); else bad('feedback no-secret: expected 403 not_teacher, got ' + r.status + ' ' + JSON.stringify(r.json));

  r = await req('POST', '/feedback/handled', { body: { index: 1, handled: true, admin_secret: ADMIN } });
  if (r.status === 200) ok('feedback handled with the teacher secret → 200'); else bad('feedback with-secret: expected 200, got ' + r.status + ' ' + JSON.stringify(r.json));
} catch (e) {
  bad('threw: ' + (e && e.message));
  console.error(srvlog.slice(-1500));
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
  for (const f of [DB, DB + '-wal', DB + '-shm']) { try { fs.unlinkSync(f); } catch {} }
  try { fs.rmSync(GALLERY, { recursive: true, force: true }); } catch {}
}
if (failed) process.exit(1);
console.log('\nGallery + feedback authorization tests complete.');
