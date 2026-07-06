window.TUTORIAL_QUESTS = [
  {
    id: "comfort",
    chapter: "Chapter 0",
    title: "Make the screen comfortable",
    instruction: "Choose a text size or press This feels OK.",
    why: "The Studio should feel easy to look at before you build.",
    image: "assets/ground-quest.svg",
    target: "#comfort-controls",
    hint: "Look along the top bar. You can make text bigger or switch contrast.",
    check: "comfort"
  },
  {
    id: "hero",
    chapter: "Chapter 1",
    title: "Choose your hero",
    instruction: "Open CHARS and set the hero role to Player.",
    why: "The game needs to know which character you control.",
    image: "assets/ground-quest.svg",
    target: "#mode-chars",
    hint: "Open CHARS. Then press Set Hero as Player.",
    check: "hero"
  },
  {
    id: "ground",
    chapter: "Chapter 2",
    title: "Paint safe ground",
    instruction: "In WORLD, paint at least 8 ground blocks under the hero.",
    why: "Your hero needs somewhere safe to land.",
    image: "assets/ground-quest.svg",
    target: "#game-grid",
    hint: "Use Stamp ground. Click cells near the bottom of the TV.",
    check: "ground"
  },
  {
    id: "solid",
    chapter: "Chapter 2",
    title: "Make ground solid",
    instruction: "Use Set solid type on the ground you painted.",
    why: "A floor picture is not solid until its type says Solid.",
    image: "assets/ground-quest.svg",
    target: "#game-grid",
    hint: "Choose Set solid type, then click the ground blocks.",
    check: "solid"
  },
  {
    id: "play",
    chapter: "Chapter 3",
    title: "Test the game",
    instruction: "Open PLAY and press Run test.",
    why: "Testing shows what your game actually does.",
    image: "assets/ground-quest.svg",
    target: "#mode-play",
    hint: "If the hero falls, check that the ground is solid.",
    check: "play"
  },
  {
    id: "jump",
    chapter: "Optional challenge",
    title: "Change the jump",
    instruction: "Open RULES and change jump height once.",
    why: "Small number changes can make the game feel different.",
    image: "assets/ground-quest.svg",
    target: "#mode-rules",
    hint: "Try a small change first. You can always reset.",
    check: "jump"
  }
];

