Where is the ability to choose the role of the chosen sprite? I really like the approach of having the the 'world page' where the elements can all be put together. There also needs to be a way of assigning tile type to each tile and there should be a way of overriding this for individual tiles if needed.
I would like a Assembly mode as well on this page.
I would like to keep the colour pallett of the whole site to the colours available to the NES.
Make sure that the UI and UX has the ability to be expanded to all of the future features to make it into a complete and full NES game maker.
Is tp-here somewhere to set the colour pallets?
What is missing from the new UI?

# Unresolved new bugs.
1. The sprite section does not allow the user to select a pallet.
2. Some of the drawing tools are missing from the background, sprite and tile areas.
3. There is no starting game to get the user started.
4. It is not obvious that the 'beginner mode' is active and therefore it looks like lots of features are missing. There needs to be a clear way of signaling to the user this is on beginner mode and to unlock more features they need to select one of the other modes.
5. Because there is no starter game the beginner mode is not usable as there are not some things created that should be.
6. The 'solid' attribute assigned to some tiles did not appear to be stopping the player falling through thte floor.
7. We appear to have lost the opportuniy to increase the size of the background beyond the size of one screen.

## Resolutions (2026-07-05)
Fixed on `redesign/ui-ux`, covered by `tools/studio-tests/bugfixes.spec.js`:

1. ✅ **CHARS palette picker** — a "Palette" row (SP 0–3, each with a colour
   strip) in the Pen section sets every cell's palette; Pen colours + LIVE
   render follow it.
2. ✅ **Line + Rectangle tools** added to TILES and CHARS (pixel painting,
   with a live drag preview); WORLD keeps stamp/fill/region.
3/5. ✅ **Starter game** — a "🎮 New game" chrome button *and* a "🎮 Load a
   starter game" item in the top account dropdown (shown even signed-out).
   Boot is now resilient: a missing/invalid/contentless saved project falls
   back to a fresh starter instead of loading nothing.
4. ✅ **Beginner signposting** — gated modes stay VISIBLE but LOCKED (🔒,
   dashed, dimmed); clicking one nudges "unlocks at Maker/Advanced"; a
   persistent level hint reads "🔒 Beginner — pick Maker/Advanced to unlock
   more". Finer dock/tool gating also applies.
6. ✅ **Solid collision** — verified the behaviour→ROM path (the engine reads
   `behaviour_at`, and the starter floor carries SOLID_GROUND). The practical
   trap was Beginner-mode: the ⛰ Type tool was Maker-gated, so a Beginner
   could stamp tiles but not make them solid, and (bugs 3/5) often had no
   proper starter floor. Restoring the starter + the locked-mode signposting
   makes solidity reachable; a test asserts the starter floor is SOLID_GROUND.
7. ✅ **Multi-screen backgrounds** — a "World size" control (1×1 / 2×1 / 1×2 /
   2×2, Maker+) resizes the nametable + behaviour grids, with a screen
   navigator (◀▶▲▼) to pan the TV; painting/eyedropper/region/attribute all
   respect the view offset. (Entity placement across screens is a follow-up;
   tiles + behaviour + scroll now work beyond one screen.)