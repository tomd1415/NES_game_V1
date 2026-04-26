# Recent bugs and feature requests

1. Have a fill option for the background tile
2. The 'door' or any movement to a new background when there are more than screen in the background
appears to get confused and show the wrong background for one of the screens.
3. When the there is a jump to a different background, sometimes the the 'behaviour blocks' are from the
wrong background.
4. Please find NES game creation resources and reference them to help.
5. Convert more parts of the C code for game creation into assembly as last time this was done there
was a massive improvement.
6. Add more to the builder, including more fine tuning and the ability to be more specific to individual sprites and areas on the game. Have the ability to change the speed of the jump.
7. Include default sound fx in the audio section.
8. Allow the user to set the default tempo for the audio and the ability to trigger tempo changes.
9. Fix scrolling errors in vertical and 2 by 2 backgrounds.
10. Enable scrolling platform games to go beyond 2 screens (research how far we can make these go)
11. Add the ability to make a 'Geometry Dash' style game. This has been requested by many of the younger pupils and making this as easy as possible would be very helpful.
12. Add an option for a top down racing game (like the classic Micro Machines game).
13. More options for enemy paths.
14. Currently the user can only place enemies and players on the first screen of the first background they should be able to do that for all screens in all backgrounds.
15. There is currently no way for a player to kill an enemy, we should add some options like jumping on top of enemy or shooting etc.
16. The pallets on the background and for the sprites sometimes do not match what they should be and the ones that are selected are not always represented.
17. Make it clearer to the user that the sprite animation is being used and allow for enemies and pickups etc. to have animations.
18. When the user selects to duplicate the sprite it should duplicate the sprite's tiles for the new sprite as well so that the duplicated sprite can be edited without affecting the original sprite.
19. There should be an option to add a pixel grid to the top view of the sprite (just like the one on the individual tile of the sprite.)
20. On the behaviour editor the Sprite reactions box needs to be wider so I think it should be below the background window and therefore have a bit more width to help make it easier to use.
21. The triggers and doors on different places should be able to have different effects.
22. There should be the ability to change variables that affect the whole game, like gravity and similar in the builder section.
23. Very low priority -- make sure it is usable on tablets and mobiles eventually.
24. Add an optional user login system that saves the users work between computers and allows them to put their creations into the gallery and remove them, whereas without an account the user can only post to the gallery and not remove from the gallery unless there is a way to be sure that it was that user that posted it to the gallery.
25. The very first frame of the game that is used in the gallery is almost always just the background transparent colour and nothing else. A different way of generating the thumbnail for the gallery might be useful.
26. The top down code has not been tested as much as the platform based code so that will need updating with everything that was discovered in the platform builder code writing and then testing. All should be documented. Again the NES is a very old system so there are probably many solutions to these problems already you should carry out a detailed search for sources of information to aid in writing this application and a suitable way of recording the information needed.
27. It is not clear where the sound effects are linked to events or how to do that currently.

---

## Diagnosis notes

When fixing items below, rather than guessing at a cause, run a
small reproduction first and record what you see here.  This
section grows over time and is meant to be re-read; please do
**not** delete entries when an item is closed — leave the
diagnosis trail in place for future debuggers (just add a
"Resolved YYYY-MM-DD: <commit ref>" line at the bottom of the
relevant sub-entry).

### Item 16 — palette mismatch (status: NOT YET REPRODUCED, 2026-04-26)

The reported symptom is "the palettes on the background and for
the sprites sometimes do not match what they should be and the
ones that are selected are not always represented."  Three
distinct things this could mean, each with a different fix
location.  Run each step and record the outcome here before
writing code.

#### Step A — selected-palette UI persistence

1. Open the Sprites page.
2. Click sprite palette index 2 to select it.
3. Save the project (or wait for autosave).
4. Reload the page.

**Question:** does palette 2 still show as the active selection
after reload?

- [ ] Outcome (Sprites page): _____
- [ ] If broken: storage round-trip likely.  Inspect
      `state.spritesActivePaletteIdx` (or equivalent) before /
      after save.

5. Repeat Steps 1-4 on the Backgrounds page with BG palette
   index 2.

- [ ] Outcome (Backgrounds page): _____

#### Step B — palette display on the canvas

1. Open the Backgrounds page.
2. Set BG palette 0 to known colours: e.g. `0F`, `30`, `15`, `27`.
3. Place tiles using palette 0 onto the canvas.
4. Open the Sprites page (still same project).
5. Set sprite palette 0 to a different recognisable set: e.g.
   `0F`, `12`, `27`, `30`.
6. Place a multi-tile sprite using sprite palette 0.

**Question:** do the colours that *render* on each canvas match
the palette values you picked, or do they show stale / wrong
hues?

- [ ] BG canvas matches BG palette 0: _____
- [ ] Sprite canvas matches sprite palette 0: _____
- [ ] If broken: probably a render-side bug in
      `sprite-render.js` looking up the wrong palette index.

#### Step C — runtime ROM render

1. Set both palettes to the recognisable values from Step B.
2. Open the Builder page.
3. Click ▶ Play in NES (browser mode is fine).

**Question:** in the running ROM, do BG and sprites use the
expected colours?

- [ ] Outcome: _____
- [ ] If broken but Step A and B were OK: assembler-side bug.
      Check `builder-assembler.js` palette emit and
      `playground_server.py` palette `.inc` writer.

#### Triage matrix (fill in once Steps A/B/C are done)

| Step A | Step B | Step C | Likely fix location |
| ------ | ------ | ------ | ------------------- |
| ❌ | — | — | Storage round-trip (`storage.js`) |
| ✅ | ❌ | — | Editor render (`sprite-render.js`) |
| ✅ | ✅ | ❌ | Assembler emit (`builder-assembler.js` / `playground_server.py`) |
| ✅ | ✅ | ✅ | Cannot reproduce — ask reporter for steps |

Until at least one step has been run, **do not start writing a
fix.**  See plan §T1.8 for the rationale (avoids burning a
session on a phantom case).