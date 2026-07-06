# Tutorial mockup

Standalone mockup for the NES Studio quest tutorial idea.

Open `index.html` in a browser. It does not need a dev server.

## What this demonstrates

- A side-by-side Studio + tutorial layout.
- One current quest at a time.
- `Show me`, `Check my work`, `Read aloud`, and `Hint` actions.
- Large text, high contrast, and reduced motion controls.
- Tutorial-specific checks that notice common mistakes.
- A small "Needs attention" panel that explains what to fix.
- Optional auto-help after repeated failed checks.

## What is deliberately fake

- This is not wired to the real Studio state.
- The TV is a small mock grid, not jsnes.
- Play is simulated.
- Audio uses browser speech synthesis if available.
- The content only mocks the first Platformer tutorial path.

## Files

- `index.html` - mock Studio screen.
- `styles.css` - layout and accessibility states.
- `tutorial-data.js` - quest content and check metadata.
- `tutorial.js` - interaction and checking logic.
- `assets/ground-quest.svg` - small tutorial illustration.
- `TEACHING_REVIEW.md` - gaps found in the tutorial plan from a teaching point
  of view.

