#!/usr/bin/env python3
"""
Playground server - one-click 'Play in NES' companion.

Serves the tile-editor web UI from tools/tile_editor_web/ and exposes a
POST /play endpoint that takes the current editor state plus a little
scene definition (which sprite is the Player, which static sprites to
drop on the background and where) and:

  1. writes the CHR + nametable into steps/Step_Playground/assets/
  2. writes palettes.inc and scene.inc into steps/Step_Playground/src/
  3. runs `make -C steps/Step_Playground` to build game.nes
  4. launches FCEUX on the freshly-built ROM

The server is intentionally a single-file stdlib-only script so it works
on any box with Python 3 and cc65 installed -- no extra dependencies.

Start from the repo root with:

    python3 tools/playground_server.py

then browse http://127.0.0.1:8765/sprites.html  (or let the VSCode task
'Start Playground Server' do it for you -- runs on folder open).
"""

from __future__ import annotations

import base64
import http.server
import json
import os
import pathlib
import re
import shutil
import socket
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import urllib.error
import urllib.request
from urllib.parse import unquote, urlparse

ROOT = pathlib.Path(__file__).resolve().parent.parent
WEB_DIR = ROOT / "tools" / "tile_editor_web"
STEP_DIR = ROOT / "steps" / "Step_Playground"
SCENE_INC = STEP_DIR / "src" / "scene.inc"
PAL_INC = STEP_DIR / "src" / "palettes.inc"
CHR_PATH = STEP_DIR / "assets" / "sprites" / "game.chr"
NAM_PATH = STEP_DIR / "assets" / "backgrounds" / "level.nam"
DEFAULT_MAIN_C = STEP_DIR / "src" / "main.c"
DEFAULT_MAIN_S = STEP_DIR / "src" / "main.s.starter"
LESSONS_DIR = ROOT / "lessons"
SNIPPETS_DIR = ROOT / "snippets"
FEEDBACK_PATH = ROOT / "feedback.jsonl"
FEEDBACK_HANDLED_PATH = ROOT / "feedback-handled.json"

FEEDBACK_CATEGORIES = ("feature", "broken", "general")
FEEDBACK_PAGES = ("index", "sprites", "behaviour", "code")
# 1 MB body cap — a project snapshot is typically 30-100 kB.
FEEDBACK_MAX_BODY = 1024 * 1024
FEEDBACK_MAX_MESSAGE = 500
FEEDBACK_MAX_NAME = 80
FEEDBACK_MAX_PROJECT = 80
FEEDBACK_LOCK = threading.Lock()
FEEDBACK_HANDLED_LOCK = threading.RLock()

FEEDBACK_CATEGORY_META = {
    "feature": ("✨", "Feature request"),
    "broken":  ("🐛", "Something broken"),
    "general": ("💭", "General comment"),
}


def _load_feedback_records():
    """Return a list of (index, record) pairs from feedback.jsonl.

    Index is 1-based and stable as long as the file is only appended
    to — which is the only way records are added.  Malformed lines are
    skipped with a stderr warning but still consume an index so the
    numbering matches what a text editor would show.
    """
    if not FEEDBACK_PATH.exists():
        return []
    out = []
    try:
        with FEEDBACK_PATH.open("r", encoding="utf-8") as fh:
            for i, line in enumerate(fh, start=1):
                line = line.strip()
                if not line:
                    continue
                try:
                    out.append((i, json.loads(line)))
                except Exception as e:
                    sys.stderr.write(
                        f"[playground] feedback line {i} bad JSON: {e}\n"
                    )
    except OSError as e:
        sys.stderr.write(f"[playground] feedback read failed: {e}\n")
    return out


def _load_handled_set():
    """Load the set of handled feedback indices from disk."""
    if not FEEDBACK_HANDLED_PATH.exists():
        return set()
    try:
        with FEEDBACK_HANDLED_PATH.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        return set(int(x) for x in data.get("handled", []))
    except Exception as e:
        sys.stderr.write(f"[playground] handled-set read failed: {e}\n")
        return set()


def _save_handled_set(handled):
    data = {"handled": sorted(handled)}
    tmp = FEEDBACK_HANDLED_PATH.with_suffix(".json.tmp")
    with FEEDBACK_HANDLED_LOCK:
        with tmp.open("w", encoding="utf-8") as fh:
            json.dump(data, fh)
        tmp.replace(FEEDBACK_HANDLED_PATH)


_FEEDBACK_VIEWER_CSS = """
:root {
  --bg: #1a1623; --panel: #241f33; --panel2: #2e2744;
  --fg: #e9e6f2; --muted: #a299c2; --accent: #ffd166;
  --good: #7ed996; --warn: #ff8a80; --info: #80c7ff;
  --border: #3a3150;
}
* { box-sizing: border-box; }
body {
  margin: 0; font-family: system-ui, sans-serif;
  background: var(--bg); color: var(--fg); line-height: 1.5;
}
header {
  display: flex; align-items: center; gap: 16px;
  padding: 12px 20px; background: var(--panel);
  border-bottom: 1px solid var(--border); position: sticky;
  top: 0; z-index: 10;
}
header h1 { margin: 0; font-size: 1.15em; color: var(--accent); }
header .stats { color: var(--muted); font-size: 0.9em; }
header label { display: flex; gap: 6px; align-items: center;
  margin-left: auto; color: var(--muted); cursor: pointer; }
main { max-width: 960px; margin: 0 auto; padding: 20px; }
.empty {
  text-align: center; color: var(--muted); padding: 60px 20px;
  font-size: 1.1em;
}
.card {
  background: var(--panel); border: 1px solid var(--border);
  border-radius: 8px; padding: 14px 18px; margin: 12px 0;
  display: grid; grid-template-columns: auto 1fr auto; gap: 10px 14px;
  align-items: start;
}
.card.handled { opacity: 0.55; }
.card .chip {
  grid-row: 1 / span 2;
  font-size: 1.6em; line-height: 1;
  padding: 6px 10px; border-radius: 8px;
  background: var(--panel2); border: 1px solid var(--border);
}
.card.feature .chip { border-color: var(--accent); }
.card.broken  .chip { border-color: var(--warn); }
.card.general .chip { border-color: var(--info); }
.card .meta {
  display: flex; flex-wrap: wrap; gap: 6px 12px;
  font-size: 0.88em; color: var(--muted);
}
.card .meta .name { color: var(--fg); font-weight: 600; }
.card .meta .name.anon { color: var(--muted); font-weight: normal;
  font-style: italic; }
.card .meta .sep::before { content: "•"; margin-right: 10px; }
.card .message {
  grid-column: 2;
  white-space: pre-wrap; word-break: break-word;
  margin: 0; font: inherit;
  background: var(--panel2); border: 1px solid var(--border);
  border-radius: 6px; padding: 10px 12px;
}
.card .handled-toggle {
  grid-row: 1 / span 2; align-self: center;
  display: flex; align-items: center; gap: 6px;
  color: var(--muted); font-size: 0.88em; cursor: pointer;
  user-select: none;
}
.card .snapshot {
  grid-column: 2; margin: 0;
}
.card .snapshot > summary {
  cursor: pointer; color: var(--info); font-size: 0.88em;
}
.card .snapshot pre {
  max-height: 400px; overflow: auto;
  background: var(--panel2); border: 1px solid var(--border);
  border-radius: 6px; padding: 10px 12px;
  font-size: 0.82em; margin-top: 8px; color: var(--muted);
}
body.hide-handled .card.handled { display: none; }
"""

_FEEDBACK_VIEWER_JS = """
(function () {
  const body = document.body;
  const toggle = document.getElementById('show-handled');
  const applyFilter = () => {
    body.classList.toggle('hide-handled', !toggle.checked);
    localStorage.setItem('fb-show-handled', toggle.checked ? '1' : '0');
  };
  toggle.checked = localStorage.getItem('fb-show-handled') === '1';
  applyFilter();
  toggle.addEventListener('change', applyFilter);

  document.querySelectorAll('.handled-toggle input').forEach(cb => {
    cb.addEventListener('change', async () => {
      const idx = parseInt(cb.dataset.index, 10);
      const handled = cb.checked;
      const card = cb.closest('.card');
      card.classList.toggle('handled', handled);
      try {
        const r = await fetch('/feedback/handled', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ index: idx, handled }),
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
      } catch (e) {
        cb.checked = !handled;
        card.classList.toggle('handled', !handled);
        alert("Couldn't save — check the server: " + e.message);
      }
      updateCounts();
      applyFilter();
    });
  });

  function updateCounts() {
    const total = document.querySelectorAll('.card').length;
    const done = document.querySelectorAll('.card.handled').length;
    const el = document.getElementById('stats');
    if (el) el.textContent =
      total + ' submission' + (total === 1 ? '' : 's') +
      ' — ' + done + ' handled, ' + (total - done) + ' open';
  }
})();
"""


def _render_feedback_viewer(records, handled):
    """Server-render the feedback viewer page.

    `records` is the list of `(index, record)` pairs from
    `_load_feedback_records()`; `handled` is the set of handled
    indices.  Newest-first.
    """
    import html as _html

    total = len(records)
    done = sum(1 for idx, _ in records if idx in handled)
    stats_text = (
        f"{total} submission{'' if total == 1 else 's'} — "
        f"{done} handled, {total - done} open"
    )

    if total == 0:
        body = (
            '<main><div class="empty">No feedback yet.<br>'
            'Submissions from the editor’s ? dialog will appear here.'
            '</div></main>'
        )
    else:
        cards = []
        for idx, rec in reversed(records):
            cards.append(_render_card(idx, rec, idx in handled))
        body = '<main>\n' + '\n'.join(cards) + '\n</main>'

    return (
        '<!doctype html>\n'
        '<html lang="en"><head><meta charset="utf-8">\n'
        '<title>Pupil feedback</title>\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f'<style>{_FEEDBACK_VIEWER_CSS}</style>\n'
        '</head><body class="hide-handled">\n'
        '<header>\n'
        '  <h1>💬 Pupil feedback</h1>\n'
        f'  <span class="stats" id="stats">{_html.escape(stats_text)}</span>\n'
        '  <label><input type="checkbox" id="show-handled"> '
        'Show handled</label>\n'
        '</header>\n'
        f'{body}\n'
        f'<script>{_FEEDBACK_VIEWER_JS}</script>\n'
        '</body></html>\n'
    )


def _render_card(idx, rec, is_handled):
    import html as _html

    category = rec.get("category", "general")
    emoji, cat_label = FEEDBACK_CATEGORY_META.get(
        category, ("💭", "General comment")
    )
    name = (rec.get("name") or "").strip()
    name_html = (
        f'<span class="name">{_html.escape(name)}</span>'
        if name else '<span class="name anon">anonymous</span>'
    )
    page = rec.get("page") or "?"
    project_name = rec.get("projectName") or ""
    ts = rec.get("ts") or ""
    message = rec.get("message") or ""
    project = rec.get("project")

    meta_bits = [name_html, f'<span class="sep">{_html.escape(cat_label)}</span>']
    if page:
        meta_bits.append(f'<span class="sep">page: {_html.escape(page)}</span>')
    if project_name:
        meta_bits.append(
            f'<span class="sep">project: {_html.escape(project_name)}</span>'
        )
    if ts:
        meta_bits.append(f'<span class="sep">{_html.escape(ts)}</span>')
    meta_html = '\n    '.join(meta_bits)

    snapshot_html = ''
    if isinstance(project, dict):
        pretty = json.dumps(project, indent=2, ensure_ascii=False)
        kb = max(1, round(len(pretty) / 1024))
        snapshot_html = (
            f'  <details class="snapshot">\n'
            f'    <summary>📎 project snapshot ({kb} KB)</summary>\n'
            f'    <pre>{_html.escape(pretty)}</pre>\n'
            f'  </details>\n'
        )

    checked_attr = ' checked' if is_handled else ''
    handled_class = ' handled' if is_handled else ''

    return (
        f'<article class="card {_html.escape(category)}{handled_class}">\n'
        f'  <div class="chip" title="{_html.escape(cat_label)}">{emoji}</div>\n'
        f'  <div class="meta">\n    {meta_html}\n  </div>\n'
        f'  <label class="handled-toggle" title="Mark as handled">\n'
        f'    <input type="checkbox" data-index="{idx}"{checked_attr}> handled\n'
        f'  </label>\n'
        f'  <pre class="message">{_html.escape(message)}</pre>\n'
        f'{snapshot_html}'
        f'</article>'
    )

# Lesson files carry a JSON metadata block at the top, delimited by
# `/*! LESSON` and `*/`.  The rest of the file is a fully-compilable
# `main.c`.  Lessons are re-read on every /lessons request so teachers can
# author and tweak without restarting the server.
LESSON_HEADER_RE = re.compile(r"/\*!\s*LESSON\s*(\{.*?\})\s*\*/", re.DOTALL)
LESSON_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")

# Snippet files share the same layout: a `/*! SNIPPET { ... } */` header
# followed by a block of C code that gets pasted at the pupil's cursor.
SNIPPET_HEADER_RE = re.compile(r"/\*!\s*SNIPPET\s*(\{.*?\})\s*\*/", re.DOTALL)

# HOST defaults to 127.0.0.1 for single-pupil / local dev; set to 0.0.0.0 on
# the classroom LXC so pupils on the LAN can browse to it.  PORT likewise
# overridable for school networks that ring-fence the default.
HOST = os.environ.get("PLAYGROUND_HOST", "127.0.0.1")
PORT = int(os.environ.get("PLAYGROUND_PORT", "8765"))

# All filesystem writes + `make` invocations funnel through this lock, so
# multiple pupils pressing Play at once serialise on the shared
# steps/Step_Playground work dir instead of racing.  cc65 builds in ~1 s,
# which is fine for a classroom queue.
BUILD_LOCK = threading.Lock()

# fceux availability is probed once at startup (not per request).  Browser
# mode is the default; only pupils on the offline workstation build need
# the native launcher.
FCEUX_PATH = shutil.which("fceux")

SCREEN_COLS = 32
SCREEN_ROWS = 30
NUM_TILES = 256


# ---------------------------------------------------------------------------
# CHR / NAM / palette encoders
# ---------------------------------------------------------------------------

def tile_to_chr(pixels):
    """8x8 pixel grid (values 0-3) -> 16 NES CHR bytes (two bit-planes)."""
    out = bytearray(16)
    for r in range(8):
        lo = 0
        hi = 0
        row = pixels[r]
        for c in range(8):
            p = row[c] & 3
            bit = 7 - c
            lo |= (p & 1) << bit
            hi |= ((p >> 1) & 1) << bit
        out[r] = lo
        out[8 + r] = hi
    return bytes(out)


def _encode_pool(tiles, label):
    if len(tiles) != NUM_TILES:
        raise ValueError(f"expected {NUM_TILES} {label} tiles, got {len(tiles)}")
    chunk = bytearray()
    for t in tiles:
        chunk += tile_to_chr(t["pixels"])
    if len(chunk) != 4096:
        raise ValueError(f"{label} pool came out {len(chunk)} bytes, expected 4096")
    return bytes(chunk)


def build_chr(state):
    """Two independent 256-tile pools -> 8KB CHR.

    Sprite pattern table lives at $0000 (first 4KB), background pattern
    table at $1000 (second 4KB) -- matches PPU_CTRL bit 4 = 1 set by the
    step's init code. Old saves with a single `tiles` pool fall back to
    duplicating it across both tables so nothing breaks during migration.
    """
    if "sprite_tiles" in state and "bg_tiles" in state:
        return _encode_pool(state["sprite_tiles"], "sprite_tiles") \
             + _encode_pool(state["bg_tiles"], "bg_tiles")
    if "tiles" in state:
        # Legacy single pool: shared across both tables.
        legacy = _encode_pool(state["tiles"], "tiles")
        return legacy * 2
    # No tile data yet (e.g. pupil opened the Code page before visiting
    # Sprites/Backgrounds). Fall back to blank CHR so the build can still
    # proceed; they'll hit the friendlier "No sprites defined yet" message
    # from build_scene_inc if their code path needs sprite data.
    return bytes(8192)


def _active_nametable(state):
    """Pull the selected background's nametable.

    New-format state keeps a list under `backgrounds` with `selectedBgIdx`.
    Legacy state had a single top-level `nametable` — fall back to that so
    older saves (and the example assets used in tests) still build.
    """
    bgs = state.get("backgrounds")
    if isinstance(bgs, list) and bgs:
        idx = state.get("selectedBgIdx", 0) or 0
        if not isinstance(idx, int) or idx < 0 or idx >= len(bgs):
            idx = 0
        bg = bgs[idx] or {}
        nt = bg.get("nametable")
        if isinstance(nt, list):
            return nt
    return state.get("nametable") or []


def build_nam(state):
    """32x30 tile bytes + 64 attribute bytes = 1024-byte NES nametable."""
    nt = _active_nametable(state)
    tiles_out = bytearray(SCREEN_COLS * SCREEN_ROWS)
    for r in range(SCREEN_ROWS):
        row = nt[r] if r < len(nt) else []
        for c in range(SCREEN_COLS):
            cell = row[c] if c < len(row) else None
            if cell:
                tiles_out[r * SCREEN_COLS + c] = int(cell.get("tile", 0)) & 0xFF

    # Attribute table: 8x8 bytes, each covers a 4x4 tile region split into
    # four 2x2 tile quads.  Quad layout in the byte: top-left=bits 0-1,
    # top-right=bits 2-3, bottom-left=bits 4-5, bottom-right=bits 6-7.
    attr_out = bytearray(64)
    for ar in range(8):
        for ac in range(8):
            byte = 0
            for quad in range(4):
                qr = (quad >> 1) & 1
                qc = quad & 1
                # top-left tile of this 2x2 quad
                tr = ar * 4 + qr * 2
                tc = ac * 4 + qc * 2
                pal = 0
                if tr < len(nt) and tc < len(nt[tr]):
                    pal = int(nt[tr][tc].get("palette", 0)) & 3
                byte |= pal << (quad * 2)
            attr_out[ar * 8 + ac] = byte

    return bytes(tiles_out) + bytes(attr_out)


def _palette_slots(state, group, i):
    """Return the 3 colour slots for palette `group[i]`, defaulting to black.

    Tolerates Code-page state that was never touched on the Backgrounds /
    Sprites pages (missing group, short list, or missing "slots" key).
    """
    entries = state.get(group) or []
    entry = entries[i] if i < len(entries) else None
    slots = (entry or {}).get("slots") if isinstance(entry, dict) else None
    if not isinstance(slots, (list, tuple)) or len(slots) < 3:
        return [0x0F, 0x0F, 0x0F]
    return [int(slots[0]), int(slots[1]), int(slots[2])]


def build_palettes_inc(state):
    ubg = int(state.get("universal_bg", 0x21)) & 0x3F
    lines = [
        "// generated by tools/playground_server.py - do not edit",
        "#ifndef PALETTES_INC",
        "#define PALETTES_INC",
        "",
        "static const unsigned char palette_bytes[32] = {",
    ]

    def emit(group):
        for i in range(4):
            s = _palette_slots(state, group, i)
            row = [ubg, s[0] & 0x3F, s[1] & 0x3F, s[2] & 0x3F]
            lines.append("    " + ", ".join(f"0x{b:02X}" for b in row) + ",")

    emit("bg_palettes")
    emit("sprite_palettes")
    lines += ["};", "", "#endif", ""]
    return "\n".join(lines)


def _hex_row(values):
    return ", ".join(f"${v:02X}" for v in values)


def build_palettes_asminc(state):
    """ca65-flavoured counterpart to build_palettes_inc.

    Emits the same 32-byte `palette_bytes` table in RODATA, reachable as
    an ordinary label from main.s.  Uses .pushseg/.popseg so including
    this file mid-stream doesn't change the caller's current segment.
    """
    ubg = int(state.get("universal_bg", 0x21)) & 0x3F
    rows = []

    def emit(group):
        for i in range(4):
            s = _palette_slots(state, group, i)
            row = [ubg, s[0] & 0x3F, s[1] & 0x3F, s[2] & 0x3F]
            rows.append(_hex_row(row))

    emit("bg_palettes")
    emit("sprite_palettes")

    lines = [
        "; generated by tools/playground_server.py - do not edit",
        ".pushseg",
        ".segment \"RODATA\"",
        "palette_bytes:",
    ]
    for row in rows:
        lines.append("    .byte " + row)
    lines += [".popseg", ""]
    return "\n".join(lines)


def build_scene_asminc(state, player_idx, scene_sprites, start_x, start_y):
    """ca65-flavoured counterpart to build_scene_inc.

    Constants become `.define` macros (text replacement) and byte tables
    become labelled data in RODATA, matching the identifier names used in
    the C header so the pedagogy carries across.
    """
    sprites = state.get("sprites") or []
    if not sprites:
        raise ValueError("No sprites defined yet -- make at least one in the Sprites page.")
    if not (0 <= player_idx < len(sprites)):
        raise ValueError(f"playerSpriteIdx {player_idx} out of range (0..{len(sprites)-1})")

    ps = sprites[player_idx]
    pw = int(ps["width"])
    ph = int(ps["height"])
    cells = ps["cells"]
    p_tiles = [cell_tile(cells[r][c]) for r in range(ph) for c in range(pw)]
    p_attrs = [cell_attr(cells[r][c]) for r in range(ph) for c in range(pw)]

    walk = _resolve_animation(state, "walk", pw, ph)
    jump = _resolve_animation(state, "jump", pw, ph)

    defines = [
        f".define PLAYER_W {pw}",
        f".define PLAYER_H {ph}",
        f".define PLAYER_X {int(start_x) & 0xFF}",
        f".define PLAYER_Y {int(start_y) & 0xFF}",
    ]

    data = [
        f"player_tiles: .byte {_hex_row(p_tiles)}",
        f"player_attrs: .byte {_hex_row(p_attrs)}",
    ]

    for kind, resolved in (("walk", walk), ("jump", jump)):
        if resolved is None:
            defines += [
                f".define {kind.upper()}_FRAME_COUNT 0",
                f".define {kind.upper()}_FRAME_TICKS 0",
            ]
            data += [
                f"{kind}_tiles: .byte $00",
                f"{kind}_attrs: .byte $00",
            ]
            continue
        frames, fps = resolved
        ticks = max(1, round(60 / fps))
        flat_tiles = []
        flat_attrs = []
        for sp in frames:
            t, a = _flatten_sprite(sp)
            flat_tiles += t
            flat_attrs += a
        defines += [
            f".define {kind.upper()}_FRAME_COUNT {len(frames)}",
            f".define {kind.upper()}_FRAME_TICKS {ticks}",
        ]
        data += [
            f"{kind}_tiles: .byte {_hex_row(flat_tiles)}",
            f"{kind}_attrs: .byte {_hex_row(flat_attrs)}",
        ]

    n = len(scene_sprites)
    defines.append(f".define NUM_STATIC_SPRITES {n}")
    # Role codes (mirrors build_scene_inc).
    defines += [
        ".define ROLE_PLAYER     0",
        ".define ROLE_NPC        1",
        ".define ROLE_ENEMY      2",
        ".define ROLE_ITEM       3",
        ".define ROLE_TOOL       4",
        ".define ROLE_POWERUP    5",
        ".define ROLE_PICKUP     6",
        ".define ROLE_PROJECTILE 7",
        ".define ROLE_DECORATION 8",
        ".define ROLE_OTHER      9",
    ]
    if n == 0:
        data += [
            "ss_x:      .byte $00",
            "ss_y:      .byte $00",
            "ss_w:      .byte $00",
            "ss_h:      .byte $00",
            "ss_offset: .byte $00",
            "ss_tiles:  .byte $00",
            "ss_attrs:  .byte $00",
            "ss_role:   .byte $00",
            "ss_flying: .byte $00",
        ]
    else:
        xs, ys, ws, hs, offsets, roles, flying = [], [], [], [], [], [], []
        tiles_flat, attrs_flat = [], []
        for item in scene_sprites:
            idx = int(item["spriteIdx"])
            if not (0 <= idx < len(sprites)):
                raise ValueError(f"scene sprite idx {idx} out of range")
            sp = sprites[idx]
            w = int(sp["width"])
            h = int(sp["height"])
            xs.append(int(item.get("x", 0)) & 0xFF)
            ys.append(int(item.get("y", 0)) & 0xFF)
            ws.append(w)
            hs.append(h)
            offsets.append(len(tiles_flat))
            roles.append(_role_code(sp))
            flying.append(1 if sp.get("flying") else 0)
            for r in range(h):
                for c in range(w):
                    cell = sp["cells"][r][c]
                    tiles_flat.append(cell_tile(cell))
                    attrs_flat.append(cell_attr(cell))
        data += [
            "ss_x:      .byte " + ", ".join(str(v) for v in xs),
            "ss_y:      .byte " + ", ".join(str(v) for v in ys),
            "ss_w:      .byte " + ", ".join(str(v) for v in ws),
            "ss_h:      .byte " + ", ".join(str(v) for v in hs),
            "ss_offset: .byte " + ", ".join(str(v) for v in offsets),
            f"ss_tiles:  .byte {_hex_row(tiles_flat)}",
            f"ss_attrs:  .byte {_hex_row(attrs_flat)}",
            "ss_role:   .byte " + ", ".join(str(v) for v in roles),
            "ss_flying: .byte " + ", ".join(str(v) for v in flying),
        ]

    lines = ["; generated by tools/playground_server.py - do not edit"]
    lines += defines
    lines += ["", ".pushseg", ".segment \"RODATA\""]
    lines += data
    lines += [".popseg", ""]
    return "\n".join(lines)


def cell_tile(cell):
    if cell.get("empty"):
        return 0
    return int(cell.get("tile", 0)) & 0xFF


def cell_attr(cell):
    if cell.get("empty"):
        return 0
    attr = int(cell.get("palette", 0)) & 3
    if cell.get("priority"):
        attr |= 0x20
    if cell.get("flipH"):
        attr |= 0x40
    if cell.get("flipV"):
        attr |= 0x80
    return attr & 0xFF


def _resolve_animation(state, kind, pw, ph):
    """Return (frames, fps) for assignment `kind` if valid, else None.

    Each frame is a sprite; all frames in an animation must share (pw, ph)
    so the player's footprint in C is a fixed W*H. Frames that don't
    match are dropped (server-side defensive — the editor also warns).
    """
    assigns = state.get("animation_assignments") or {}
    anim_id = assigns.get(kind)
    if anim_id is None:
        return None
    anims = state.get("animations") or []
    anim = next((a for a in anims if a.get("id") == anim_id), None)
    if not anim:
        return None
    frames = anim.get("frames") or []
    if not frames:
        return None
    sprites = state.get("sprites") or []
    good = []
    for fi in frames:
        if not (0 <= fi < len(sprites)):
            continue
        sp = sprites[fi]
        if int(sp.get("width", 0)) == pw and int(sp.get("height", 0)) == ph:
            good.append(sp)
    if not good:
        return None
    fps = max(1, min(60, int(anim.get("fps", 8) or 8)))
    return good, fps


def _flatten_sprite(sp):
    """Flatten a sprite's cells (row-major) into (tiles, attrs) byte lists."""
    w = int(sp["width"])
    h = int(sp["height"])
    tiles = [cell_tile(sp["cells"][r][c]) for r in range(h) for c in range(w)]
    attrs = [cell_attr(sp["cells"][r][c]) for r in range(h) for c in range(w)]
    return tiles, attrs


ROLE_CODES = {
    "player":     0,
    "npc":        1,
    "enemy":      2,
    "item":       3,
    "tool":       4,
    "powerup":    5,
    "pickup":     6,
    "projectile": 7,
    "decoration": 8,
    "other":      9,
}


def _role_code(sp):
    role = (sp.get("role") or "other").lower()
    return ROLE_CODES.get(role, ROLE_CODES["other"])


def build_scene_inc(state, player_idx, scene_sprites, start_x, start_y,
                    player_idx2=-1, start_x2=180, start_y2=120):
    sprites = state.get("sprites") or []
    if not sprites:
        raise ValueError("No sprites defined yet -- make at least one in the Sprites page.")
    if not (0 <= player_idx < len(sprites)):
        raise ValueError(f"playerSpriteIdx {player_idx} out of range (0..{len(sprites)-1})")
    # Validate the optional P2 pointer so a malformed payload can't sneak
    # an out-of-range index through to the scene.inc writer.  -1 means
    # "single-player build" and is always accepted.
    p2_active = (player_idx2 is not None and player_idx2 >= 0
                 and player_idx2 != player_idx
                 and player_idx2 < len(sprites))

    lines = [
        "// generated by tools/playground_server.py - do not edit",
        "#ifndef SCENE_INC",
        "#define SCENE_INC",
        "",
        "// Role codes — match enemy/npc/tool/... logic in your snippets.",
        "// ss_role[i] is the role of scene sprite i (see below).",
        "#define ROLE_PLAYER     0",
        "#define ROLE_NPC        1",
        "#define ROLE_ENEMY      2",
        "#define ROLE_ITEM       3",
        "#define ROLE_TOOL       4",
        "#define ROLE_POWERUP    5",
        "#define ROLE_PICKUP     6",
        "#define ROLE_PROJECTILE 7",
        "#define ROLE_DECORATION 8",
        "#define ROLE_OTHER      9",
        "",
    ]

    # --- Player -----------------------------------------------------------
    ps = sprites[player_idx]
    pw = int(ps["width"])
    ph = int(ps["height"])
    cells = ps["cells"]
    p_tiles = [cell_tile(cells[r][c]) for r in range(ph) for c in range(pw)]
    p_attrs = [cell_attr(cells[r][c]) for r in range(ph) for c in range(pw)]

    # Resolve walk / jump animations (if any). All frames must share the
    # player sprite's (pw, ph) so the C loop has a fixed tile count.
    walk = _resolve_animation(state, "walk", pw, ph)
    jump = _resolve_animation(state, "jump", pw, ph)

    lines += [
        f"#define PLAYER_W {pw}",
        f"#define PLAYER_H {ph}",
        f"#define PLAYER_X {int(start_x) & 0xFF}",
        f"#define PLAYER_Y {int(start_y) & 0xFF}",
        "",
        f"static const unsigned char player_tiles[{pw*ph}] = {{",
        "    " + ", ".join(f"0x{t:02X}" for t in p_tiles),
        "};",
        f"static const unsigned char player_attrs[{pw*ph}] = {{",
        "    " + ", ".join(f"0x{a:02X}" for a in p_attrs),
        "};",
        "",
    ]

    # --- Player 2 (optional, Phase B chunk 5) ---------------------------
    # Always emit PLAYER2_ENABLED so the template's #if gate compiles
    # cleanly regardless of single- vs two-player.  When enabled we also
    # emit PLAYER2_X/Y/W/H and the tile+attr tables drawn from the
    # second sprite tagged Player.
    if p2_active:
        ps2 = sprites[player_idx2]
        pw2 = int(ps2["width"])
        ph2 = int(ps2["height"])
        cells2 = ps2["cells"]
        p2_tiles = [cell_tile(cells2[r][c]) for r in range(ph2) for c in range(pw2)]
        p2_attrs = [cell_attr(cells2[r][c]) for r in range(ph2) for c in range(pw2)]
        lines += [
            "#define PLAYER2_ENABLED 1",
            f"#define PLAYER2_W {pw2}",
            f"#define PLAYER2_H {ph2}",
            f"#define PLAYER2_X {int(start_x2) & 0xFF}",
            f"#define PLAYER2_Y {int(start_y2) & 0xFF}",
            "",
            f"static const unsigned char player2_tiles[{pw2*ph2}] = {{",
            "    " + ", ".join(f"0x{t:02X}" for t in p2_tiles),
            "};",
            f"static const unsigned char player2_attrs[{pw2*ph2}] = {{",
            "    " + ", ".join(f"0x{a:02X}" for a in p2_attrs),
            "};",
            "",
        ]
    else:
        # P2 inactive: stub so any stray reference of PLAYER2_ENABLED
        # in pupil code resolves to 0.  Empty arrays would fail cc65,
        # so the tile / attr tables are simply not emitted.
        lines += [
            "#define PLAYER2_ENABLED 0",
            "",
        ]

    # --- Walk / Jump animation tables ------------------------------------
    # For each assigned animation, emit:
    #   <kind>_frame_count, <kind>_frame_ticks (vblanks between frame advances),
    #   <kind>_tiles[N*W*H] and <kind>_attrs[N*W*H].
    # If an animation isn't set, emit a count of 0 and a 1-element stub
    # (cc65 rejects zero-length arrays); main.c's "if count > 0" gate
    # keeps the stubs unread.
    for kind, resolved in (("walk", walk), ("jump", jump)):
        if resolved is None:
            lines += [
                f"#define {kind.upper()}_FRAME_COUNT 0",
                f"#define {kind.upper()}_FRAME_TICKS 0",
                f"static const unsigned char {kind}_tiles[1] = {{ 0 }};",
                f"static const unsigned char {kind}_attrs[1] = {{ 0 }};",
                "",
            ]
            continue
        frames, fps = resolved
        ticks = max(1, round(60 / fps))
        flat_tiles = []
        flat_attrs = []
        for sp in frames:
            t, a = _flatten_sprite(sp)
            flat_tiles += t
            flat_attrs += a
        lines += [
            f"#define {kind.upper()}_FRAME_COUNT {len(frames)}",
            f"#define {kind.upper()}_FRAME_TICKS {ticks}",
            f"static const unsigned char {kind}_tiles[{len(flat_tiles)}] = {{",
            "    " + ", ".join(f"0x{t:02X}" for t in flat_tiles),
            "};",
            f"static const unsigned char {kind}_attrs[{len(flat_attrs)}] = {{",
            "    " + ", ".join(f"0x{a:02X}" for a in flat_attrs),
            "};",
            "",
        ]

    # --- Static sprites --------------------------------------------------
    n = len(scene_sprites)
    lines.append(f"#define NUM_STATIC_SPRITES {n}")

    if n == 0:
        # cc65 rejects zero-length arrays -- keep a 1-element stub that's
        # never accessed because NUM_STATIC_SPRITES gates the loop.
        # ss_x / ss_y are non-const so movement snippets can write to them.
        stub = (
            "static unsigned char ss_x[1]            = { 0 };\n"
            "static unsigned char ss_y[1]            = { 0 };\n"
            "static const unsigned char ss_w[1]      = { 0 };\n"
            "static const unsigned char ss_h[1]      = { 0 };\n"
            "static const unsigned char ss_offset[1] = { 0 };\n"
            "static const unsigned char ss_tiles[1]  = { 0 };\n"
            "static const unsigned char ss_attrs[1]  = { 0 };\n"
            "static const unsigned char ss_role[1]   = { 0 };\n"
            "static const unsigned char ss_flying[1] = { 0 };"
        )
        lines.append(stub)
    else:
        xs, ys, ws, hs, offsets, roles, flying = [], [], [], [], [], [], []
        tiles_flat, attrs_flat = [], []
        for item in scene_sprites:
            idx = int(item["spriteIdx"])
            if not (0 <= idx < len(sprites)):
                raise ValueError(f"scene sprite idx {idx} out of range")
            sp = sprites[idx]
            w = int(sp["width"])
            h = int(sp["height"])
            xs.append(int(item.get("x", 0)) & 0xFF)
            ys.append(int(item.get("y", 0)) & 0xFF)
            ws.append(w)
            hs.append(h)
            offsets.append(len(tiles_flat))
            roles.append(_role_code(sp))
            # `flying` lives on the sprite definition (Sprites page). When the
            # pupil ticks the 🕊 Flying checkbox, the baked gravity loop in
            # main.c skips that sprite so it hovers at its authored Y.
            flying.append(1 if sp.get("flying") else 0)
            for r in range(h):
                for c in range(w):
                    cell = sp["cells"][r][c]
                    tiles_flat.append(cell_tile(cell))
                    attrs_flat.append(cell_attr(cell))

        def arr(name, values, as_hex=False, mutable=False):
            fmt = (lambda v: f"0x{v:02X}") if as_hex else (lambda v: str(v))
            qualifier = "static" if mutable else "static const"
            return (f"{qualifier} unsigned char {name}[{len(values)}] = {{ "
                    + ", ".join(fmt(v) for v in values) + " };")
        # ss_x / ss_y are mutable so movement / AI snippets can modify
        # positions at runtime; cc65's DATA segment is copied ROM->RAM at
        # startup per the nes.cfg linker script.
        lines += [
            arr("ss_x", xs, mutable=True),
            arr("ss_y", ys, mutable=True),
            arr("ss_w", ws),
            arr("ss_h", hs),
            arr("ss_offset", offsets),
            arr("ss_tiles", tiles_flat, as_hex=True),
            arr("ss_attrs", attrs_flat, as_hex=True),
            arr("ss_role", roles),
            arr("ss_flying", flying),
        ]

    lines += ["", "#endif", ""]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Behaviour / collision data (Sprint 10 Phase B)
#
# The Behaviour page paints a tile-id map (0..7) on top of the background and
# records per-sprite reactions to each behaviour id.  The playground server
# ships that out as two C files the pupil's main.c can #include:
#
#   src/collision.h  - enums for BEHAVIOUR_* ids and REACT_* verbs, plus
#                      prototypes for behaviour_at() and reaction_for().
#   src/behaviour.c  - the flat world map (scroll-ready: full screens_x x
#                      screens_y tiles) and the sprite x behaviour reaction
#                      table, plus the tiny query functions themselves.
#
# Phase B is data-only: main.c is untouched.  The pupil calls behaviour_at()
# + reaction_for() themselves from their own code.  Phase C will emit the
# hook-dispatch calls for them.
# ---------------------------------------------------------------------------

REACTION_VERB_IDS = {
    "ignore":       0,
    "block":        1,
    "land":         2,
    "land_top":     3,
    "bounce":       4,
    "exit":         5,
    "call_handler": 6,
}

BUILTIN_BEHAVIOUR_NAMES = {
    0: "NONE",
    1: "SOLID_GROUND",
    2: "WALL",
    3: "PLATFORM",
    4: "DOOR",
    5: "TRIGGER",
    6: "LADDER",
}


def _sanitise_behaviour_name(name, slot_id):
    """Return an uppercase C identifier for the pupil's custom behaviour name.

    Strips non-[A-Z0-9_] characters, collapses runs of underscores, and
    falls back to ``CUSTOM7`` when the cleaned name is empty or starts
    with a digit.  Slot ids 1..6 always use the built-in name.
    """
    if slot_id in BUILTIN_BEHAVIOUR_NAMES:
        return BUILTIN_BEHAVIOUR_NAMES[slot_id]
    raw = (name or "").upper()
    cleaned = re.sub(r"[^A-Z0-9_]+", "_", raw).strip("_")
    cleaned = re.sub(r"_+", "_", cleaned)
    if not cleaned or cleaned[0].isdigit():
        return f"CUSTOM{slot_id}"
    return cleaned


def _collect_behaviour_names(state):
    """Map slot id 0..7 -> uppercase C identifier, with uniqueness."""
    names = {}
    seen = set()
    types = state.get("behaviour_types") or []
    by_id = {}
    for t in types:
        if isinstance(t, dict) and "id" in t:
            try:
                by_id[int(t["id"])] = t
            except (TypeError, ValueError):
                continue
    for slot_id in range(8):
        t = by_id.get(slot_id) or {}
        base = _sanitise_behaviour_name(t.get("name"), slot_id)
        name = base
        n = 2
        while name in seen:
            name = f"{base}_{n}"
            n += 1
        seen.add(name)
        names[slot_id] = name
    return names


def _behaviour_world_dims(state):
    """Return (world_cols, world_rows) from the active background."""
    bgs = state.get("backgrounds")
    bg = None
    if isinstance(bgs, list) and bgs:
        idx = state.get("selectedBgIdx", 0) or 0
        if not isinstance(idx, int) or idx < 0 or idx >= len(bgs):
            idx = 0
        bg = bgs[idx] or {}
    dims = (bg or {}).get("dimensions") or {}
    sx = max(1, int(dims.get("screens_x") or 1))
    sy = max(1, int(dims.get("screens_y") or 1))
    return SCREEN_COLS * sx, SCREEN_ROWS * sy


def _behaviour_world_map(state):
    """Build the flat world behaviour map as a bytes() of length cols*rows."""
    cols, rows = _behaviour_world_dims(state)
    out = bytearray(cols * rows)
    bgs = state.get("backgrounds")
    bg = None
    if isinstance(bgs, list) and bgs:
        idx = state.get("selectedBgIdx", 0) or 0
        if not isinstance(idx, int) or idx < 0 or idx >= len(bgs):
            idx = 0
        bg = bgs[idx] or {}
    grid = (bg or {}).get("behaviour") or []
    for r in range(rows):
        row = grid[r] if r < len(grid) else []
        base = r * cols
        for c in range(cols):
            try:
                v = int(row[c]) if c < len(row) else 0
            except (TypeError, ValueError):
                v = 0
            out[base + c] = v & 0x07  # only ids 0..7 are valid
    return bytes(out), cols, rows


def _sprite_reaction_table(state):
    """Return (flat_table_bytes, num_sprites).

    Flat layout: sprite_idx * 8 + behaviour_id -> reaction verb id.
    Missing entries default to REACT_IGNORE so an incomplete project still
    builds cleanly.
    """
    sprites = state.get("sprites") or []
    reactions = state.get("behaviour_reactions") or []
    n = len(sprites)
    out = bytearray(n * 8)
    for i in range(n):
        rmap = reactions[i] if i < len(reactions) else {}
        if not isinstance(rmap, dict):
            rmap = {}
        for slot_id in range(8):
            verb = rmap.get(str(slot_id)) or rmap.get(slot_id) or "ignore"
            out[i * 8 + slot_id] = REACTION_VERB_IDS.get(str(verb), 0)
    return bytes(out), n


def build_collision_h(state):
    """Emit src/collision.h — BEHAVIOUR_* / REACT_* enums + prototypes."""
    names = _collect_behaviour_names(state)
    cols, rows = _behaviour_world_dims(state)
    num_sprites = len(state.get("sprites") or [])
    lines = [
        "/* Auto-generated by playground_server.py — do not edit by hand. */",
        "/* Source: the Behaviour page of the tile editor.                */",
        "#ifndef COLLISION_H",
        "#define COLLISION_H",
        "",
        "/* Behaviour type ids (0..7). Slot 7 is custom — if the pupil",
        "   named it, their chosen name appears here. */",
    ]
    for slot_id in range(8):
        lines.append(f"#define BEHAVIOUR_{names[slot_id]:<16} {slot_id}")
    lines += [
        "",
        "/* Reaction verbs a sprite can have towards a behaviour id. */",
        "#define REACT_IGNORE       0",
        "#define REACT_BLOCK        1",
        "#define REACT_LAND         2",
        "#define REACT_LAND_TOP     3",
        "#define REACT_BOUNCE       4",
        "#define REACT_EXIT         5",
        "#define REACT_CALL_HANDLER 6",
        "",
        "/* World size in 8x8 tiles. Covers the full screens_x × screens_y",
        "   grid so the same data works when scrolling is added later. */",
        f"#define WORLD_COLS   {cols}",
        f"#define WORLD_ROWS   {rows}",
        f"#define NUM_BEHAVIOUR_SPRITES {num_sprites}",
        "",
        "/* Look up the behaviour id at a given world tile (8x8 grid).",
        "   Returns BEHAVIOUR_NONE (0) for out-of-range coordinates. */",
        "unsigned char behaviour_at(unsigned int world_col, unsigned int world_row);",
        "",
        "/* Look up the reaction verb a sprite has for a behaviour id.",
        "   Returns REACT_IGNORE (0) for out-of-range sprite or id. */",
        "unsigned char reaction_for(unsigned char sprite_idx, unsigned char behaviour_id);",
        "",
        "#endif",
        "",
    ]
    return "\n".join(lines)


def build_behaviour_c(state):
    """Emit src/behaviour.c — world map + reaction table + query functions."""
    map_bytes, cols, rows = _behaviour_world_map(state)
    react_bytes, num_sprites = _sprite_reaction_table(state)

    def _hex_table(name, data, cols_per_line=16):
        if not data:
            return [f"const unsigned char {name}[1] = {{ 0 }}; /* empty */"]
        out = [f"const unsigned char {name}[{len(data)}] = {{"]
        for i in range(0, len(data), cols_per_line):
            chunk = data[i:i + cols_per_line]
            out.append("  " + ", ".join(f"0x{b:02X}" for b in chunk) + ",")
        out.append("};")
        return out

    lines = [
        "/* Auto-generated by playground_server.py — do not edit by hand. */",
        "/* Source: the Behaviour page of the tile editor.                */",
        '#include "collision.h"',
        "",
        f"/* World behaviour map: {cols} cols x {rows} rows, row-major. */",
    ]
    lines += _hex_table("behaviour_map", map_bytes)
    lines += [
        "",
        "/* Sprite x behaviour reaction table.",
        "   Row i (8 bytes) = sprite i's verb for behaviour ids 0..7. */",
    ]
    if num_sprites == 0:
        lines += [
            "/* No sprites defined yet — stub table so the build still links. */",
            "const unsigned char sprite_reactions[8] = { 0, 0, 0, 0, 0, 0, 0, 0 };",
        ]
    else:
        lines += _hex_table("sprite_reactions", react_bytes, cols_per_line=8)
    lines += [
        "",
        "unsigned char behaviour_at(unsigned int world_col, unsigned int world_row) {",
        "  if (world_col >= WORLD_COLS) return BEHAVIOUR_NONE;",
        "  if (world_row >= WORLD_ROWS) return BEHAVIOUR_NONE;",
        "  return behaviour_map[world_row * WORLD_COLS + world_col];",
        "}",
        "",
        "unsigned char reaction_for(unsigned char sprite_idx, unsigned char behaviour_id) {",
        "  if (behaviour_id >= 8) return REACT_IGNORE;",
        f"  if (sprite_idx >= {max(num_sprites, 1)}) return REACT_IGNORE;",
        "  return sprite_reactions[((unsigned int)sprite_idx << 3) | behaviour_id];",
        "}",
        "",
    ]
    return "\n".join(lines)


COLLISION_H_PATH = STEP_DIR / "src" / "collision.h"
BEHAVIOUR_C_PATH = STEP_DIR / "src" / "behaviour.c"


# ---------------------------------------------------------------------------
# Full-world background data (Sprint 11 S-1 slice 1)
#
# The legacy build_nam() emits a single 32x30 screen into level.nam and the
# runtime copies that blob into one NES nametable — enough for a one-screen
# game but nothing larger.  The scroll foundation needs the painted data for
# EVERY screen the pupil drew, flat row-major so the scroll core can stream
# one column (or row) at a time as the camera moves.
#
# This slice only emits the data + commits stub files.  No runtime yet reads
# from bg_world.c, so 1x1 projects must produce a ROM identical to today.
# ---------------------------------------------------------------------------

def _world_nametable(state):
    """Return (tile_bytes, attr_bytes, cols, rows) for the whole painted world.

    Row-major flat layout:
      tile_bytes[r * cols + c]  = tile id at (col=c, row=r), 0 outside paint.
      attr_bytes[ar * acols + ac] packs four 2x2 tile quads of palette ids.
    """
    bgs = state.get("backgrounds")
    bg = None
    if isinstance(bgs, list) and bgs:
        idx = state.get("selectedBgIdx", 0) or 0
        if not isinstance(idx, int) or idx < 0 or idx >= len(bgs):
            idx = 0
        bg = bgs[idx] or {}
    dims = (bg or {}).get("dimensions") or {}
    sx = max(1, int(dims.get("screens_x") or 1))
    sy = max(1, int(dims.get("screens_y") or 1))
    cols = SCREEN_COLS * sx
    rows = SCREEN_ROWS * sy

    nt = (bg or {}).get("nametable")
    if not isinstance(nt, list):
        nt = state.get("nametable") or []

    tiles = bytearray(cols * rows)
    for r in range(rows):
        row = nt[r] if r < len(nt) else []
        base = r * cols
        for c in range(cols):
            cell = row[c] if c < len(row) else None
            if isinstance(cell, dict):
                tiles[base + c] = int(cell.get("tile", 0)) & 0xFF

    # Attribute table: each byte covers a 4x4 tile region split into four 2x2
    # tile quads.  Matches the NES PPU layout per screen; we just emit it
    # tiled across the whole world so streaming can copy one attr column per
    # 16 px of horizontal travel.
    acols = (cols + 3) // 4
    arows = (rows + 3) // 4
    attrs = bytearray(acols * arows)
    for ar in range(arows):
        for ac in range(acols):
            byte = 0
            for quad in range(4):
                qr = (quad >> 1) & 1
                qc = quad & 1
                tr = ar * 4 + qr * 2
                tc = ac * 4 + qc * 2
                pal = 0
                if tr < len(nt):
                    row = nt[tr]
                    if tc < len(row) and isinstance(row[tc], dict):
                        pal = int(row[tc].get("palette", 0)) & 3
                byte |= pal << (quad * 2)
            attrs[ar * acols + ac] = byte
    return bytes(tiles), bytes(attrs), cols, rows, acols, arows


def build_bg_world_h(state):
    """Emit src/bg_world.h — world-nametable dimensions + array prototypes."""
    _, _, cols, rows, acols, arows = _world_nametable(state)
    lines = [
        "/* Auto-generated by playground_server.py — do not edit by hand. */",
        "/* Source: the Backgrounds page of the tile editor.              */",
        "#ifndef BG_WORLD_H",
        "#define BG_WORLD_H",
        "",
        "/* Full-world nametable, row-major.  Covers every screen the pupil",
        "   painted; the scroll core (Sprint 11 S-1) streams columns/rows",
        "   from this data into the off-screen nametable as the camera moves.",
        "   1x1 projects still include this header but nothing consumes it. */",
        f"#define BG_WORLD_COLS       {cols}",
        f"#define BG_WORLD_ROWS       {rows}",
        f"#define BG_WORLD_ATTR_COLS  {acols}",
        f"#define BG_WORLD_ATTR_ROWS  {arows}",
        "",
        "/* Full-world pixel dimensions.  Exposed here (rather than in",
        "   scroll.h) because main.c bounds-checks the player against them",
        "   even on the 1x1 fast path, where scroll.h is not included. */",
        "#define WORLD_W_PX          (BG_WORLD_COLS * 8)",
        "#define WORLD_H_PX          (BG_WORLD_ROWS * 8)",
        "",
        "extern const unsigned char bg_world_tiles[BG_WORLD_COLS * BG_WORLD_ROWS];",
        "extern const unsigned char bg_world_attrs[BG_WORLD_ATTR_COLS * BG_WORLD_ATTR_ROWS];",
        "",
        "#endif",
        "",
    ]
    return "\n".join(lines)


def build_bg_world_c(state):
    """Emit src/bg_world.c — flat tile + attribute arrays for the whole world."""
    tiles, attrs, cols, rows, acols, arows = _world_nametable(state)

    def _hex_table(name, size_expr, data, cols_per_line=16):
        out = [f"const unsigned char {name}[{size_expr}] = {{"]
        if not data:
            out.append("  0")
        else:
            for i in range(0, len(data), cols_per_line):
                chunk = data[i:i + cols_per_line]
                out.append("  " + ", ".join(f"0x{b:02X}" for b in chunk) + ",")
        out.append("};")
        return out

    lines = [
        "/* Auto-generated by playground_server.py — do not edit by hand. */",
        "/* Source: the Backgrounds page of the tile editor.              */",
        '#include "bg_world.h"',
        "",
        "/* Gate the arrays on world size so 1x1 builds emit no symbols,",
        "   keeping their ROM byte-identical to the pre-Sprint-11 baseline.",
        "   The scroll core only references these arrays under the same",
        "   guard — dangling externs are harmless as long as no caller",
        "   actually links against them. */",
        "#if (BG_WORLD_COLS > 32) || (BG_WORLD_ROWS > 30)",
        "",
        f"/* {cols} cols x {rows} rows of 8x8 tiles ({cols * rows} bytes). */",
    ]
    lines += _hex_table("bg_world_tiles", "BG_WORLD_COLS * BG_WORLD_ROWS", tiles)
    lines += [
        "",
        f"/* {acols} x {arows} attribute bytes ({acols * arows} bytes). */",
    ]
    lines += _hex_table("bg_world_attrs", "BG_WORLD_ATTR_COLS * BG_WORLD_ATTR_ROWS", attrs)
    lines += [
        "",
        "#endif",
        "",
    ]
    return "\n".join(lines)


BG_WORLD_H_PATH = STEP_DIR / "src" / "bg_world.h"
BG_WORLD_C_PATH = STEP_DIR / "src" / "bg_world.c"


# ---------------------------------------------------------------------------
# Build + launch pipeline
# ---------------------------------------------------------------------------

def _build_rom(body):
    """Generate + compile the ROM. Returns (rom_bytes, build_log) or raises.

    Three paths, chosen by the request body:

    * ``customMainAsm`` present -> asm tempdir build.  The Playground step
      tree is cloned, main.c is removed, the pupil's main.s lands in its
      place, and a minimal asm-only Makefile is written alongside it.
      scene.asminc + palettes.asminc are generated to feed `.include`.
    * ``customMainC`` present   -> C tempdir build (original 3b/3c path).
    * neither                   -> in-place build against the shared
      STEP_DIR using the stock main.c template.  Used by the native /
      offline workflow.
    """
    state = body.get("state")
    if not isinstance(state, dict):
        raise ValueError("missing 'state' in request body")

    custom_main_c = body.get("customMainC")
    if custom_main_c is not None and not isinstance(custom_main_c, str):
        raise ValueError("'customMainC' must be a string if provided")
    if isinstance(custom_main_c, str) and not custom_main_c.strip():
        custom_main_c = None

    custom_main_asm = body.get("customMainAsm")
    if custom_main_asm is not None and not isinstance(custom_main_asm, str):
        raise ValueError("'customMainAsm' must be a string if provided")
    if isinstance(custom_main_asm, str) and not custom_main_asm.strip():
        custom_main_asm = None

    if custom_main_c and custom_main_asm:
        raise ValueError("send only one of 'customMainC' or 'customMainAsm' per request")

    player_idx = int(body.get("playerSpriteIdx", 0))
    scene_sprites = body.get("sceneSprites") or []
    start = body.get("playerStart") or {}
    start_x = int(start.get("x", 60))
    start_y = int(start.get("y", 120))

    # Optional Player 2 (Phase B chunk 5).  Both fields must be present
    # and the idx must point at a second sprite; otherwise the ROM is
    # built as single-player.  The server always emits PLAYER2_ENABLED
    # so the template's #if gates have something defined to evaluate.
    raw_idx2 = body.get("playerSpriteIdx2")
    start2 = body.get("playerStart2") or {}
    try:
        player_idx2 = int(raw_idx2) if raw_idx2 is not None else -1
    except (TypeError, ValueError):
        player_idx2 = -1
    start_x2 = int(start2.get("x", 180)) if start2 else 180
    start_y2 = int(start2.get("y", 120)) if start2 else 120

    chr_bytes = build_chr(state)
    nam_bytes = build_nam(state)

    if custom_main_asm is not None:
        pal_asm = build_palettes_asminc(state)
        scene_asm = build_scene_asminc(state, player_idx, scene_sprites, start_x, start_y)
        return _build_asm_in_tempdir(
            custom_main_asm, chr_bytes, nam_bytes, pal_asm, scene_asm,
        )

    pal_src = build_palettes_inc(state)
    scene_src = build_scene_inc(
        state, player_idx, scene_sprites, start_x, start_y,
        player_idx2=player_idx2, start_x2=start_x2, start_y2=start_y2,
    )
    collision_h = build_collision_h(state)
    behaviour_c = build_behaviour_c(state)
    bg_world_h = build_bg_world_h(state)
    bg_world_c = build_bg_world_c(state)

    if custom_main_c is not None:
        return _build_in_tempdir(
            custom_main_c, chr_bytes, nam_bytes, pal_src, scene_src,
            collision_h, behaviour_c, bg_world_h, bg_world_c,
        )
    return _build_in_shared_dir(
        chr_bytes, nam_bytes, pal_src, scene_src, collision_h, behaviour_c,
        bg_world_h, bg_world_c,
    )


# Minimal Makefile for the asm-only build path.  No cc65 step; main.s and
# graphics.s go straight through ca65 -> ld65 against nes.lib.  Kept here
# rather than committed into STEP_DIR so the asm path doesn't complicate
# the stock Makefile pupils see when they open the workspace.
ASM_MAKEFILE = """\
# Generated by playground_server.py for the asm-only build path.
# Pure ca65 -> ld65, no nes.lib - main.s provides its own iNES header and
# hardware vectors, so the pupil can see the actual boot path without a C
# runtime in the way.
AS      = ca65
LD      = ld65
TARGET  = nes
CONFIG  = cfg/nes.cfg
ROM     = game.nes
BUILD   = build
OBJECTS = $(BUILD)/main.o $(BUILD)/graphics.o

.PHONY: all clean
all: $(ROM)

$(BUILD):
\tmkdir -p $(BUILD)

$(ROM): $(OBJECTS)
\t$(LD) -C $(CONFIG) -o $@ $(OBJECTS)

$(BUILD)/main.o: src/main.s src/scene.asminc src/palettes.asminc assets/sprites/game.chr assets/backgrounds/level.nam | $(BUILD)
\t$(AS) -t $(TARGET) -o $@ src/main.s

$(BUILD)/graphics.o: src/graphics.s assets/sprites/game.chr assets/backgrounds/level.nam | $(BUILD)
\t$(AS) -t $(TARGET) -o $@ src/graphics.s

clean:
\trm -rf $(BUILD) $(ROM)
"""


def _build_asm_in_tempdir(custom_main_asm, chr_bytes, nam_bytes, pal_asm, scene_asm):
    with tempfile.TemporaryDirectory(prefix="nesgame_build_asm_") as td:
        tmp_root = pathlib.Path(td) / "Step_Playground"
        shutil.copytree(
            STEP_DIR, tmp_root,
            ignore=shutil.ignore_patterns("game.nes", "*.o", "*.map", "build"),
        )
        # Nuke the stock C main and its includes so the pupil's asm build
        # is self-contained; the generated .asminc siblings take their place.
        for orphan in ("main.c", "scene.inc", "palettes.inc"):
            (tmp_root / "src" / orphan).unlink(missing_ok=True)
        (tmp_root / "src" / "main.s").write_text(custom_main_asm)
        (tmp_root / "src" / "scene.asminc").write_text(scene_asm)
        (tmp_root / "src" / "palettes.asminc").write_text(pal_asm)
        (tmp_root / "assets" / "sprites").mkdir(parents=True, exist_ok=True)
        (tmp_root / "assets" / "backgrounds").mkdir(parents=True, exist_ok=True)
        (tmp_root / "assets" / "sprites" / "game.chr").write_bytes(chr_bytes)
        (tmp_root / "assets" / "backgrounds" / "level.nam").write_bytes(nam_bytes)
        (tmp_root / "Makefile").write_text(ASM_MAKEFILE)

        build = subprocess.run(
            ["make", "-C", str(tmp_root)],
            capture_output=True, text=True,
        )
        build_log = (build.stdout or "") + (build.stderr or "")
        build_log = build_log.replace(str(tmp_root) + "/", "").replace(str(tmp_root), "")
        if build.returncode != 0:
            raise BuildError(build_log)

        rom_path = tmp_root / "game.nes"
        if not rom_path.exists():
            raise BuildError(build_log + "\ngame.nes missing after build")
        rom_bytes = rom_path.read_bytes()

    return rom_bytes, build_log


def _build_in_shared_dir(chr_bytes, nam_bytes, pal_src, scene_src,
                         collision_h, behaviour_c, bg_world_h, bg_world_c):
    # Serialise the shared-directory writes + make.  Multiple pupils pressing
    # Play at once queue here instead of corrupting each other's scene.inc.
    with BUILD_LOCK:
        CHR_PATH.parent.mkdir(parents=True, exist_ok=True)
        NAM_PATH.parent.mkdir(parents=True, exist_ok=True)
        SCENE_INC.parent.mkdir(parents=True, exist_ok=True)

        CHR_PATH.write_bytes(chr_bytes)
        NAM_PATH.write_bytes(nam_bytes)
        SCENE_INC.write_text(scene_src)
        PAL_INC.write_text(pal_src)
        COLLISION_H_PATH.write_text(collision_h)
        BEHAVIOUR_C_PATH.write_text(behaviour_c)
        BG_WORLD_H_PATH.write_text(bg_world_h)
        BG_WORLD_C_PATH.write_text(bg_world_c)

        build = subprocess.run(
            ["make", "-C", str(STEP_DIR)],
            capture_output=True, text=True,
        )
        build_log = (build.stdout or "") + (build.stderr or "")
        if build.returncode != 0:
            raise BuildError(build_log)

        rom_path = STEP_DIR / "game.nes"
        if not rom_path.exists():
            raise BuildError(build_log + "\ngame.nes missing after build")
        rom_bytes = rom_path.read_bytes()

    return rom_bytes, build_log


def _build_in_tempdir(custom_main, chr_bytes, nam_bytes, pal_src, scene_src,
                      collision_h, behaviour_c, bg_world_h, bg_world_c):
    # Clone STEP_DIR into a throwaway directory so the pupil's main.c and
    # generated asset files don't touch the shared tree.  Concurrent custom
    # builds can therefore proceed in parallel without the BUILD_LOCK.
    with tempfile.TemporaryDirectory(prefix="nesgame_build_") as td:
        tmp_root = pathlib.Path(td) / "Step_Playground"
        shutil.copytree(
            STEP_DIR, tmp_root,
            ignore=shutil.ignore_patterns("game.nes", "*.o", "*.map", "build"),
        )
        (tmp_root / "src" / "main.c").write_text(custom_main)

        (tmp_root / "assets" / "sprites").mkdir(parents=True, exist_ok=True)
        (tmp_root / "assets" / "backgrounds").mkdir(parents=True, exist_ok=True)
        (tmp_root / "assets" / "sprites" / "game.chr").write_bytes(chr_bytes)
        (tmp_root / "assets" / "backgrounds" / "level.nam").write_bytes(nam_bytes)
        (tmp_root / "src" / "scene.inc").write_text(scene_src)
        (tmp_root / "src" / "palettes.inc").write_text(pal_src)
        (tmp_root / "src" / "collision.h").write_text(collision_h)
        (tmp_root / "src" / "behaviour.c").write_text(behaviour_c)
        (tmp_root / "src" / "bg_world.h").write_text(bg_world_h)
        (tmp_root / "src" / "bg_world.c").write_text(bg_world_c)

        build = subprocess.run(
            ["make", "-C", str(tmp_root)],
            capture_output=True, text=True,
        )
        build_log = (build.stdout or "") + (build.stderr or "")
        # Strip the tempdir prefix out of diagnostics so clickable error
        # locations in the editor read as "src/main.c(42): Error ..." rather
        # than an unreachable /tmp/... path.
        build_log = build_log.replace(str(tmp_root) + "/", "").replace(str(tmp_root), "")
        if build.returncode != 0:
            raise BuildError(build_log)

        rom_path = tmp_root / "game.nes"
        if not rom_path.exists():
            raise BuildError(build_log + "\ngame.nes missing after build")
        rom_bytes = rom_path.read_bytes()

    return rom_bytes, build_log


class BuildError(RuntimeError):
    """cc65 build failed — .args[0] is the full build log."""


# ---------------------------------------------------------------------------
# Lesson library
# ---------------------------------------------------------------------------

def _parse_lesson(path):
    """Read a lesson .c file and return (metadata_dict, source_text) or None."""
    try:
        text = path.read_text()
    except OSError:
        return None
    m = LESSON_HEADER_RE.search(text)
    if not m:
        return None
    try:
        meta = json.loads(m.group(1))
    except json.JSONDecodeError as e:
        # Surface malformed lesson metadata via the server log so teachers
        # see the problem without digging through request responses.
        sys.stderr.write(f"[playground] bad lesson JSON in {path.name}: {e}\n")
        return None
    if not isinstance(meta, dict) or "id" not in meta:
        return None
    # Default the summary/goal/hints fields so the UI can render without
    # each lesson restating the whole schema.
    meta.setdefault("title", meta["id"])
    meta.setdefault("difficulty", 1)
    meta.setdefault("summary", "")
    meta.setdefault("description", "")
    meta.setdefault("goal", "")
    meta.setdefault("hints", [])
    return meta, text


def _scan_lessons():
    """Return a sorted list of (metadata, path) for every lesson .c file."""
    if not LESSONS_DIR.exists():
        return []
    out = []
    for p in sorted(LESSONS_DIR.glob("*.c")):
        parsed = _parse_lesson(p)
        if parsed is None:
            continue
        meta, _text = parsed
        out.append((meta, p))
    # Stable sort by (difficulty, id) so the picker has a predictable order.
    out.sort(key=lambda mp: (int(mp[0].get("difficulty", 1)), str(mp[0]["id"])))
    return out


def _find_lesson(lesson_id):
    if not LESSON_ID_RE.match(lesson_id or ""):
        return None
    for meta, path in _scan_lessons():
        if str(meta.get("id")) == lesson_id:
            return meta, path
    return None


# ---------------------------------------------------------------------------
# Snippet library
# ---------------------------------------------------------------------------

def _parse_snippet(path):
    """Read a snippet .c file and return (metadata_dict, body_text) or None.

    The body is everything after the closing `*/` of the header.  Leading
    and trailing blank lines are trimmed so the picker can paste cleanly.
    """
    try:
        text = path.read_text()
    except OSError:
        return None
    m = SNIPPET_HEADER_RE.search(text)
    if not m:
        return None
    try:
        meta = json.loads(m.group(1))
    except json.JSONDecodeError as e:
        sys.stderr.write(f"[playground] bad snippet JSON in {path.name}: {e}\n")
        return None
    if not isinstance(meta, dict) or "id" not in meta:
        return None
    meta.setdefault("title", meta["id"])
    meta.setdefault("summary", "")
    meta.setdefault("description", "")
    meta.setdefault("regions", [])
    meta.setdefault("tags", [])
    body = text[m.end():].strip("\n")
    # Collapse a trailing newline-only tail so pasted snippets don't spawn
    # an extra blank line below the cursor.
    body = body.rstrip() + "\n"
    return meta, body


def _scan_snippets():
    if not SNIPPETS_DIR.exists():
        return []
    out = []
    for p in sorted(SNIPPETS_DIR.glob("*.c")):
        parsed = _parse_snippet(p)
        if parsed is None:
            continue
        meta, _body = parsed
        out.append((meta, p))
    out.sort(key=lambda mp: str(mp[0]["id"]))
    return out


def _find_snippet(snippet_id):
    if not LESSON_ID_RE.match(snippet_id or ""):
        return None
    for meta, path in _scan_snippets():
        if str(meta.get("id")) == snippet_id:
            parsed = _parse_snippet(path)
            if parsed is None:
                return None
            return parsed[0], parsed[1]
    return None


def run_play(body):
    # mode: "browser" (default) returns ROM bytes for jsnes to run in the
    # tab; "native" launches fceux on the server's desktop (only useful for
    # the offline single-user workflow).  "native" auto-falls-back to
    # browser behaviour with a warning if fceux isn't on PATH.
    mode = (body.get("mode") or "browser").lower()

    started = time.time()
    try:
        rom_bytes, build_log = _build_rom(body)
    except BuildError as e:
        return {"ok": False, "stage": "build", "log": str(e),
                "build_time_ms": int((time.time() - started) * 1000)}
    except Exception as e:
        return {"ok": False, "stage": "generate",
                "log": f"{type(e).__name__}: {e}\n\n{traceback.format_exc()}",
                "build_time_ms": int((time.time() - started) * 1000)}

    built_epoch = time.time()
    result = {"ok": True, "log": build_log, "size": len(rom_bytes),
              "built_epoch": built_epoch,
              "built_iso": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(built_epoch)),
              "build_time_ms": int((built_epoch - started) * 1000)}

    if mode == "native":
        if not FCEUX_PATH:
            result["stage"] = "launched-browser-fallback"
            result["warning"] = "fceux is not installed on the server; returning ROM for in-browser play instead."
            result["rom_b64"] = base64.b64encode(rom_bytes).decode("ascii")
            return result
        try:
            subprocess.Popen(
                [FCEUX_PATH, str(STEP_DIR / "game.nes")],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
        except Exception as e:
            return {"ok": False, "stage": "launch",
                    "log": build_log + f"\nfailed to launch fceux: {e}"}
        result["stage"] = "launched-native"
        return result

    # Browser mode: stream the ROM back, let jsnes run it in the tab.
    result["stage"] = "built"
    result["rom_b64"] = base64.b64encode(rom_bytes).decode("ascii")
    return result


# ---------------------------------------------------------------------------
# HTTP plumbing
# ---------------------------------------------------------------------------

class Handler(http.server.SimpleHTTPRequestHandler):
    # Serve static files out of WEB_DIR.
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            return self._json(200, {
                "ok": True,
                "fceux": FCEUX_PATH is not None,
                "modes": ["browser"] + (["native"] if FCEUX_PATH else []),
            })
        if parsed.path == "/default-main-c":
            return self._default_main_c()
        if parsed.path == "/default-main-s":
            return self._default_main_s()
        if parsed.path == "/lessons":
            return self._lessons_index()
        if parsed.path.startswith("/lessons/"):
            return self._lesson_body(unquote(parsed.path[len("/lessons/"):]))
        if parsed.path == "/snippets":
            return self._snippets_index()
        if parsed.path.startswith("/snippets/"):
            return self._snippet_body(unquote(parsed.path[len("/snippets/"):]))
        if parsed.path == "/feedback":
            return self._feedback_viewer()
        return super().do_GET()

    def _lessons_index(self):
        metas = [m for m, _p in _scan_lessons()]
        return self._json(200, {"ok": True, "lessons": metas})

    def _lesson_body(self, lesson_id):
        found = _find_lesson(lesson_id)
        if not found:
            return self.send_error(404, f"no such lesson: {lesson_id}")
        meta, path = found
        try:
            data = path.read_bytes()
        except OSError as e:
            return self.send_error(500, f"could not read {path.name}: {e}")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _snippets_index(self):
        metas = [m for m, _p in _scan_snippets()]
        return self._json(200, {"ok": True, "snippets": metas})

    def _snippet_body(self, snippet_id):
        found = _find_snippet(snippet_id)
        if not found:
            return self.send_error(404, f"no such snippet: {snippet_id}")
        meta, body = found
        data = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _default_main_c(self):
        try:
            data = DEFAULT_MAIN_C.read_bytes()
        except OSError as e:
            return self.send_error(500, f"could not read default main.c: {e}")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _default_main_s(self):
        try:
            data = DEFAULT_MAIN_S.read_bytes()
        except OSError as e:
            return self.send_error(500, f"could not read default main.s: {e}")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/play":
            length = int(self.headers.get("Content-Length", "0") or "0")
            raw = self.rfile.read(length)
            try:
                body = json.loads(raw.decode("utf-8"))
            except Exception as e:
                return self._json(400, {"ok": False, "stage": "input", "log": f"bad JSON: {e}"})
            try:
                result = run_play(body)
            except Exception:
                result = {"ok": False, "stage": "server", "log": traceback.format_exc()}
            return self._json(200 if result.get("ok") else 500, result)
        if parsed.path == "/feedback":
            return self._feedback()
        if parsed.path == "/feedback/handled":
            return self._feedback_toggle_handled()
        return self.send_error(404)

    def _feedback(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0 or length > FEEDBACK_MAX_BODY:
            return self._json(400, {"ok": False, "error": "bad payload size"})
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            return self._json(400, {"ok": False, "error": "bad JSON"})
        if not isinstance(body, dict):
            return self._json(400, {"ok": False, "error": "bad JSON"})

        category = body.get("category")
        if category not in FEEDBACK_CATEGORIES:
            return self._json(400, {"ok": False, "error": "category required"})

        message = (body.get("message") or "").strip()
        if not message:
            return self._json(400, {"ok": False, "error": "message required"})
        if len(message) > FEEDBACK_MAX_MESSAGE:
            return self._json(400, {"ok": False, "error": "message too long"})

        name = (body.get("name") or "").strip()[:FEEDBACK_MAX_NAME]
        project_name = (body.get("projectName") or "").strip()[:FEEDBACK_MAX_PROJECT]
        page = body.get("page") if body.get("page") in FEEDBACK_PAGES else ""

        record = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "ip": self.client_address[0] if self.client_address else "",
            "category": category,
            "message": message,
            "name": name,
            "page": page,
            "projectName": project_name,
            "userAgent": self.headers.get("User-Agent", "")[:200],
        }
        project = body.get("project")
        if isinstance(project, dict):
            record["project"] = project
        line = json.dumps(record, ensure_ascii=False) + "\n"
        try:
            with FEEDBACK_LOCK:
                with FEEDBACK_PATH.open("a", encoding="utf-8") as fh:
                    fh.write(line)
        except OSError as e:
            sys.stderr.write(f"[playground] feedback write failed: {e}\n")
            return self._json(500, {"ok": False, "error": "could not save feedback"})
        return self._json(200, {"ok": True})

    def _feedback_viewer(self):
        records = _load_feedback_records()
        handled = _load_handled_set()
        html = _render_feedback_viewer(records, handled).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(html)))
        self.end_headers()
        self.wfile.write(html)

    def _feedback_toggle_handled(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0 or length > 4096:
            return self._json(400, {"ok": False, "error": "bad payload size"})
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            return self._json(400, {"ok": False, "error": "bad JSON"})
        if not isinstance(body, dict):
            return self._json(400, {"ok": False, "error": "bad JSON"})
        try:
            idx = int(body.get("index"))
        except Exception:
            return self._json(400, {"ok": False, "error": "index required"})
        if idx < 1:
            return self._json(400, {"ok": False, "error": "bad index"})
        handled_flag = bool(body.get("handled"))
        with FEEDBACK_HANDLED_LOCK:
            current = _load_handled_set()
            if handled_flag:
                current.add(idx)
            else:
                current.discard(idx)
            _save_handled_set(current)
        return self._json(200, {"ok": True})

    def _json(self, code, obj):
        data = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):  # keep the server log tidy
        sys.stderr.write("[playground] " + (fmt % args) + "\n")


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def _port_in_use(host, port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        try:
            s.connect((host, port))
            return True
        except OSError:
            return False


def _ping_existing_playground(host, port):
    """Return True if something on host:port already speaks our /health."""
    try:
        req = urllib.request.Request(f"http://{host}:{port}/health")
        with urllib.request.urlopen(req, timeout=0.5) as r:
            body = json.loads(r.read().decode("utf-8"))
            return bool(body.get("ok"))
    except (urllib.error.URLError, OSError, ValueError):
        return False


def main():
    if not WEB_DIR.exists():
        sys.exit(f"web dir not found: {WEB_DIR}")
    if not STEP_DIR.exists():
        sys.exit(f"step dir not found: {STEP_DIR}")

    # Idempotent start: VSCode's 'runOn: folderOpen' can fire this task more
    # than once across window reloads.  If another playground server is
    # already listening, just print a friendly message and exit 0.
    probe_host = "127.0.0.1" if HOST in ("0.0.0.0", "") else HOST
    if _port_in_use(probe_host, PORT):
        if _ping_existing_playground(probe_host, PORT):
            print(
                f"Playground server already running on http://{probe_host}:{PORT}/ -- nothing to do.\n"
                f"  Editor:  http://{probe_host}:{PORT}/index.html\n"
                f"  Sprites: http://{probe_host}:{PORT}/sprites.html",
                file=sys.stderr, flush=True,
            )
            return
        sys.exit(
            f"Port {PORT} is in use by something else (not a playground server).\n"
            f"  Find it with:  lsof -iTCP:{PORT} -sTCP:LISTEN\n"
            f"  Or change PLAYGROUND_PORT in the env."
        )

    srv = ThreadedHTTPServer((HOST, PORT), Handler)
    display_host = "0.0.0.0 (all interfaces)" if HOST == "0.0.0.0" else HOST
    fceux_note = f"fceux: {FCEUX_PATH}" if FCEUX_PATH else "fceux: not installed (browser mode only)"
    banner = (
        f"Playground server listening on {display_host}:{PORT}\n"
        f"  Editor:    http://{probe_host}:{PORT}/index.html\n"
        f"  Sprites:   http://{probe_host}:{PORT}/sprites.html\n"
        f"  Code:      http://{probe_host}:{PORT}/code.html\n"
        f"  {fceux_note}\n"
        f"Press Ctrl-C to stop."
    )
    print(banner, file=sys.stderr, flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        srv.shutdown()
        print("stopped", file=sys.stderr)


if __name__ == "__main__":
    main()
