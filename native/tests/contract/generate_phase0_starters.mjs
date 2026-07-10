#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import * as H from '../../../tools/builder-tests/lib/render-harness.mjs';

const OUT = path.join(H.ROOT, 'native', 'tests', 'fixtures', 'phase0', 'starters');
const PORT = 18920;

globalThis.window = globalThis;
globalThis.NES_TARGET_ENGINE = 63;
globalThis.NES_ENGINE_VERSION = 63;
for (const file of [
  'sprite-render.js',
  'builder-assembler.js',
  'builder-modules.js',
  'builder-validators.js',
  'default-state.js',
  'studio-starter.js',
]) {
  new Function(fs.readFileSync(path.join(H.WEB, file), 'utf8'))();
}

const template = H.readTemplate();
const styles = [
  ['basics', () => window.StudioStarter.create()],
  ['smb', () => window.StudioStarter.createSmb()],
  ['topdown', () => window.StudioStarter.createTopdown()],
  ['runner', () => window.StudioStarter.createRunner()],
  ['geodash', () => window.StudioStarter.createGeoDash()],
  ['racer', () => window.StudioStarter.createRacer()],
  ['scratch', () => window.StudioStarter.createScratch()],
];

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function jsonBytes(value) {
  return Buffer.from(JSON.stringify(canonical(value), null, 2) + '\n');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function playerStart(state) {
  const config = state.builder?.modules?.players?.submodules?.player1?.config;
  return { x: config?.startX | 0, y: config?.startY | 0 };
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const manifest = {
  schema_version: 1,
  engine_version: 63,
  generator: 'native/tests/contract/generate_phase0_starters.mjs',
  fixtures: {},
};
const { srv } = await H.startServer(PORT);
let failed = false;
try {
  for (const [id, make] of styles) {
    const state = make();
    const before = jsonBytes(state);
    const mainC = Buffer.from(window.BuilderAssembler.assemble(state, template));
    const request = {
      state,
      playerSpriteIdx: 0,
      playerStart: playerStart(state),
      sceneSprites: [],
      mode: 'browser',
      customMainC: mainC.toString('utf8'),
      targetEngine: 63,
    };
    const requestBytes = jsonBytes(request);
    const result = await H.buildRom(PORT, request);
    const after = jsonBytes(state);
    if (!result.ok) throw new Error(`${id}: build failed at ${result.stage}: ${result.log || ''}`);
    if (!before.equals(after)) throw new Error(`${id}: build mutated the input project`);

    const directory = path.join(OUT, id);
    fs.mkdirSync(directory, { recursive: true });
    const rom = Buffer.from(result.romBytes);
    fs.writeFileSync(path.join(directory, 'project.json.gz'), gzipSync(before, { level: 9, mtime: 0 }));
    fs.writeFileSync(path.join(directory, 'play-request.json.gz'), gzipSync(requestBytes, { level: 9, mtime: 0 }));
    fs.writeFileSync(path.join(directory, 'main.c.gz'), gzipSync(mainC, { level: 9, mtime: 0 }));
    fs.writeFileSync(path.join(directory, 'game.nes'), rom);
    manifest.fixtures[id] = {
      project_json_sha256: sha256(before),
      play_request_json_sha256: sha256(requestBytes),
      generated_source_sha256: sha256(mainC),
      rom_sha256: sha256(rom),
      rom_size: rom.length,
      input_project_unchanged: true,
    };
    console.log(`${id}: ${rom.length} bytes ${sha256(rom).slice(0, 12)}`);
  }
} catch (error) {
  failed = true;
  console.error(error?.stack || error);
} finally {
  await H.stopServer(srv);
}

if (failed) process.exit(1);
fs.writeFileSync(path.join(OUT, 'manifest.json'), jsonBytes(manifest));
console.log(`wrote ${styles.length} fixtures to ${path.relative(H.ROOT, OUT)}`);
