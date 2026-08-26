#!/usr/bin/env node
// Two branches must not publish DIFFERENT engines under the SAME version number.
//
// `tools/engines/README.md` calls snapshot directories immutable, which is what makes a
// collision unrepairable rather than untidy: a project stamped `engineVersion: 76` is
// ambiguous about which engine built it, and neither side can renumber history. This
// branch and `main` have done it three times (v76, v77, v78) by both bumping while
// diverged. Until now that was recorded only in prose -- and a note in a document is
// not a check.
//
// So: `tools/engines/main-manifests.json` records the sha1 of every `vN/manifest.json`
// on `main` at a named commit. This compares ours against it and asserts the colliding
// set is EXACTLY `expected_collisions` -- both directions:
//
//   * a NEW collision (a fourth version bumped while diverged) fails, which is the
//     point; and
//   * a collision that has been RESOLVED also fails, so the record cannot quietly go
//     stale after the port-forward renumbers ours. A known-failures list that only
//     shrinks silently is the thing it was written to prevent.
//
// It exits 2 -- not 0 -- if it compared nothing, because a scan that finds nothing must
// never be indistinguishable from a scan that found nothing wrong.
//
// Refresh after merging or after `main` moves:
//   node tools/builder-tests/lib/snapshot-collisions.mjs --update
// which rewrites the record from the CURRENT `origin/main` (fetch first). Read the diff:
// a version moving from identical to colliding is a real event, not noise.

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ENGINES = path.join(ROOT, 'tools', 'engines');
const RECORD = path.join(ENGINES, 'main-manifests.json');

const sha1 = (buffer) => crypto.createHash('sha1').update(buffer).digest('hex');
const localVersions = () =>
  fs.readdirSync(ENGINES)
    .filter((name) => /^v\d+$/.test(name) && fs.existsSync(path.join(ENGINES, name, 'manifest.json')))
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
const localDigest = (v) => sha1(fs.readFileSync(path.join(ENGINES, v, 'manifest.json')));

function update() {
  const listed = execFileSync('git', ['ls-tree', '--name-only', 'origin/main', 'tools/engines/'],
    { cwd: ROOT, encoding: 'utf8' })
    .split('\n').map((line) => line.replace(/\/$/, '').split('/').pop())
    .filter((name) => /^v\d+$/.test(name));
  if (listed.length === 0) throw new Error('origin/main has no engine snapshots — is the remote fetched?');
  const head = execFileSync('git', ['rev-parse', '--short', 'origin/main'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const digests = {};
  for (const v of listed) {
    digests[v] = sha1(execFileSync('git', ['show', `origin/main:tools/engines/${v}/manifest.json`],
      { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }));
  }
  const ours = localVersions();
  const record = {
    _comment: 'Digests of origin/main’s engine-snapshot manifests. See tools/builder-tests/lib/snapshot-collisions.mjs.',
    generated_from: `origin/main @ ${head}`,
    generated_on: new Date().toISOString().slice(0, 10),
    digests,
    expected_collisions: ours.filter((v) => digests[v] && digests[v] !== localDigest(v)),
    local_only: ours.filter((v) => !digests[v]),
  };
  fs.writeFileSync(RECORD, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`updated ${path.relative(ROOT, RECORD)} from ${record.generated_from}`);
  console.log(`  colliding: ${record.expected_collisions.join(', ') || '(none)'}`);
  console.log(`  local-only: ${record.local_only.join(', ') || '(none)'}`);
}

function check() {
  let record;
  try {
    record = JSON.parse(fs.readFileSync(RECORD, 'utf8'));
  } catch (error) {
    console.error(`cannot read ${path.relative(ROOT, RECORD)}: ${error.message}`);
    process.exit(2);
  }
  const ours = localVersions();
  if (ours.length === 0) {
    console.error('no engine snapshots found at all — this scan proved nothing.');
    process.exit(2);
  }
  const colliding = [];
  const localOnly = [];
  let compared = 0;
  for (const v of ours) {
    const theirs = record.digests[v];
    if (!theirs) { localOnly.push(v); continue; }
    compared += 1;
    if (theirs !== localDigest(v)) colliding.push(v);
  }
  if (compared === 0) {
    console.error(`compared 0 versions against ${record.generated_from} — the record and the ` +
      'snapshots share no version numbers, so this check established nothing.');
    process.exit(2);
  }

  const problems = [];
  const diff = (label, actual, expected, hint) => {
    const added = actual.filter((v) => !expected.includes(v));
    const gone = expected.filter((v) => !actual.includes(v));
    if (added.length) problems.push(`NEW ${label}: ${added.join(', ')} — ${hint}`);
    if (gone.length) problems.push(`${label} no longer present: ${gone.join(', ')} — ` +
      'if that is deliberate, re-run with --update so the record says so.');
  };
  diff('collision', colliding, record.expected_collisions ?? [],
    'this branch and main now describe DIFFERENT engines under the same number. ' +
    'Snapshots are immutable, so renumber before this is published.');
  diff('local-only version', localOnly, record.local_only ?? [],
    'main has no snapshot at this number yet, so it may still claim it. Check before bumping again.');

  console.log(`compared ${compared} version(s) against ${record.generated_from} ` +
    `(recorded ${record.generated_on})`);
  console.log(`  colliding: ${colliding.join(', ') || '(none)'}`);
  console.log(`  local-only: ${localOnly.join(', ') || '(none)'}`);
  if (problems.length) {
    console.error(`\n${problems.map((p) => `  ✗ ${p}`).join('\n')}`);
    process.exit(1);
  }
}

if (process.argv.includes('--update')) update(); else check();
