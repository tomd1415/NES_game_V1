// Phase 4.2 — gallery smoke-test.  Spins up the playground server,
// publishes a fake project (small valid iNES + 1×1 PNG), confirms it
// shows up in /gallery/list, that each of the four served files is
// retrievable, and that /gallery/remove deletes the entry cleanly.
//
// The gallery folder is shared between developers; we publish into a
// throwaway slug pattern (`smoketest-...`) and remove on teardown so
// repeated runs don't pile up entries.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = '/home/duguid/projects/nesgame/attempt1';
const PORT = 18801;
const BASE = `http://127.0.0.1:${PORT}`;
const GALLERY_DIR = path.join(ROOT, 'tools', 'gallery');

// 24 KB minimal-but-valid iNES dummy: header, 16 KB PRG, 8 KB CHR.
function makeFakeRom() {
  const rom = new Uint8Array(16 + 16384 + 8192);
  rom[0] = 0x4E; rom[1] = 0x45; rom[2] = 0x53; rom[3] = 0x1A;  // "NES\x1a"
  rom[4] = 1;   // PRG banks
  rom[5] = 1;   // CHR banks
  return rom;
}

// Minimal 1×1 transparent-black PNG (real, decodable).
function makeFakePng() {
  return new Uint8Array([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,             // PNG sig
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,             // IHDR len + tag
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,             // 1×1
    0x08, 0x00, 0x00, 0x00, 0x00, 0x3B, 0x7E, 0x9B, 0x55,        // bit depth/colour + CRC
    0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54,             // IDAT
    0x78, 0x9C, 0x62, 0x00, 0x00, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,  // IEND
  ]);
}

function toB64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function getJson(url) {
  const res = await fetch(url);
  return { status: res.status, data: await res.json() };
}

async function getBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

const srv = spawn('python3',
  [path.join(ROOT, 'tools', 'playground_server.py')],
  { env: { ...process.env, PLAYGROUND_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'] });
await sleep(1500);

const publishedSlugs = [];
async function cleanup() {
  for (const slug of publishedSlugs) {
    try { await postJson(`${BASE}/gallery/remove`, { slug }); } catch (_) {}
  }
}

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(2);
}

try {
  // Empty list works.
  let { status, data } = await getJson(`${BASE}/gallery/list`);
  if (status !== 200 || !data.ok) fail('list endpoint did not return ok');
  console.log('✓ /gallery/list responds (' + (data.entries?.length ?? 0) + ' existing entries)');

  // Publish requires a title.
  ({ status, data } = await postJson(`${BASE}/gallery/publish`, { project: {} }));
  if (status === 200) fail('expected publish without title to fail');
  console.log('✓ publish rejects missing title');

  // Successful publish.
  const rom = makeFakeRom();
  const png = makeFakePng();
  const project = { name: 'smoke-test', sprites: [], backgrounds: [] };
  const payload = {
    title: 'Smoke test — gallery round-trip',
    description: 'Auto-publish from gallery.mjs',
    pupil_handle: 'smoke-bot',
    project,
    rom_b64: toB64(rom),
    preview_b64: toB64(png),
    source_page: 'builder',
  };
  ({ status, data } = await postJson(`${BASE}/gallery/publish`, payload));
  if (status !== 200 || !data.ok || !data.slug) fail('publish failed: ' + JSON.stringify(data));
  publishedSlugs.push(data.slug);
  const slug = data.slug;
  console.log('✓ publish ok (slug=' + slug + ')');

  // Folder + files exist on disk.
  for (const fname of ['rom.nes', 'preview.png', 'project.json', 'metadata.json']) {
    const p = path.join(GALLERY_DIR, slug, fname);
    if (!fs.existsSync(p)) fail(`expected ${fname} on disk`);
  }
  console.log('✓ all four files written to tools/gallery/' + slug);

  // List shows it.
  ({ status, data } = await getJson(`${BASE}/gallery/list`));
  if (status !== 200 || !data.ok) fail('post-publish list failed');
  const entry = data.entries.find(e => e.slug === slug);
  if (!entry) fail('published slug missing from list');
  if (entry.title !== payload.title) fail('list returned wrong title');
  if (entry.pupil_handle !== payload.pupil_handle) fail('list dropped handle');
  if (entry.owner !== null) fail('owner should be null pre-accounts (got ' + JSON.stringify(entry.owner) + ')');
  console.log('✓ list shows the new entry with pupil_handle + null owner slot');

  // ROM bytes round-trip.
  const fetchedRom = await getBytes(`${BASE}/gallery/${slug}/rom.nes`);
  if (fetchedRom.length !== rom.length) fail('ROM size mismatch');
  if (fetchedRom[0] !== 0x4E || fetchedRom[3] !== 0x1A) fail('fetched ROM is not iNES');
  console.log('✓ rom.nes round-trips (' + fetchedRom.length + ' bytes)');

  // project.json round-trips.
  const projRes = await fetch(`${BASE}/gallery/${slug}/project.json`);
  const proj = await projRes.json();
  if (proj.name !== 'smoke-test') fail('project.json round-trip lost data');
  console.log('✓ project.json round-trips');

  // Path-traversal rejection.
  let r = await fetch(`${BASE}/gallery/..%2F..%2Fetc%2Fpasswd`);
  if (r.status !== 404 && r.status !== 403) fail('path-traversal not blocked (' + r.status + ')');
  console.log('✓ path-traversal blocked');

  // Remove the entry.
  ({ status, data } = await postJson(`${BASE}/gallery/remove`, { slug }));
  if (status !== 200 || !data.ok) fail('remove failed');
  publishedSlugs.length = 0;
  if (fs.existsSync(path.join(GALLERY_DIR, slug))) fail('folder still on disk after remove');
  console.log('✓ remove deletes the entry');

  // Removing a non-existent slug returns 404.
  ({ status, data } = await postJson(`${BASE}/gallery/remove`, { slug: 'never-existed-aaaa' }));
  if (status !== 404) fail('expected 404 on non-existent remove (got ' + status + ')');
  console.log('✓ remove of unknown slug returns 404');

} finally {
  await cleanup();
  srv.kill('SIGTERM');
  await sleep(300);
}
console.log('\nGallery smoke-test complete.');
