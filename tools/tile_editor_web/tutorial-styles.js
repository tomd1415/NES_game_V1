/*
 * Tutorial content for the other four game styles (the platformer "first-game"
 * lives in tutorial-first-game.js). Same shape + rules as that file: flat,
 * id-keyed, declarative-check steps; ANY light edit passes. The tutorial's
 * starter already sets the game type, so there is no "choose the style" step —
 * the pupil just makes the game their own, then plays it.
 *
 * Each block below is one tutorial; edit / add / remove steps freely.
 */
(function (global) {
  'use strict';
  global.STUDIO_TUTORIALS = global.STUDIO_TUTORIALS || {};

  // Shared step builders keep the four tutorials consistent and short.
  function nameHero(word, icon) {
    return {
      id: 'name-hero', chapter: 'Chapter 1 — Your ' + word, mode: 'chars', icon: icon || '🦸',
      title: 'Name your ' + word,
      instruction: 'Open Chars and give your ' + word + ' a new name.',
      why: 'It is your game, so your ' + word + ' can be called anything you like.',
      finishedEnough: 'Any new name counts. It does not need to be clever.',
      hint: 'In Chars, click the ' + word + ', then type a name in the Name box.',
      check: { type: 'spriteRenamed' },
    };
  }
  var recolour = {
    id: 'recolour', chapter: 'Chapter 2 — Make it yours', mode: 'pals', icon: '🎨',
    title: 'Change a colour',
    instruction: 'Open Pals and change one colour in a palette.',
    why: 'Colour is the fastest way to make the game feel like yours.',
    finishedEnough: 'Changing any one colour is enough.',
    hint: 'In Pals, click a colour swatch, then pick a different colour.',
    check: { type: 'paletteChanged' },
  };
  var drawTile = {
    id: 'draw-tile', chapter: 'Chapter 2 — Make it yours', mode: 'tiles', icon: '🧩',
    title: 'Draw on a tile',
    instruction: 'Open Tiles and draw a few pixels on any tile.',
    why: 'Tiles are the little pictures your world is built from.',
    finishedEnough: 'A few new pixels on any tile is plenty.',
    hint: 'In Tiles, pick a tile, choose a colour, and click the big square to draw.',
    check: { type: 'tileChanged' },
  };
  function buildStep(title, instruction, why, hint, icon) {
    return {
      id: 'build', chapter: 'Chapter 3 — Build the world', mode: 'world', icon: icon || '🧱',
      title: title, instruction: instruction, why: why,
      finishedEnough: 'About three more blocks is enough.',
      hint: hint, check: { type: 'behaviourAdded', params: { min: 3 } },
    };
  }
  function rulesStep(title, instruction, why, hint, icon) {
    return {
      id: 'change-rules', chapter: 'Chapter 4 — How it plays', mode: 'rules', icon: icon || '⚙️',
      title: title, instruction: instruction, why: why,
      finishedEnough: 'Changing any one setting counts. You can always change it back.',
      hint: hint, check: { type: 'builderChanged' },
    };
  }
  var playStep = {
    id: 'play-it', chapter: 'Chapter 5 — Try it', mode: null, icon: '🎮', flashSelector: '#btn-play',
    title: 'Play your game',
    instruction: 'Press the ▶ Play button at the top and watch your game run.',
    why: 'Testing is how you find out what your game actually does.',
    finishedEnough: 'Pressing Play once is enough. Close the game window when you are done.',
    hint: 'The ▶ Play button is in the top bar. It builds a real NES game and runs it.',
    check: { type: 'played' },
  };

  global.STUDIO_TUTORIALS['smb-first'] = {
    id: 'smb-first', title: 'Make an SMB-style game', minLevel: 'maker',
    intro: 'A faster platform game with run + jump, blocks and coins. Make it yours, then play it.',
    steps: [
      nameHero('hero', '🍄'),
      recolour, drawTile,
      buildStep('Add more blocks', 'Open World and paint a few more ground or brick blocks.',
        'Your hero needs ground to run and jump on.', 'In World, pick a block tile and click near the floor.', '🧱'),
      rulesStep('Change the run speed', 'Open Rules and change the speed (1–5).',
        'SMB is all about how fast you can run and jump.', 'In Rules, change the Speed number.', '🏃'),
      playStep,
    ],
  };

  global.STUDIO_TUTORIALS['topdown-first'] = {
    id: 'topdown-first', title: 'Make a top-down adventure', minLevel: 'maker',
    intro: 'A top-down game where you walk around a room. Make it yours, then play it.',
    steps: [
      nameHero('hero', '🧭'),
      recolour, drawTile,
      buildStep('Build the walls', 'Open World and paint a few more wall blocks around the room.',
        'Walls keep your hero inside the room.', 'In World, pick a solid block and click to add walls.', '🧱'),
      rulesStep('Change the move speed', 'Open Rules and change how fast the hero moves.',
        'A top-down game is about exploring — find a speed that feels right.', 'In Rules, change the speed setting.', '⚙️'),
      playStep,
    ],
  };

  global.STUDIO_TUTORIALS['runner-first'] = {
    id: 'runner-first', title: 'Make an auto-runner', minLevel: 'maker',
    intro: 'The screen moves by itself and your hero jumps. Make it yours, then play it.',
    steps: [
      nameHero('hero', '🏃'),
      recolour, drawTile,
      buildStep('Add a platform', 'Open World and paint a few more platform blocks to jump to.',
        'A runner is a rhythm of jumps between platforms.', 'In World, pick a platform tile and click above the floor.', '🟫'),
      rulesStep('Change the scroll speed', 'Open Rules and change how fast the screen scrolls.',
        'Slower is easier; faster is a bigger challenge.', 'In Rules, change the scroll / autoscroll speed.', '🏃'),
      playStep,
    ],
  };

  global.STUDIO_TUTORIALS['racer-first'] = {
    id: 'racer-first', title: 'Make a racing game', minLevel: 'maker',
    intro: 'A top-down racer: steer, accelerate and brake around a track. Make it yours, then play it.',
    steps: [
      nameHero('car', '🏎️'),
      recolour, drawTile,
      buildStep('Add more track', 'Open World and paint a few more road blocks to widen the track.',
        'A wide track is easier to drive on to start.', 'In World, pick the road/track tile and click to extend it.', '🛣️'),
      rulesStep('Change the top speed', 'Open Rules and change the car’s top speed.',
        'A slower car is easier to control for a first race.', 'In Rules, change the top speed (or laps).', '⚙️'),
      playStep,
    ],
  };
})(typeof window !== 'undefined' ? window : this);
