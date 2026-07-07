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
  // The latest engine version.
  global.NES_ENGINE_VERSION = 27;
  // The engine version THIS page targets. The Studio loads this file and so
  // targets the latest; the original seven pages do NOT load it, so codegen
  // (builder-modules.js) treats an unset target as v1 — pinning the stable
  // multi-page site to engine v1 while the Studio moves forward. A page may
  // also set window.NES_TARGET_ENGINE explicitly before builder-modules loads.
  if (typeof global.NES_TARGET_ENGINE !== 'number') {
    global.NES_TARGET_ENGINE = global.NES_ENGINE_VERSION;
  }
})(typeof window !== 'undefined' ? window : globalThis);
