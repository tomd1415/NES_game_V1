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

  // --- The long "from scratch" tutorial: blank project → complete game -------
  function S(id, mode, icon, title, instruction, why, hint, check, finishedEnough) {
    return { id: id, chapter: '', mode: mode, icon: icon, title: title, instruction: instruction, why: why, finishedEnough: finishedEnough || 'Give it a go — it does not need to be perfect.', hint: hint, check: check };
  }
  var SCRATCH = [
    // Chapter 1 — your hero
    S('name-hero', 'chars', '🦸', 'Name your hero', 'Open Chars and give your hero a name.', 'Every game starts with a main character.', 'In Chars, click the hero, then type a name in the Name box.', { type: 'spriteRenamed' }, 'Any name is fine.'),
    S('draw-hero', 'tiles', '🎨', 'Draw your hero', 'Open Tiles and draw a face and body on your hero.', 'Right now your hero is blank — bring it to life.', 'In Tiles, pick a colour and click on the big square to draw. Your hero uses the first few tiles.', { type: 'tileChanged' }, 'A few pixels is a great start.'),
    S('colour-hero', 'pals', '🌈', 'Choose your colours', 'Open Pals and change a colour in a palette.', 'Colour makes your hero yours.', 'In Pals, click a colour swatch and pick a new colour.', { type: 'paletteChanged' }, 'One colour change is enough.'),
    // Chapter 2 — build the ground
    S('draw-ground', 'tiles', '🟫', 'Draw a ground tile', 'Open Tiles, pick a NEW tile, and draw some grass or dirt on it.', 'The world is built from little tile pictures.', 'In Tiles, click a blank tile in the list first, then draw on it.', { type: 'tileChanged' }, 'A simple pattern is plenty.'),
    S('paint-floor', 'world', '🗺️', 'Paint a floor', 'Open World and stamp your ground tile along the bottom of the screen.', 'Your hero needs somewhere to stand.', 'In World, pick the Stamp tool and your ground tile, then click along the bottom row.', { type: 'nametablePainted', params: { min: 8 } }, 'A row across the bottom is enough.'),
    S('make-solid', 'world', '🧱', 'Make the floor solid', 'Use the Type tool in World to mark the floor as Solid ground.', 'A picture is not solid until its Type says so — this is the most important idea!', 'In World open More tools → the ⛰ Type tool, pick Solid ground, then click your floor tiles.', { type: 'behaviourTypePainted', params: { name: 'solid_ground', min: 8 } }, 'Mark the whole floor solid.'),
    S('play-1', null, '🎮', 'Try it!', 'Press the ▶ Play button and watch your hero stand on the floor.', 'Test early and often — it is the best way to learn.', 'The ▶ Play button is in the top bar.', { type: 'played' }, 'One quick test.'),
    // Chapter 3 — platforms
    S('draw-brick', 'tiles', '🟧', 'Draw a brick tile', 'Open Tiles, pick another blank tile, and draw a brick or block.', 'Platforms need their own tile.', 'In Tiles, click a new blank tile, then draw on it.', { type: 'tileChanged' }),
    S('build-platform', 'world', '🧗', 'Build a platform', 'Stamp a few brick tiles up in the air in World.', 'Platforms turn a flat floor into a jumping game.', 'Pick your brick tile and click a few squares above the floor.', { type: 'nametablePainted', params: { min: 3 } }, 'Two or three bricks is enough.'),
    S('platform-type', 'world', '🪜', 'Make it a platform', 'Use the Type tool to mark those bricks as Platform.', 'Then your hero can land on them.', 'Type tool → Platform, then click the bricks you placed.', { type: 'behaviourTypePainted', params: { name: 'platform', min: 3 } }),
    // Chapter 4 — an enemy
    S('create-enemy', 'chars', '👾', 'Create an enemy', 'In Chars press "+ New" and set the new character\'s Role to Enemy.', 'A game needs a bit of danger.', 'In Chars, "+ New", then choose Enemy in the Role dropdown.', { type: 'spriteRoleAdded', params: { role: 'enemy' } }),
    S('draw-enemy', 'tiles', '🎨', 'Draw your enemy', 'Open Tiles and draw your enemy.', 'Make it look scary or silly — your choice.', 'Draw on your enemy\'s tiles in Tiles.', { type: 'tileChanged' }),
    S('place-enemy', 'world', '📍', 'Place your enemy', 'Use the 🧍 Place tool in World to drop your enemy into the level.', 'Put it away from where the hero starts.', 'World → 🧍 Place tool → click an empty spot.', { type: 'sceneInstanceAdded', params: { min: 1 } }),
    S('add-hearts', 'rules', '❤️', 'Add hearts', 'Open Rules and turn on the Damage / hearts feature.', 'Now the enemy can actually hurt the hero.', 'In Rules, find Damage (hearts) and switch it on.', { type: 'moduleEnabledChanged', params: { id: 'damage' } }),
    // Chapter 5 — a reward
    S('create-pickup', 'chars', '🪙', 'Create a coin', 'In Chars press "+ New" and set the Role to Pickup.', 'Something to collect gives a reason to explore.', 'Chars → "+ New" → Role: Pickup.', { type: 'spriteRoleAdded', params: { role: 'pickup' } }),
    S('place-pickup', 'world', '💎', 'Place your coin', 'Use the 🧍 Place tool to put your coin somewhere to reach.', 'Coins guide the player along the best route.', 'World → 🧍 Place tool → click above a platform.', { type: 'sceneInstanceAdded', params: { min: 1 } }),
    // Chapter 6 — a goal
    S('paint-goal', 'world', '🏁', 'Paint a goal', 'Use the Type tool to mark a tile as Trigger — this is the finish.', 'Every game needs a way to win.', 'World → Type tool → Trigger, then click a tile at the end of your level.', { type: 'behaviourTypePainted', params: { name: 'trigger', min: 1 } }),
    S('turn-on-win', 'rules', '🏆', 'Turn on winning', 'Open Rules and turn on the Win condition.', 'Reaching the trigger tile will now win the game.', 'In Rules, switch on Win condition (reach a trigger tile).', { type: 'moduleEnabledChanged', params: { id: 'win_condition' } }),
    // Chapter 7 — tune + finish
    S('change-jump', 'rules', '⚙️', 'Tune the jump', 'Open Rules and change the jump height or speed.', 'Small number changes change how the game feels.', 'In Rules, change a number like jump height.', { type: 'builderChanged' }),
    S('play-final', null, '🎉', 'Play your finished game!', 'Press ▶ Play and enjoy the game you built from nothing.', 'You drew it, built it, and set the rules — brilliant.', 'Press ▶ Play. Try to reach your goal tile to win!', { type: 'played' }, 'Play it through once.'),
  ];
  SCRATCH.forEach(function (st, i) { if (!st.chapter) st.chapter = 'Step ' + (i + 1) + ' of ' + SCRATCH.length; });
  global.STUDIO_TUTORIALS['scratch'] = {
    id: 'scratch', title: 'Build a game from scratch', minLevel: 'maker',
    intro: 'Start with a blank screen and build a whole game, one small step at a time. You can leave and come back whenever you like.',
    steps: SCRATCH,
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
