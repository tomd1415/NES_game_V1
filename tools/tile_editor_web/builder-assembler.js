/*
 * Builder assembler.
 *
 * Pure function land.  Given:
 *   - `template`  : the string contents of builder-templates/platformer.c
 *                   (or topdown.c once that lands in chunk 2),
 *   - `state`     : the pupil's full editor state (reads sprites, roles,
 *                   animation assignments, the full `state.builder`
 *                   module tree),
 * returns a compilable `main.c` string by walking the enabled modules in
 * a fixed order and asking each to transform the template.
 *
 * The transformations are narrow on purpose — a module can either:
 *   - replace the body of a //>> id: hint ... //<< region
 *     (via `replaceRegion(template, id, body)`), or
 *   - append text into a named //@ insert: slot
 *     (via `appendToSlot(template, slot, text)`).
 * There is no eval, no conditional template logic, and no recursive
 * module expansion.  That keeps "one input -> one output" deterministic
 * and readable by a teacher who wants to audit what the Builder did.
 *
 * Chunk 1 scope: the `game` module picks the template up-front; the
 * `player` module replaces the walk_speed / player_start / jump_height
 * regions.  Chunk 2 will add //@ insert: slots + modules that fill
 * them (enemies, walls, win).
 */
(function () {
  'use strict';

  // Replace the body between `//>> <id>: hint` and `//<<`.  Leaves the
  // marker lines themselves untouched so the generated file still looks
  // like the template to anyone reading it side-by-side.  Returns the
  // template unchanged if the region is not found — modules should not
  // silently fail, so callers that care log a warning.
  function replaceRegion(template, id, newBody) {
    const lines = template.split('\n');
    const openRe = new RegExp('^\\s*//>>\\s*' + _escape(id) + '\\s*:');
    const closeRe = /^\s*\/\/<</;
    let startIdx = -1;
    let endIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (startIdx < 0 && openRe.test(lines[i])) {
        startIdx = i;
      } else if (startIdx >= 0 && closeRe.test(lines[i])) {
        endIdx = i;
        break;
      }
    }
    if (startIdx < 0 || endIdx < 0) {
      if (typeof console !== 'undefined') {
        console.warn('[builder] region not found: ' + id);
      }
      return template;
    }
    const body = Array.isArray(newBody) ? newBody : String(newBody).split('\n');
    const result = lines.slice(0, startIdx + 1)
      .concat(body)
      .concat(lines.slice(endIdx));
    return result.join('\n');
  }

  // Append a block of text into the first occurrence of `//@ insert:
  // <slot>` marker.  The marker line itself is replaced by the new text
  // so that a slot can be filled or left empty without leaving visible
  // residue in the final C.  If the slot does not exist, returns the
  // template unchanged (same silent-or-warn contract as replaceRegion).
  //
  // Multiple `appendToSlot` calls for the same slot simply layer — each
  // call replaces the previous marker with `text + <marker>`, keeping
  // later appends stable.
  function appendToSlot(template, slot, text) {
    const marker = '//@ insert: ' + slot;
    const idx = template.indexOf(marker);
    if (idx < 0) {
      if (typeof console !== 'undefined') {
        console.warn('[builder] insertion slot not found: ' + slot);
      }
      return template;
    }
    return template.slice(0, idx) + text + '\n' + marker +
      template.slice(idx + marker.length);
  }

  // Strip every remaining `//@ insert: <slot>` marker from the output.
  // Called last so empty slots leave no trace in the generated file.
  function stripSlotMarkers(template) {
    return template.split('\n').filter(function (line) {
      return !/^\s*\/\/@\s*insert\s*:/.test(line);
    }).join('\n');
  }

  // Find the first sprite with the given role (same convention as the
  // server's build_scene_inc — role strings match state.sprites[i].role).
  // Returns the index or -1.
  function findSpriteByRole(state, role) {
    const sprites = (state && state.sprites) || [];
    for (let i = 0; i < sprites.length; i++) {
      if (sprites[i] && sprites[i].role === role) return i;
    }
    return -1;
  }

  // Return every sprite index whose role matches.  Used by the Player
  // 2 wiring — findSpritesByRole(state, 'player')[1] is the second
  // Player-tagged sprite, i.e. P2's art.  Preserves list order so the
  // pupil's intent (tag order on the Sprites page) survives.
  function findSpritesByRole(state, role) {
    const sprites = (state && state.sprites) || [];
    const out = [];
    for (let i = 0; i < sprites.length; i++) {
      if (sprites[i] && sprites[i].role === role) out.push(i);
    }
    return out;
  }

  // Clamp an integer into a sensible range.  Used to paper over config
  // values that survived validation but are still outside the hardware
  // comfort zone (e.g. walk_speed = 0 would freeze the player, so the
  // assembler will clamp to 1 rather than emit a broken build).
  function clampInt(v, lo, hi, fallback) {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, n));
  }

  // Deterministic module order.  Later modules see the output of earlier
  // ones, so the order matters: `game` picks the template; `players`
  // then fills in player region values.
  const MODULE_ORDER = ['game', 'players', 'scene',
    'behaviour_walls', 'pickups', 'damage', 'hud', 'doors',
    'dialogue', 'events', 'win_condition'];

  function assemble(state, templateText) {
    if (!templateText || typeof templateText !== 'string') {
      throw new Error('assemble() requires templateText');
    }
    const builder = (state && state.builder) || { modules: {} };
    const modules = builder.modules || {};
    let template = templateText;

    for (const id of MODULE_ORDER) {
      const node = modules[id];
      if (!node || node.enabled === false) continue;
      const def = (window.BuilderModules && window.BuilderModules[id]);
      if (def && typeof def.applyToTemplate === 'function') {
        try {
          const next = def.applyToTemplate(template, node, state);
          if (typeof next === 'string') template = next;
        } catch (e) {
          if (typeof console !== 'undefined') {
            console.error('[builder] module "' + id + '" failed:', e);
          }
        }
      }
      // Recurse into submodules — submodule handlers look up by
      // <parent>.<child> key in the module registry.
      if (node.submodules && typeof node.submodules === 'object') {
        for (const subId of Object.keys(node.submodules)) {
          const subNode = node.submodules[subId];
          if (!subNode || subNode.enabled === false) continue;
          const subDef = (window.BuilderModules &&
            window.BuilderModules[id + '.' + subId]);
          if (subDef && typeof subDef.applyToTemplate === 'function') {
            try {
              const next = subDef.applyToTemplate(template, subNode, state);
              if (typeof next === 'string') template = next;
            } catch (e) {
              if (typeof console !== 'undefined') {
                console.error('[builder] submodule "' + id + '.' + subId +
                  '" failed:', e);
              }
            }
          }
        }
      }
    }

    return stripSlotMarkers(template);
  }

  function _escape(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  window.BuilderAssembler = {
    assemble,
    // exported for modules + tests
    replaceRegion,
    appendToSlot,
    stripSlotMarkers,
    findSpriteByRole,
    findSpritesByRole,
    clampInt,
  };
})();
