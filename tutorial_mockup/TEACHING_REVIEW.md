# Teaching review notes

These notes are based on reading `docs/design/quest-tutorials.md`. They are
not edits to the main design doc; they are extra planning points to consider
before implementation.

## Strong parts already present

- The plan assumes no previous knowledge.
- It keeps one task visible at a time.
- It uses short instructions and calm language.
- It includes large text, high contrast, optional audio, captions, and reduced
  motion.
- It treats tutorials as part of the Studio, not a separate manual.
- It uses checks that accept different-looking pupil work.
- It includes teacher sheets and known limitations.

## Missing or under-specified teaching points

### 1. "Finished enough" needs to be defined per quest

For pupils who can get stuck perfecting art or worrying about correctness, each
quest should say what counts as enough.

Example:

```text
Finished enough: at least 8 ground blocks under the player. They do not need to
look perfect.
```

### 2. Add a "stop and breathe" support pattern

Some pupils may become frustrated when Play fails or when a game behaves
differently from their expectation. Add non-patronising regulation prompts.

Example:

```text
Pause point: The game did something surprising. That happens in game making.
Take one breath, then press "Show me" for the next small fix.
```

### 3. Include misconception checks

The plan includes mistake checks, but it should explicitly list common
misconceptions and the response.

Examples:

- "I drew a floor, so it should be solid."
- "A sprite picture is automatically an enemy."
- "A door drawing automatically moves the player."
- "The tutorial wants exact art like the picture."
- "Build failed means my game is ruined."

### 4. Add vocabulary cards

Use plain words first, but pupils still need repeated vocabulary.

Suggested cards:

- Tile: a small 8x8 picture square.
- Sprite: a moving picture, like the player or enemy.
- Role: what a character does in the game.
- Solid: a tile the player cannot fall through.
- Play: build the game and try it.

Each card should have a picture and one sentence.

### 5. Add teacher pacing modes

The plan asks whether teacher pace should exist. It should. A teacher may need
to project the same step to a group.

Suggested modes:

- Independent: pupil controls next step.
- Teacher pace: teacher unlocks the next chapter.
- Recovery: teacher can mark a quest complete or reset it.

### 6. Add printable/offline supports

Useful for pupils who prefer paper or need fewer on-screen elements.

Suggested printouts:

- One-page "Where things are" Studio map.
- Tile legend for each starter kit.
- Quest checklist with tick boxes.
- Calm debugging card: "Look, Check, Show me, Ask."

### 7. Make collaboration explicit

Many pupils may work in pairs. Add roles for pair work.

Examples:

- Driver: uses mouse/keyboard.
- Navigator: reads the current quest and checks the TV.
- Artist: chooses colours and tiles.
- Tester: presses Play and says what happened.

### 8. Include input alternatives

The tutorials should support mouse, touch, keyboard, and possibly assistive
switch use.

The plan should specify:

- Keyboard focus order for the tutorial panel.
- Keyboard equivalent for paint/check/show-me actions.
- Touch target size.
- No drag-only required action without a click/tap alternative.

### 9. Add celebration controls

Celebration matters, but sensory load matters too.

Recommendation:

- Silent visual success by default.
- Optional short success sound.
- No confetti burst by default.
- Teacher can disable celebration effects for a class.

### 10. Add review and retrieval moments

For learning, each chapter should end with one small recall question or choice.

Examples:

- "What made the floor solid: the picture or the Type?"
- "What tells the game who the player is?"
- "What button tests the game?"

These should be low-pressure and skippable.

### 11. Add a pupil-owned goal

At the start of each tutorial, ask the pupil to pick one simple theme.

Examples:

- Castle
- Space
- Forest
- Underwater
- Silly

The tutorial can use this to frame optional art choices, while the mechanics
stay the same.

### 12. Add teacher observation notes

The teacher sheet should include what to watch for.

Examples:

- The pupil avoids pressing Play because they fear failure.
- The pupil keeps redrawing art instead of moving to the next quest.
- The pupil understands roles but not tile types.
- The pupil can follow one-step instructions but struggles with two-step ones.

## Suggested changes to the main tutorial plan later

- Add a "Finished enough" column to quest tables.
- Add a "Common misconception" column to teacher sheets.
- Add a "Regulation support" section under accessibility.
- Add keyboard/touch requirements under implementation.
- Add a "Chapter review" quest type.
- Add printable supports to Phase T0.

