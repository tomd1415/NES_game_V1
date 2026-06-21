#!/usr/bin/env node
// Pupil accounts (T4.2 — P1) end-to-end backend test.
//
// Drives the real playground server's /auth/* endpoints over HTTP, with a temp
// SQLite DB + a configured class join code + admin secret + a 1-second session
// TTL (so expiry is testable without waiting 30 days).  Asserts:
//   * signup is gated on the class join code; bad username / password rejected
//   * signup issues a session cookie + a one-time recovery code
//   * /auth/me reflects the logged-in user (and signupsOpen)
//   * duplicate usernames rejected; usernames are case-insensitive
//   * logout invalidates the session; sessions expire
//   * login rejects wrong passwords with a generic error
//   * recovery-code reset + teacher (admin-secret) reset, with old creds dying
//   * per-IP rate limiting trips
//
// Each functional call uses a UNIQUE client IP (via X-Forwarded-For) so the
// rate limiter (set low here) never starves the flow; the rate-limit test uses
// one fixed IP on purpose.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 18861;
const BASE = `http://127.0.0.1:${PORT}`;
const DB = path.join('/tmp', `accounts-test-${process.pid}.db`);
const JOIN = 'OPEN-SESAME';
const ADMIN = 'teacher-admin-key';
const RATE_MAX = 5;

let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

for (const f of [DB, DB + '-wal', DB + '-shm']) { try { fs.unlinkSync(f); } catch {} }

const srv = spawn('python3', [path.join(ROOT, 'tools', 'playground_server.py')], {
  env: { ...process.env,
    PLAYGROUND_PORT: String(PORT),
    PLAYGROUND_ACCOUNTS_DB: DB,
    PLAYGROUND_JOIN_CODE: JOIN,
    PLAYGROUND_ADMIN_SECRET: ADMIN,
    PLAYGROUND_SESSION_TTL: '3',          // short, so expiry is testable; >1 to
                                          // survive integer-second boundaries
                                          // during the functional checks
    PLAYGROUND_AUTH_RATE_MAX: String(RATE_MAX),
    PLAYGROUND_AUTH_RATE_WINDOW: '60',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let srvlog = '';
srv.stdout.on('data', d => { srvlog += d; });
srv.stderr.on('data', d => { srvlog += d; });

let ipCounter = 0;
// One request.  `ip` defaults to a fresh address per call (fresh rate bucket).
async function req(method, p, { body, cookie, ip } = {}) {
  const headers = { 'X-Forwarded-For': ip || `10.1.${(ipCounter++ & 0xffff) >> 8}.${ipCounter & 0xff}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers['Cookie'] = cookie;
  const res = await fetch(BASE + p, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') };
}
// Pull the session token out of a Set-Cookie header → a Cookie header value.
const cookieFrom = (sc) => {
  if (!sc) return null;
  const m = /session=([^;]*)/.exec(sc);
  return m ? 'session=' + m[1] : null;
};

async function waitHealthy() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + '/health'); if (r.ok) return true; } catch {}
    await sleep(200);
  }
  return false;
}

try {
  if (!await waitHealthy()) { bad('server did not become healthy\n' + srvlog.slice(-1200)); }
  else {
    // me (anonymous) — no user, signups open (a join code is configured).
    let r = await req('GET', '/auth/me');
    if (r.json && r.json.ok && r.json.username === null && r.json.signupsOpen === true)
      ok('GET /auth/me anonymous → no user, signups open');
    else bad('anon /auth/me unexpected: ' + JSON.stringify(r.json));

    // signup without / with wrong join code → 403.
    r = await req('POST', '/auth/signup', { body: { username: 'speedy', password: 'two words ok' } });
    if (r.status === 403 && r.json.code === 'bad_join_code') ok('signup without join code → 403 bad_join_code');
    else bad('signup w/o join code unexpected: ' + r.status + ' ' + JSON.stringify(r.json));

    r = await req('POST', '/auth/signup', { body: { username: 'speedy', password: 'two words ok', joinCode: 'WRONG' } });
    if (r.status === 403 && r.json.code === 'bad_join_code') ok('signup with wrong join code → 403');
    else bad('signup wrong code unexpected: ' + r.status + ' ' + JSON.stringify(r.json));

    // bad username (space = real-name shape) and short password → 400.
    r = await req('POST', '/auth/signup', { body: { username: 'Real Name', password: 'two words ok', joinCode: JOIN } });
    if (r.status === 400 && r.json.code === 'bad_username') ok('signup with a spaced/real-name username → 400 bad_username');
    else bad('bad username unexpected: ' + r.status + ' ' + JSON.stringify(r.json));

    r = await req('POST', '/auth/signup', { body: { username: 'speedy', password: 'x', joinCode: JOIN } });
    if (r.status === 400 && r.json.code === 'bad_password') ok('signup with too-short password → 400 bad_password');
    else bad('bad password unexpected: ' + r.status + ' ' + JSON.stringify(r.json));

    // valid signup → ok + recovery code + session cookie.
    r = await req('POST', '/auth/signup', { body: { username: 'speedy', password: 'red car go', joinCode: JOIN } });
    const signupCookie = cookieFrom(r.setCookie);
    if (r.status === 200 && r.json.ok && r.json.username === 'speedy'
        && typeof r.json.recoveryCode === 'string' && r.json.recoveryCode.length === 16 && signupCookie)
      ok('valid signup → ok, 16-char recovery code, session cookie set');
    else bad('valid signup unexpected: ' + r.status + ' ' + JSON.stringify(r.json) + ' cookie=' + signupCookie);

    // me with the signup cookie → speedy.
    r = await req('GET', '/auth/me', { cookie: signupCookie });
    if (r.json && r.json.username === 'speedy') ok('GET /auth/me with session cookie → speedy');
    else bad('me-with-cookie unexpected: ' + JSON.stringify(r.json));

    // duplicate username (case-insensitive) → 409.
    r = await req('POST', '/auth/signup', { body: { username: 'SPEEDY', password: 'red car go', joinCode: JOIN } });
    if (r.status === 409 && r.json.code === 'username_taken') ok('duplicate username (case-insensitive) → 409 username_taken');
    else bad('dup username unexpected: ' + r.status + ' ' + JSON.stringify(r.json));

    // wrong password → 401 generic.
    r = await req('POST', '/auth/login', { body: { username: 'speedy', password: 'nope nope' } });
    if (r.status === 401 && r.json.code === 'bad_credentials') ok('login wrong password → 401 bad_credentials');
    else bad('login wrong pw unexpected: ' + r.status + ' ' + JSON.stringify(r.json));

    // login OK (case-insensitive username) → cookie.
    r = await req('POST', '/auth/login', { body: { username: 'SpEeDy', password: 'red car go' } });
    const loginCookie = cookieFrom(r.setCookie);
    if (r.status === 200 && r.json.username === 'speedy' && loginCookie) ok('login (case-insensitive) → ok + cookie');
    else bad('login unexpected: ' + r.status + ' ' + JSON.stringify(r.json));

    // logout → cookie cleared, session dead.
    r = await req('POST', '/auth/logout', { cookie: loginCookie });
    if (r.status === 200 && /session=;/.test(r.setCookie || '')) ok('logout → clears the session cookie');
    else bad('logout unexpected: ' + r.status + ' setCookie=' + r.setCookie);
    r = await req('GET', '/auth/me', { cookie: loginCookie });
    if (r.json && r.json.username === null) ok('logged-out session no longer authenticates');
    else bad('post-logout me unexpected: ' + JSON.stringify(r.json));

    // session expiry (TTL=3s): fresh login, confirm live, wait past the TTL, dead.
    r = await req('POST', '/auth/login', { body: { username: 'speedy', password: 'red car go' } });
    const expCookie = cookieFrom(r.setCookie);
    r = await req('GET', '/auth/me', { cookie: expCookie });
    const liveBefore = r.json && r.json.username === 'speedy';
    await sleep(4000);               // > TTL (3s) + a boundary's slack
    r = await req('GET', '/auth/me', { cookie: expCookie });
    if (liveBefore && r.json && r.json.username === null) ok('sessions expire after their TTL');
    else bad('session expiry unexpected (liveBefore=' + liveBefore + ', after=' + JSON.stringify(r.json) + ')');

    // recovery-code reset.  Get a known recovery code via a fresh account.
    r = await req('POST', '/auth/signup', { body: { username: 'lapper', password: 'first pass ok', joinCode: JOIN } });
    const recCode = r.json.recoveryCode;
    r = await req('POST', '/auth/reset', { body: { username: 'lapper', recoveryCode: 'WRONGWRONGWRONG0', newPassword: 'second pass' } });
    if (r.status === 401 && r.json.code === 'bad_recovery') ok('reset with wrong recovery code → 401');
    else bad('reset wrong code unexpected: ' + r.status + ' ' + JSON.stringify(r.json));
    r = await req('POST', '/auth/reset', { body: { username: 'lapper', recoveryCode: recCode, newPassword: 'second pass' } });
    if (r.status === 200 && r.json.ok && typeof r.json.recoveryCode === 'string' && r.json.recoveryCode !== recCode)
      ok('reset with correct recovery code → ok + a fresh recovery code');
    else bad('reset ok unexpected: ' + r.status + ' ' + JSON.stringify(r.json));
    r = await req('POST', '/auth/login', { body: { username: 'lapper', password: 'first pass ok' } });
    const oldDead = r.status === 401;
    r = await req('POST', '/auth/login', { body: { username: 'lapper', password: 'second pass' } });
    if (oldDead && r.status === 200) ok('after reset: old password fails, new password works');
    else bad('post-reset login unexpected (oldDead=' + oldDead + ', new=' + r.status + ')');

    // teacher admin reset.
    r = await req('POST', '/auth/admin/reset', { body: { username: 'lapper', newPassword: 'teacher set', adminSecret: 'WRONG' } });
    if (r.status === 403 && r.json.code === 'bad_admin') ok('admin reset with wrong secret → 403');
    else bad('admin reset wrong secret unexpected: ' + r.status + ' ' + JSON.stringify(r.json));
    r = await req('POST', '/auth/admin/reset', { body: { username: 'lapper', newPassword: 'teacher set', adminSecret: ADMIN } });
    if (r.status === 200 && r.json.ok) ok('admin reset with correct secret → ok');
    else bad('admin reset unexpected: ' + r.status + ' ' + JSON.stringify(r.json));
    r = await req('POST', '/auth/login', { body: { username: 'lapper', password: 'teacher set' } });
    if (r.status === 200) ok('after admin reset: the teacher-set password works');
    else bad('post-admin-reset login unexpected: ' + r.status);

    // rate limiting: hammer ONE ip past the limit.
    let got429 = false;
    for (let i = 0; i < RATE_MAX + 3; i++) {
      const rr = await req('POST', '/auth/login', { ip: '9.9.9.9', body: { username: 'nobody', password: 'x' } });
      if (rr.status === 429) { got429 = true; break; }
    }
    if (got429) ok('per-IP rate limiting trips after the configured max');
    else bad('rate limiting never returned 429');
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
  for (const f of [DB, DB + '-wal', DB + '-shm']) { try { fs.unlinkSync(f); } catch {} }
}

if (failed) process.exit(1);
console.log('\nAccounts (T4.2 P1) backend test complete.');
