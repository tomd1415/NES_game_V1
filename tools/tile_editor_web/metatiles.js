/* Arc E §1 — 16x16 metatile library (E1-1 headless half).
 *
 * A metatile = 2x2 tiles + ONE palette + ONE behaviour id — the same shape the
 * server's `_expand_metatile_bg` (playground_server.py) consumes:
 *
 *     { tiles: [TL, TR, BL, BR], palette, behaviour }
 *
 * This module is the editor-side counterpart: it migrates state, promotes an
 * 8x8 background into metatiles, and expands a 16x16 background back to 8x8
 * (for live preview).  `expand` MIRRORS the server byte-for-byte so the
 * Backgrounds preview matches the built ROM (cross-checked in
 * tools/builder-tests/metatile-lib.mjs).
 *
 * The authoring UI (library panel, mini-editor, stamping, promote button) is
 * NOT here — it lives in index.html (E1-1 proper).  This module is the tested,
 * UI-agnostic logic those controls call.
 */
(function (global) {
  'use strict';

  // TL, TR, BL, BR within a 2x2 block.
  var QUADS = [[0, 0], [0, 1], [1, 0], [1, 1]];

  /* Additive migration.  16x16 backgrounds get their library/map arrays
   * ensured; 8x8 (or tileMode-absent) backgrounds are left UNTOUCHED so
   * existing saves don't change (the server defaults a missing tileMode to
   * '8x8').  Call from each page's migrateState, like migrateBuilderFields. */
  function migrate(state) {
    var bgs = state && state.backgrounds;
    if (!Array.isArray(bgs)) return state;
    for (var i = 0; i < bgs.length; i++) {
      var bg = bgs[i];
      if (!bg || typeof bg !== 'object') continue;
      if (bg.tileMode === '16x16') {
        if (!Array.isArray(bg.metatiles)) bg.metatiles = [];
        if (!Array.isArray(bg.mtmap)) bg.mtmap = [];
      } else if (bg.tileMode !== undefined && bg.tileMode !== '8x8') {
        // Unknown value -> treat as 8x8 (forward-compat safety).
        bg.tileMode = '8x8';
      }
    }
    return state;
  }

  /* Expand a 16x16 metatile background into 8x8 { nametable, behaviour } grids.
   * Mirrors playground_server.py `_expand_metatile_bg` exactly. */
  function expand(bg) {
    var mts = (bg && bg.metatiles) || [];
    var mtmap = (bg && bg.mtmap) || [];
    var mrows = mtmap.length;
    var mcols = 0;
    for (var r0 = 0; r0 < mrows; r0++) {
      if (Array.isArray(mtmap[r0])) mcols = Math.max(mcols, mtmap[r0].length);
    }
    var nrows = mrows * 2, ncols = mcols * 2;
    var nametable = [], behaviour = [];
    for (var r = 0; r < nrows; r++) {
      var ntRow = [], bRow = [];
      for (var c = 0; c < ncols; c++) { ntRow.push({ tile: 0, palette: 0 }); bRow.push(0); }
      nametable.push(ntRow); behaviour.push(bRow);
    }
    for (var mr = 0; mr < mrows; mr++) {
      var row = Array.isArray(mtmap[mr]) ? mtmap[mr] : [];
      for (var mc = 0; mc < row.length; mc++) {
        var mid = row[mc];
        if (!Number.isInteger(mid) || mid < 0 || mid >= mts.length) continue;
        var mt = mts[mid] || {};
        var tiles = mt.tiles || [];
        var pal = (mt.palette | 0) & 3;
        var beh = (mt.behaviour | 0) & 0xFF;
        for (var k = 0; k < 4; k++) {
          var dr = QUADS[k][0], dc = QUADS[k][1];
          var t = (k < tiles.length ? (tiles[k] | 0) : 0) & 0xFF;
          nametable[mr * 2 + dr][mc * 2 + dc] = { tile: t, palette: pal };
          behaviour[mr * 2 + dr][mc * 2 + dc] = beh;
        }
      }
    }
    return { nametable: nametable, behaviour: behaviour };
  }

  /* Promote an 8x8 background to 16x16 metatiles (one-way; the pupil opts in).
   * Scans the nametable in 2x2 blocks, dedups them into a library, and builds
   * the id map.  Palette + behaviour are taken from each block's TOP-LEFT cell
   * — matching the NES 16x16 attribute granularity the server already
   * downsamples to, so a promoted background renders IDENTICALLY to the
   * original (the §1.2 "correct by construction": the other 3 cells' palettes
   * were already being discarded at emit).
   *
   * Mutates + returns `bg`.  Keeps bg.nametable/bg.behaviour as a downgrade
   * fallback (§1.5); the server regenerates them from mtmap on build. */
  function promote(bg) {
    var nt = (bg && bg.nametable) || [];
    var beh = (bg && bg.behaviour) || [];
    var rows = nt.length;
    var cols = (nt[0] && nt[0].length) || 0;
    var mrows = Math.floor(rows / 2), mcols = Math.floor(cols / 2);

    function cellTile(r, c) { var cell = nt[r] && nt[r][c]; return (cell && (cell.tile | 0)) || 0; }
    function cellPal(r, c) { var cell = nt[r] && nt[r][c]; return cell ? ((cell.palette | 0) & 3) : 0; }
    function cellBeh(r, c) { var row = beh[r]; return (row && typeof row[c] === 'number') ? ((row[c] | 0) & 0xFF) : 0; }

    var metatiles = [], mtmap = [], index = Object.create(null);
    for (var mr = 0; mr < mrows; mr++) {
      var outRow = [];
      for (var mc = 0; mc < mcols; mc++) {
        var r = mr * 2, c = mc * 2;
        var tiles = [cellTile(r, c), cellTile(r, c + 1), cellTile(r + 1, c), cellTile(r + 1, c + 1)];
        var palette = cellPal(r, c);      // TL palette == the attribute quad
        var behaviour = cellBeh(r, c);    // TL behaviour
        var sig = tiles.join(',') + '|' + palette + '|' + behaviour;
        var id = index[sig];
        if (id === undefined) {
          id = metatiles.length;
          metatiles.push({ tiles: tiles, palette: palette, behaviour: behaviour });
          index[sig] = id;
        }
        outRow.push(id);
      }
      mtmap.push(outRow);
    }
    bg.tileMode = '16x16';
    bg.metatiles = metatiles;
    bg.mtmap = mtmap;
    return bg;
  }

  global.MetatileLib = { migrate: migrate, expand: expand, promote: promote };
})(typeof window !== 'undefined' ? window : globalThis);
