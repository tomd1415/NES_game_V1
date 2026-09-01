# Adding a Studio mode

The Studio's eight modes (WORLD, CHARS, TILES, PALS, STYLE, RULES, SOUND, CODE) are
plugin objects on `window.StudioModes`. Adding one means making **three separate
places agree**, and nothing about the code makes that obvious — which is why the
mismatch is gated (`tools/studio-tests/mode-module-registry.spec.js`) and why this
page exists.

## The three places

1. **`MODES` in `tools/tile_editor_web/studio.js`** — one entry, which builds the rail
   button:
   ```js
   { id: 'mymode', name: 'MyMode', ico: '🛠', minLevel: 1,
     sub: 'One line the dock shows under the title.' },
   ```
   `minLevel` is progressive disclosure: `0` Beginner, `1` Maker, `2` Advanced. A
   mode above the pupil's level still shows on the rail, with a 🔒, and clicking it
   nudges them to raise the level rather than hiding that more exists (bug #4).

2. **`tools/tile_editor_web/studio-mymode.js`** — registers itself:
   ```js
   (function (global) {
     global.StudioModes = global.StudioModes || {};
     global.StudioModes.mymode = { /* hooks, below */ };
   })(typeof window !== 'undefined' ? window : globalThis);
   ```
   The key **must** equal the `id` in step 1.

3. **A `<script>` tag in `studio.html`** — hand-written, in the block with the other
   `studio-*.js` files, *before* `studio.js`.

Miss step 3 and the mode looks fine in the editor listing but its dock renders a
placeholder saying the feature "arrives later in the redesign" — copy written in
Phase 0 that now only appears when a module fails to load. That is why the failure is
reported to the console once per mode, and why the registry spec exists.

## The hooks

All optional. `studio.js` feature-tests each before calling, so a mode that
implements none still switches cleanly (it just shows the scaffold toolbar and an
empty dock).

| Hook | Called when |
| --- | --- |
| `renderDock(dock, ctx)` | the left dock is (re)built — **every** dock interaction, so it must not reset tool state |
| `renderTV(g, ctx)` | the mode takes over the TV canvas entirely (CHARS/TILES do; WORLD does not) |
| `onRenderOverlay(g, ctx)` | drawing grid / hover / selection *on top* of the normal TV render |
| `onEnter(ctx)` / `onExit(ctx)` | switching into / out of the mode |
| `stageTools` | array of `{ id, label }` for the stage toolbar; absent means the Phase-0 scaffold |
| `moreTools` | extra tools behind the disclosure |
| `onKey(evt, ctx)` | a key is pressed while focus is **not** in an `INPUT`/`TEXTAREA`/`SELECT`, and it was not consumed as undo/redo |
| `onToolChange(id, ctx)` | the active stage tool changed |
| `onTvRightClick(cell, ctx)` | right-click on the TV |
| `hidePlayerPreview` | truthy suppresses the idle hero preview on the TV |

`ctx` is the shared `window.Studio.ctx`. The whole surface, so you can see what is
*not* there as well as what is:

`getState` · `setState` · `markDirty` · `pushUndo` · `renderLive` · `renderDock` ·
`refresh` · `getLevel` · `levelAtLeast` · `getActiveTool` · `activeBackground` ·
`tvCanvas` · `NesRender` · `selectMode` · `viewScreen` · `setViewScreen` ·
`viewOffset` · `bgScreens`

Use `viewOffset()` for anything that reads the nametable on the pupil's behalf — a
mode that ignores it silently describes screen 0 while the pupil looks at screen 2,
which is a bug this project has already shipped once (the WORLD palette-clash count).

**Two traps, both paid for:**

- **`renderDock` runs on every dock interaction**, not once per mode entry. The stage
  toolbar is built in `selectMode`, deliberately, so that rebuilding the dock does not
  reset the active tool.
- **A throwing `onRenderOverlay` used to fail silently.** It is now reported once per
  mode+hook, but the hook is still *called* every frame and will keep throwing — the
  message is what is suppressed, not the fault.

## What the gate checks

`mode-module-registry.spec.js` enumerates **both** lists at runtime — the rail from the
DOM it actually built, the registry from the object that actually exists — and fails
if either side has an entry the other lacks. It is deliberately not a source scan: a
version that grepped `studio.js` and `studio.html` for names would match the comments
explaining itself and pass on them.

Run it with `npx playwright test tools/studio-tests/mode-module-registry.spec.js`.
