# Quest tutorials for NES Studio

Planning document for the Studio tutorial system. Written on 2026-07-05.

Status: planning only. The current Studio is not feature complete, and several
tutorial steps below are marked `[CURRENT GUESS]` where they depend on features
that are planned, partly built, or likely to change.

Audience: 11-year-old pupils at a specialist school for autism and ADHD. The
tutorials must assume no previous game-making, programming, pixel-art, or NES
knowledge.

## Goals

Each tutorial should guide a pupil from a new project to a small playable game
in one style:

- Platformer
- SMB-style platformer
- Top-down adventure
- Auto-runner
- Top-down racer

The tutorial should be open on one side of the Studio while the pupil works on
the other side. It should teach by doing, with calm step-by-step quests,
illustrations, optional audio, large-text support, and checks that notice when a
pupil is stuck or has probably made a mistake.

The tutorials are not a separate manual. They are the main beginner learning
path for the Studio.

## Design principles for this audience

Use the same structure every time. Predictability lowers stress and helps pupils
build independence.

- One visible task at a time.
- Short sentences.
- Plain words first, NES words second.
- No timers.
- No surprise sounds.
- No flashing or fast animation in tutorial UI.
- Never say "wrong". Say "not yet", "nearly", or "try this next".
- Let the pupil pause, replay audio, go back one step, or skip an optional
  challenge.
- Give the pupil a finished thing early: press Play in the first few minutes.
- Separate "must do" from "make it yours".
- Keep optional harder tasks clearly optional.
- Always show where the work is saved and how to recover.

Recommended quest-card text size:

- Title: 4-7 words.
- Main instruction: 1 action, under 25 words.
- Why it matters: optional, under 18 words.
- Hint: under 20 words.
- Success message: short and specific.

Example:

```text
Quest: Paint safe ground
Do this: In WORLD, paint a line of ground blocks under your hero.
Why: Your hero needs somewhere safe to land.
Check: I can see ground below the player.
Success: Good. Your hero has a floor.
```

## Tutorial layout

The Studio already has the right overall shape: mode rail, dock, TV, quest log,
and Needs attention. The tutorial system should extend that instead of adding
modal pop-ups.

Recommended layout:

```text
left: mode rail + dock       centre: TV/workspace       right: tutorial panel
```

The right panel should have two stacked areas:

- `Quest path`: the current tutorial chapter and quest cards.
- `Needs attention`: validator messages and tutorial-specific guidance.

Each quest card should include:

- Step number.
- Short title.
- One action.
- Illustration thumbnail or animation.
- `Show me` button that highlights the correct place in the Studio.
- `Check my work` button.
- Optional `Read aloud` button.
- Optional `Make it easier` hint.
- Optional `Challenge` after the required check passes.

Do not force the pupil to read a long panel before acting. The panel should
behave like a calm companion: short instruction, visual cue, then immediate
work.

## Accessibility and sensory options

The existing shared accessibility module supports text size 100%, 125%, 150%,
175% and high-contrast theme. The tutorial layer should use those settings and
add tutorial-specific options.

Tutorial options:

- Large tutorial text: inherits site text size, with a "picture first" layout
  at 150% and 175%.
- Audio narration: off by default; pupil chooses when to play.
- Captions: always visible when audio is available.
- Reduced motion: disables animated arrows and uses static highlights.
- Sound effects in tutorial UI: off by default.
- Read current step again.
- Hide optional challenges.
- Teacher can lock the tutorial to Beginner, Maker, or Advanced tools.

Audio design:

- Calm voice.
- One instruction per clip.
- No background music behind narration.
- Use the same wording as the visible text.
- Offer slower playback if practical.

## Illustration plan

Each quest should have one small visual. The visual is not decoration; it shows
the exact target.

Illustration types:

- Annotated screenshot: "click WORLD", "paint here", "choose Player role".
- Before/after tile grid.
- Tiny 16x16 or 32x32 diagram of an NES concept.
- Short silent animation for drag/paint actions.
- End-of-chapter game screenshot.

Illustration rules:

- Use the actual Studio UI where possible.
- Use thick outlines and high contrast.
- Avoid busy full-screen screenshots.
- Crop tightly to the relevant panel or tool.
- Include text labels only when they match the current UI exactly.
- Keep a static fallback for every animation.

Proposed asset paths:

```text
docs/design/assets/tutorials/<style>/<chapter>-<quest>.png
docs/design/assets/tutorials/<style>/<chapter>-<quest>.webp
tools/tile_editor_web/tutorials/<style>/assets/<chapter>-<quest>.png
tools/tile_editor_web/tutorials/<style>/audio/<chapter>-<quest>.mp3
```

The docs asset can be a planning/mockup copy. The web asset should be the
runtime version.

## Optional starter kits

Each tutorial should work in two ways:

1. `Start from blank`: the pupil draws or chooses everything.
2. `Use starter kit`: the tutorial provides tiles, palettes, characters, and
   sounds, but the pupil still places and configures the game.

Starter kits should not load a finished game. They should load ingredients.

Each kit should include:

- Background tile table.
- Sprite tile table.
- At least one player character.
- At least one enemy or obstacle.
- One pickup or goal item.
- One sound effect pack.
- One short music loop.
- Palettes chosen for clear contrast.
- A printable one-page tile legend for teachers.

Starter kits by style:

| Style | Kit name | Contents |
| --- | --- | --- |
| Platformer | `platformer-basic-kit` | ground, platform, ladder, door, player, enemy, star, heart |
| SMB-style | `block-run-kit` | ground, brick, question block, used block, coin, mushroom/powerup, player, enemy |
| Top-down | `key-quest-kit` | floor, wall, path, door, key, player, NPC, enemy |
| Auto-runner | `jump-beat-kit` | floor, floating platform, spike, coin, player, checkpoint marker |
| Racer | `mini-gp-kit` | road, edge, wall, finish line, checkpoint 1, checkpoint 2, car, cone |

## Tutorial data model

Use a manifest so tutorial content, checks, illustrations, and audio can evolve
without hardcoding everything in `studio.js`.

Proposed shape:

```json
{
  "id": "platformer-crystal-jump",
  "gameStyle": "platformer",
  "title": "Crystal Jump",
  "status": "draft",
  "starterKits": ["platformer-basic-kit"],
  "chapters": [
    {
      "id": "power-on",
      "title": "Power on",
      "quests": [
        {
          "id": "choose-comfort",
          "title": "Make the screen comfortable",
          "level": "beginner",
          "mode": "home",
          "instruction": "Choose text size and theme.",
          "why": "The Studio should feel easy to look at.",
          "illustration": "power-on-comfort.png",
          "audio": "power-on-comfort.mp3",
          "check": { "type": "preferenceSeen", "key": "a11y" },
          "hints": [
            "Look at the top bar for Text size and Theme.",
            "Ask for 150% text if reading feels tiring."
          ]
        }
      ]
    }
  ]
}
```

Checks should be declarative where possible:

- `hasGameStyle`
- `hasSpriteRole`
- `hasBackgroundTileCount`
- `hasBehaviourTile`
- `hasSceneInstanceRole`
- `hasModuleEnabled`
- `hasModuleConfig`
- `buildsOk`
- `playedThisSession`
- `hasPublished`
- `customPredicate` only for rare cases

## Checking and guidance system

The check system should use both:

- Shared build validators (`BuilderValidators` and Studio checks).
- Tutorial-specific quest checks.

Do not require exact art. A pupil should pass a quest if the game idea works,
even if their drawing looks different.

Good checks:

- "There is a sprite with role `player`."
- "There are at least 20 solid ground tiles."
- "The player start is not inside a wall."
- "The Game type is `runner`."
- "There is at least one finish-line tile."
- "The project builds and Play has run."

Bad checks:

- "Tile 4 must have these exact pixels."
- "The level must match the screenshot exactly."
- "The pupil must use this exact colour."

Guidance levels:

1. `Not yet`: calm nudge.
2. `Nearly`: detects partial completion.
3. `Specific fix`: points to mode/tool/field.
4. `Show me`: highlights the UI target.
5. `Offer auto-help`: after repeated checks, ask if the pupil wants the Studio
   to place an example.

Example:

```text
Quest check: Add a Player
Not yet: I cannot find a character set to Player yet.
Nearly: You made a character. Now set its role to Player in CHARS.
Show me: Open CHARS and highlight the Role dropdown.
Auto-help: Would you like me to make this character the Player?
```

Tutorial-specific mistake checks:

| Mistake | Detection | Guidance |
| --- | --- | --- |
| Painted art but not behaviour | Ground-looking tiles exist, but no solid/platform behaviour | "Your floor looks right. Now make it solid in WORLD Type." |
| Player missing | No sprite role `player` | "Choose which character is the player." |
| Player inside wall | Start tile is solid | "Move the player start onto empty space above the floor." |
| Runner too short | Runner style and world width < 2 screens | "A runner needs room to move. Add a second screen." |
| Racer no finish | Racer style and no finish/trigger tile | "Paint a finish line so laps can count." |
| Too many sprites | scanline load > 8 | "Spread characters out vertically so the NES can draw them." |
| Dialogue in runner | Runner style and dialogue enabled | "Dialogue is not ready for runners yet. Turn it off for this game." |

## Shared opening chapter

Every style starts with the same short chapter. It teaches comfort, saving, the
TV, and Play before style-specific work begins.

### Chapter 0: Get comfortable

| Quest | Pupil instruction | Check | Illustration |
| --- | --- | --- | --- |
| Make the screen comfortable | Choose text size and theme. | A11y controls seen or changed. | Top-bar crop of text/theme controls. |
| Choose your start | Pick Blank or Starter Kit. | Tutorial start mode stored. | Two-card choice screen. |
| Find the TV | Look at the centre screen. This is where your game appears. | Step acknowledged. | Studio layout with TV highlighted. |
| Press Play once | Press Play and watch the starter or blank test build. | `playedThisSession` or build success. | Play button and emulator crop. |
| Meet Time Machine | Open Time Machine, then close it. | Time Machine opened. | Time Machine button and restore list. |

This chapter must take less than 5 minutes.

## Tutorial 1: Platformer - Crystal Jump

Goal: make a side-view jumping game with a hero, platforms, a pickup, an enemy,
a door, and an ending.

Features covered:

- WORLD: paint ground, platforms, ladder, door, second screen.
- CHARS: player, enemy, pickup/NPC roles.
- RULES: platformer game type, player start, jump height, walk speed, damage,
  pickup, win condition, door, dialogue.
- PALS/TILES: optional Maker chapter for colours and tile edits.
- SOUND: jump/pickup/win sounds `[CURRENT GUESS: event binding UI]`.
- CODE: optional Advanced read-only look at generated C.

### Platformer chapter outline

| Chapter | Purpose | Must finish with |
| --- | --- | --- |
| 1. Make a hero | Player character exists and is placed. | Player moves left/right. |
| 2. Build safe ground | Ground art and solid behaviour. | Player lands safely. |
| 3. Add a jump challenge | Platforms and jump tuning. | Player reaches a higher platform. |
| 4. Add a prize | Pickup and HUD/win rule. | Player can collect a prize. |
| 5. Add danger | Enemy, damage, hearts, checkpoint. | Player can get hurt and recover. |
| 6. Add a second room | Door and optional NPC dialogue. | Player can enter another area. |
| 7. Make it yours | Palette, tile edits, sound, publish. | Finished small platformer. |

### Platformer quest content

| Quest | Pupil instruction | Check | Guidance if stuck |
| --- | --- | --- | --- |
| Choose Platformer | In RULES, set Game type to Platformer. | `game.type == platformer` or default. | "Open RULES. The Game type card is near the top." |
| Make your hero | In CHARS, choose or draw a hero and set Role to Player. | sprite role `player`. | "You have art, but it is not Player yet." |
| Place your hero | In WORLD, put the player start above the floor area. | player start set and not inside solid tile. | "Move the start marker above empty space." |
| Paint ground | Paint a line of ground blocks under the hero. | enough non-empty background tiles. | "Use WORLD Stamp. Paint under the hero." |
| Make ground solid | Use Type to mark the ground as Solid. | enough `solid_ground` or `platform`. | "The floor looks right. Now make it solid." |
| Test the floor | Press Play. Try walking and jumping. | build ok and played. | "If the hero falls, check the floor type." |
| Add a platform | Paint a higher platform. Mark it Platform or Solid. | platform tiles above floor. | "Put it close enough for a jump." |
| Tune the jump | In RULES, change Jump height until it feels good. | player jump config changed. | "Try a small change first." |
| Add a prize | Make or choose a pickup. Place it on a platform. | pickup role and scene instance. | "A prize needs role Pickup." |
| Count the prize | Turn on Pickups or Win condition. | module enabled. | "Open RULES and find Pickups." |
| Add danger | Make or choose an enemy and place it away from the start. | enemy role and scene instance. | "Place danger after the first jump, not at the start." |
| Add hearts | Turn on Damage and HUD hearts. | damage and HUD modules enabled. | "Use low damage for the first game." |
| Add a door | Paint a door tile and set door rules. | door behaviour and doors module. | "Door art and Door type both matter." |
| Add a second room | Create a second background and link the door. | background count > 1 and door target. | "The door needs somewhere to go." |
| Add a line of dialogue | Add an NPC and one short sentence. | NPC role and dialogue module. | "Keep it short: 1 sentence first." |
| Add sound | Choose a pickup or win sound. | `[CURRENT GUESS] event sound binding exists`. | "Sound can wait. Your game works without it." |
| Publish or save | Save, download, or publish to gallery. | export/publish action. | "Saving is enough. Publishing is optional." |

## Tutorial 2: SMB-style platformer - Block Run

Goal: make a faster platform game with run physics, variable jump, blocks,
coins, power-ups, and a clear finish.

This tutorial is for pupils who have finished the basic platformer or are ready
for a more game-like version.

Features covered:

- SMB game type.
- Variable jump: tap for small jump, hold for high jump.
- Run speed.
- Question blocks, brick blocks, coins, power-ups.
- Enemy defeat `[CURRENT GUESS: stomp/shoot options may change]`.
- SMB HUD.
- Sprite flicker/OAM warnings at Maker level.

### SMB chapter outline

| Chapter | Purpose | Must finish with |
| --- | --- | --- |
| 1. Feel the controls | Pupil learns tap/hold jump and run. | Player can reach a block. |
| 2. Build block land | Ground, brick, question block, used block. | A simple SMB-like scene. |
| 3. Coins and blocks | Coins or block contents. | Collecting feels rewarding. |
| 4. Power up | Mushroom/flower/star `[CURRENT GUESS]`. | Player changes state or gets reward. |
| 5. Enemies | Enemy paths and defeat rule. | Enemy challenge works. |
| 6. Finish | Flag/finish or reach-tile win `[CURRENT GUESS]`. | Game can be won. |
| 7. Polish | HUD, sound, palette, publish. | Finished Block Run game. |

### SMB quest content

| Quest | Pupil instruction | Check | Guidance if stuck |
| --- | --- | --- | --- |
| Choose SMB style | In RULES, set Game type to SMB platformer. | `game.type == smb`. | "SMB is in the Game type list." |
| Try tap and hold | Press Play. Tap jump, then hold jump. | played after style set. | "Tap is small. Hold is higher." |
| Set a run speed | Pick a gentle speed first. | SMB speed config set. | "Start slower. You can speed up later." |
| Paint ground | Build a safe flat start. | solid ground exists. | "Start with a simple floor." |
| Add a question block | Place a question block above the player. | `[CURRENT GUESS] question block config or tile exists`. | "Put it low enough to bump." |
| Put a coin inside | Set the block contents to Coin. | `[CURRENT GUESS] block contents == coin`. | "One coin is enough for the first test." |
| Add a brick | Place brick blocks after the start. | brick block tile/config exists. | "Bricks can be decoration first." |
| Add a power-up | Put a mushroom or star in a block. | SMB powerup module enabled. | "Use one power-up, not all at once." |
| Add an enemy | Place an enemy with a simple path. | enemy instance. | "Keep it after the first coin." |
| Choose enemy rule | Pick stomp or avoid `[CURRENT GUESS]`. | enemy defeat config. | "Avoid is simpler than stomp." |
| Add HUD | Turn on SMB HUD. | `smbhud` enabled. | "The HUD shows score/lives/coins." |
| Add a finish | Add a finish tile or flag. | win condition exists. | "The game needs an end point." |
| Test the whole level | Press Play and reach the finish. | build ok and played. | "If it feels too hard, move the enemy." |

## Tutorial 3: Top-down adventure - Key Quest

Goal: make a simple top-down game where the player explores a room, talks to an
NPC, finds a key or prize, avoids danger, and opens a door.

Features covered:

- Top-down game type.
- Four-way movement.
- Walls and paths.
- NPC dialogue.
- Pickup/key.
- Door to another room.
- Enemy/chaser or walker.
- Win condition.

### Top-down chapter outline

| Chapter | Purpose | Must finish with |
| --- | --- | --- |
| 1. Make a room | Floor and wall layout. | Player can walk around but not through walls. |
| 2. Add a goal | Key/pickup and win rule. | Player can collect the key. |
| 3. Add a door | Door links rooms. | Player can move to a second room. |
| 4. Add a helper | NPC and dialogue. | Player can read a message. |
| 5. Add danger | Enemy, patrol/chase, damage. | Game has a challenge. |
| 6. Polish | Palettes, sound, publish. | Finished adventure. |

### Top-down quest content

| Quest | Pupil instruction | Check | Guidance if stuck |
| --- | --- | --- | --- |
| Choose Top-down | In RULES, set Game type to Top-down. | `game.type == topdown`. | "Top-down has no jumping." |
| Make a floor | Paint a simple room floor. | enough floor/non-empty tiles. | "Use one tile repeated first." |
| Paint walls | Paint walls around the room. | wall behaviour exists. | "Walls need Type: Wall." |
| Test walking | Press Play and try four-way movement. | build ok and played. | "If you walk through walls, check Type." |
| Add a key | Make or choose a pickup and place it. | pickup role and instance. | "Role must be Pickup." |
| Add a door | Paint a door and turn on Doors. | door behaviour and module. | "Door art is not enough; set Door type." |
| Make room two | Add another background and link the door. | background count > 1. | "Keep room two small first." |
| Add an NPC | Make a character with role NPC. | NPC role and instance. | "NPC means someone to talk to." |
| Write one message | Add a short dialogue line. | dialogue text not empty. | "One sentence is plenty." |
| Add danger | Add an enemy walker or chaser. | enemy instance and AI. | "Place it away from the start." |
| Add a win | Win when the key is collected or the exit reached. | win condition configured. | "Choose one clear goal." |

## Tutorial 4: Auto-runner - Jump Beat

Goal: make a short rhythm-like runner where the screen moves by itself and the
player jumps over danger and collects prizes.

Current limitation to explain gently: runners currently need a scrolling world
and dialogue is not supported in runner builds. Longer than 2x2 worlds are a
future engine goal.

Features covered:

- Runner game type.
- Autoscroll speed.
- Long horizontal world.
- Platforms/gaps.
- Spike/hazard tile.
- Pickups.
- Respawn/checkpoint `[CURRENT GUESS]`.
- Sound timing `[CURRENT GUESS]`.

### Runner chapter outline

| Chapter | Purpose | Must finish with |
| --- | --- | --- |
| 1. Start moving | Runner style and autoscroll. | The camera moves by itself. |
| 2. Build the track | Safe floor and small gaps. | Player can survive the first screen. |
| 3. Add rhythm | Platforms placed with fair spacing. | The jumps feel possible. |
| 4. Add danger | Spikes or hazard tiles. | Player can lose and restart. |
| 5. Add rewards | Coins/pickups. | Player has a reason to take risks. |
| 6. Polish | Speed, sounds, finish, publish. | Finished runner. |

### Runner quest content

| Quest | Pupil instruction | Check | Guidance if stuck |
| --- | --- | --- | --- |
| Choose Runner | In RULES, set Game type to Auto-runner. | `game.type == runner`. | "Runner means the game moves for you." |
| Add a second screen | Make the world at least 2 screens wide. | screen width >= 2. | "A runner needs room to move." |
| Pick slow speed | Set scroll speed to 1 or 2. | autoscrollSpeed <= 2. | "Start slow. Fast comes later." |
| Build safe start | Paint a flat start with no danger. | solid/platform near start. | "Give yourself time to learn." |
| Add one gap | Remove a small section of floor. | gap detected `[CURRENT GUESS]`. | "Make the first gap small." |
| Test jump timing | Press Play and jump over the gap. | played after gap. | "If it is too hard, make the gap smaller." |
| Add a spike | Paint one spike/hazard after the gap. | runner hazard tile exists. | "Do not put spikes at the start." |
| Add coins | Place pickups above the safe path. | pickup instances. | "Coins should show the best route." |
| Add a checkpoint | Add a respawn point `[CURRENT GUESS]`. | checkpoint configured. | "Checkpoint support may move as the engine changes." |
| Add finish | Add a finish tile or final pickup. | win condition. | "A short runner is better than a huge unfinished one." |
| Add beat sounds | Add jump/coin/hit sounds `[CURRENT GUESS]`. | event sounds bound. | "Sounds are optional." |

## Tutorial 5: Top-down racer - Mini GP

Goal: make a top-down racing game with a track, edge collision, finish line,
checkpoints, laps, HUD, and optional 2-player mode.

Features covered:

- Racer game type.
- Acceleration, steering, brake.
- Track edge/wall behaviour.
- Finish line and checkpoints.
- Laps to win.
- Racer HUD.
- Optional 2-player.
- Sound effects.

### Racer chapter outline

| Chapter | Purpose | Must finish with |
| --- | --- | --- |
| 1. Make a test track | Road and edge tiles. | Car drives on road and slows/stops at edges. |
| 2. Add race rules | Finish line, checkpoints, laps. | Laps count correctly. |
| 3. Tune the car | Speed and control feel. | Car feels controllable. |
| 4. Add challenge | Curves, narrow sections, cones `[CURRENT GUESS]`. | Track has skill without frustration. |
| 5. Add another player | Optional two-player race. | Both players can play. |
| 6. Polish | HUD, sound, publish. | Finished racer. |

### Racer quest content

| Quest | Pupil instruction | Check | Guidance if stuck |
| --- | --- | --- | --- |
| Choose Racer | In RULES, set Game type to Racer. | `game.type == racer`. | "Racer uses steering, not jumping." |
| Paint road | Paint a simple oval or rectangle road. | enough road/non-edge tiles. | "Make a wide road first." |
| Paint edges | Mark grass/walls as edge tiles. | edge behaviour exists. | "The car needs road and edge." |
| Place the car | Set the player/car start on the road. | player start not on edge. | "Move the start onto road." |
| Test drive | Press Play. Try accelerate, steer, brake. | played. | "If it is hard, lower top speed." |
| Add finish line | Paint a finish line across the track. | finish/trigger tile exists. | "The finish line should cross the road." |
| Add checkpoint 1 | Paint checkpoint 1 halfway around. | checkpoint count >= 1. | "Checkpoint stops shortcut laps." |
| Add checkpoint 2 | Optional: paint checkpoint 2 later on the track. | checkpoint count >= 2 or skipped. | "Use checkpoint 2 for bigger tracks." |
| Set laps | Choose 1-3 laps for a first game. | laps config set. | "One lap is best for testing." |
| Turn on HUD | Show lap/count HUD. | racer HUD enabled. | "The HUD tells the racer what is left." |
| Add two-player | Optional: turn on Player 2. | P2 enabled and second player sprite. | "Only use this if two pupils will play." |
| Add sounds | Add engine, checkpoint, finish sounds `[CURRENT GUESS]`. | event sounds bound. | "Sounds can come after the race works." |

## Advanced optional chapters

These appear only after the first playable game works.

### Maker chapter: Draw your own tiles

Purpose: introduce TILES and shared-tile reuse.

Quests:

- Open TILES.
- Pick a background tile.
- Duplicate before editing if it is shared.
- Change one tile and see every place using it change.
- Fix a shared-tile surprise with Duplicate first.
- Check CHR budget.

### Maker chapter: Colour and contrast

Purpose: teach palettes and attribute-grid limits.

Quests:

- Open PALS.
- Change backdrop colour.
- Change one background palette.
- Paint colour on a 16x16 area.
- Turn on attribute-grid overlay.
- Make the player readable against the background.

### Maker chapter: Sound

Purpose: add audio without making it a blocker.

Quests:

- Load starter sound pack.
- Choose a music loop.
- Bind a pickup sound `[CURRENT GUESS]`.
- Bind a hurt or win sound `[CURRENT GUESS]`.
- Test Play.

### Advanced chapter: Peek at code

Purpose: demystify generated code without requiring programming.

Quests:

- Open CODE.
- Find the game type line.
- Find the player start numbers.
- Find one comment that explains a rule.
- Return to visual editing.

Advanced editing should remain optional and should not be part of the first
successful tutorial route.

## Teacher support

Each tutorial should have a teacher view or printable teacher sheet.

Teacher sheet contents:

- Tutorial goal.
- Expected duration.
- Features used.
- Required starter kit.
- Common stuck points.
- What "finished enough" looks like.
- Extension tasks.
- Known current limitations.

Example teacher note:

```text
Runner known limitation:
Dialogue is currently disabled in runner games. If a pupil asks for a talking
character, suggest putting dialogue in a Platformer or Top-down project instead.
```

## Implementation plan

### Phase T0: Content and assets

- Write final pupil wording for Platformer first.
- Create low-detail placeholder illustrations.
- Create one optional starter kit per style.
- Record or script audio text, even before final audio is recorded.

### Phase T1: Tutorial manifest reader

- Add tutorial manifests under `tools/tile_editor_web/tutorials/`.
- Render quest chapters in the existing quest panel.
- Add `Show me`, `Check my work`, `Read aloud`, and `Hint`.
- Store tutorial progress per project.

### Phase T2: Checking system

- Add declarative tutorial checks.
- Reuse BuilderValidators.
- Add tutorial-specific partial-success messages.
- Add safe highlight targets for mode buttons, dock controls, TV cells, and
  RULES fields.

### Phase T3: First complete tutorial

- Ship Platformer tutorial end to end.
- Test with one adult and one pupil before writing the other styles in full.
- Keep content editable without touching code.

### Phase T4: Remaining styles

- Ship Top-down.
- Ship Auto-runner.
- Ship Racer.
- Ship SMB-style last if its feature set is still moving fastest.

### Phase T5: Teacher tools

- Teacher can pick which tutorial appears for a class.
- Teacher can hide advanced chapters.
- Teacher can reset tutorial progress for a pupil project.
- Teacher can view which chapter each saved project reached.

## Success criteria

A tutorial is successful when:

- A pupil can make a playable game without reading any external document.
- The game can be different from the example and still pass.
- The pupil presses Play early and often.
- The tutorial catches common mistakes before a build error becomes confusing.
- A teacher can support the session by reading the same quest wording.
- Large text and audio modes work without changing the lesson content.
- The finished game can be saved, reopened, and continued.

## Open questions

- Should tutorials live in the right quest panel only, or should there be a
  wider "tutorial reader" drawer for large-text mode?
- Should starter kits be installed as project templates or as importable asset
  packs?
- Should audio narration be recorded files, browser speech synthesis, or both?
- How much auto-fix should the Studio offer before it stops feeling like the
  pupil made the game?
- Should each tutorial have a "teacher pace" mode for whole-class projection?
- What is the minimum feature set for the SMB tutorial to avoid promising
  mechanics that are still unstable?

