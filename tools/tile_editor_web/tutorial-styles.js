/*
 * Tutorial content for the other four game styles (the platformer "first-game"
 * lives in tutorial-first-game.js). Same shape + rules as that file: flat,
 * id-keyed, declarative-check steps; ANY light edit passes. The tutorial's
 * starter already sets the game type, so there is no "choose the style" step.
 * Checks diff against a PER-STEP baseline (studio-tutorial.js re-snapshots each
 * step), so sequential "add/paint more" steps each need a fresh action.
 *
 * Each block below is one tutorial; edit / add / remove steps freely.
 */
(function (global) {
  'use strict';
  global.STUDIO_TUTORIALS = global.STUDIO_TUTORIALS || {};

  // --- shared step builders -------------------------------------------------
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
  function buildStep(id, title, instruction, why, hint, icon) {
    return {
      id: id, chapter: 'Chapter 3 — Build the world', mode: 'world', icon: icon || '🧱',
      title: title, instruction: instruction, why: why,
      finishedEnough: 'About three more blocks is enough.',
      hint: hint, check: { type: 'behaviourAdded', params: { min: 3 } },
    };
  }
  function paintType(id, name, min, title, instruction, why, hint, icon) {
    return {
      id: id, chapter: 'Chapter 3 — Build the world', mode: 'world', icon: icon || '🧱',
      title: title, instruction: instruction, why: why,
      finishedEnough: 'A couple is enough.',
      hint: hint, check: { type: 'behaviourTypePainted', params: { name: name, min: min || 1 } },
    };
  }
  function placeEnemy(icon) {
    return {
      id: 'place-enemy', chapter: 'Chapter 3 — Build the world', mode: 'world', icon: icon || '👾',
      title: 'Add a character',
      instruction: 'Use the 🧍 Place tool in World to drop a character into your level.',
      why: 'A game needs a bit of life or danger to feel exciting.',
      finishedEnough: 'Dropping one character is enough. Put it away from the start.',
      hint: 'In World, pick the 🧍 Place tool, then click an empty spot to drop a character.',
      check: { type: 'sceneInstanceAdded', params: { min: 1 } },
    };
  }
  var addRoom = {
    id: 'add-room', chapter: 'Chapter 3 — Build the world', mode: 'world', icon: '🚪',
    title: 'Add a second room',
    instruction: 'In World, press "+ New" in the Backgrounds list to add another room.',
    why: 'More rooms make a bigger world to explore.',
    finishedEnough: 'Adding one more room is enough — you can decorate it later.',
    hint: 'Look for the Backgrounds list in the World dock and press "+ New".',
    check: { type: 'backgroundAdded' },
  };
  var dialogueStep = {
    id: 'write-dialogue', chapter: 'Chapter 4 — How it plays', mode: 'rules', icon: '💬',
    title: 'Change what a character says',
    instruction: 'Open Rules, find the Dialogue words, and change the message.',
    why: 'Your characters can say anything — make it yours.',
    finishedEnough: 'One new short sentence is plenty.',
    hint: 'In Rules, look for the Dialogue module and edit the text box.',
    check: { type: 'dialogueChanged' },
  };
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
      nameHero('hero', '🍄'), recolour, drawTile,
      buildStep('build-ground', 'Add more ground', 'Open World and paint a few more ground blocks.',
        'Your hero needs ground to run and jump on.', 'In World, pick the ground tile and click near the floor.', '🧱'),
      paintType('add-brick', 'platform', 2, 'Add some bricks', 'Paint a couple of brick blocks up in the air.',
        'Bricks are the SMB blocks you bump and stand on.', 'Pick the brick tile, then click squares above the ground.', '🟫'),
      placeEnemy('👾'),
      rulesStep('Change the run speed', 'Open Rules and change the speed (1–5).',
        'SMB is all about how fast you can run and jump.', 'In Rules, change the Speed number.', '🏃'),
      playStep,
    ],
  };

  global.STUDIO_TUTORIALS['topdown-first'] = {
    id: 'topdown-first', title: 'Make a top-down adventure', minLevel: 'maker',
    intro: 'A top-down game where you walk around rooms. Make it yours, then play it.',
    steps: [
      nameHero('hero', '🧭'), recolour, drawTile,
      buildStep('build-walls', 'Build more walls', 'Open World and paint a few more wall blocks around the room.',
        'Walls keep your hero inside the room.', 'In World, pick a solid block and click to add walls.', '🧱'),
      addRoom,
      placeEnemy('👾'),
      dialogueStep,
      rulesStep('Change the move speed', 'Open Rules and change how fast the hero moves.',
        'A top-down game is about exploring — find a speed that feels right.', 'In Rules, change the speed setting.', '⚙️'),
      playStep,
    ],
  };

  global.STUDIO_TUTORIALS['runner-first'] = {
    id: 'runner-first', title: 'Make an auto-runner', minLevel: 'maker',
    intro: 'The screen moves by itself and your hero jumps. Make it yours, then play it.',
    steps: [
      nameHero('hero', '🏃'), recolour, drawTile,
      buildStep('extend-floor', 'Extend the floor', 'Open World and paint a few more ground blocks along the bottom.',
        'The runner needs a safe path before the danger.', 'In World, pick the ground tile and click along the floor.', '🗺️'),
      paintType('add-platform', 'platform', 2, 'Add a platform', 'Paint a couple of brick platforms to jump onto.',
        'A runner is a rhythm of jumps between platforms.', 'Pick the brick tile and click above the floor.', '🟫'),
      paintType('add-spike', 'spike', 1, 'Add a spike', 'Paint one spike after the gap for the hero to jump over.',
        'A little danger makes the run exciting — but keep it fair.', 'Pick the spike tile and place ONE, not at the very start.', '⚠️'),
      rulesStep('Change the scroll speed', 'Open Rules and change how fast the screen scrolls.',
        'Slower is easier; faster is a bigger challenge.', 'In Rules, change the scroll / autoscroll speed.', '🏃'),
      playStep,
    ],
  };

  global.STUDIO_TUTORIALS['racer-first'] = {
    id: 'racer-first', title: 'Make a racing game', minLevel: 'maker',
    intro: 'A top-down racer: steer, accelerate and brake around a track. Make it yours, then play it.',
    steps: [
      nameHero('car', '🏎️'), recolour, drawTile,
      buildStep('widen-track', 'Widen the track', 'Open World and paint a few more road-edge blocks to shape the track.',
        'A wider track is easier to drive on to start.', 'In World, pick the road-edge (solid) tile and click to extend it.', '🛣️'),
      paintType('add-checkpoint', 'trigger', 1, 'Add a checkpoint', 'Paint a checkpoint tile across the road.',
        'A checkpoint stops racers cutting the corner to cheat a lap.', 'Pick the checkpoint tile and paint it across the road.', '🚩'),
      rulesStep('Tune the car', 'Open Rules and change the top speed or the number of laps.',
        'A slower car is easier to control for a first race.', 'In Rules, change the top speed (or laps).', '⚙️'),
      playStep,
    ],
  };
})(typeof window !== 'undefined' ? window : this);
