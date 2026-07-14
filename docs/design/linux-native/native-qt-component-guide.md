# Native Qt component guide

> Implementation guide for the native sibling application. It applies the
> approved [design principles](../design-principles.md) and
> [Studio architecture](../ui-architecture.md) to Qt Widgets.

## Purpose and authority

The native application is not a page-for-page browser port. It must preserve
the approved Studio vocabulary: a game-first, NES-authentic workspace with a
mode rail, a single-purpose contextual dock, a CRT-framed centre stage, and a
quest/attention panel. The design principles remain the tie-breaker whenever
this guide is incomplete.

## Layout contract

At the supported minimum window size (960 × 640), no control may overlap,
clip, or become inaccessible. Long editors use a vertical scroll area; a
mode-specific inspector is hidden outside its mode instead of remaining as
disabled or clipped content.

| Region | Responsibility | Native rule |
| --- | --- | --- |
| Mode rail | Select a Studio mode | Compact, labelled, high-contrast buttons; selected state is visible without hover. |
| Context dock | One mode-specific concept | Scroll when longer than the viewport; hide outside WORLD until each other mode has its own dock. |
| Centre stage | Primary editing or live game | Always the visual focus; preserve CRT frame, provide predictable scroll for long editors. |
| Quest panel | Progress and later validation | Informational, never blocks editing. |

## Components

### Buttons and toggles

- Minimum hit area: 30 px high (32 px for primary selectors).
- Use a clearly differentiated disabled state and visible keyboard focus.
- Destructive actions use an explicit label; never rely on colour alone.
- Mutually exclusive choices show both a selected state and a textual label.

### Selectors and numeric controls

- Visual selectors pair a colour/pixel icon with a text label.
- Numeric controls keep a label or descriptive prefix; raw values are not a
  substitute for context.
- Four-value tile colour choices are always rendered as swatches labelled
  `0`–`3`; sprite colour zero remains identified as transparent.

### Lists and libraries

- Tile and sprite libraries show both identifiers and visual thumbnails.
- Selected and referenced tiles use distinguishable borders/backgrounds.
- Tooltips provide concise usage context without being the only description.

### Pixel canvases

- A tile canvas is exactly 8 × 8, square, and gapless. Individual cells may
  have an internal one-pixel gridline for blank-tile visibility, but no layout
  gap.
- Canvas cells retain accessible names describing their coordinates.
- A visible pen indicates which of the four values will be painted.

### Source editor

- C and ASM are separate, persistent sources with visible language controls.
- Use a dark IDE surface, syntax colours, monospaced text, and a readable
  selection/focus state.

## Colour and type

The app uses the established dark NES-inspired palette: near-black workspace,
indigo panels, cyan information, yellow highlight, green success, and red
warning. Text must remain legible against every panel; default labels use a
light foreground. Colour supplements, never replaces, labels and state.

Use the system sans font for ordinary form text and a monospace font for source
and compact technical values. Pixel-inspired decoration must never reduce
readability or hit targets.

## Audit and acceptance checklist

For each mode at 1440 × 900 and 960 × 640:

1. Selected mode and primary task are apparent on first view.
2. Every visible label, value, and state passes visual contrast inspection.
3. No overlap or clipped control; long content is reachable by scrolling.
4. Keyboard focus and accessible names remain available for interactive
   controls.
5. The screen fulfils one concept rather than showing unrelated disabled UI.
6. UI-shell tests cover every new structural component; full native tests pass.
