/*
 * First Game tutorial — CONTENT ONLY (the runtime is studio-tutorial.js).
 *
 * This is the manifest the design doc calls for: a flat, ordered array of
 * steps with STABLE ids and DECLARATIVE checks. To add, remove, or reorder a
 * step, just edit this array — nothing references a step by position, and pupil
 * progress is keyed by the step `id`, so reordering never corrupts a save.
 *
 * Each step:
 *   id             stable slug (progress + checks key on this)
 *   chapter        short group label shown above the title
 *   mode           the Studio mode "Show me" jumps to (world/chars/tiles/pals/rules)
 *   icon           a big emoji shown on the step card (a friendly visual)
 *   flashSelector  (optional) CSS selector of the REAL button/icon to flash on
 *                  "Show me"; defaults to the mode-rail button for `mode`.
 *   title          the quest name
 *   instruction    what to do, one plain sentence
 *   why            one sentence of motivation
 *   finishedEnough plain definition of "done" (for pupils who over-perfect)
 *   hint           revealed by the Hint button
 *   check          { type, params? } — resolved by the CHECKS registry in
 *                  studio-tutorial.js. Every check accepts ANY light edit; none
 *                  demand the pupil match an exact target.
 *
 * The tutorial's `minLevel` unlocks the areas it uses (Tiles/Pals are Maker-
 * level) when it starts, so no step ever points at a locked mode.
 */
(function (global) {
  'use strict';

  var STEPS = [
    {
      id: 'name-hero',
      chapter: 'Chapter 1 — Your hero',
      mode: 'chars',
      icon: '🦸',
      title: 'Name your hero',
      instruction: 'Open Chars and give your hero a new name.',
      why: 'It is your game, so your hero can be called anything you like.',
      finishedEnough: 'Any name that is not "Hero" counts. It does not need to be clever.',
      hint: 'In Chars, click the hero sprite, then type a name in the Name box.',
      check: { type: 'spriteRenamed' },
    },
    {
      id: 'recolour',
      chapter: 'Chapter 2 — Make it yours',
      mode: 'pals',
      icon: '🎨',
      title: 'Change a colour',
      instruction: 'Open Pals and change one colour in a palette.',
      why: 'Colour is the fastest way to make the game feel like yours.',
      finishedEnough: 'Changing any one colour is enough.',
      hint: 'In Pals, click a colour swatch, then pick a different colour.',
      check: { type: 'paletteChanged' },
    },
    {
      id: 'draw-tile',
      chapter: 'Chapter 2 — Make it yours',
      mode: 'tiles',
      icon: '🧩',
      title: 'Draw on a tile',
      instruction: 'Open Tiles and draw a few pixels on any tile.',
      why: 'Tiles are the little pictures your world is built from.',
      finishedEnough: 'A few new pixels on any tile is plenty. It need not look perfect.',
      hint: 'In Tiles, pick a tile, choose a colour, and click on the big square to draw.',
      check: { type: 'tileChanged' },
    },
    {
      id: 'build-floor',
      chapter: 'Chapter 3 — Build the world',
      mode: 'world',
      icon: '🗺️',
      title: 'Add more ground',
      instruction: 'Open World and paint a few more ground blocks for your hero.',
      why: 'Your hero needs somewhere safe to stand and walk.',
      finishedEnough: 'About three more ground blocks is enough.',
      hint: 'In World, choose the ground tile, then click empty squares near the floor.',
      check: { type: 'groundAdded', params: { min: 3 } },
    },
    {
      id: 'change-rules',
      chapter: 'Chapter 4 — How it plays',
      mode: 'rules',
      icon: '⚙️',
      title: 'Change how it plays',
      instruction: 'Open Rules and change one number — try the jump height or speed.',
      why: 'Small number changes can make the game feel completely different.',
      finishedEnough: 'Changing any one setting counts. You can always change it back.',
      hint: 'In Rules, move a slider or change a number, e.g. jump height.',
      check: { type: 'builderChanged' },
    },
    {
      id: 'play-it',
      chapter: 'Chapter 5 — Try it',
      mode: null,
      icon: '🎮',
      flashSelector: '#btn-play',
      title: 'Play your game',
      instruction: 'Press the ▶ Play button at the top and watch your game run.',
      why: 'Testing is how you find out what your game actually does.',
      finishedEnough: 'Pressing Play once is enough. Close the game window when you are done.',
      hint: 'The ▶ Play button is in the top bar. It builds a real NES game and runs it.',
      check: { type: 'played' },
    },
  ];

  global.STUDIO_TUTORIALS = global.STUDIO_TUTORIALS || {};
  global.STUDIO_TUTORIALS['first-game'] = {
    id: 'first-game',
    title: 'Make your first game',
    // Unlock the areas this tutorial visits (Tiles + Pals are Maker-level) so
    // no step ever points the pupil at a locked mode.
    minLevel: 'maker',
    intro: 'Follow one small step at a time. Your game is already made — you will '
      + 'make it yours, then play it. You can press Show me any time.',
    steps: STEPS,
  };
})(typeof window !== 'undefined' ? window : this);
