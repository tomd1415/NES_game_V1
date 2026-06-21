// Shared "blank starter project" factory.
//
// Backgrounds / Sprites / Behaviour each grow their own createDefaultState();
// the Builder, Code and Audio pages historically had none, which is why they
// could not offer a "New project" button.  This module gives every page one
// canonical, complete-and-valid blank project so New works everywhere and the
// menus match.  The shape mirrors the Sprites page's createDefaultState (the
// most complete one) so a project made here loads cleanly on every page.
(function (global) {
  const STATE_VERSION = 1;
  const NUM_TILES = 256;
  const SCREEN_W = 32;
  const SCREEN_H = 30;

  function emptyTile() {
    return { name: '', pixels: Array.from({ length: 8 }, () => [0, 0, 0, 0, 0, 0, 0, 0]) };
  }
  function defaultBgPalettes() {
    return [
      { slots: [0x29, 0x19, 0x07] },
      { slots: [0x30, 0x00, 0x2D] },
      { slots: [0x27, 0x17, 0x07] },
      { slots: [0x31, 0x21, 0x01] },
    ];
  }
  function defaultSpritePalettes() {
    return [
      { slots: [0x27, 0x17, 0x30] },
      { slots: [0x1A, 0x30, 0x0A] },
      { slots: [0x30, 0x16, 0x00] },
      { slots: [0x16, 0x36, 0x06] },
    ];
  }
  function emptyNametable() {
    return Array.from({ length: SCREEN_H }, () =>
      Array.from({ length: SCREEN_W }, () => ({ tile: 0, palette: 0 })));
  }
  function emptyBackground(name) {
    return { name: name || 'background', dimensions: { screens_x: 1, screens_y: 1 }, nametable: emptyNametable() };
  }

  // opts.name      — project name (default 'untitled')
  // opts.template  — 'platformer' | 'topdown' (sets state.template + movement)
  // opts.now       — ISO timestamp for metadata (tests pass a fixed value)
  function create(opts) {
    opts = opts || {};
    const template = opts.template === 'topdown' ? 'topdown' : 'platformer';
    const now = (typeof opts.now === 'string') ? opts.now : new Date().toISOString();
    return {
      version: STATE_VERSION,
      name: opts.name || 'untitled',
      template,
      movement: template === 'topdown' ? 'fourway' : 'platformer',
      universal_bg: 0x21,
      bg_palettes: defaultBgPalettes(),
      sprite_palettes: defaultSpritePalettes(),
      sprite_tiles: Array.from({ length: NUM_TILES }, () => emptyTile()),
      bg_tiles: Array.from({ length: NUM_TILES }, () => emptyTile()),
      backgrounds: [emptyBackground('background')],
      selectedBgIdx: 0,
      sprites: [],
      animations: [],
      animation_assignments: { walk: null, jump: null, attack: null },
      nextAnimationId: 1,
      metadata: { created: now, modified: now },
    };
  }

  global.DefaultState = { create };
})(typeof window !== 'undefined' ? window : globalThis);
