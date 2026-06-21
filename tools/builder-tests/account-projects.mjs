#!/usr/bin/env node
// Pupil accounts (T4.2 — P2) per-user project storage test.
//
// Drives the real /me/projects endpoints over HTTP with a temp DB + join code.
// Asserts the cross-device save model:
//   * project endpoints require a session (401 when signed out)
//   * create → list → get round-trips the blob; update changes it
//   * delete removes it
//   * ownership is enforced: user B cannot see, fetch, change or delete user A's
//     project (404, never another pupil's work)
//   * oversize blobs are rejected (413)
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 18862;
const BASE = `http://127.0.0.1:${PORT}`;
const DB = path.join('/tmp', `account-projects-test-${process.pid}.db`);
const JOIN = 'PIT-LANE';

let failed = false;
const ok  = (m) => console.log('✓ ' + m);
const bad = (m) => { console.error('FAIL: ' + m); failed = true; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

for (const f of [DB, DB + '-wal', DB + '-shm']) { try { fs.unlinkSync(f); } catch {} }

const srv = spawn('python3', [path.join(ROOT, 'tools', 'playground_server.py')], {
  env: { ...process.env,
    PLAYGROUND_SKIP_DOTENV: '1',           // ignore any dev .env so this test is deterministic
    PLAYGROUND_PORT: String(PORT), PLAYGROUND_ACCOUNTS_DB: DB,
    PLAYGROUND_JOIN_CODE: JOIN, PLAYGROUND_AUTH_RATE_MAX: '1000' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let srvlog = ''; srv.stdout.on('data', d => srvlog += d); srv.stderr.on('data', d => srvlog += d);

let ipc = 0;
async function req(method, p, { body, cookie } = {}) {
  const headers = { 'X-Forwarded-For': `10.2.0.${(ipc++ & 0xff)}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers['Cookie'] = cookie;
  const res = await fetch(BASE + p, { method, headers,
    body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') };
}
const cookieFrom = (sc) => { const m = sc && /session=([^;]*)/.exec(sc); return m ? 'session=' + m[1] : null; };
async function signup(username) {
  const r = await req('POST', '/auth/signup', { body: { username, password: 'pit stop go', joinCode: JOIN } });
  return cookieFrom(r.setCookie);
}
async function waitHealthy() {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/health')).ok) return true; } catch {} await sleep(200); }
  return false;
}

try {
  if (!await waitHealthy()) { bad('server not healthy\n' + srvlog.slice(-1200)); }
  else {
    // Signed out → 401 on every project route.
    let r = await req('GET', '/me/projects');
    if (r.status === 401 && r.json.code === 'not_logged_in') ok('GET /me/projects signed out → 401');
    else bad('signed-out list unexpected: ' + r.status + ' ' + JSON.stringify(r.json));
    r = await req('POST', '/me/projects', { body: { name: 'x', blob: '{}' } });
    if (r.status === 401) ok('POST /me/projects signed out → 401');
    else bad('signed-out create unexpected: ' + r.status);

    const alice = await signup('alice_ace');
    const bob = await signup('bob_blaze');

    // Empty list to start.
    r = await req('GET', '/me/projects', { cookie: alice });
    if (r.json && r.json.ok && Array.isArray(r.json.projects) && r.json.projects.length === 0)
      ok('new account has an empty project list');
    else bad('initial list unexpected: ' + JSON.stringify(r.json));

    // Create.
    const blob1 = JSON.stringify({ name: 'My Racer', track: [1, 2, 3] });
    r = await req('POST', '/me/projects', { cookie: alice, body: { name: 'My Racer', blob: blob1 } });
    const pid = r.json && r.json.id;
    if (r.status === 200 && r.json.ok && Number.isInteger(pid) && r.json.size === blob1.length)
      ok('create project → returns an id + size');
    else bad('create unexpected: ' + r.status + ' ' + JSON.stringify(r.json));

    // List shows it (metadata only, no blob).
    r = await req('GET', '/me/projects', { cookie: alice });
    if (r.json.projects.length === 1 && r.json.projects[0].id === pid
        && r.json.projects[0].name === 'My Racer' && r.json.projects[0].blob === undefined)
      ok('list shows the project metadata (no blob in the list)');
    else bad('list-after-create unexpected: ' + JSON.stringify(r.json));

    // Get round-trips the blob.
    r = await req('GET', `/me/projects/${pid}`, { cookie: alice });
    if (r.status === 200 && r.json.blob === blob1) ok('get project round-trips the exact blob');
    else bad('get unexpected: ' + r.status + ' blobMatch=' + (r.json && r.json.blob === blob1));

    // Update changes the blob + name.
    const blob2 = JSON.stringify({ name: 'My Racer v2', track: [9, 9, 9, 9] });
    r = await req('PUT', `/me/projects/${pid}`, { cookie: alice, body: { name: 'My Racer v2', blob: blob2 } });
    if (r.status === 200 && r.json.ok && r.json.size === blob2.length) ok('update project → ok, new size');
    else bad('update unexpected: ' + r.status + ' ' + JSON.stringify(r.json));
    r = await req('GET', `/me/projects/${pid}`, { cookie: alice });
    if (r.json.blob === blob2 && r.json.name === 'My Racer v2') ok('update persisted (blob + name)');
    else bad('post-update get unexpected: ' + JSON.stringify(r.json));

    // Ownership: Bob cannot see, fetch, update or delete Alice's project.
    r = await req('GET', '/me/projects', { cookie: bob });
    if (r.json.projects.length === 0) ok("ownership: Bob's list does not include Alice's project");
    else bad("ownership leak in list: " + JSON.stringify(r.json));
    r = await req('GET', `/me/projects/${pid}`, { cookie: bob });
    if (r.status === 404) ok("ownership: Bob GET on Alice's project → 404");
    else bad('ownership get leak: ' + r.status + ' ' + JSON.stringify(r.json));
    r = await req('PUT', `/me/projects/${pid}`, { cookie: bob, body: { name: 'hijack', blob: '{}' } });
    if (r.status === 404) ok("ownership: Bob PUT on Alice's project → 404");
    else bad('ownership put leak: ' + r.status);
    r = await req('DELETE', `/me/projects/${pid}`, { cookie: bob });
    if (r.status === 404) ok("ownership: Bob DELETE on Alice's project → 404");
    else bad('ownership delete leak: ' + r.status);
    // Alice's project survived Bob's attempts.
    r = await req('GET', `/me/projects/${pid}`, { cookie: alice });
    if (r.status === 200 && r.json.blob === blob2) ok("Alice's project intact after Bob's attempts");
    else bad('project damaged by ownership attempts: ' + JSON.stringify(r.json));

    // Oversize blob rejected.
    const huge = 'x'.repeat(4 * 1024 * 1024 + 16);
    r = await req('POST', '/me/projects', { cookie: alice, body: { name: 'huge', blob: huge } });
    if (r.status === 413 && r.json.code === 'project_too_big') ok('oversize project rejected → 413');
    else bad('oversize unexpected: ' + r.status + ' ' + JSON.stringify(r.json));

    // Delete.
    r = await req('DELETE', `/me/projects/${pid}`, { cookie: alice });
    if (r.status === 200 && r.json.ok) ok('delete project → ok');
    else bad('delete unexpected: ' + r.status + ' ' + JSON.stringify(r.json));
    r = await req('GET', `/me/projects/${pid}`, { cookie: alice });
    if (r.status === 404) ok('deleted project is gone (404)');
    else bad('post-delete get unexpected: ' + r.status);
  }
} catch (e) {
  bad('threw: ' + (e && e.stack || e));
} finally {
  srv.kill('SIGTERM');
  await sleep(300);
  for (const f of [DB, DB + '-wal', DB + '-shm']) { try { fs.unlinkSync(f); } catch {} }
}

if (failed) process.exit(1);
console.log('\nAccount projects (T4.2 P2) test complete.');
