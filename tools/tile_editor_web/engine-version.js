/*
 * engine-version.js — the current NES-engine version, exposed to the client.
 *
 * The "engine" is the C templates + assembler + cc65 project that turn a
 * project into a ROM. This number is stamped onto new projects
 * (state.engineVersion) so we always know which engine a design targets, and
 * so a future engine can fall back to the one a game was authored for.
 *
 * SOURCE OF TRUTH: keep this integer in lock-step with
 * `tools/engines/ENGINE_VERSION` (a snapshot script and the build server
 * read that file). Bump BOTH, and add a `tools/engines/CHANGELOG.md` entry,
 * whenever a change alters ROM output or the project↔ROM contract.
 */
(function (global) {
  'use strict';
  global.NES_ENGINE_VERSION = 1;
})(typeof window !== 'undefined' ? window : globalThis);
