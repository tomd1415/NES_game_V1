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
import secrets
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


def _load_dotenv(path):
    """Populate os.environ from a .env file so config (class join code, admin
    secret, port, …) can live in one gitignored file instead of being exported
    by hand on every launch.  Zero-dependency, deliberately tiny.

    Rules: a real environment variable ALWAYS wins (so launchers, systemd units
    and the test harness override the file); blank lines and ``#`` comments are
    skipped; an optional ``export`` prefix and surrounding quotes are stripped.
    Set ``PLAYGROUND_SKIP_DOTENV=1`` to ignore the file entirely (the test
    harness does this so a developer's .env can never change test behaviour)."""
    if os.environ.get("PLAYGROUND_SKIP_DOTENV"):
        return
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export "):].lstrip()
        key, sep, val = line.partition("=")
        if not sep:
            continue
        key, val = key.strip(), val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"'):
            val = val[1:-1]
        if key and key not in os.environ:   # real env wins over the file
            os.environ[key] = val


# Load before any os.environ.get() reads below, so .env can set PORT, the
# account join code/admin secret, etc.
_load_dotenv(ROOT / ".env")
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

# Phase 4.2 — published-project gallery.  Lives outside WEB_DIR so a
# pupil running the editor can't accidentally clobber another pupil's
# entry from a project's import/export.  Removal is authorized (S1.2,
# 2026-07-05): a signed-in pupil may delete only their own entries, and a
# teacher (admin secret) may delete any — see
# docs/plans/current/2026-07-05-trust-and-hardening.md.
# PLAYGROUND_GALLERY_DIR overrides the location (used by tests to isolate).
GALLERY_DIR = pathlib.Path(os.environ.get("PLAYGROUND_GALLERY_DIR") or (ROOT / "tools" / "gallery"))

# Phase 4.3 — starter audio assets shipped under tools/audio/starter/.
# Each .s is built from a .fmstxt project via the FamiStudio CLI
# (see tools/audio/starter/build.sh).  The /starter/audio endpoint
# parses the symbol exports out of each file and serves them to the
# editor so pupils can drop a starter pack into their project with
# one click.
AUDIO_STARTER_DIR = ROOT / "tools" / "audio" / "starter"
AUDIO_STARTER_SONGS = [
    ("Cheerful loop", "song_cheerful_loop.s"),
    ("Tense loop",    "song_tense_loop.s"),
]
AUDIO_STARTER_SFX = ("Starter sfx pack", "sfx_pack.s")

# Absolute path the Makefile's FAMISTUDIO_DIR variable gets
# overridden to.  The Makefile's default is `../../tools/audio/
# famistudio`, which resolves correctly when make runs in STEP_DIR
# but breaks when the customMainC path clones STEP_DIR into a
# tempdir (the relative path then points at a sibling that doesn't
# exist).  Passing the absolute path on the make command line
# works for both paths, and the build output stays portable
# because the engine's `.include` / `.incbin` paths are all
# relative to the engine source, not the Makefile.
AUDIO_ENGINE_DIR = ROOT / "tools" / "audio" / "famistudio"

# Auto-stubs used when a pupil uploads only one side of the audio
# pair (a song without an sfx pack, or vice versa).  Without these,
# main.c's `extern audio_default_music[]` / `extern audio_sfx_data[]`
# would fail to link and the build fell back to USE_AUDIO=0 entirely
# — pupils saw silence even though they'd uploaded music.  These
# stubs are the minimum-viable blobs the FamiStudio engine accepts:
# the song stub is one channel of immediate end-of-song markers
# (silent), and the sfx stub is a single null entry.  Both lifted
# from tools/builder-tests/audio.mjs's STUB_*_ASM constants which
# the regression suite already proves compile + link cleanly.
_AUTO_SONGS_STUB_ASM = """\
.export _audio_default_music:=audio_default_music
.export audio_default_music
audio_default_music:
\t.byte 1
\t.word @instruments
\t.word @samples-4
\t.word @song0ch0
\t.word @song0ch1
\t.word @song0ch2
\t.word @song0ch3
\t.word @song0ch4
\t.byte .lobyte(@tempo_env_1_mid), .hibyte(@tempo_env_1_mid), 0, 0
@instruments:
\t.byte 0
@samples:
@song0ch0:
@song0ch1:
@song0ch2:
@song0ch3:
@song0ch4:
\t.byte $00
@tempo_env_1_mid:
\t.byte 6, 6, 6, 6, $00
"""

_AUTO_SFX_STUB_ASM = """\
.export _audio_sfx_data:=audio_sfx_data
.export audio_sfx_data
audio_sfx_data:
\t.word @ntsc
\t.word @ntsc
@ntsc:
\t.byte $00, $00
"""

# Prelude prepended to every staged pupil-uploaded audio .s file
# before ca65 sees it.  Pupil-reported (2026-04-27): newer
# FamiStudio versions wrap their `.export _<sym>=<sym>` lines in
# `.if FAMISTUDIO_CFG_C_BINDINGS ... .endif`, and ca65 errors with
# "Constant expression expected" when the `.if` symbol isn't
# pre-defined.  Defining it to 0 here makes ca65 evaluate the .if
# as false and skip the wrapped exports — harmless because our
# alias trailer (added by play-pipeline.js) maps
# `audio_default_music` / `audio_sfx_data` to the right symbol
# directly without needing those underscore-prefixed aliases.  We
# preempt a few sibling FAMISTUDIO_CFG_* gates the same way to
# keep the failure mode from creeping back in if FamiStudio adds
# more conditional blocks in future exports.
_AUDIO_ASM_PRELUDE = """\
; Auto-prepended by playground_server.py — see _AUDIO_ASM_PRELUDE
; in tools/playground_server.py for the why.  Defines symbols that
; newer FamiStudio exports test via `.if`, so ca65 can evaluate
; them as constant 0 instead of erroring with "Constant expression
; expected".
.ifndef FAMISTUDIO_CFG_C_BINDINGS
FAMISTUDIO_CFG_C_BINDINGS = 0
.endif

"""


_FAMISTUDIO_CFG_DEF_RE = re.compile(
    r"^\s*FAMISTUDIO_CFG_C_BINDINGS\s*=", re.MULTILINE)


def _stage_audio_asm(asm: str) -> str:
    """Prepend the FamiStudio-config prelude to a pupil-uploaded
    audio .s string so newer-FamiStudio exports' `.if`-wrapped
    `_music_data_*` exports assemble cleanly.  The prelude itself
    is `.ifndef`-guarded, so prepending unconditionally is safe.
    We still skip it when the pupil's file *already* assigns the
    symbol (`FAMISTUDIO_CFG_C_BINDINGS = N`) so a future
    upstream-fixed export doesn't end up double-defining via two
    `.ifndef` blocks evaluating differently."""
    if not asm:
        return asm
    if _FAMISTUDIO_CFG_DEF_RE.search(asm):
        return asm
    return _AUDIO_ASM_PRELUDE + asm
GALLERY_LOCK = threading.Lock()
GALLERY_MAX_BODY = 4 * 1024 * 1024  # 4 MB — ROM + preview + project state.
GALLERY_MAX_TITLE = 80
GALLERY_MAX_DESC = 500
GALLERY_MAX_HANDLE = 40
GALLERY_SOURCE_PAGES = ("builder", "code")
GALLERY_FILES = ("rom.nes", "preview.png", "project.json", "metadata.json")

FEEDBACK_CATEGORIES = ("feature", "broken", "general")
FEEDBACK_PAGES = ("index", "sprites", "behaviour", "code", "builder")
# 1 MB body cap — a project snapshot is typically 30-100 kB.
FEEDBACK_MAX_BODY = 1024 * 1024
# 4 MB body cap for /play — project state + custom C/asm source + audio asm.
PLAY_MAX_BODY = 4 * 1024 * 1024
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

  // Marking feedback handled is a teacher action — ask for the teacher secret
  // once (kept only in this tab's sessionStorage) and send it with each change.
  function teacherSecret() {
    let s = sessionStorage.getItem('feedbackAdminSecret') || '';
    if (!s) { s = prompt('Teacher secret (to change feedback state):') || ''; if (s) sessionStorage.setItem('feedbackAdminSecret', s); }
    return s;
  }
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
          body: JSON.stringify({ index: idx, handled, admin_secret: teacherSecret() }),
        });
        if (r.status === 403) { sessionStorage.removeItem('feedbackAdminSecret'); throw new Error('wrong teacher secret'); }
        if (!r.ok) throw new Error('HTTP ' + r.status);
      } catch (e) {
        cb.checked = !handled;
        card.classList.toggle('handled', !handled);
        alert("Couldn't save — " + e.message);
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

# --- Pupil accounts (T4.2 — P1) --------------------------------------------
# See docs/plans/current/2026-06-21-pupil-accounts.md.  Data-minimisation:
# only a non-real-name username + a scrypt-hashed password are stored.  Self-
# signup is gated on a class join code (PLAYGROUND_JOIN_CODE); with no code set
# enrolment is closed (safe default for the public instance).  Forgotten
# passwords recover via a one-time code (issued at signup) or a teacher reset
# using PLAYGROUND_ADMIN_SECRET.  The DB is a single SQLite file kept out of
# git.  Cookies are marked Secure when the request arrives over HTTPS (the
# classroom instance is behind an HTTPS reverse proxy that sets
# X-Forwarded-Proto); PLAYGROUND_FORCE_SECURE_COOKIES forces it on.
import accounts  # local module (tools/accounts.py)

ACCOUNTS_DB = os.environ.get("PLAYGROUND_ACCOUNTS_DB", str(ROOT / "tools" / "accounts.db"))
ACCOUNTS = accounts.AccountStore(
    ACCOUNTS_DB,
    join_code=os.environ.get("PLAYGROUND_JOIN_CODE", ""),
    admin_secret=os.environ.get("PLAYGROUND_ADMIN_SECRET", ""),
    session_ttl=int(os.environ.get("PLAYGROUND_SESSION_TTL", "0") or "0")
    or accounts.SESSION_TTL_SECONDS,
)
COOKIE_FORCE_SECURE = os.environ.get("PLAYGROUND_FORCE_SECURE_COOKIES", "") == "1"

# --- CSRF (Origin check) ---------------------------------------------------
# The session cookie is SameSite=Lax, which already stops it riding along on a
# cross-site POST — the primary CSRF vector.  As defence-in-depth we ALSO check
# the Origin/Referer on the routes that perform a state change using the
# ambient session cookie (publish, remove, /me/projects).  The hot /play path
# and admin-secret routes are exempt (see _csrf_origin_ok).  Robust behind the
# classroom's HTTPS reverse proxy: the expected host is drawn from Host AND
# X-Forwarded-Host, plus an optional explicit allowlist; a kill-switch exists.
CSRF_ALLOWED_ORIGINS = {
    o.strip().lower()
    for o in (os.environ.get("PLAYGROUND_ALLOWED_ORIGINS", "") or "").replace(",", " ").split()
    if o.strip()
}
CSRF_ORIGIN_CHECK = os.environ.get("PLAYGROUND_DISABLE_CSRF_ORIGIN_CHECK", "") != "1"
# State-changing routes authenticated by the session COOKIE (so a browser would
# attach it automatically) — these want the Origin check.
CSRF_PROTECTED_PATHS = {"/gallery/publish", "/gallery/remove", "/me/projects"}
AUTH_MAX_BODY = 16 * 1024  # signup/login/reset bodies are tiny
# Per-IP rate limit on auth attempts (signup + login + reset): 12 / minute by
# default; both bounds overridable so tests can exercise the limiter cheaply.
AUTH_RATE = accounts.RateLimiter(
    max_attempts=int(os.environ.get("PLAYGROUND_AUTH_RATE_MAX", "12") or "12"),
    window_seconds=int(os.environ.get("PLAYGROUND_AUTH_RATE_WINDOW", "60") or "60"),
)

# Every browser/native build now runs in its OWN throwaway temp dir (see
# _build_in_tempdir), so builds no longer race on the shared steps/Step_Playground
# tree and never leave "build-dirt".  Rather than serialise all of them (the old
# BUILD_LOCK — a bottleneck when 30 pupils press Play at once) or let them run
# fully unbounded (which would spawn 30 cc65 processes and thrash the box), cap
# concurrent compiles with a semaphore sized to the machine.
_BUILD_MAX = max(2, min(8, (os.cpu_count() or 2)))
BUILD_SEM = threading.BoundedSemaphore(_BUILD_MAX)

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


# --- Built-in dialogue font ------------------------------------------------
#
# Dialogue renders text as raw background tile indices (A = tile 0x41 ...),
# so the glyphs must physically exist in the bg pattern table.  Most projects
# (especially gallery loads) never paint a font there, which is the "dialogue
# shows garbage" bug.  When the dialogue module is on, build_chr() seeds these
# glyphs into the *blank* bg tile slots at their ASCII indices, so dialogue
# "just works" without the pupil painting a font.  Pupil art already in a slot
# is left untouched (see _seed_dialogue_font).  See the architecture review §N3
# and docs/plans/current/2026-06-18-codegen-rework-implementation.md (Sprint 3).
#
# Glyphs are an 8x8, 5x7 letterform drawn here as readable bitmaps; '#' is an
# on pixel (colour 1), '.' is off (colour 0 / transparent).
#
# Sync note: these keys define the dialogue character set, which is mirrored in
# two other places that must agree (enforced by a run-all.mjs guard):
# `DIALOGUE_GLYPH_CHARS` in tools/tile_editor_web/index.html (the editor's
# reserved-letter-tile marking, minus space) and `SUPPORTED` in
# tools/tile_editor_web/builder-validators.js (the unsupported-char warning).

def _glyph(*rows):
    """8 rows of up-to-8 chars -> an 8x8 pixel grid, padded/truncated.

    Arc B box fix: a stroke ("#") is colour 1 (the readable text colour) and
    every other pixel is colour **2** (the box body), NOT colour 0.  Colour 0 is
    the shared universal_bg, so an all-0 box body matched the backdrop and the
    scenery appeared to vanish; colour 2 is a dedicated box colour (navy) the
    server seeds into BG palette 3, so the box reads as a distinct box on any
    project.  Knock-on: the space glyph (`_glyph()` with no rows) becomes a
    solid colour-2 tile — exactly the box-body fill the banner writes."""
    out = []
    for r in range(8):
        row = rows[r] if r < len(rows) else ""
        out.append([1 if c == "#" else 2 for c in row.ljust(8, ".")[:8]])
    return out


_DIALOGUE_FONT = {
    " ": _glyph(),
    "A": _glyph(".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"),
    "B": _glyph("####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."),
    "C": _glyph(".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."),
    "D": _glyph("####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."),
    "E": _glyph("#####", "#....", "#....", "###..", "#....", "#....", "#####"),
    "F": _glyph("#####", "#....", "#....", "###..", "#....", "#....", "#...."),
    "G": _glyph(".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."),
    "H": _glyph("#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"),
    "I": _glyph(".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."),
    "J": _glyph("..###", "...#.", "...#.", "...#.", "#..#.", "#..#.", ".##.."),
    "K": _glyph("#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"),
    "L": _glyph("#....", "#....", "#....", "#....", "#....", "#....", "#####"),
    "M": _glyph("#...#", "##.##", "#.#.#", "#...#", "#...#", "#...#", "#...#"),
    "N": _glyph("#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"),
    "O": _glyph(".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."),
    "P": _glyph("####.", "#...#", "#...#", "####.", "#....", "#....", "#...."),
    "Q": _glyph(".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"),
    "R": _glyph("####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"),
    "S": _glyph(".####", "#....", "#....", ".###.", "....#", "....#", "####."),
    "T": _glyph("#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."),
    "U": _glyph("#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."),
    "V": _glyph("#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."),
    "W": _glyph("#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"),
    "X": _glyph("#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"),
    "Y": _glyph("#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."),
    "Z": _glyph("#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"),
    "0": _glyph(".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."),
    "1": _glyph("..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."),
    "2": _glyph(".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"),
    "3": _glyph("####.", "....#", "....#", ".###.", "....#", "....#", "####."),
    "4": _glyph("...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."),
    "5": _glyph("#####", "#....", "####.", "....#", "....#", "#...#", ".###."),
    "6": _glyph(".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."),
    "7": _glyph("#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."),
    "8": _glyph(".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."),
    "9": _glyph(".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."),
    ".": _glyph("", "", "", "", "", ".##..", ".##.."),
    ",": _glyph("", "", "", "", ".##..", ".##..", ".#..."),
    "!": _glyph("..#..", "..#..", "..#..", "..#..", "..#..", "", "..#.."),
    "?": _glyph(".###.", "#...#", "...#.", "..#..", "..#..", "", "..#.."),
    "'": _glyph("..#..", "..#..", "..#..", "", "", "", ""),
    "-": _glyph("", "", "", "#####", "", "", ""),
    ":": _glyph("", ".##..", ".##..", "", ".##..", ".##..", ""),
}


def _pixels_blank(px):
    """True if a tile's pixel grid is all zero (a paintable empty slot)."""
    if not isinstance(px, list):
        return True
    for row in px:
        if isinstance(row, list):
            for p in row:
                if p:
                    return False
    return True


def _dialogue_module_enabled(state):
    try:
        mods = (state.get("builder") or {}).get("modules") or {}
        return bool((mods.get("dialogue") or {}).get("enabled"))
    except AttributeError:
        return False


# Arc B — reserved dialogue box palette.  When the dialogue module is on the
# server overrides BG sub-palette 3 (the least-used "sky" default; matches
# BW_DIALOG_PALETTE in builder-modules.js) so the dialogue box has a KNOWN
# readable text colour independent of whatever art the pupil painted.  The
# emitted palette row is [universal_bg, slot0, slot1, slot2] (colour 0 is the
# shared universal_bg), and the font's "on" pixels are colour 1 == slot0 — so
# slot0 is the text colour.  slot0 = 0x30 (white) → white text on the
# universal_bg box body; slot1/slot2 reserved for a future border/accent.
DIALOGUE_BG_PALETTE = 3
# [colour1 = text, colour2 = box body, colour3 = spare].  colour1 = white text;
# colour2 = navy box body (a dark colour that stays visible on light AND dark/
# black backdrops, unlike colour 0 = the shared universal_bg which matched the
# backdrop and made the scenery look like it vanished — the Arc B box fix).
DIALOGUE_BG_PALETTE_SLOTS = [0x30, 0x01, 0x0F]


def _palette_slots_for(state, group, i):
    """Like _palette_slots, but substitutes the reserved dialogue palette for
    BG sub-palette 3 when the dialogue module is on.  Used by the palette
    emitters so the box text colour is guaranteed.  No-op when dialogue is off
    (→ byte-identical baseline unaffected)."""
    if (group == "bg_palettes" and i == DIALOGUE_BG_PALETTE
            and _dialogue_module_enabled(state)):
        return list(DIALOGUE_BG_PALETTE_SLOTS)
    return _palette_slots(state, group, i)


def _seed_dialogue_font(state):
    """Fill blank bg tiles at the font's ASCII indices with the built-in
    glyphs when the dialogue module is on.  Only blank slots are written, so
    pupil art in an occupied slot is never overwritten (the dialogue-font
    validator warns about that case separately).  Mutates the request-scoped
    `state` in place; a no-op when dialogue is off, so non-dialogue ROMs are
    unchanged (and the byte-identical baseline never runs this — it builds
    Step_Playground via make, not build_chr)."""
    if not _dialogue_module_enabled(state):
        return
    bg = state.get("bg_tiles")
    if not isinstance(bg, list):
        return
    for ch, glyph in _DIALOGUE_FONT.items():
        idx = ord(ch)
        if not (0 <= idx < len(bg)):
            continue
        tile = bg[idx]
        if not isinstance(tile, dict):
            continue
        if _pixels_blank(tile.get("pixels")):
            tile["pixels"] = [row[:] for row in glyph]


def _smbhud_enabled(state):
    """True when the SMB HUD module is on (needs sprite digits seeded)."""
    try:
        m = state["builder"]["modules"]
        if m.get("game", {}).get("config", {}).get("type") != "smb":
            return False
        return bool(m.get("smbhud", {}).get("enabled"))
    except Exception:
        return False


def _seed_hud_digits(state):
    """Seed the built-in 0-9 glyphs into blank SPRITE tiles at their ASCII
    indices (48..57) when the SMB HUD is on, so the OAM digit read-out has art.
    Mirrors _seed_dialogue_font but writes the sprite pool (the HUD draws OAM
    sprites, which read the sprite pattern table, not the bg one).  A no-op when
    the HUD is off, so non-HUD ROMs are unchanged."""
    if not _smbhud_enabled(state):
        return
    sp = state.get("sprite_tiles")
    if not isinstance(sp, list):
        return
    for d in "0123456789":
        idx = ord(d)
        if not (0 <= idx < len(sp)):
            continue
        tile = sp[idx]
        if isinstance(tile, dict) and _pixels_blank(tile.get("pixels")):
            tile["pixels"] = [row[:] for row in _DIALOGUE_FONT[d]]


def _smbhud_bg_enabled(state):
    """True when the SMB HUD is on AND set to the background-status-bar mode
    (needs the 0-9 glyphs seeded into the BACKGROUND pattern table)."""
    try:
        m = state["builder"]["modules"]
        if m.get("game", {}).get("config", {}).get("type") != "smb":
            return False
        hud = m.get("smbhud", {})
        return bool(hud.get("enabled") and (hud.get("config") or {}).get("background"))
    except Exception:
        return False


# Tile index (both pools) for the solid status-bar tile: an opaque background so
# the sprite-0 split fires reliably, and the sprite-0 marker sprite itself.  58 is
# just past the 0-9 digit glyphs (48-57) the bg HUD also seeds.
BW_HUDBG_SOLID_TILE = 58


def _seed_hud_digits_bg(state):
    """Seed the built-in 0-9 glyphs into blank BACKGROUND tiles at their ASCII
    indices (48..57) when the SMB HUD is in background mode, so the nametable
    status bar can draw the read-out as background tiles (BW_SMB_HUD_BG). Same
    indices as the dialogue font, so the two never conflict.  Also seeds a solid
    opaque tile at BW_HUDBG_SOLID_TILE in BOTH pools — the bar background (so the
    sprite-0 hit has an opaque bg pixel) and the sprite-0 marker.  A no-op
    otherwise, so non-bg-HUD ROMs are byte-identical."""
    if not _smbhud_bg_enabled(state):
        return
    bg = state.get("bg_tiles")
    if not isinstance(bg, list):
        return
    for d in "0123456789":
        idx = ord(d)
        if not (0 <= idx < len(bg)):
            continue
        tile = bg[idx]
        if isinstance(tile, dict) and _pixels_blank(tile.get("pixels")):
            tile["pixels"] = [row[:] for row in _DIALOGUE_FONT[d]]
    solid = [[1] * 8 for _ in range(8)]
    # BG: fully solid (the bar background + the sprite-0 hit target).
    if isinstance(bg, list) and 0 <= BW_HUDBG_SOLID_TILE < len(bg):
        t = bg[BW_HUDBG_SOLID_TILE]
        if isinstance(t, dict) and _pixels_blank(t.get("pixels")):
            t["pixels"] = [row[:] for row in solid]
    # SPRITE-0 marker: opaque ONLY in the bottom row, so the hit fires on that
    # scanline (the strip's bottom) rather than the sprite's top — a clean split.
    sp = state.get("sprite_tiles")
    if isinstance(sp, list) and 0 <= BW_HUDBG_SOLID_TILE < len(sp):
        t = sp[BW_HUDBG_SOLID_TILE]
        if isinstance(t, dict) and _pixels_blank(t.get("pixels")):
            t["pixels"] = [[0] * 8 for _ in range(7)] + [[1] * 8]


def build_chr(state):
    """Two independent 256-tile pools -> 8KB CHR.

    Sprite pattern table lives at $0000 (first 4KB), background pattern
    table at $1000 (second 4KB) -- matches PPU_CTRL bit 4 = 1 set by the
    step's init code. Old saves with a single `tiles` pool fall back to
    duplicating it across both tables so nothing breaks during migration.

    When the dialogue module is on, a built-in font is seeded into blank bg
    tile slots first (see _seed_dialogue_font) so dialogue text renders as
    letters without the pupil painting a font.
    """
    _seed_dialogue_font(state)
    _seed_hud_digits(state)
    _seed_hud_digits_bg(state)
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


def selected_bg_idx_safe(state):
    """Return state.selectedBgIdx clamped to a valid index, or 0."""
    bgs = state.get("backgrounds") if isinstance(state, dict) else None
    if not isinstance(bgs, list) or not bgs:
        return 0
    idx = state.get("selectedBgIdx", 0) or 0
    if not isinstance(idx, int) or idx < 0 or idx >= len(bgs):
        return 0
    return idx


def _nametable_bytes_for(nt):
    """Encode a single background's nametable (2D list of {tile,palette})
    into the raw NES format: 32*30 tile bytes followed by 64 attribute
    bytes.  Extracted from build_nam so build_scene_inc can emit one
    per background for Phase B+ Round 3 (multi-background doors)."""
    tiles_out = bytearray(SCREEN_COLS * SCREEN_ROWS)
    for r in range(SCREEN_ROWS):
        row = nt[r] if r < len(nt) else []
        for c in range(SCREEN_COLS):
            cell = row[c] if c < len(row) else None
            if cell:
                tiles_out[r * SCREEN_COLS + c] = int(cell.get("tile", 0)) & 0xFF
    attr_out = bytearray(64)
    for ar in range(8):
        for ac in range(8):
            byte = 0
            for quad in range(4):
                qr = (quad >> 1) & 1
                qc = quad & 1
                tr = ar * 4 + qr * 2
                tc = ac * 4 + qc * 2
                pal = 0
                if tr < len(nt) and tc < len(nt[tr]) and isinstance(nt[tr][tc], dict):
                    pal = int(nt[tr][tc].get("palette", 0)) & 3
                byte |= pal << (quad * 2)
            attr_out[ar * 8 + ac] = byte
    return bytes(tiles_out) + bytes(attr_out)


def build_nam(state):
    """32x30 tile bytes + 64 attribute bytes = 1024-byte NES nametable."""
    return _nametable_bytes_for(_active_nametable(state))


# --- 16x16 metatiles (Arc E §1, spike E1-0) -----------------------------------
# A metatile = 2x2 tiles + ONE palette + ONE behaviour id.  The pupil authors a
# background as a grid of metatile ids (`bg.mtmap`) referencing a per-bg library
# (`bg.metatiles`).  This spike expands such a background, server-side, into the
# ordinary 8x8 `nametable` + `behaviour` grids the rest of the pipeline already
# consumes — so there is NO engine / scroll.c / baseline change, and the result
# is palette-correct *by construction*: all four 8x8 cells of a metatile share
# its single palette, so every 16x16 attribute quadrant is uniform (this is the
# desync §1.2 describes — the old per-8x8-cell palette that the emitter silently
# downsampled).  Behaviour expands the same way (collision stays 8x8, D4).
def _expand_metatile_bg(bg):
    """(nametable, behaviour) 8x8 grids for a 16x16 metatile background.

    `bg.metatiles[i] = {tiles:[TL,TR,BL,BR], palette, behaviour}` and
    `bg.mtmap[r][c] = <metatile id>` (in metatile units).  An out-of-range or
    missing id expands to a blank (tile 0, palette 0, behaviour 0) block."""
    mts = bg.get("metatiles") or []
    mtmap = bg.get("mtmap") or []
    mrows = len(mtmap)
    mcols = max((len(r) for r in mtmap if isinstance(r, list)), default=0)
    nrows, ncols = mrows * 2, mcols * 2
    nametable = [[{"tile": 0, "palette": 0} for _ in range(ncols)]
                 for _ in range(nrows)]
    behaviour = [[0 for _ in range(ncols)] for _ in range(nrows)]
    # TL, TR, BL, BR -> (row offset, col offset) within the 2x2 block.
    quads = ((0, 0), (0, 1), (1, 0), (1, 1))
    for mr in range(mrows):
        row = mtmap[mr] if isinstance(mtmap[mr], list) else []
        for mc in range(len(row)):
            mid = row[mc]
            if not isinstance(mid, int) or mid < 0 or mid >= len(mts):
                continue
            mt = mts[mid] or {}
            tiles = mt.get("tiles") or []
            pal = int(mt.get("palette", 0)) & 3
            beh = int(mt.get("behaviour", 0)) & 0xFF
            for k, (dr, dc) in enumerate(quads):
                t = int(tiles[k]) & 0xFF if k < len(tiles) else 0
                nametable[mr * 2 + dr][mc * 2 + dc] = {"tile": t, "palette": pal}
                behaviour[mr * 2 + dr][mc * 2 + dc] = beh
    return nametable, behaviour


def _expand_metatiles(state):
    """In-place: replace every `tileMode=='16x16'` background's nametable +
    behaviour with the 8x8 grids expanded from its metatile map, and set its
    `dimensions` to span the expansion.  No-op for 8x8 (default) backgrounds, so
    existing projects and the byte-identical baseline are untouched."""
    bgs = state.get("backgrounds") if isinstance(state, dict) else None
    if not isinstance(bgs, list):
        return state
    for bg in bgs:
        if not isinstance(bg, dict) or (bg.get("tileMode") or "8x8") != "16x16":
            continue
        nametable, behaviour = _expand_metatile_bg(bg)
        bg["nametable"] = nametable
        bg["behaviour"] = behaviour
        nrows, ncols = len(nametable), (len(nametable[0]) if nametable else 0)
        # 1 screen = 32x30 tiles; size dimensions to cover the expansion.
        bg["dimensions"] = {
            "screens_x": max(1, -(-ncols // SCREEN_COLS)),   # ceil-div
            "screens_y": max(1, -(-nrows // SCREEN_ROWS)),
        }
    return state


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


def _palette_rows(state):
    """The eight 4-byte palette rows (BG 0-3 then sprite 0-3).  The first byte
    of every row is the shared universal background colour.  Defined once here
    so the C (build_palettes_inc) and asm (build_palettes_asminc) emitters can
    never disagree on the byte layout — they only differ in how they format
    these rows."""
    ubg = int(state.get("universal_bg", 0x21)) & 0x3F
    rows = []
    for group in ("bg_palettes", "sprite_palettes"):
        for i in range(4):
            s = _palette_slots_for(state, group, i)
            rows.append([ubg, s[0] & 0x3F, s[1] & 0x3F, s[2] & 0x3F])
    return rows


def build_palettes_inc(state):
    lines = [
        "// generated by tools/playground_server.py - do not edit",
        "#ifndef PALETTES_INC",
        "#define PALETTES_INC",
        "",
        # Non-`static` so main_asm.s write_palettes (NES_ASM_LEAF) can .import it.
        # Linkage-only — the 32 emitted bytes are unchanged, so a flag-off ROM is
        # byte-identical.
        "const unsigned char palette_bytes[32] = {",
    ]
    for row in _palette_rows(state):
        lines.append("    " + ", ".join(f"0x{b:02X}" for b in row) + ",")
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
    lines = [
        "; generated by tools/playground_server.py - do not edit",
        ".pushseg",
        ".segment \"RODATA\"",
        "palette_bytes:",
    ]
    for row in _palette_rows(state):
        lines.append("    .byte " + _hex_row(row))
    lines += [".popseg", ""]
    return "\n".join(lines)


def _scene_world_bounds(state):
    """(world_w, world_h) in pixels for the active background.  Scene-sprite
    positions are clamped to these so a sprite can sit anywhere in a
    multi-screen level, not just the first screen.  Shared by the C and asm
    scene emitters so they can never disagree on the clamp."""
    bgs = state.get("backgrounds") or []
    bg = bgs[selected_bg_idx_safe(state)] if bgs else {}
    dims = (bg.get("dimensions") or {}) if isinstance(bg, dict) else {}
    world_w = ((int(dims.get("screens_x", 1)) or 1)) * 256
    world_h = ((int(dims.get("screens_y", 1)) or 1)) * 240
    return world_w, world_h


def _scene_sprite_xy(item, world_w, world_h):
    """Clamp one scene sprite's authored (x, y) to the world bounds.  Used by
    both scene emitters.  The C emitter keeps the full value (going 16-bit when
    a sprite sits past the first screen); the asm emitter takes the low byte
    (its layout is first-screen / 8-bit by design).  For the single-screen
    projects the asm path targets this is identical to the old `& 0xFF`; the
    only change is that out-of-range positions now clamp to the world edge
    instead of wrapping around — matching the C path's long-standing clamp."""
    x = max(0, min(world_w - 1, int(item.get("x", 0))))
    y = max(0, min(world_h - 1, int(item.get("y", 0))))
    return x, y


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
    attack = _resolve_animation(state, "attack", pw, ph)   # R-7 attack animation

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

    # R-7: emit the attack tables ONLY when an attack animation is assigned.
    # walk/jump always emit a {0} placeholder (the engine references them
    # unconditionally), but the attack code is fully #if-gated, so omitting the
    # attack arrays when unused keeps a no-attack ROM byte-identical (cc65 emits
    # even unreferenced const arrays, so an always-present placeholder would
    # shift the baseline).
    _anim_kinds = [("walk", walk), ("jump", jump)]
    if attack is not None:
        _anim_kinds.append(("attack", attack))
    for kind, resolved in _anim_kinds:
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
    # Role codes — rendered from the shared ROLE_TABLE (T7.6a) so the asm and C
    # paths can't drift.
    defines += _role_defs(".define")
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
        world_w, world_h = _scene_world_bounds(state)
        xs, ys, ws, hs, offsets, roles, flying = [], [], [], [], [], [], []
        tiles_flat, attrs_flat = [], []
        for item in scene_sprites:
            idx = int(item["spriteIdx"])
            if not (0 <= idx < len(sprites)):
                raise ValueError(f"scene sprite idx {idx} out of range")
            sp = sprites[idx]
            w = int(sp["width"])
            h = int(sp["height"])
            # First-screen / 8-bit layout by design: clamp to the world bounds
            # (shared with the C emitter) then take the low byte.
            sx, sy = _scene_sprite_xy(item, world_w, world_h)
            xs.append(sx & 0xFF)
            ys.append(sy & 0xFF)
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

    # T7.6b: state the asm path's scope honestly.  The Builder modules emit C
    # and POST customMainC — they never touch this path — so asm /play is the
    # raw-6502 mode: single player, no Builder modules.  Comments only, so the
    # assembled bytes are unchanged.
    lines = [
        "; generated by tools/playground_server.py - do not edit",
        ";",
        "; SCOPE: asm /play is the raw 6502 path -- single player, NO Builder",
        "; modules.  HUD, Player 2, dialogue, win-conditions, pickups, damage,",
        "; doors and scene AI are C-only (the Builder emits C).  This file gives",
        "; you the same identifiers the C scene.inc does (player_tiles,",
        "; player_attrs, NUM_STATIC_SPRITES, ss_x/ss_y/ss_w/ss_h/ss_role/...) so",
        "; the pedagogy carries across -- use the C language mode for the modules.",
    ]
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


def _as_sprite_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return -1


def _spawn_trigger_index(state):
    """The trigger-effect (kind 0) sprite index when the `spawn` module is on,
    else None.  BR-05 model B: independent of the hit effect."""
    try:
        mods = (state.get("builder") or {}).get("modules") or {}
    except AttributeError:
        return None
    sp = mods.get("spawn") or {}
    if not sp.get("enabled"):
        return None
    return _as_sprite_int((sp.get("config") or {}).get("spriteIdx", -1))


def _spawn_hit_index(state):
    """The hit-effect (kind 1) sprite index when the `damage` module's
    spawn-on-hit is ticked, else None.  Independent of the trigger effect."""
    try:
        mods = (state.get("builder") or {}).get("modules") or {}
    except AttributeError:
        return None
    dmg = mods.get("damage") or {}
    dcfg = dmg.get("config") or {}
    if not (dmg.get("enabled") and dcfg.get("spawnOnHit")):
        return None
    return _as_sprite_int(dcfg.get("spawnSpriteIdx", -1))


def _spawn_art_one(sprites, idx, suffix):
    """C lines for one SPAWN<suffix>_W/H + SPAWN<suffix>_TILES/ATTRS art block,
    or [] when idx is out of range (caller validates / fails early)."""
    if not (0 <= idx < len(sprites)):
        return []
    sp = sprites[idx]
    w = int(sp.get("width", 0) or 0)
    h = int(sp.get("height", 0) or 0)
    if w < 1 or h < 1:
        return []
    cells = sp.get("cells") or []
    tiles = [cell_tile(cells[r][c]) for r in range(h) for c in range(w)]
    attrs = [cell_attr(cells[r][c]) for r in range(h) for c in range(w)]
    return [
        "",
        f"#define SPAWN{suffix}_W {w}",
        f"#define SPAWN{suffix}_H {h}",
        f"static const unsigned char SPAWN{suffix}_TILES[{w*h}] = {{",
        "    " + ", ".join(f"0x{t:02X}" for t in tiles),
        "};",
        f"static const unsigned char SPAWN{suffix}_ATTRS[{w*h}] = {{",
        "    " + ", ".join(f"0x{a:02X}" for a in attrs),
        "};",
        "",
    ]


def _spawn_art_lines(state, sprites):
    """C for the trigger (SPAWN0_*) and hit (SPAWN1_*) effect art tables.  BR-05
    model B: each enabled source emits its own independent art; a disabled
    source emits nothing (so a no-spawn ROM stays byte-identical)."""
    lines = []
    ti = _spawn_trigger_index(state)
    if ti is not None:
        lines += _spawn_art_one(sprites, ti, "0")
    hi = _spawn_hit_index(state)
    if hi is not None:
        lines += _spawn_art_one(sprites, hi, "1")
    return lines


def _resolve_tagged_animation(state, role, style):
    """Find the first animation tagged (role, style) and flatten it.

    Returns (frames, fps, w, h) on success, or None if no matching
    animation exists, its frame list is empty, or the frames don't
    all share a single (W, H).  Phase B finale chunk B uses this to
    emit per-(role, style) animation tables without needing the
    animation to be assigned via `animation_assignments`.
    """
    anims = state.get("animations") or []
    sprites = state.get("sprites") or []
    hit = next((a for a in anims
                if (a.get("role") or "") == role
                and (a.get("style") or "") == style), None)
    if not hit:
        return None
    frame_idxs = hit.get("frames") or []
    frame_sprites = []
    for fi in frame_idxs:
        if 0 <= fi < len(sprites):
            frame_sprites.append(sprites[fi])
    if not frame_sprites:
        return None
    # All frames must share the same W×H or the emitted table's
    # indexing breaks.  Drop mismatches; if nothing's left, bail.
    w = int(frame_sprites[0].get("width", 0))
    h = int(frame_sprites[0].get("height", 0))
    good = [sp for sp in frame_sprites
            if int(sp.get("width", 0)) == w and int(sp.get("height", 0)) == h]
    if not good:
        return None
    fps = max(1, min(60, int(hit.get("fps", 8) or 8)))
    return good, fps, w, h


def _flatten_sprite(sp):
    """Flatten a sprite's cells (row-major) into (tiles, attrs) byte lists."""
    w = int(sp["width"])
    h = int(sp["height"])
    tiles = [cell_tile(sp["cells"][r][c]) for r in range(h) for c in range(w)]
    attrs = [cell_attr(sp["cells"][r][c]) for r in range(h) for c in range(w)]
    return tiles, attrs


# --- E3-3: top-down racer auto-rotated car art -----------------------------
# The NES can't rotate sprites in hardware, so a racer car can't face its
# heading on its own.  At build time we take the player's single drawn car
# (assumed to face RIGHT → heading 0) and bake RACER_ROT_FRAMES rotated copies
# (45° steps) into spare sprite-CHR slots; the engine picks the frame from
# racer_heading (16 headings → 8 frames, "8 directions reused across 16").
# Nearest-neighbour rotation is rough on the 45° diagonals at 16×16 but fine for
# a pupil tool; the 90° frames are exact.  Runs ONLY for racer games (and only
# when there's CHR room), so every other ROM stays byte-identical.
RACER_ROT_FRAMES = 8
# E3-5 flip-sharing: the NES OAM attr can H/V-flip a tile, so the 8 headings need
# only 3 UNIQUE drawn frames — E (right, 0°), SE (down-right, 45°), S (down, 90°)
# — and the other 5 are those mirrored.  Cuts the car's rotation CHR from 32
# tiles to 12.  Each entry: (source frame, flipH, flipV).  (For a left-facing car
# we MIRROR the right one, not rotate it 180°, so its roof stays up.)
RACER_ROT_UNIQUE = 3
_RACER_FRAME_SRC = [
    (0, False, False),  # 0 E  (right)   — drawn
    (1, False, False),  # 1 SE           — drawn
    (2, False, False),  # 2 S  (down)    — drawn
    (1, True,  False),  # 3 SW = SE H-flip
    (0, True,  False),  # 4 W  = E  H-flip
    (1, True,  True),   # 5 NW = SE H+V-flip
    (2, False, True),   # 6 N  = S  V-flip
    (1, False, True),   # 7 NE = SE V-flip
]

def _pool_pixels(pool, idx):
    t = pool[idx] if (isinstance(pool, list) and 0 <= idx < len(pool)) else None
    px = t.get("pixels") if isinstance(t, dict) else None
    if not (isinstance(px, list) and len(px) == 8 and all(isinstance(r, list) and len(r) == 8 for r in px)):
        return [[0] * 8 for _ in range(8)]
    return px

def _assemble_player_image(sp, pool):
    """Player car as a (ph*8)×(pw*8) pixel grid, honouring per-cell flips."""
    pw, ph = int(sp["width"]), int(sp["height"])
    W, H = pw * 8, ph * 8
    img = [[0] * W for _ in range(H)]
    cells = sp["cells"]
    for cr in range(ph):
        for cc in range(pw):
            cell = cells[cr][cc]
            px = _pool_pixels(pool, cell_tile(cell))
            attr = cell_attr(cell)
            fh, fv = bool(attr & 0x40), bool(attr & 0x80)
            for y in range(8):
                sy = 7 - y if fv else y
                for x in range(8):
                    sx = 7 - x if fh else x
                    img[cr * 8 + y][cc * 8 + x] = px[sy][sx] & 3
    return img, W, H

def _rotate_image(img, W, H, deg):
    """Nearest-neighbour clockwise rotation (screen coords, y down) about the
    centre; samples off the source are transparent (0)."""
    import math
    rad = math.radians(deg)
    cs, sn = math.cos(rad), math.sin(rad)
    cx, cy = (W - 1) / 2.0, (H - 1) / 2.0
    out = [[0] * W for _ in range(H)]
    for dy in range(H):
        oy = dy - cy
        for dx in range(W):
            ox = dx - cx
            sx = int(round(cx + ox * cs + oy * sn))
            sy = int(round(cy - ox * sn + oy * cs))
            if 0 <= sx < W and 0 <= sy < H:
                out[dy][dx] = img[sy][sx]
    return out

def _inject_racer_rotation(state, player_idx):
    """For a racer game, bake 8 rotated car frames into spare sprite-CHR slots
    and stash their tile indices in state['_racer_rot'] for build_scene_inc.
    Mutates state['sprite_tiles'] in place, so it MUST run before build_chr."""
    game = (((state.get("builder") or {}).get("modules") or {}).get("game") or {}).get("config") or {}
    if game.get("type") != "racer":
        return
    sprites = state.get("sprites") or []
    if not (isinstance(player_idx, int) and 0 <= player_idx < len(sprites)):
        return
    pool = state.get("sprite_tiles")
    if not (isinstance(pool, list) and len(pool) == NUM_TILES):
        return
    sp = sprites[player_idx]
    try:
        pw, ph = int(sp["width"]), int(sp["height"])
    except (KeyError, TypeError, ValueError):
        return
    if pw <= 0 or ph <= 0:
        return
    need = RACER_ROT_UNIQUE * pw * ph
    # Free = blank AND not referenced by ANY sprite cell, so we never clobber a
    # tile some sprite uses (even a blank one used as a transparent quadrant).
    # Tile 0 is the canonical transparent tile — always keep it.
    referenced = {0}
    for s in sprites:
        for row in (s.get("cells") or []):
            for cell in row:
                referenced.add(cell_tile(cell))
    free = [i for i in range(NUM_TILES)
            if i not in referenced and _pixels_blank(_pool_pixels(pool, i))]
    if len(free) < need:
        return  # not enough CHR room — engine falls back to the un-rotated car
    img, W, H = _assemble_player_image(sp, pool)
    # Bake the 3 unique frames (E 0°, SE 45°, S 90°) into spare slots.
    unique = []   # unique[u] = list of pw*ph pool tile indices, row-major
    k = 0
    for u in range(RACER_ROT_UNIQUE):
        rimg = _rotate_image(img, W, H, u * 45.0)
        fr = []
        for cr in range(ph):
            for cc in range(pw):
                idx = free[k]; k += 1
                sub = [[rimg[cr * 8 + y][cc * 8 + x] for x in range(8)] for y in range(8)]
                if isinstance(pool[idx], dict):
                    pool[idx]["pixels"] = sub
                else:
                    pool[idx] = {"pixels": sub}
                fr.append(idx)
        unique.append(fr)
    # Build the 8-frame (tile, attr) table from the 3 unique frames, mirroring the
    # 5 derived headings via H/V flip (with the tile positions swapped to match).
    tiles, attrs = [], []
    for src, fh, fv in _RACER_FRAME_SRC:
        fr = unique[src]
        attr = (0x40 if fh else 0) | (0x80 if fv else 0)
        for r in range(ph):
            for c in range(pw):
                sr = (ph - 1 - r) if fv else r
                sc = (pw - 1 - c) if fh else c
                tiles.append(fr[sr * pw + sc])
                attrs.append(attr)
    state["_racer_rot"] = {"tiles": tiles, "attrs": attrs,
                           "frames": RACER_ROT_FRAMES, "w": pw, "h": ph}

    # E3-5 lap HUD: seed 0-9 digit glyphs into 10 more spare slots so the engine
    # can draw the current lap number.  The font glyph uses colour 2 for its
    # background (the dialogue box body); a HUD sprite wants it transparent, so we
    # keep the stroke (colour 1) and map everything else to 0.  Skipped (HUD off)
    # if there isn't room — rotation has first claim on the free slots.
    digits = "0123456789"
    if len(free) - k >= len(digits):
        dig_idx = []
        for ch in digits:
            g = _DIALOGUE_FONT.get(ch) or _glyph()
            sub = [[1 if g[y][x] == 1 else 0 for x in range(8)] for y in range(8)]
            idx = free[k]; k += 1
            if isinstance(pool[idx], dict):
                pool[idx]["pixels"] = sub
            else:
                pool[idx] = {"pixels": sub}
            dig_idx.append(idx)
        state["_racer_digits"] = dig_idx


# T7.6a: single source of truth for sprite role codes.  Both scene emitters
# render this — the C path as `#define ROLE_<NAME> <code>` and the asm path as
# `.define ROLE_<NAME> <code>` — so the two tables can no longer drift (they
# used to be duplicated verbatim).  Order = numeric code; HUD is the Phase B
# chunk-A addition (tagged sprites drive the HUD render).
ROLE_TABLE = [
    ("PLAYER", 0), ("NPC", 1), ("ENEMY", 2), ("ITEM", 3), ("TOOL", 4),
    ("POWERUP", 5), ("PICKUP", 6), ("PROJECTILE", 7), ("DECORATION", 8),
    ("OTHER", 9), ("HUD", 10),
]
ROLE_CODES = {name.lower(): code for name, code in ROLE_TABLE}
# Width that aligns the code column exactly as the original hand-written tables
# did (longest token is "ROLE_PROJECTILE"), so the emitted bytes are unchanged.
_ROLE_TOKEN_WIDTH = max(len("ROLE_" + name) for name, _ in ROLE_TABLE)


def _role_defs(directive):
    """Role table as `<directive> ROLE_<NAME> <code>` lines (`.define`/`#define`)."""
    return [f"{directive} {('ROLE_' + name).ljust(_ROLE_TOKEN_WIDTH)} {code}"
            for name, code in ROLE_TABLE]


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
        *_role_defs("#define"),   # T7.6a: shared ROLE_TABLE source
        "",
        # Linkage for the scene-sprite arrays the draw loop reads. Normally
        # `static` (byte-identical as always); when the scene-draw ASM module
        # is built (NES_ASM_SCENE) they must be linker-visible so scene_asm.s
        # can import them. Flag-off is byte-for-byte unchanged.
        "#if defined(NES_ASM_SCENE) || defined(NES_ASM_AI)",
        "#define SS_LINKAGE",
        "#else",
        "#define SS_LINKAGE static",
        "#endif",
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
    attack = _resolve_animation(state, "attack", pw, ph)   # R-7 attack animation

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

    # E3-3: racer auto-rotated car frames (only emitted when _inject_racer_rotation
    # baked them, i.e. a racer game with CHR room).  The engine selects a frame
    # from racer_heading; BW_RACER_ROT gates the whole feature off otherwise, so
    # non-racer ROMs are byte-identical.
    rot = state.get("_racer_rot")
    if rot and rot.get("tiles"):
        rt, ra = rot["tiles"], rot["attrs"]
        lines += [
            "#define BW_RACER_ROT 1",
            f"#define RACER_ROT_FRAMES {rot['frames']}",
            f"static const unsigned char car_rot_tiles[{len(rt)}] = {{",
            "    " + ", ".join(f"0x{t:02X}" for t in rt),
            "};",
            f"static const unsigned char car_rot_attrs[{len(ra)}] = {{",
            "    " + ", ".join(f"0x{a:02X}" for a in ra),
            "};",
            "",
        ]
    digs = state.get("_racer_digits")
    if digs and len(digs) == 10:
        lines += [
            "#define BW_RACER_HUD 1",
            f"static const unsigned char racer_digit_tiles[10] = {{",
            "    " + ", ".join(f"0x{t:02X}" for t in digs),
            "};",
            "",
        ]

    # R-3/R-6 spawn-pool art (only when a spawn/damage-on-hit sprite is chosen,
    # so a no-spawn ROM stays byte-identical).  BR-04/BR-05 model B: validate the
    # trigger and hit effects independently and fail here with a clear message
    # naming the bad index, instead of letting cc65 choke on undefined SPAWN*_*.
    def _need_sprite(idx, what):
        if idx is not None and not (0 <= idx < len(sprites)):
            raise ValueError(
                f"{what} points at sprite #{idx}, which does not exist (this "
                f"project has {len(sprites)} sprite(s), numbered "
                f"0..{len(sprites) - 1}). Pick an existing sprite, or draw it "
                f"on the Sprites page.")
    _need_sprite(_spawn_trigger_index(state), "The Spawn effect")
    _need_sprite(_spawn_hit_index(state), "The Damage hit effect")
    lines += _spawn_art_lines(state, sprites)

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
            # Linkage for the P2 tile/attr arrays the P2 draw loop reads. Normally
            # `static` (byte-identical); when the P1/P2 draw ASM is built
            # (NES_ASM_PDRAW) they must be linker-visible so pdraw_asm.s's
            # draw_player2 can import them. Flag-off is byte-for-byte unchanged.
            "#if defined(NES_ASM_PDRAW)",
            "#define P2_LINKAGE",
            "#else",
            "#define P2_LINKAGE static",
            "#endif",
            f"P2_LINKAGE const unsigned char player2_tiles[{pw2*ph2}] = {{",
            "    " + ", ".join(f"0x{t:02X}" for t in p2_tiles),
            "};",
            f"P2_LINKAGE const unsigned char player2_attrs[{pw2*ph2}] = {{",
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
    # R-7: emit the attack tables ONLY when an attack animation is assigned.
    # walk/jump always emit a {0} placeholder (the engine references them
    # unconditionally), but the attack code is fully #if-gated, so omitting the
    # attack arrays when unused keeps a no-attack ROM byte-identical (cc65 emits
    # even unreferenced const arrays, so an always-present placeholder would
    # shift the baseline).
    _anim_kinds = [("walk", walk), ("jump", jump)]
    if attack is not None:
        _anim_kinds.append(("attack", attack))
    for kind, resolved in _anim_kinds:
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

    # --- HUD icon (Phase B finale chunk A) -------------------------------
    # First sprite tagged `hud` on the Sprites page becomes the heart
    # icon used by the HP/HUD module.  No tagged HUD sprite → emit the
    # HUD_ENABLED = 0 stub so the template's #if gates compile clean.
    hud_sprite = next((sp for sp in sprites if (sp.get("role") or "").lower() == "hud"), None)
    if hud_sprite is not None:
        hw = int(hud_sprite["width"])
        hh = int(hud_sprite["height"])
        hcells = hud_sprite["cells"]
        hud_tiles = [cell_tile(hcells[r][c]) for r in range(hh) for c in range(hw)]
        hud_attrs = [cell_attr(hcells[r][c]) for r in range(hh) for c in range(hw)]
        lines += [
            "#define HUD_ENABLED 1",
            f"#define HUD_W {hw}",
            f"#define HUD_H {hh}",
            "",
            f"static const unsigned char hud_tiles[{hw*hh}] = {{",
            "    " + ", ".join(f"0x{t:02X}" for t in hud_tiles),
            "};",
            f"static const unsigned char hud_attrs[{hw*hh}] = {{",
            "    " + ", ".join(f"0x{a:02X}" for a in hud_attrs),
            "};",
            "",
        ]
    else:
        lines += ["#define HUD_ENABLED 0", ""]

    # --- Tagged scene animations (Phase B finale chunk B) -----------
    # For each (role, style) pair the template cares about, look for
    # an animation tagged that way on the Sprites page.  If one
    # exists and all its frames share a single (W, H), emit the frame
    # table plus the count/ticks/W/H defines.  The template gates on
    # `ANIM_<ROLE>_<STYLE>_COUNT > 0` so absent pairs cost nothing.
    # Chunk B shipped enemy+walk.  Phase B+ round 1b/1c extends to
    # player2+walk, enemy+idle, and pickup+idle.  Future rounds can
    # drop npc+walk / npc+idle in alongside dialogue; the loop below
    # makes each pair mechanical to add.
    anim_targets = [
        ("enemy",   "walk"),
        ("enemy",   "idle"),
        ("pickup",  "idle"),
        ("player2", "walk"),
        # Phase 3.4 — finishes the P1/P2 animation symmetry.  P2 walk
        # already wires through above; jump now picks up the same
        # `role=player2, style=jump` tagged animation and the
        # template's per-frame render switches to it while jumping2 is
        # active.  Gated by `ANIM_PLAYER2_JUMP_COUNT > 0` so projects
        # without a tagged P2 jump animation pay nothing.
        ("player2", "jump"),
    ]
    for role, style in anim_targets:
        token = f"{role.upper()}_{style.upper()}"
        resolved = _resolve_tagged_animation(state, role, style)
        if resolved is None:
            lines.append(f"#define ANIM_{token}_COUNT 0")
            lines.append("")
            continue
        frames, fps, aw, ah = resolved
        ticks = max(1, round(60 / fps))
        flat_t, flat_a = [], []
        for sp in frames:
            t, a = _flatten_sprite(sp)
            flat_t += t
            flat_a += a
        lines += [
            f"#define ANIM_{token}_COUNT {len(frames)}",
            f"#define ANIM_{token}_TICKS {ticks}",
            f"#define ANIM_{token}_W {aw}",
            f"#define ANIM_{token}_H {ah}",
            f"static const unsigned char anim_{role}_{style}_tiles[{len(flat_t)}] = {{",
            "    " + ", ".join(f"0x{t:02X}" for t in flat_t),
            "};",
            f"static const unsigned char anim_{role}_{style}_attrs[{len(flat_a)}] = {{",
            "    " + ", ".join(f"0x{a:02X}" for a in flat_a),
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
            "SS_LINKAGE unsigned char ss_x[1]            = { 0 };\n"
            "SS_LINKAGE unsigned char ss_y[1]            = { 0 };\n"
            "SS_LINKAGE const unsigned char ss_w[1]      = { 0 };\n"
            "SS_LINKAGE const unsigned char ss_h[1]      = { 0 };\n"
            "SS_LINKAGE const unsigned char ss_offset[1] = { 0 };\n"
            "SS_LINKAGE const unsigned char ss_tiles[1]  = { 0 };\n"
            "SS_LINKAGE const unsigned char ss_attrs[1]  = { 0 };\n"
            "static const unsigned char ss_role[1]   = { 0 };\n"
            "static const unsigned char ss_flying[1] = { 0 };\n"
            "static unsigned char ss_anim_frame[1]   = { 0 };\n"
            "static unsigned char ss_anim_tick[1]    = { 0 };"
        )
        lines.append(stub)
    else:
        # Scene-sprite positions are world pixels so sprites can sit anywhere in a
        # multi-screen level, not just the first screen.  Clamp to the active
        # background's world bounds (ss_x/ss_y go 16-bit below if any exceed 255).
        world_w, world_h = _scene_world_bounds(state)
        xs, ys, ws, hs, offsets, roles, flying = [], [], [], [], [], [], []
        tiles_flat, attrs_flat = [], []
        for item in scene_sprites:
            idx = int(item["spriteIdx"])
            if not (0 <= idx < len(sprites)):
                raise ValueError(f"scene sprite idx {idx} out of range")
            sp = sprites[idx]
            w = int(sp["width"])
            h = int(sp["height"])
            sx, sy = _scene_sprite_xy(item, world_w, world_h)
            xs.append(sx)
            ys.append(sy)
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

        def arr(name, values, as_hex=False, mutable=False, wide=False, link=False):
            fmt = (lambda v: f"0x{v:02X}") if as_hex else (lambda v: str(v))
            # `link=True` arrays are read by the scene-draw ASM module, so they
            # carry SS_LINKAGE (static normally, linker-visible under NES_ASM_SCENE).
            base = "SS_LINKAGE" if link else "static"
            qualifier = base if mutable else base + " const"
            ctype = "unsigned int" if wide else "unsigned char"
            return (f"{qualifier} {ctype} {name}[{len(values)}] = {{ "
                    + ", ".join(fmt(v) for v in values) + " };")
        # ss_x / ss_y are mutable so movement / AI snippets can modify
        # positions at runtime; cc65's DATA segment is copied ROM->RAM at
        # startup per the nes.cfg linker script.  They go 16-bit (unsigned int)
        # only when a sprite sits past the first screen (x or y > 255), so
        # single-screen ROMs keep the 8-bit layout — which matches the asm /play
        # path, so the asm/C rom-equiv parity holds for first-screen projects.
        wide_pos = any(v > 255 for v in xs) or any(v > 255 for v in ys)
        # Per-instance animation state — one frame counter + one
        # tick counter per scene sprite.  Zero-initialised; the
        # template advances them when a matching tagged animation
        # exists (Phase B finale chunk B).
        anim_zero = [0] * n
        lines += [
            arr("ss_x", xs, mutable=True, wide=wide_pos, link=True),
            arr("ss_y", ys, mutable=True, wide=wide_pos, link=True),
            arr("ss_w", ws, link=True),
            arr("ss_h", hs, link=True),
            arr("ss_offset", offsets, link=True),
            arr("ss_tiles", tiles_flat, as_hex=True, link=True),
            arr("ss_attrs", attrs_flat, as_hex=True, link=True),
            arr("ss_role", roles),
            arr("ss_flying", flying),
            arr("ss_anim_frame", anim_zero, mutable=True),
            arr("ss_anim_tick", anim_zero, mutable=True),
        ]

    # --- Per-background nametables (Phase B+ Round 3 + T2.1 fix) ----
    # For multi-background door transitions we emit each painted
    # background's full nametable data in ROM, sized to the project's
    # world dimensions.  Pre-T2.1 each `bg_nametable_<n>` was a fixed
    # 1024 bytes (a single screen), so when a multi-screen project
    # used a door to swap rooms only screen 0 of the new bg got
    # written to NT0 — the player walking to a different screen post-
    # door saw the *previous* bg's stale tiles in NT1+ (item 2 in
    # docs/feedback/recently-observed-bugs.md).  The fix is to emit
    # `screens_x * screens_y` consecutive 1024-byte blocks per bg
    # (each block = one screen's tiles + attrs in NES format) and let
    # `load_background_n` walk all of them at door-swap time.
    #
    # Constraint: every bg in the project must share the active bg's
    # dimensions.  Mismatched bgs would need per-bg world dimensions
    # in the scroll engine which is T3.2's territory.  A validator
    # in builder-validators.js refuses the build before this code
    # runs; here we silently project-wide clamp to the active bg's
    # dimensions as a safety belt.
    bgs = state.get("backgrounds") or []
    active_bg = bgs[selected_bg_idx_safe(state)] if bgs else None
    proj_dims = ((active_bg or {}).get("dimensions") or {}) if active_bg else {}
    proj_sx = max(1, int(proj_dims.get("screens_x") or 1))
    proj_sy = max(1, int(proj_dims.get("screens_y") or 1))
    bytes_per_bg = proj_sx * proj_sy * 1024  # 1024 = 32*30 tiles + 64 attrs
    lines += ["", f"#define BG_COUNT {len(bgs)}",
              f"#define BG_SCREENS_X {proj_sx}",
              f"#define BG_SCREENS_Y {proj_sy}",
              f"#define BG_NAMETABLE_BYTES {bytes_per_bg}",
              ""]
    for bi, bg in enumerate(bgs):
        nt = bg.get("nametable") or []
        # Concatenate one 1024-byte NES block per screen, in
        # row-major (sy, sx) order.  Block ordering matches the
        # loop in load_background_n (sy outer, sx inner).
        bg_bytes = bytearray()
        for sy in range(proj_sy):
            for sx in range(proj_sx):
                # _nametable_bytes_for() works on a 30-row × 32-col
                # grid; carve out the (sy, sx) screen from the bg's
                # full multi-screen grid.  Pupils with mismatched-
                # dimension bgs see padding (zeros) for missing rows.
                rows_start = sy * SCREEN_ROWS
                cols_start = sx * SCREEN_COLS
                screen_grid = []
                for r in range(SCREEN_ROWS):
                    src_row = nt[rows_start + r] if rows_start + r < len(nt) else []
                    cropped = src_row[cols_start:cols_start + SCREEN_COLS]
                    # Pad short rows so _nametable_bytes_for sees the
                    # full 32-col width.
                    while len(cropped) < SCREEN_COLS:
                        cropped.append({"tile": 0, "palette": 0})
                    screen_grid.append(cropped)
                bg_bytes += _nametable_bytes_for(screen_grid)
        hex_body = ", ".join(f"0x{b:02X}" for b in bg_bytes)
        lines += [
            f"static const unsigned char bg_nametable_{bi}[BG_NAMETABLE_BYTES] = {{",
            "    " + hex_body,
            "};",
            "",
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


def _behaviour_map_for_bg(bg, cols, rows):
    """Encode a single bg's behaviour grid into the flat row-major
    bytes() the runtime indexes into.  Pads with zeros (BEHAVIOUR_NONE)
    for any cell missing from the source grid; T2.2 (per-bg behaviour
    maps for multi-bg door swaps) calls this once per bg with the
    project's world dimensions to get a consistent layout across all
    rooms."""
    out = bytearray(cols * rows)
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
    return bytes(out)


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
        "/* T2.2 — multi-bg behaviour swap.  Doors module's emitted code",
        "   calls this after a teleport so behaviour_at queries the new",
        "   room's collision data.  Out-of-range n leaves the current",
        "   map in place. */",
        "void behaviour_set_active_bg(unsigned char n);",
        "",
        "#endif",
        "",
    ]
    return "\n".join(lines)


def build_behaviour_c(state):
    """Emit src/behaviour.c — world map + reaction table + query functions.

    T2.2 (2026-04-27) — when the project has multiple backgrounds we
    emit one `behaviour_map_<n>` per bg plus a mutable
    `active_behaviour_map` pointer.  `behaviour_at()` reads through
    the pointer; the doors module's emitted code calls
    `behaviour_set_active_bg(n)` after a teleport so collision data
    follows the visible room.  Pre-fix the global `behaviour_map[]`
    held the *selected* bg only and never swapped, so post-door
    collisions queried the wrong room (item 3 in
    docs/feedback/recently-observed-bugs.md).
    """
    cols, rows = _behaviour_world_dims(state)
    react_bytes, num_sprites = _sprite_reaction_table(state)
    bgs = state.get("backgrounds")
    bg_list = bgs if isinstance(bgs, list) else []
    selected = selected_bg_idx_safe(state)

    def _hex_table(name, data, cols_per_line=16, qualifier="const"):
        if not data:
            return [f"{qualifier} unsigned char {name}[1] = {{ 0 }}; /* empty */"]
        out = [f"{qualifier} unsigned char {name}[{len(data)}] = {{"]
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

    # Emit one per-bg map.  At least one map is always emitted so the
    # pointer below has a valid initialiser even on projects with no
    # backgrounds defined yet (the `or [None]` guarantees that).
    bgs_for_emit = bg_list if bg_list else [None]
    for i, bg in enumerate(bgs_for_emit):
        map_bytes = _behaviour_map_for_bg(bg, cols, rows)
        lines += [f"/* Behaviour map for background {i}. */"]
        lines += _hex_table(f"behaviour_map_{i}", map_bytes)
        lines.append("")

    # Mutable pointer to whichever map is currently in play.  Door
    # transitions update it via behaviour_set_active_bg().
    init_idx = selected if bg_list else 0
    lines += [
        f"/* Active map pointer — initialised to the selected bg ({init_idx}). */",
        f"const unsigned char *active_behaviour_map = behaviour_map_{init_idx};",
        "",
        "void behaviour_set_active_bg(unsigned char n) {",
        "  switch (n) {",
    ]
    for i in range(len(bgs_for_emit)):
        lines.append(f"    case {i}: active_behaviour_map = behaviour_map_{i}; break;")
    lines += [
        "    default: /* leave the current map in place */ break;",
        "  }",
        "}",
        "",
    ]

    lines += [
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
        "/* behaviour_at + reaction_for have hand-written 6502 twins in",
        "   behaviour_asm.s (Phase 1: generalised via project.inc). NES_ASM_LEAF",
        "   gates the C bodies out so exactly one definition links; flag off",
        "   (default) = pure C = byte-identical. Prototypes stay in collision.h. */",
        "#ifndef NES_ASM_LEAF",
        "unsigned char behaviour_at(unsigned int world_col, unsigned int world_row) {",
        "  if (world_col >= WORLD_COLS) return BEHAVIOUR_NONE;",
        "  if (world_row >= WORLD_ROWS) return BEHAVIOUR_NONE;",
        "  return active_behaviour_map[world_row * WORLD_COLS + world_col];",
        "}",
        "",
        "unsigned char reaction_for(unsigned char sprite_idx, unsigned char behaviour_id) {",
        "  if (behaviour_id >= 8) return REACT_IGNORE;",
        f"  if (sprite_idx >= {max(num_sprites, 1)}) return REACT_IGNORE;",
        "  return sprite_reactions[((unsigned int)sprite_idx << 3) | behaviour_id];",
        "}",
        "#endif",
        "",
    ]
    return "\n".join(lines)


def _player_physics(state):
    """(jump_budget, jump_speed, player_gravity) for the hand-written ASM player.

    Mirrors the JS Players/Globals module defaults + clamps so the ASM immediates
    baked into project.inc match the C values (jmp_up literal, BW_JUMP_SPEED_PX,
    BW_PLAYER_GRAVITY) — keeping the ASM and C players behaviourally identical.
    A module is active unless `enabled === False` (builder-assembler MODULE_ORDER).

    Defaults 20/2/2 reproduce the historic hardcoded `lda #20` / `sbc #2` /
    `fall_amt=2`, so an untouched project is byte-identical.  The Gravity slider
    (0..4, default 1) shifts the player's base-2 fall: player_gravity = grav + 1
    (so default 1 -> 2, and 0 -> floaty 1, 4 -> heavy 5)."""
    def _ci(v, lo, hi, default):
        try:
            return max(lo, min(hi, int(v)))
        except (TypeError, ValueError):
            return default
    mods = (((state or {}).get("builder") or {}).get("modules") or {})
    game_type = str((((mods.get("game") or {}).get("config") or {})
                     .get("type") or "platformer")).lower()
    p1cfg = ((((mods.get("players") or {}).get("submodules") or {})
              .get("player1") or {}).get("config") or {})
    jump_budget = _ci(p1cfg.get("jumpHeight"), 1, 60, 20)
    gnode = mods.get("globals") or {}
    gactive = bool(gnode) and gnode.get("enabled") is not False and bool(gnode.get("config"))
    gcfg = gnode.get("config") or {}
    grav = _ci(gcfg.get("gravityPx"), 0, 4, 1) if gactive else 1
    player_gravity = max(1, min(5, grav + 1))
    # JUMP_SPEED drives the SHARED pl_vmove rise (platformer + runner + smb).  The
    # platformer AND runner C rise both honour jumpSpeedPx (BW_APPLY_JUMP_RISE), so
    # tune it for them.  SMB uses a variable-height jump tuned by its own Speed
    # preset (smbSpeed), so it stays at the historic 2 (ASM == its C at default =
    # byte-identical); topdown/racer have no jump.
    if game_type in ("platformer", "runner"):
        jump_speed = _ci(gcfg.get("jumpSpeedPx"), 1, 6, 2) if gactive else 2
    else:
        jump_speed = 2
    return jump_budget, jump_speed, player_gravity


def build_project_inc(state, player_idx, scene_sprites, start_y=120, player_idx2=-1):
    """Emit src/project.inc — the per-project ASM constants the hand-written 6502
    modules `.include`. Values MUST match collision.h / bg_world.h / scene.inc so
    the ASM and C engines agree. Uses ca65 `.define` (textual) not `SYM = value`
    because ca65 won't fold an `=` constant inside a `.proc` for `.if` / MULC.
    See docs/plans/current/2026-07-06-asm-engine-generator.md (Phase 1)."""
    wcols, wrows = _behaviour_world_dims(state)              # WORLD_COLS/ROWS
    _, _, bcols, brows, acols, _ = _world_nametable(state)   # BG_WORLD_COLS/ROWS + attr cols
    sprites = state.get("sprites") or []
    num_beh = len(sprites)
    num_static = len(scene_sprites or [])
    pw = ph = 2
    if isinstance(player_idx, int) and 0 <= player_idx < len(sprites):
        ps = sprites[player_idx] or {}
        pw = int(ps.get("width") or 2)
        ph = int(ps.get("height") or 2)
    # Player-2 dimensions for the hand-written P2 update (NES_ASM_PLAYER2). The
    # ASM P2 procs bake PLAYER2_W/H like the P1 procs bake PLAYER_W/H; feed them
    # via project.inc (same discipline as PLAYER_W/RUNNER_*/RACER_*). Default to
    # the P1 size when there is no distinct 2nd player sprite.
    pw2, ph2 = pw, ph
    p2_on = (isinstance(player_idx2, int) and 0 <= player_idx2 < len(sprites)
             and player_idx2 != player_idx)
    if p2_on:
        ps2 = sprites[player_idx2] or {}
        pw2 = int(ps2.get("width") or 2)
        ph2 = int(ps2.get("height") or 2)
    # SS_POS_WIDE mirrors build_scene_inc's wide_pos: 1 when any scene sprite
    # sits past the first screen (x or y > 255), so ss_x/ss_y are u16 in the C —
    # the scene-draw ASM must read them at the same width.
    ss_pos_wide = 0
    if num_static:
        world_w, world_h = _scene_world_bounds(state)
        for item in (scene_sprites or []):
            sx, sy = _scene_sprite_xy(item, world_w, world_h)
            if sx > 255 or sy > 255:
                ss_pos_wide = 1
                break
    # SMB horizontal tuning (8.8 fixed-point) for the hand-written smb_accel — it
    # MUST match the C's BW_SMB_WALK_MAX/RUN_MAX/ACCEL, which builder-modules.js
    # derives from the Speed preset (1..5), else the ASM velocity ramps at a
    # different rate than the C. Same table + same clamp(1,5,default=2) as the JS.
    _SMB_SPEED = {
        1: (256, 448, 40), 2: (384, 640, 48), 3: (512, 832, 56),
        4: (640, 1024, 64), 5: (768, 1280, 80),
    }
    _game_cfg = (((state.get("builder") or {}).get("modules") or {}).get("game") or {}).get("config") or {}
    try:
        _sp_key = min(5, max(1, int(_game_cfg.get("smbSpeed"))))
    except (TypeError, ValueError):
        _sp_key = 2
    smb_walk, smb_run, smb_accel = _SMB_SPEED[_sp_key]
    # Auto-runner tuning for the hand-written run_update (BW_GAME_STYLE 2). Must
    # match the C: AUTOSCROLL_SPEED is Builder-emitted (clamp 1..4, default 2);
    # RUNNER_SCREEN_X / BW_RUNNER_SPIKE_ID are template #ifndef defaults (64 / 7);
    # the respawn Y is the player start Y (& 0xFF, as scene.inc's PLAYER_Y).
    # Prefixed RUNNER_* so they never collide with scene.asminc's PLAYER_Y in a
    # module that includes both. Emitted for every build (unused off-runner).
    try:
        run_autoscroll = min(4, max(1, int(_game_cfg.get("autoscrollSpeed"))))
    except (TypeError, ValueError):
        run_autoscroll = 2
    run_screen_x = 64
    run_spike_id = 7
    run_start_y = int(start_y) & 0xFF
    # Racer tuning for the hand-written racer_update (BW_GAME_STYLE 3). Must match
    # the C: RACER_MAX_SPEED/LAPS_TO_WIN/CP_COUNT are Builder-emitted (from the
    # racerTopSpeed/racerLaps/racerCheckpoints knobs); ACCEL/FRICTION/BRAKE + the
    # finish/checkpoint IDs are template #ifndef defaults; REV_MAX = MAX/2. Same
    # discipline as SMB_*/RUNNER_* to avoid the tuning-mismatch class.
    try:
        _rt_tier = min(4, max(1, int(_game_cfg.get("racerTopSpeed"))))
    except (TypeError, ValueError):
        _rt_tier = 3
    racer_max = 256 + _rt_tier * 128
    try:
        racer_laps = min(9, max(1, int(_game_cfg.get("racerLaps"))))
    except (TypeError, ValueError):
        racer_laps = 3
    try:
        racer_cps = min(2, max(1, int(_game_cfg.get("racerCheckpoints"))))
    except (TypeError, ValueError):
        racer_cps = 1
    # Tunable platformer physics for the hand-written pl_jump / pl_vmove. Same
    # discipline as SMB_*/RUNNER_*/RACER_*: mirror the JS Players/Globals module
    # clamps so the ASM (immediates) matches the C. Defaults 20/2/2 == the historic
    # `lda #20` / `sbc #2` / `fall_amt=2` -> byte-identical when untouched.
    jump_budget, jump_speed, player_gravity = _player_physics(state)
    lines = [
        "; project.inc — generated by tools/playground_server.py. Per-project ASM",
        "; constants for the hand-written 6502 engine. `.define` (textual) so ca65",
        "; folds them inside .proc scopes. Values mirror collision.h/bg_world.h.",
        f".define WORLD_COLS             {wcols}",
        f".define WORLD_ROWS             {wrows}",
        f".define BG_WORLD_COLS          {bcols}",
        f".define BG_WORLD_ROWS          {brows}",
        f".define BG_WORLD_ATTR_COLS     {acols}",
        f".define PLAYER_W               {pw}",
        f".define PLAYER_H               {ph}",
        f".define PLAYER2_W              {pw2}",
        f".define PLAYER2_H              {ph2}",
        f".define PLAYER2_ENABLED        {1 if p2_on else 0}",
        # Tunable platformer physics (Style tab: Jump height / Jump speed / Gravity).
        # Defaults 20/2/2 == the historic hardcoded ASM immediates -> byte-identical.
        f".define JUMP_BUDGET           {jump_budget}",
        f".define JUMP_SPEED            {jump_speed}",
        f".define PLAYER_GRAVITY        {player_gravity}",
        # Rows the column streamer skips at the top of the nametable — 4 when the SMB
        # background status bar is on (BW_SMB_HUD_BG) so scroll_stream never overwrites
        # the fixed status strip (rows 0-3); 0 otherwise -> byte-identical.
        f".define SCROLL_SKIP_TOP        {4 if _smbhud_bg_enabled(state) else 0}",
        # 1 when the wide (>8-screen) world's tiles are column-deduplicated
        # (feedback #10); the scroll core then reads bg_col_index/bg_col_data
        # instead of the raw bg_world_tiles array.  0 -> raw -> byte-identical.
        f".define SCROLL_COMPRESSED      {1 if _bg_compression(state)[0] else 0}",
        f".define PLAYER_TILES_PER_FRAME {pw * ph}",
        f".define NUM_BEHAVIOUR_SPRITES  {max(num_beh, 1)}",
        f".define NUM_STATIC_SPRITES     {num_static}",
        f".define SS_POS_WIDE            {ss_pos_wide}",
        ".define SCREEN_W_PX            256",
        ".define SCREEN_H_PX            240",
        f".define SMB_WALK_MAX           {smb_walk}",
        f".define SMB_RUN_MAX            {smb_run}",
        f".define SMB_ACCEL              {smb_accel}",
        f".define RUNNER_AUTOSCROLL      {run_autoscroll}",
        f".define RUNNER_SCREEN_X        {run_screen_x}",
        f".define RUNNER_SPIKE_ID        {run_spike_id}",
        f".define RUNNER_START_Y         {run_start_y}",
        f".define RACER_MAX_SPEED        {racer_max}",
        ".define RACER_ACCEL            13",
        ".define RACER_TURN_CD          6",   # steer cooldown — keep == the C #define RACER_TURN_CD
        ".define RACER_FRICTION         8",
        ".define RACER_BRAKE            40",
        f".define RACER_REV_MAX          {racer_max // 2}",
        f".define RACER_LAPS_TO_WIN      {racer_laps}",
        f".define RACER_CP_COUNT         {racer_cps}",
        ".define RACER_FINISH_ID        7",
        ".define RACER_CHECKPOINT_ID    5",
        ".define RACER_CHECKPOINT2_ID   6",
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

    # Attribute table: 8 attr rows x 8 attr cols per screen.  A NES screen is
    # 30 tiles tall = 7.5 attribute rows, so each screen still occupies a full
    # 8-row band (the 8th row's bottom quads cover the unused tile rows 30-31).
    # Emit one 8x8 block per screen, each derived from THAT screen's own tile
    # rows, laid out as a full-world grid of stride acols.  The scroll core
    # reads bg_world_attrs[(sy*8 + rr) * acols + sx*8 + cc], so screen (sx, sy)
    # must live at attr rows sy*8..sy*8+7 / cols sx*8..sx*8+7 — NOT a tightly
    # packed (rows+3)//4 grid, which mis-aligned the bottom screens of
    # vertical / 2x2 worlds and read one screen-row past the array end.
    acols = 8 * sx
    arows = 8 * sy
    attrs = bytearray(acols * arows)
    for screen_y in range(sy):
        for screen_x in range(sx):
            tile_row0 = screen_y * SCREEN_ROWS
            tile_col0 = screen_x * SCREEN_COLS
            for sr in range(8):
                for sc in range(8):
                    byte = 0
                    for quad in range(4):
                        qr = (quad >> 1) & 1
                        qc = quad & 1
                        tr = tile_row0 + sr * 4 + qr * 2
                        tc = tile_col0 + sc * 4 + qc * 2
                        pal = 0
                        if tr < len(nt):
                            row = nt[tr]
                            if tc < len(row) and isinstance(row[tc], dict):
                                pal = int(row[tc].get("palette", 0)) & 3
                        byte |= pal << (quad * 2)
                    attrs[(screen_y * 8 + sr) * acols + (screen_x * 8 + sc)] = byte
    return bytes(tiles), bytes(attrs), cols, rows, acols, arows


def build_bg_world_h(state):
    """Emit src/bg_world.h — world-nametable dimensions + array prototypes."""
    _, _, cols, rows, acols, arows = _world_nametable(state)
    compress, uniq, _ci, _cd = _bg_compression(state)
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
        f"#define SCROLL_COMPRESSED   {1 if compress else 0}",
        "",
        "/* Full-world pixel dimensions.  Exposed here (rather than in",
        "   scroll.h) because main.c bounds-checks the player against them",
        "   even on the 1x1 fast path, where scroll.h is not included. */",
        "#define WORLD_W_PX          (BG_WORLD_COLS * 8)",
        "#define WORLD_H_PX          (BG_WORLD_ROWS * 8)",
        "",
        *([f"#define BG_COL_UNIQ         {uniq}",
           "extern const unsigned char bg_col_index[BG_WORLD_COLS];",
           "extern const unsigned char bg_col_data[BG_COL_UNIQ * BG_WORLD_ROWS];"]
          if compress else
          ["extern const unsigned char bg_world_tiles[BG_WORLD_COLS * BG_WORLD_ROWS];"]),
        "extern const unsigned char bg_world_attrs[BG_WORLD_ATTR_COLS * BG_WORLD_ATTR_ROWS];",
        "",
        "#endif",
        "",
    ]
    return "\n".join(lines)


def _dedup_columns(tiles, cols, rows):
    """Column-deduplicate a row-major tile array.

    Returns (col_index, col_data, uniq).  col_index[c] is the unique-column id
    for world column c; col_data lays the unique columns out contiguously so
    col_data[uid * rows + r] is that column's tile at row r.  Levels repeat
    columns heavily (sky, flat floor, repeated blocks), so this shrinks a raw
    ~1KB/screen tile array to a small unique-column table + a 1-byte-per-column
    index — the compression that lets levels exceed the ~8-screen NROM raw cap.
    """
    seen = {}
    # A plain list (not a bytearray) so the uid can exceed 255 without raising:
    # levels with >=256 unique columns can't be indexed in one byte, but we must
    # still count them so the caller can reject the world with a clear message
    # instead of crashing with "byte must be in range(0, 256)".
    col_index = []
    col_data = bytearray()
    for c in range(cols):
        colbytes = bytes(tiles[r * cols + c] for r in range(rows))
        uid = seen.get(colbytes)
        if uid is None:
            uid = len(seen)
            seen[colbytes] = uid
            col_data.extend(colbytes)
        col_index.append(uid)
    return col_index, col_data, len(seen)


def _bg_compression(state):
    """Decide whether the selected bg's tiles are column-compressed, and how.

    Compress ANY 1-tall world wider than one screen (>32 cols) when the dedup
    both fits a 1-byte index (<256 unique columns) AND is actually smaller than
    the raw array.  (v66: was gated to >8 screens = >256 cols, which left a
    *detailed* 5-8 screen level overflowing NROM on the raw path with no help;
    real hand-painted levels repeat columns heavily — sky, flat floor, repeated
    blocks — so compressing them shrinks the ROM and lets them fit.)  A 1-screen
    world (32 cols) stays raw so its ROM is byte-identical to the baseline; tall
    worlds (rows>30) stay raw (tall scroll is capped at 2 screens).  Returns
    (compress: bool, uniq: int, col_index: bytes|None, col_data: bytes|None).
    """
    tiles, attrs, cols, rows, acols, arows = _world_nametable(state)
    if rows == 30 and cols > 32:
        col_index, col_data, uniq = _dedup_columns(tiles, cols, rows)
        # Compressed size = unique-column data + a 1-byte index per world column.
        # Only compress when it fits a 1-byte index and genuinely shrinks the ROM.
        if uniq < 256 and (uniq * rows + cols) < (cols * rows):
            return True, uniq, bytes(col_index), bytes(col_data)
        # Couldn't compress usefully.  Return the real uniq so _guard_world_fits
        # can reject a *wide* (>8 screen) un-compressible world with a clear
        # message (a raw >8-screen array always overflows NROM).
        return False, uniq, None, None
    return False, 0, None, None


def _guard_world_fits(state):
    """Reject worlds that provably cannot fit an NROM cartridge, with a clear,
    kid-friendly message instead of a Python traceback (500) or an obscure
    "memory area overflow" linker error.

    The one case we can prove up front: a world more than 8 screens wide (>256
    cols) that also can't column-compress (too many distinct columns for a
    1-byte index, or not compressible enough).  A raw >8-screen array always
    overflows NROM, so such a world can never build — better to say why.  A
    world of 8 screens or fewer is NOT rejected here: it may fit raw, and if it
    doesn't the linker overflow is turned into a friendly message downstream."""
    _tiles, _attrs, cols, rows, _ac, _ar = _world_nametable(state)
    if rows == 30 and cols > 256:
        compress, uniq, _ci, _cd = _bg_compression(state)
        if not compress:
            raise BuildError(
                "This level is too big to fit on the cartridge. It is more than "
                "8 screens wide and its columns are too varied to pack down "
                f"({uniq} different columns — the compressor needs fewer than "
                "256 and works best with lots of repeats). Try making it "
                "shorter, or reuse more repeated sections (flat floor, repeated "
                "blocks) so columns can be shared."
            )


def build_bg_world_c(state):
    """Emit src/bg_world.c — flat tile + attribute arrays for the whole world."""
    tiles, attrs, cols, rows, acols, arows = _world_nametable(state)
    compress, uniq, col_index, col_data = _bg_compression(state)

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
    if compress:
        lines += [
            f"/* Column-deduplicated (feedback #10 — go beyond 8 screens): {uniq} "
            f"unique columns x {rows} rows = {uniq * rows} bytes + a {cols}-byte "
            f"index; the raw array would be {cols * rows} bytes. The scroll core "
            f"reads bg_col_data[bg_col_index[col] * BG_WORLD_ROWS + rr]. */",
        ]
        lines += _hex_table("bg_col_index", "BG_WORLD_COLS", col_index)
        lines += [""]
        lines += _hex_table("bg_col_data", "BG_COL_UNIQ * BG_WORLD_ROWS", col_data)
    else:
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

def _project_needs_four_screen(state):
    """True if any background in the project scrolls vertically (any
    `screens_y > 1`).  Vertical scroll under V-mirror corrupts the
    visible screen because NT0 ≡ NT2; flipping the 4-screen bit in the
    iNES header makes every emulator allocate four physically distinct
    nametables, which is what the scroll core already assumes.  We
    deliberately *don't* flip this for purely-horizontal worlds (2×1)
    because V-mirror is the right choice there and it keeps the
    byte-identical-baseline test honest for the 1×1 stock build.

    Phase 4.4 fix — see [scroll.c](steps/Step_Playground/src/scroll.c)
    `load_world_bg` and `scroll_stream`'s vertical block, which already
    address `$2800/$2C00` correctly assuming NT2/NT3 are distinct.
    """
    if not isinstance(state, dict):
        return False
    bgs = state.get("backgrounds") or []
    if not isinstance(bgs, list):
        return False
    for bg in bgs:
        if not isinstance(bg, dict):
            continue
        dims = bg.get("dimensions") or {}
        try:
            sy = int(dims.get("screens_y") or 1)
        except (TypeError, ValueError):
            sy = 1
        if sy > 1:
            return True
    return False


def _patch_ines_four_screen(rom_bytes):
    """Set bit 3 of the iNES header byte 6 (the 4-screen-VRAM flag).
    cc65 v2.18's nes.lib hard-codes byte 6 to 0x03 (vertical mirroring
    + a stray battery bit) regardless of the cfg's `NES_MIRRORING`
    weak symbol, so reaching it via the cfg is a dead end on this
    toolchain.  Patching the produced ROM in-place is reliable, costs
    one byte to mutate, and lets the regression suite sha1 a stable
    output."""
    if not rom_bytes or len(rom_bytes) < 16:
        return rom_bytes
    if rom_bytes[0:4] != b"NES\x1a":
        return rom_bytes
    header = bytearray(rom_bytes[:16])
    header[6] |= 0x08
    return bytes(header) + rom_bytes[16:]


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

    After whichever path runs, if the project needs vertical scroll
    we flip the 4-screen-VRAM bit in the iNES header so emulators
    allocate four distinct nametables (Phase 4.4).
    """
    state = body.get("state")
    if not isinstance(state, dict):
        raise ValueError("missing 'state' in request body")
    # Arc E §1 (E1-0): expand any 16x16-metatile backgrounds into ordinary 8x8
    # nametable/behaviour grids before anything reads them.  No-op for 8x8.
    _expand_metatiles(state)

    # Fail fast with a readable message on worlds that provably can't fit the
    # cartridge (a wide level too varied to column-compress), rather than
    # crashing deep in codegen or overflowing the linker.
    _guard_world_fits(state)

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

    # E3-3: bake the racer's rotated car frames into spare CHR slots (mutates the
    # sprite pool) before encoding it.  No-op for non-racer games → byte-identical.
    _inject_racer_rotation(state, player_idx)

    chr_bytes = build_chr(state)
    nam_bytes = build_nam(state)

    needs_four_screen = _project_needs_four_screen(state)

    def _maybe_patch(result):
        rom_bytes, build_log = result
        if needs_four_screen:
            rom_bytes = _patch_ines_four_screen(rom_bytes)
        return rom_bytes, build_log

    # Phase 4.3 — optional audio assets.  The browser-side audio
    # editor passes the FamiStudio-exported `.s` blobs in here.
    # Both must be present for USE_AUDIO=1 to flip on, since
    # main.c links against `audio_default_music` *and*
    # `audio_sfx_data` symbols.  Small validation: must be strings,
    # capped at 64 KB each so a runaway upload can't eat memory.
    AUDIO_MAX_BYTES = 64 * 1024
    audio_songs = body.get("audioSongsAsm")
    audio_sfx   = body.get("audioSfxAsm")
    if audio_songs is not None:
        if not isinstance(audio_songs, str):
            raise ValueError("'audioSongsAsm' must be a string if provided")
        if len(audio_songs.encode("utf-8")) > AUDIO_MAX_BYTES:
            raise ValueError(f"'audioSongsAsm' too large (>{AUDIO_MAX_BYTES} bytes)")
        if not audio_songs.strip():
            audio_songs = None
    if audio_sfx is not None:
        if not isinstance(audio_sfx, str):
            raise ValueError("'audioSfxAsm' must be a string if provided")
        if len(audio_sfx.encode("utf-8")) > AUDIO_MAX_BYTES:
            raise ValueError(f"'audioSfxAsm' too large (>{AUDIO_MAX_BYTES} bytes)")
        if not audio_sfx.strip():
            audio_sfx = None
    # main.c imports both `audio_default_music` and `audio_sfx_data`
    # symbols — without them the link fails.  Pre-2026-04-27 we
    # required pupils to upload BOTH a song and an sfx pack before
    # audio engaged at all, and asymmetric uploads silently fell
    # back to no-audio.  Pupil-reported (2026-04-27): pupils
    # uploading just a song expected music to play and got silence
    # because the editor quietly dropped audio entirely.
    #
    # Fix: when only one side is provided, auto-stub the other so
    # the link succeeds and the audio engine engages.  The stubs
    # below are the minimum-viable blobs (lifted from audio.mjs's
    # STUB_*_ASM constants which the smoke suite already proves
    # compile + link).  The stub song is silent, the stub sfx pack
    # has a single null entry — pupils get whatever asset they
    # uploaded plus a no-op for the other side.
    # Event sound effects (engine v74): trigger sfx on jump/pickup/hurt/win.
    # Only honoured when the pupil supplied a REAL sfx pack — the auto-stub
    # below has a single null entry, and calling famistudio_sfx_play against it
    # would read past the (empty) sound table.
    audio_sfx_events = bool(body.get("audioSfxEvents"))
    has_real_sfx = audio_sfx is not None
    audio_kwargs = {}
    if audio_songs and not audio_sfx:
        audio_sfx = _AUTO_SFX_STUB_ASM
    elif audio_sfx and not audio_songs:
        audio_songs = _AUTO_SONGS_STUB_ASM
    if audio_songs and audio_sfx:
        audio_kwargs = {"audio_songs_asm": audio_songs,
                        "audio_sfx_asm":   audio_sfx,
                        "bw_sfx_events":   audio_sfx_events and has_real_sfx}

    if custom_main_asm is not None:
        pal_asm = build_palettes_asminc(state)
        scene_asm = build_scene_asminc(state, player_idx, scene_sprites, start_x, start_y)
        return _maybe_patch(_build_asm_in_tempdir(
            custom_main_asm, chr_bytes, nam_bytes, pal_asm, scene_asm,
        ))

    pal_src = build_palettes_inc(state)
    scene_src = build_scene_inc(
        state, player_idx, scene_sprites, start_x, start_y,
        player_idx2=player_idx2, start_x2=start_x2, start_y2=start_y2,
    )
    collision_h = build_collision_h(state)
    behaviour_c = build_behaviour_c(state)
    bg_world_h = build_bg_world_h(state)
    bg_world_c = build_bg_world_c(state)
    project_inc = build_project_inc(state, player_idx, scene_sprites, start_y, player_idx2)

    # The universal hand-written 6502 engine is only linked when the main.c is
    # KNOWN ASM-ready: the stock main.c (custom_main_c is None) or a
    # template-derived one carrying the NES_ASM_READY_V1 marker (read_controller/
    # write_palettes gated behind NES_ASM_LEAF + exported palette_bytes).  A
    # bespoke customMainC (e.g. the audio.html preview) lacks the marker and is
    # built as pure C, so it can define those helpers itself without a clash.
    asm_ready = custom_main_c is None or ("NES_ASM_READY_V1" in custom_main_c)
    # A build is "scroll" (multi-screen) when the painted world exceeds one
    # nametable — matches scroll.c's `BG_WORLD_COLS > 32 || BG_WORLD_ROWS > 30`
    # gate.  Only then is it safe to link the NES_ASM_SCROLL functions.
    _, _, _world_cols, _world_rows, _, _ = _world_nametable(state)
    is_scroll = _world_cols > 32 or _world_rows > 30

    # Scene-sprite DRAW loop on hand-written 6502 (Phase 2a). SHIPPED BY DEFAULT
    # (engine v31) for the shapes it handles: it does only the PLAIN draw path, so
    # it needs no tagged scene animation; it calls world_to_screen_x/y, so it needs
    # a scroll build (which pulls in NES_ASM_SCROLL); and it needs >=1 scene sprite
    # (scene_asm.s resolves the ss_* arrays only when scene.inc emits them).
    # Projects outside that envelope (1x1/non-scroll, animated sprites, or no scene
    # sprites) keep the C draw loop. Proven pixel-identical to the C by
    # asm-scene.mjs (palette + OAM + nametables, incl. the SS_POS_WIDE u16 render).
    # PLAYGROUND_NO_ASM=1 is the kill switch (below).
    num_static = len(scene_sprites or [])
    has_scene_anim = any(
        _resolve_tagged_animation(state, role, style) is not None
        for (role, style) in (("enemy", "walk"), ("enemy", "idle"), ("pickup", "idle"))
    )
    nes_asm_scene = bool(
        asm_ready and is_scroll and num_static > 0 and not has_scene_anim
    )
    # Scene-sprite AI on hand-written 6502 (Phase 2b): the generic ai_update loop
    # (walker/chaser/flyer/patrol) + the bw_sprite_blocked probe. SHIPPED BY
    # DEFAULT (engine v30) — enabled whenever the client emitted the AI tables
    # (ss_ai_type[...]), which builder-modules.js does only when the project has
    # at least one walker/chaser/flyer/patrol. Gating on the tables' PRESENCE is
    # required, not optional: ai_asm.s `.import`s _ss_ai_type/state/speed/aux/home,
    # so forcing NES_ASM_AI on a table-less build (no AI enemies, or the stock
    # main.c) would fail to link. Proven byte-behaviour-identical to the C AI by
    # the asm-ai{,-wide,-corpus} A/B suites (~1.2x faster + smaller — asm-ai-bench).
    # PLAYGROUND_NO_ASM=1 falls back to the pure-C AI (kill switch, below).
    nes_asm_ai = bool(
        asm_ready and custom_main_c is not None and "ss_ai_type[" in custom_main_c
    )
    # Player update on hand-written 6502 (Phase 2c). SHIPPED BY DEFAULT (engine v43)
    # for SINGLE-PLAYER builds: all six single-player models (top-down, platformer,
    # SMB, auto-runner, racer P1) are A/B-proven byte-behaviour-identical to the C
    # (asm-player.mjs) and flag-off byte-identical. TWO-PLAYER builds stay on the C
    # for now — the P2 second actors aren't on ASM yet — unless PLAYGROUND_ASM_PLAYER
    # is set (force-on incl. 2P, for the P2 A/B). PLAYGROUND_NO_ASM=1 is the kill
    # switch (skips all asm flags below). The models are detected in the client
    # main.c: top-down emits
    # `#define BW_GAME_STYLE 1`; a plain platformer emits NO BW_GAME_STYLE define
    # (it defaults to 0) and NO BW_SMB_JUMP; runner/racer are 2/3 and SMB carries
    # BW_SMB_JUMP (plat_update does NOT cover SMB physics). Both px/py widths are
    # handled (a PX_WIDE .if picks u8 vs u16). The C player blocks are #if'd out
    # only under NES_ASM_PLAYER, so flag off is byte-identical.
    # Match REAL defines (line-anchored via the leading newline) — the template
    # carries an explanatory comment containing the text `#define BW_GAME_STYLE 1`
    # in every build, so a bare substring test would false-match for platformer/SMB.
    _cmc = custom_main_c or ""
    _asm_player_topdown = "\n#define BW_GAME_STYLE 1" in _cmc
    _asm_player_smb = "\n#define BW_SMB_JUMP" in _cmc
    # Auto-runner (Phase 2c): style 2 -> run_update. It MUST be a scroll build (the
    # ASM runner section is gated `.if PX_WIDE` because it imports _cam_x, which
    # scroll.c defines only for a multi-screen world); a runner always is one.
    _asm_player_runner = ("\n#define BW_GAME_STYLE 2" in _cmc) and is_scroll
    # Top-down racer (Phase 2c): style 3 -> racer_update (P1 car). Always a scroll
    # build (racer_update uses u16 px/py); its own NES_ASM_RACER gate because it
    # imports the racer-only globals a non-racer build never defines.
    _asm_player_racer = ("\n#define BW_GAME_STYLE 3" in _cmc) and is_scroll
    _asm_player_platformer = (
        "\n#define BW_GAME_STYLE 1" not in _cmc
        and "\n#define BW_GAME_STYLE 2" not in _cmc
        and "\n#define BW_GAME_STYLE 3" not in _cmc
        and not _asm_player_smb
    )
    # 2-player detection (mirrors build_scene_inc's p2_active). As of engine v50 the
    # P2 second actors ALSO ship on ASM by default (all four styles A/B-proven
    # identical to the C), so a 2P build gets P1 on ASM here + P2 on ASM via the
    # nes_asm_player2 gate below. (_p2_ok is retired — 2P is no longer excluded.)
    _p2_sprites = state.get("sprites") or []
    player2_enabled = (player_idx2 is not None and player_idx2 >= 0
                       and player_idx2 != player_idx and player_idx2 < len(_p2_sprites))
    # NB a 2-PLAYER auto-runner (style 2) uses the pure-C 2p-runner path (both cars
    # auto-run + jump + ghost-on-death, restart when both die — see platformer.c),
    # so it engages NEITHER NES_ASM_PLAYER (P1) nor NES_ASM_PLAYER2 (P2). The 1p
    # runner keeps the ASM run_update. (Chosen: C for the niche 2p runner keeps the
    # proven 1p ASM run_update untouched.)
    nes_asm_player = bool(
        asm_ready and custom_main_c is not None
        and (_asm_player_topdown or _asm_player_platformer
             or (_asm_player_runner and not player2_enabled))
    )
    # SMB (Phase 2c 5b): style 0 + BW_SMB_JUMP — smb_update (accel/skid + ladder/
    # jump + variable-cut + gravity). Distinct from plat_update (which does NOT
    # cover SMB physics), so it's its own gate; NES_ASM_SMB=1 IMPLIES NES_ASM_PLAYER
    # in the Makefile (links player_asm.s + -D's out the C blocks) and additionally
    # passes `-D NES_ASM_SMB` to ca65 so player_asm.s compiles its SMB section.
    nes_asm_smb = bool(
        asm_ready and custom_main_c is not None
        and _asm_player_smb
    )
    # Racer (Phase 2c): style 3 — racer_update. NES_ASM_RACER=1 IMPLIES NES_ASM_PLAYER
    # in the Makefile and passes `-D NES_ASM_RACER` to ca65 so player_asm.s compiles
    # its racer section (racer_update + the racer-only globals it imports).
    nes_asm_racer = bool(
        asm_ready and custom_main_c is not None
        and _asm_player_racer
    )
    # Player-2 second actor (Phase 2c). NES_ASM_PLAYER2=1 IMPLIES NES_ASM_PLAYER and
    # passes `-D NES_ASM_PLAYER2` to ca65 so player_asm.s compiles its P2 section
    # (p2_* procs + the P2-only globals). SHIPPED BY DEFAULT (engine v50) for any
    # 2-player build of a covered style (top-down/racer/platformer) — those P2 second
    # actors are A/B-proven byte-behaviour-identical to the C. PLAYGROUND_NO_ASM=1
    # remains the whole-engine kill switch. The 2-player RUNNER is excluded: it uses
    # the pure-C 2p-runner path (both cars auto-run; see nes_asm_player above).
    nes_asm_player2 = bool(
        asm_ready and custom_main_c is not None and player2_enabled
        and (_asm_player_topdown or _asm_player_racer or _asm_player_platformer)
    )
    # Player OAM DRAW loop (Phase 2d). NES_ASM_PDRAW=1 links pdraw_asm.s
    # (draw_player + draw_player2 under NES_ASM_PLAYER2) and -D's out the plain C P1
    # and P2 draw loops in main.c. Generic (works for any player — it reads
    # anim_tiles/anim_attrs/anim_base + the fixed player2_tiles/attrs), needs a
    # scroll build (calls world_to_screen_x/y). SHIPPED BY DEFAULT (engine v54): the
    # OAM A/B (asm-player.mjs) proves C-draw ≡ ASM-draw byte-for-byte in the shadow
    # buffer, and the draw is the same pre-vblank work as the C. Only scroll builds
    # with a custom main.c engage it; the stock/golden + 1-screen _rom-equiv fixtures
    # are outside that envelope, so both goldens stay byte-identical. PLAYGROUND_
    # NO_ASM=1 remains the whole-engine kill switch (skips this with everything else).
    nes_asm_pdraw = bool(
        asm_ready and custom_main_c is not None and is_scroll
        and not os.environ.get("PLAYGROUND_NO_PDRAW")   # granular kill switch (draw only)
    )

    if custom_main_c is not None:
        return _maybe_patch(_build_in_tempdir(
            custom_main_c, chr_bytes, nam_bytes, pal_src, scene_src,
            collision_h, behaviour_c, bg_world_h, bg_world_c,
            nes_asm_leaf=asm_ready, nes_asm_scroll=(is_scroll and asm_ready),
            nes_asm_scene=nes_asm_scene, nes_asm_ai=nes_asm_ai,
            nes_asm_player=nes_asm_player, nes_asm_smb=nes_asm_smb,
            nes_asm_racer=nes_asm_racer, nes_asm_player2=nes_asm_player2,
            nes_asm_pdraw=nes_asm_pdraw,
            # Gate on the ACTUAL emission of BW_SMB_HUD_BG in the assembled C
            # (target-engine gated, >= v58), not just the module config — the
            # NMI crt0 imports _hud_present/_hud_ready, which only exist when
            # `BW_SMB_HUD_BG && SCROLL_BUILD` both hold.  is_scroll gives the
            # SCROLL_BUILD half; a pre-v58 target that leaves BW_SMB_HUD_BG out
            # would otherwise link the crt0 against undefined symbols.
            hud_nmi=(is_scroll and "#define BW_SMB_HUD_BG 1" in (custom_main_c or "")),
            project_inc=project_inc, **audio_kwargs,
        ))
    # Default (no custom source): build the stock main.c in its own temp dir
    # too — isolated + dirt-free.
    return _maybe_patch(_build_in_tempdir(
        None, chr_bytes, nam_bytes, pal_src, scene_src,
        collision_h, behaviour_c, bg_world_h, bg_world_c,
        nes_asm_leaf=asm_ready, nes_asm_scroll=(is_scroll and asm_ready),
        nes_asm_scene=nes_asm_scene, nes_asm_ai=nes_asm_ai,
        nes_asm_player=nes_asm_player, nes_asm_smb=nes_asm_smb,
            nes_asm_racer=nes_asm_racer, nes_asm_player2=nes_asm_player2,
        project_inc=project_inc, **audio_kwargs,
    ))


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

        with BUILD_SEM:
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


def _build_in_tempdir(custom_main, chr_bytes, nam_bytes, pal_src, scene_src,
                      collision_h, behaviour_c, bg_world_h, bg_world_c,
                      audio_songs_asm=None, audio_sfx_asm=None, bw_sfx_events=False,
                      nes_asm_leaf=False, nes_asm_scroll=False,
                      nes_asm_scene=False, nes_asm_ai=False,
                      nes_asm_player=False, nes_asm_smb=False, nes_asm_racer=False, nes_asm_player2=False,
                      nes_asm_pdraw=False, hud_nmi=False,
                      project_inc=None):
    # Clone STEP_DIR into a throwaway directory so a build's main.c + generated
    # asset files never touch the shared tree — used for EVERY build now (the
    # pupil's `customMainC` and the default stock build alike), so concurrent
    # Plays run in parallel (bounded by BUILD_SEM) and leave no build-dirt.
    # `custom_main=None` keeps the stock main.c the copytree brought in.
    with tempfile.TemporaryDirectory(prefix="nesgame_build_") as td:
        tmp_root = pathlib.Path(td) / "Step_Playground"
        shutil.copytree(
            STEP_DIR, tmp_root,
            ignore=shutil.ignore_patterns("game.nes", "*.o", "*.map", "build"),
        )
        if custom_main is not None:
            (tmp_root / "src" / "main.c").write_text(custom_main)

        (tmp_root / "assets" / "sprites").mkdir(parents=True, exist_ok=True)
        (tmp_root / "assets" / "backgrounds").mkdir(parents=True, exist_ok=True)
        (tmp_root / "assets" / "sprites" / "game.chr").write_bytes(chr_bytes)
        (tmp_root / "assets" / "backgrounds" / "level.nam").write_bytes(nam_bytes)
        (tmp_root / "src" / "scene.inc").write_text(scene_src)
        # Per-project ASM constants for the hand-written 6502 modules (Phase 1).
        if project_inc:
            (tmp_root / "src" / "project.inc").write_text(project_inc)
        (tmp_root / "src" / "palettes.inc").write_text(pal_src)
        (tmp_root / "src" / "collision.h").write_text(collision_h)
        (tmp_root / "src" / "behaviour.c").write_text(behaviour_c)
        (tmp_root / "src" / "bg_world.h").write_text(bg_world_h)
        (tmp_root / "src" / "bg_world.c").write_text(bg_world_c)

        # Phase 4.3 — audio.  The clone of STEP_DIR always starts with no audio
        # files, so only stage them when the project ships a song + sfx blob;
        # default-off keeps the byte-identical-baseline test honest.
        make_args = ["make", "-C", str(tmp_root)]
        # Universal hand-written 6502 engine (asm-lab).  NES_ASM_LEAF
        # (read_controller, write_palettes) is project-independent, so it ships
        # for every build; NES_ASM_SCROLL (world_to_screen_x/y, scroll_follow,
        # scroll_apply_ppu) only for multi-screen builds — a 1x1 ROM's empty
        # scroll.c defines no cam_x for scroll_asm.s to link against.  These are
        # proven behaviourally identical to the C in asm-lab/ and let the engine
        # hold 60fps where pure C dropped frames.  Set PLAYGROUND_NO_ASM=1 to fall
        # back to the pure-C engine (kill switch).
        if not os.environ.get("PLAYGROUND_NO_ASM"):
            if nes_asm_leaf:
                make_args.append("NES_ASM_LEAF=1")
            if nes_asm_scroll:
                make_args.append("NES_ASM_SCROLL=1")
            if nes_asm_scene:                       # Phase 2a — scene-draw loop
                make_args.append("NES_ASM_SCENE=1")
            if nes_asm_ai:                          # Phase 2b — scene AI helpers
                make_args.append("NES_ASM_AI=1")
            if nes_asm_smb:                         # Phase 2c 5b — SMB player (implies PLAYER)
                make_args.append("NES_ASM_SMB=1")
            elif nes_asm_racer:                     # Phase 2c — racer player (implies PLAYER)
                make_args.append("NES_ASM_RACER=1")
            elif nes_asm_player:                    # Phase 2c — player update (top-down/platformer/runner)
                make_args.append("NES_ASM_PLAYER=1")
            if nes_asm_player2:                     # Phase 2c — P2 second actor (implies PLAYER; combines with P1)
                make_args.append("NES_ASM_PLAYER2=1")
            if nes_asm_pdraw:                       # Phase 2d — P1 OAM draw loop (independent of the player-update flags)
                make_args.append("NES_ASM_PDRAW=1")
        if audio_songs_asm and audio_sfx_asm:
            (tmp_root / "src" / "audio_songs.s").write_text(_stage_audio_asm(audio_songs_asm))
            (tmp_root / "src" / "audio_sfx.s").write_text(_stage_audio_asm(audio_sfx_asm))
            make_args.append("USE_AUDIO=1")
            if bw_sfx_events:                       # engine v74 — event SFX (jump/pickup/hurt/win)
                make_args.append("BW_SFX_EVENTS=1")
            # Override the Makefile's relative `../../tools/audio/famistudio`
            # default with the real path — the tempdir clone of STEP_DIR
            # has no `tools/` sibling, so the relative form would 404.
            make_args.append(f"FAMISTUDIO_DIR={AUDIO_ENGINE_DIR}")

        # SMB background status bar on a scrolling world: drive its sprite-0 PPU
        # push from the NMI so the strip renders on time under heavy frame load
        # (the "header flickers after the first screen" fix).  HUD_NMI=1 links
        # src/hud_crt0.o (the NMI hook that calls hud_present()).  Only for
        # scroll builds — a 1-screen bg HUD has no split and defines no
        # hud_present symbol for the crt0 to import.  Independent of the ASM kill
        # switch: hud_present is C and calls scroll_apply_ppu/scroll_stream
        # whether they resolve to the ASM or the C definitions.
        if hud_nmi:
            make_args.append("HUD_NMI=1")

        # Cap concurrent compiles (each is CPU-heavy) so a class pressing Play
        # together doesn't spawn dozens of cc65 processes at once.
        with BUILD_SEM:
            build = subprocess.run(
                make_args,
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


def _resolve_engine_versions(body):
    """(target_engine, current_engine) for build provenance / versioning.

    The original multi-page site defaults to v1 (stable/pinned); the Studio
    targets the latest.  For v1..v2 the static cc65 sources are identical, so
    this is provenance-only today — it is the hook where a future engine whose
    static sources diverge would build the target's snapshot."""
    try:
        current_engine = int((ROOT / "tools" / "engines" / "ENGINE_VERSION").read_text().strip())
    except Exception:
        current_engine = 1
    try:
        target_engine = int(body.get("targetEngine", 1))
    except (TypeError, ValueError):
        target_engine = 1
    return max(1, min(current_engine, target_engine)), current_engine


_OVERFLOW_RE = re.compile(r"overflows memory area '(\w+)' by (\d+) bytes")


def _friendly_build_error(log):
    """Turn an obscure ld65 "memory area overflow" into a message a teacher or
    pupil can act on, while keeping the raw linker output for debugging.

    NES cartridges are tiny (NROM = 32KB of program space), so a big level plus
    its graphics can simply not fit.  Rather than surface
    "Segment 'RODATA' overflows memory area 'ROM0' by 5950 bytes", explain what
    that means and how to make the game smaller."""
    m = _OVERFLOW_RE.search(log or "")
    if not m:
        return log
    over = int(m.group(2))
    return (
        f"Your game is about {over} bytes too big to fit on the NES cartridge "
        "(they only hold 32KB in total). To make it fit, try one or more of:\n"
        "  • make the level a few screens shorter;\n"
        "  • reuse repeated sections (flat floor, repeated blocks) so the level "
        "packs down smaller;\n"
        "  • use fewer different background tiles;\n"
        "  • remove some sprites or animation frames.\n\n"
        "(If your level is wide and this only started recently, the playground "
        "server may need restarting so it can compress wide levels.)\n\n"
        "----- technical details -----\n" + log
    )


def run_play(body):
    # mode: "browser" (default) returns ROM bytes for jsnes to run in the
    # tab; "native" launches fceux on the server's desktop (only useful for
    # the offline single-user workflow).  "native" auto-falls-back to
    # browser behaviour with a warning if fceux isn't on PATH.
    mode = (body.get("mode") or "browser").lower()
    target_engine, current_engine = _resolve_engine_versions(body)

    started = time.time()
    try:
        rom_bytes, build_log = _build_rom(body)
    except BuildError as e:
        return {"ok": False, "stage": "build", "log": _friendly_build_error(str(e)),
                "build_time_ms": int((time.time() - started) * 1000)}
    except Exception as e:
        return {"ok": False, "stage": "generate",
                "log": f"{type(e).__name__}: {e}\n\n{traceback.format_exc()}",
                "build_time_ms": int((time.time() - started) * 1000)}

    built_epoch = time.time()
    result = {"ok": True, "log": build_log, "size": len(rom_bytes),
              "built_epoch": built_epoch,
              "built_iso": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(built_epoch)),
              "build_time_ms": int((built_epoch - started) * 1000),
              "engineVersion": target_engine, "engineLatest": current_engine}

    if mode == "native":
        if not FCEUX_PATH:
            result["stage"] = "launched-browser-fallback"
            result["warning"] = "fceux is not installed on the server; returning ROM for in-browser play instead."
            result["rom_b64"] = base64.b64encode(rom_bytes).decode("ascii")
            return result
        # Write the just-built ROM to a dedicated path before launching
        # fceux.  The customMainC / customMainAsm paths above build in a
        # throwaway tempdir and return bytes — they do NOT update
        # STEP_DIR / "game.nes", so earlier revisions of this branch
        # launched fceux against whatever stale ROM `make` happened to
        # leave there (usually the stock build without the pupil's
        # changes).  Using a dedicated "_play_latest.nes" avoids
        # clobbering any stock game.nes the pupil may rely on for
        # offline work.
        latest_rom = STEP_DIR / "_play_latest.nes"
        try:
            latest_rom.write_bytes(rom_bytes)
        except Exception as e:
            return {"ok": False, "stage": "launch",
                    "log": build_log + f"\nfailed to stage ROM for fceux: {e}"}
        try:
            subprocess.Popen(
                [FCEUX_PATH, str(latest_rom)],
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
# Gallery (Phase 4.2)
# ---------------------------------------------------------------------------

# Slug builder.  Lower-cases title, replaces every non-[a-z0-9] run
# with a single dash, trims leading/trailing dashes, caps length, and
# tacks on a 4-char random suffix so two pupils calling their game
# "Untitled" don't collide.
_SLUG_RE = re.compile(r"[^a-z0-9]+")
_SLUG_FORBIDDEN = {"", ".", ".."}


def _gallery_slug(title):
    base = _SLUG_RE.sub("-", (title or "").lower()).strip("-")[:48]
    if base in _SLUG_FORBIDDEN:
        base = "untitled"
    suffix = secrets.token_hex(2)  # 4 hex chars
    return f"{base}-{suffix}"


def _gallery_metadata_path(slug):
    return GALLERY_DIR / slug / "metadata.json"


def _gallery_load_metadata(slug):
    """Read a gallery entry's metadata.json.  Returns None on any error."""
    try:
        with _gallery_metadata_path(slug).open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, dict):
            data["slug"] = slug
            return data
    except Exception:
        pass
    return None


def _gallery_list_entries():
    """Return every gallery entry's metadata, newest first.  Skips
    folders without a valid metadata.json so a half-written publish
    in flight can't break the gallery page."""
    if not GALLERY_DIR.exists():
        return []
    out = []
    for child in GALLERY_DIR.iterdir():
        if not child.is_dir():
            continue
        meta = _gallery_load_metadata(child.name)
        if meta is None:
            continue
        out.append(meta)
    out.sort(key=lambda m: m.get("ts", ""), reverse=True)
    return out


def _gallery_safe_slug(slug):
    """Reject path-traversal / odd chars before touching the filesystem."""
    if not isinstance(slug, str):
        return None
    if not slug or slug in _SLUG_FORBIDDEN:
        return None
    if "/" in slug or "\\" in slug or ".." in slug:
        return None
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,80}", slug):
        return None
    return slug


def _gallery_decode_b64(s, max_bytes):
    if not isinstance(s, str):
        raise ValueError("expected base64 string")
    try:
        raw = base64.b64decode(s, validate=True)
    except Exception as e:
        raise ValueError(f"bad base64: {e}")
    if len(raw) > max_bytes:
        raise ValueError(f"payload too large ({len(raw)} > {max_bytes} bytes)")
    return raw


def _gallery_publish(body, owner_id=None, owner_name=None):
    """Validate, slugify, and write a gallery entry to disk.  Caller
    holds GALLERY_LOCK so two near-simultaneous publishes don't collide
    on the same slug.  `owner_id`/`owner_name` come from the publisher's
    session (None for anonymous) and gate later removal (S1.2)."""
    title = (body.get("title") or "").strip()[:GALLERY_MAX_TITLE]
    if not title:
        raise ValueError("title required")
    description = (body.get("description") or "").strip()[:GALLERY_MAX_DESC]
    handle = (body.get("pupil_handle") or "").strip()[:GALLERY_MAX_HANDLE]
    source = body.get("source_page") if body.get("source_page") in GALLERY_SOURCE_PAGES else "builder"
    project = body.get("project")
    if not isinstance(project, dict):
        raise ValueError("project (dict) required")
    rom = _gallery_decode_b64(body.get("rom_b64"), 1 * 1024 * 1024)
    preview = _gallery_decode_b64(body.get("preview_b64"), 512 * 1024)
    if not rom.startswith(b"NES\x1a"):
        raise ValueError("rom_b64 does not look like an iNES file")
    if not preview.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("preview_b64 does not look like a PNG")

    GALLERY_DIR.mkdir(parents=True, exist_ok=True)
    # Retry slug generation a few times if the random suffix collides.
    for _ in range(8):
        slug = _gallery_slug(title)
        target = GALLERY_DIR / slug
        if not target.exists():
            break
    else:
        raise RuntimeError("could not allocate a unique slug after 8 attempts")

    target.mkdir(parents=True, exist_ok=False)
    (target / "rom.nes").write_bytes(rom)
    (target / "preview.png").write_bytes(preview)
    (target / "project.json").write_text(
        json.dumps(project, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    metadata = {
        "title": title,
        "description": description,
        "pupil_handle": handle,
        # `owner` is the publisher's account id (None for anonymous posts);
        # gallery removal is gated on it (S1.2 — a pupil can delete only their
        # own; a teacher/admin can delete any; anonymous posts are teacher-only).
        "owner": owner_id,
        "owner_name": owner_name,
        "source_page": source,
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "rom_size": len(rom),
        "preview_size": len(preview),
    }
    (target / "metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    metadata["slug"] = slug
    return metadata


def _gallery_remove(slug):
    """Best-effort folder removal.  Returns True if the folder existed
    and is gone afterwards.  Authorization is the caller's job
    (_gallery_remove_response gates on owner / teacher secret)."""
    target = GALLERY_DIR / slug
    if not target.exists():
        return False
    # Belt-and-braces: never recurse outside GALLERY_DIR.
    try:
        resolved = target.resolve()
        gallery_resolved = GALLERY_DIR.resolve()
    except OSError:
        return False
    if gallery_resolved not in resolved.parents and resolved != gallery_resolved:
        return False
    shutil.rmtree(target, ignore_errors=True)
    return not target.exists()


def _gallery_entry_owner(slug):
    """Return the account id that owns gallery entry `slug` (int), or None for
    an anonymous / missing entry.  Used to gate removal (S1.2)."""
    meta_path = GALLERY_DIR / slug / "metadata.json"
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    owner = meta.get("owner")
    return owner if isinstance(owner, int) else None


# ---------------------------------------------------------------------------
# Audio starter pack (Phase 4.3)
# ---------------------------------------------------------------------------

# `.export _foo:=foo` or `.export foo`.  We pick the first `_`-prefixed
# match because that's the cc65-mangled C symbol the engine wrapper
# exposes; the bare symbol below is the asm name.  Falls back to the
# plain form if no `_`-prefixed export is present (FamiStudio's sfx
# export uses `.export _sounds=sounds` which matches the first arm).
_AUDIO_EXPORT_RE = re.compile(
    r"^\s*\.export\s+_([A-Za-z_][A-Za-z0-9_]*)\b", re.MULTILINE
)
_AUDIO_PLAIN_EXPORT_RE = re.compile(
    r"^\s*\.export\s+([A-Za-z_][A-Za-z0-9_]*)\b", re.MULTILINE
)


def _audio_extract_symbol(asm):
    """Best-effort: pull the music_data_* / sounds symbol out of a
    FamiStudio-exported `.s` file so the editor can show pupils what
    they uploaded and so the assembler's alias trailer hits the
    right target.  Returns "" if no symbol is identifiable."""
    m = _AUDIO_EXPORT_RE.search(asm or "")
    if m:
        return m.group(1)
    m = _AUDIO_PLAIN_EXPORT_RE.search(asm or "")
    return m.group(1) if m else ""


# `Song Name="..."` lines in the .fmstxt source give us the
# pupil-facing name for each sfx slot, in order.  Pulled from the
# .fmstxt rather than the .s because the .s only carries
# `@sfx_ntsc_<name>` labels which are identifiers, not display names.
_FMSTXT_SONG_NAME_RE = re.compile(r'^\s*Song\s+Name="([^"]*)"', re.MULTILINE)


def _audio_extract_sfx_names(fmstxt_text):
    """Pull SFX names out of a .fmstxt source — order matters because
    FamiStudio's sfx exporter emits them in declaration order."""
    return _FMSTXT_SONG_NAME_RE.findall(fmstxt_text or "")


def _audio_starter_payload():
    """Build the JSON payload for /starter/audio.  Returns an empty
    response if the .s files haven't been built yet — pupils get a
    clear message in that case rather than an obscure 500."""
    songs = []
    for display_name, fname in AUDIO_STARTER_SONGS:
        path = AUDIO_STARTER_DIR / fname
        if not path.exists():
            continue
        try:
            asm = path.read_text(encoding="utf-8")
        except OSError:
            continue
        songs.append({
            "name":     display_name,
            "filename": fname,
            "symbol":   _audio_extract_symbol(asm),
            "asm":      asm,
            "size":     len(asm.encode("utf-8")),
        })

    sfx = None
    sfx_name, sfx_fname = AUDIO_STARTER_SFX
    sfx_path = AUDIO_STARTER_DIR / sfx_fname
    if sfx_path.exists():
        try:
            sfx_asm = sfx_path.read_text(encoding="utf-8")
            sfx_src_path = sfx_path.with_suffix(".fmstxt")
            sfx_src_text = (sfx_src_path.read_text(encoding="utf-8")
                            if sfx_src_path.exists() else "")
            sfx = {
                "name":     sfx_name,
                "filename": sfx_fname,
                "symbol":   _audio_extract_symbol(sfx_asm),
                "sfxNames": _audio_extract_sfx_names(sfx_src_text),
                "asm":      sfx_asm,
                "size":     len(sfx_asm.encode("utf-8")),
            }
        except OSError:
            sfx = None

    return {"ok": True, "songs": songs, "sfx": sfx}


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
        if parsed.path == "/auth/me":
            return self._auth_me()
        if parsed.path == "/me/projects" or parsed.path.startswith("/me/projects/"):
            return self._me_projects_get(parsed.path)
        if parsed.path == "/default-main-c":
            return self._serve_text_file(DEFAULT_MAIN_C, "main.c")
        if parsed.path == "/default-main-s":
            return self._serve_text_file(DEFAULT_MAIN_S, "main.s")
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
        if parsed.path == "/starter/audio":
            return self._json(200, _audio_starter_payload())
        if parsed.path == "/gallery/list":
            return self._gallery_list_response()
        if parsed.path.startswith("/gallery/"):
            # /gallery/<slug>/<file> — serve the four files written by
            # _gallery_publish.  Anything else under /gallery/ (e.g.
            # /gallery/index.html) falls through to SimpleHTTPRequestHandler
            # so a future static gallery template still works.
            served = self._gallery_static(parsed.path)
            if served is not None:
                return served
        if parsed.path.startswith("/engine/"):
            # Serve the engine version registry (CHANGELOG.md, ENGINE_VERSION)
            # so the Studio's upgrade advisor can show "what changed".
            served = self._engine_static(parsed.path)
            if served is not None:
                return served
        if parsed.path.startswith("/docs/"):
            # 2026-04-27 — Editor-page links to pupil-facing docs
            # (e.g. audio.html -> ../../docs/guides/AUDIO_GUIDE.md)
            # resolve at the BROWSER to the URL `/docs/guides/...`.
            # The static handler below serves out of `WEB_DIR`
            # (`tools/tile_editor_web/`), so it would 404 — the
            # docs tree lives at the *project root* (`docs/`).
            # This branch maps `/docs/*` requests to that real
            # location with a defensive path-traversal check.
            served = self._docs_static(parsed.path)
            if served is not None:
                return served
        return super().do_GET()

    def _engine_static(self, url_path):
        """Serve files under `tools/engines/` (CHANGELOG.md, ENGINE_VERSION)."""
        rel = unquote(url_path[len("/engine/"):])
        base = (ROOT / "tools" / "engines").resolve()
        target = (base / rel).resolve()
        try:
            target.relative_to(base)
        except ValueError:
            self.send_error(404)
            return True
        if not target.is_file():
            return None
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
        return True

    def _docs_static(self, url_path):
        """Serve files under the project-root `docs/` directory."""
        # Strip the `/docs/` prefix (with leading slash already
        # consumed) and resolve against ROOT/docs.  resolve() +
        # is_relative_to() guards against `/docs/../foo` escapes.
        rel = unquote(url_path[len("/docs/"):])
        target = (ROOT / "docs" / rel).resolve()
        try:
            target.relative_to((ROOT / "docs").resolve())
        except ValueError:
            self.send_error(404)
            return True
        if not target.is_file():
            return None  # 404 fall-through to default handler
        # Pick a sensible content type — Markdown gets text/plain so
        # browsers display it inline rather than offering a download.
        suffix = target.suffix.lower()
        content_types = {
            ".md": "text/plain; charset=utf-8",
            ".txt": "text/plain; charset=utf-8",
            ".html": "text/html; charset=utf-8",
            ".png": "image/png",
            ".svg": "image/svg+xml",
            ".json": "application/json",
        }
        ctype = content_types.get(suffix, "application/octet-stream")
        try:
            data = target.read_bytes()
        except OSError:
            self.send_error(404)
            return True
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
        return True

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

    def _serve_text_file(self, path, label):
        try:
            data = path.read_bytes()
        except OSError as e:
            return self.send_error(500, f"could not read default {label}: {e}")
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
        if self._csrf_blocked(parsed.path):
            return
        if parsed.path == "/play":
            try:
                length = int(self.headers.get("Content-Length", "0") or "0")
            except ValueError:
                return self._json(400, {"ok": False, "stage": "input", "log": "bad Content-Length"})
            if length <= 0 or length > PLAY_MAX_BODY:
                return self._json(400, {"ok": False, "stage": "input", "log": "bad payload size"})
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
        if parsed.path == "/gallery/publish":
            return self._gallery_publish_response()
        if parsed.path == "/gallery/remove":
            return self._gallery_remove_response()
        if parsed.path == "/auth/signup":
            return self._auth_signup()
        if parsed.path == "/auth/login":
            return self._auth_login()
        if parsed.path == "/auth/logout":
            return self._auth_logout()
        if parsed.path == "/auth/reset":
            return self._auth_reset()
        if parsed.path == "/auth/admin/reset":
            return self._auth_admin_reset()
        if parsed.path == "/me/projects":
            return self._me_projects_post()
        return self.send_error(404)

    def do_PUT(self):
        parsed = urlparse(self.path)
        if self._csrf_blocked(parsed.path):
            return
        if parsed.path.startswith("/me/projects/"):
            return self._me_projects_put(parsed.path)
        return self.send_error(404)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if self._csrf_blocked(parsed.path):
            return
        if parsed.path.startswith("/me/projects/"):
            return self._me_projects_delete(parsed.path)
        return self.send_error(404)

    def _read_json_body(self, max_bytes):
        """Read and JSON-parse a POST body, returning (dict, None) on
        success or (None, error_message) on failure.  Guards a malformed
        or out-of-range Content-Length the same way the /play branch does,
        so the feedback/gallery handlers return clean 400 JSON instead of
        throwing on a non-numeric Content-Length."""
        try:
            length = int(self.headers.get("Content-Length", "0") or "0")
        except ValueError:
            return None, "bad payload size"
        if length <= 0 or length > max_bytes:
            return None, "bad payload size"
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            return None, "bad JSON"
        if not isinstance(body, dict):
            return None, "bad JSON"
        return body, None

    def _feedback(self):
        body, err = self._read_json_body(FEEDBACK_MAX_BODY)
        if err:
            return self._json(400, {"ok": False, "error": err})

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
        body, err = self._read_json_body(4096)
        if err:
            return self._json(400, {"ok": False, "error": err})
        # Teacher-only: marking feedback handled is moderation (S1.3, ADVICE #3).
        if not ACCOUNTS.verify_admin(body.get("admin_secret")):
            return self._json(403, {"ok": False, "code": "not_teacher",
                                    "error": "The teacher secret is required to change feedback state."})
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

    # ----- Gallery (Phase 4.2) ------------------------------------------

    def _gallery_list_response(self):
        try:
            entries = _gallery_list_entries()
        except Exception as e:
            sys.stderr.write(f"[playground] gallery list failed: {e}\n")
            return self._json(500, {"ok": False, "error": "could not read gallery"})
        # Never leak the raw numeric owner id to the client; instead compute an
        # `owned` flag against the requesting session so the UI can show Remove
        # only on entries the viewer owns.  `owner_name` stays for attribution.
        user = ACCOUNTS.user_for_session(self._session_token())
        uid = user["id"] if user else None
        public = []
        for meta in entries:
            m = dict(meta)
            owner = m.pop("owner", None)
            m["owned"] = uid is not None and owner is not None and owner == uid
            public.append(m)
        return self._json(200, {"ok": True, "entries": public, "signed_in": user is not None})

    def _gallery_static(self, path):
        # path is /gallery/<slug>/<file>.  Anything else returns None
        # so the caller falls back to the static-file handler.
        rest = path[len("/gallery/"):]
        if "/" not in rest:
            return None
        slug, _, fname = rest.partition("/")
        slug = _gallery_safe_slug(slug)
        if slug is None or fname not in GALLERY_FILES:
            return None
        target = GALLERY_DIR / slug / fname
        if not target.is_file():
            self.send_error(404)
            return True
        try:
            data = target.read_bytes()
        except OSError as e:
            self.send_error(500, f"could not read {fname}: {e}")
            return True
        ctype = {
            "rom.nes":      "application/octet-stream",
            "preview.png":  "image/png",
            "project.json": "application/json; charset=utf-8",
            "metadata.json": "application/json; charset=utf-8",
        }[fname]
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        # Pupils download these via <a download> — give them sensible names.
        if fname in ("rom.nes", "project.json"):
            self.send_header("Content-Disposition",
                             f'attachment; filename="{slug}-{fname}"')
        self.end_headers()
        self.wfile.write(data)
        return True

    def _gallery_publish_response(self):
        body, err = self._read_json_body(GALLERY_MAX_BODY)
        if err:
            return self._json(400, {"ok": False, "error": err})
        # Record the publisher so removal can be gated on ownership (S1.1/S1.2).
        user = ACCOUNTS.user_for_session(self._session_token())
        owner_id = user["id"] if user else None
        owner_name = user["username"] if user else None
        try:
            with GALLERY_LOCK:
                meta = _gallery_publish(body, owner_id, owner_name)
        except ValueError as e:
            return self._json(400, {"ok": False, "error": str(e)})
        except Exception as e:
            sys.stderr.write(f"[playground] gallery publish failed: {e}\n")
            return self._json(500, {"ok": False, "error": "could not publish"})
        return self._json(200, {"ok": True, "slug": meta["slug"], "metadata": meta})

    def _gallery_remove_response(self):
        body, err = self._read_json_body(4096)
        if err:
            return self._json(400, {"ok": False, "error": err})
        slug = _gallery_safe_slug(body.get("slug"))
        if slug is None:
            return self._json(400, {"ok": False, "error": "bad slug"})
        # Deny by default (ADVICE #1).  A delete is allowed only for a valid
        # teacher/admin secret (moderates anyone, incl. anonymous posts) OR the
        # signed-in account that owns the entry.
        owner = _gallery_entry_owner(slug)          # int owner id, or None (anon / missing)
        is_admin = ACCOUNTS.verify_admin(body.get("admin_secret"))
        if not is_admin:
            user = ACCOUNTS.user_for_session(self._session_token())
            if user is None:
                return self._json(401, {"ok": False, "code": "not_logged_in",
                                        "error": "Sign in (or use the teacher secret) to remove gallery entries."})
            if owner is None or user["id"] != owner:
                return self._json(403, {"ok": False, "code": "not_owner",
                                        "error": "You can only remove your own gallery entries. A teacher can remove any."})
        with GALLERY_LOCK:
            removed = _gallery_remove(slug)
        if not removed:
            return self._json(404, {"ok": False, "error": "no such entry"})
        return self._json(200, {"ok": True})

    # --------------------------------------------------------------------

    # ----- Pupil accounts (T4.2 — P1) -----------------------------------

    def _client_ip(self):
        """Best-effort client IP for rate limiting — first X-Forwarded-For hop
        (set by the HTTPS reverse proxy) else the socket peer."""
        xff = self.headers.get("X-Forwarded-For", "")
        if xff:
            return xff.split(",")[0].strip()
        return self.client_address[0] if self.client_address else ""

    def _session_token(self):
        """Extract the opaque session token from the Cookie header, if any."""
        for part in (self.headers.get("Cookie", "") or "").split(";"):
            k, _, v = part.strip().partition("=")
            if k == "session":
                return v or None
        return None

    def _csrf_origin_ok(self):
        """Return False only when we can POSITIVELY tell a state-changing
        request came from another site (a CSRF attempt).  Defence-in-depth on
        top of the SameSite=Lax session cookie.

        A browser always sends `Origin` on POST/PUT/DELETE.  If it's present and
        its host is not one of ours, reject.  We accept the request's own `Host`
        header and any `X-Forwarded-Host` the reverse proxy set (the classroom
        instance is proxied), plus an explicit `PLAYGROUND_ALLOWED_ORIGINS`
        allowlist.  If `Origin` is absent we fall back to `Referer`.  If BOTH
        are absent (curl, the test harness, non-browser tools) there is no
        ambient-cookie CSRF vector, so we allow it — fail-open on ambiguity so a
        misconfigured proxy can never lock users out."""
        if not CSRF_ORIGIN_CHECK:
            return True
        origin = self.headers.get("Origin")
        source = origin if origin and origin.lower() != "null" else None
        if source is None:
            ref = self.headers.get("Referer")
            source = ref or None
        if source is None:
            return True   # no Origin/Referer → not a browser CSRF vector
        src_host = (urlparse(source).netloc or "").lower()
        if not src_host:
            return True   # unparseable → don't block legitimate traffic
        expected = set(CSRF_ALLOWED_ORIGINS)
        for h in (self.headers.get("Host"), self.headers.get("X-Forwarded-Host")):
            if not h:
                continue
            for part in h.split(","):
                part = part.strip().lower()
                if part:
                    expected.add(part)
                    # Allowlist may be scheme-qualified; match on host too.
                    expected.add(urlparse("//" + part).netloc or part)
        # Allowlist entries may be full origins (https://host); reduce to host.
        expected = {urlparse(e).netloc or e for e in expected} | expected
        return src_host in expected

    def _csrf_blocked(self, path):
        """If `path` is a cookie-authed state-change route and the Origin looks
        cross-site, emit a 403 and return True so the caller returns at once."""
        protected = path in CSRF_PROTECTED_PATHS or path.startswith("/me/projects/")
        if protected and not self._csrf_origin_ok():
            self._json(403, {"ok": False, "code": "bad_origin",
                             "error": "This request looks like it came from another "
                                      "site and was blocked."})
            return True
        return False

    def _auth_cookie(self, token=None, clear=False):
        """Build a Set-Cookie value for the session cookie.  Secure only over
        HTTPS (or when forced) so local http dev still works."""
        secure = COOKIE_FORCE_SECURE or \
            self.headers.get("X-Forwarded-Proto", "").lower() == "https"
        attrs = ["session=" + ("" if clear else token), "Path=/", "HttpOnly", "SameSite=Lax"]
        if secure:
            attrs.append("Secure")
        attrs.append("Max-Age=0" if clear else f"Max-Age={ACCOUNTS.session_ttl}")
        return "; ".join(attrs)

    def _json_cookie(self, code, obj, set_cookie):
        data = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Set-Cookie", set_cookie)
        self.end_headers()
        self.wfile.write(data)

    def _auth_err(self, e):
        return self._json(e.status, {"ok": False, "code": e.code, "error": e.message})

    def _auth_rate_ok(self):
        if AUTH_RATE.check("auth:" + self._client_ip()):
            return True
        self._json(429, {"ok": False, "code": "rate_limited",
                         "error": "Too many tries — wait a minute and try again."})
        return False

    def _auth_signup(self):
        if not self._auth_rate_ok():
            return
        body, err = self._read_json_body(AUTH_MAX_BODY)
        if err:
            return self._json(400, {"ok": False, "error": err})
        try:
            username, recovery, token = ACCOUNTS.signup(
                body.get("username", ""), body.get("password", ""),
                body.get("joinCode", ""))
        except accounts.AccountError as e:
            return self._auth_err(e)
        return self._json_cookie(200, {
            "ok": True, "username": username, "recoveryCode": recovery,
        }, self._auth_cookie(token))

    def _auth_login(self):
        if not self._auth_rate_ok():
            return
        body, err = self._read_json_body(AUTH_MAX_BODY)
        if err:
            return self._json(400, {"ok": False, "error": err})
        try:
            username, token = ACCOUNTS.login(
                body.get("username", ""), body.get("password", ""))
        except accounts.AccountError as e:
            return self._auth_err(e)
        return self._json_cookie(200, {"ok": True, "username": username},
                                 self._auth_cookie(token))

    def _auth_logout(self):
        ACCOUNTS.logout(self._session_token())
        return self._json_cookie(200, {"ok": True}, self._auth_cookie(clear=True))

    def _auth_me(self):
        user = ACCOUNTS.user_for_session(self._session_token())
        return self._json(200, {
            "ok": True,
            "username": user["username"] if user else None,
            "signupsOpen": ACCOUNTS.signups_open(),
        })

    def _auth_reset(self):
        if not self._auth_rate_ok():
            return
        body, err = self._read_json_body(AUTH_MAX_BODY)
        if err:
            return self._json(400, {"ok": False, "error": err})
        try:
            new_code = ACCOUNTS.reset_with_recovery_code(
                body.get("username", ""), body.get("recoveryCode", ""),
                body.get("newPassword", ""))
        except accounts.AccountError as e:
            return self._auth_err(e)
        return self._json(200, {"ok": True, "recoveryCode": new_code})

    def _auth_admin_reset(self):
        if not self._auth_rate_ok():
            return
        body, err = self._read_json_body(AUTH_MAX_BODY)
        if err:
            return self._json(400, {"ok": False, "error": err})
        try:
            ACCOUNTS.admin_reset(body.get("username", ""), body.get("newPassword", ""),
                                 body.get("adminSecret", ""))
        except accounts.AccountError as e:
            return self._auth_err(e)
        return self._json(200, {"ok": True})

    # ----- Per-user projects (T4.2 — P2) --------------------------------

    def _require_user(self):
        """Return the logged-in user dict, or send 401 and return None."""
        user = ACCOUNTS.user_for_session(self._session_token())
        if user is None:
            self._json(401, {"ok": False, "code": "not_logged_in",
                             "error": "Please sign in to save or load your work."})
            return None
        return user

    def _project_path_id(self, path):
        """Parse /me/projects[/<id>] → (is_collection, project_id|None).  An
        unparseable id yields (False, -1) so callers 404 it."""
        rest = path[len("/me/projects"):]
        if rest in ("", "/"):
            return True, None
        if rest.startswith("/"):
            try:
                return False, int(rest[1:])
            except ValueError:
                return False, -1
        return None, None

    def _me_projects_get(self, path):
        user = self._require_user()
        if user is None:
            return
        is_coll, pid = self._project_path_id(path)
        if is_coll:
            return self._json(200, {"ok": True,
                                    "projects": ACCOUNTS.list_projects(user["id"])})
        try:
            return self._json(200, {"ok": True, **ACCOUNTS.get_project(user["id"], pid)})
        except accounts.AccountError as e:
            return self._auth_err(e)

    def _me_projects_post(self):
        user = self._require_user()
        if user is None:
            return
        body, err = self._read_json_body(accounts.PROJECT_BLOB_MAX + 65536)
        if err:
            return self._json(400, {"ok": False, "error": err})
        try:
            proj = ACCOUNTS.create_project(user["id"], body.get("name", ""),
                                           body.get("blob", ""))
        except accounts.AccountError as e:
            return self._auth_err(e)
        return self._json(200, {"ok": True, **proj})

    def _me_projects_put(self, path):
        user = self._require_user()
        if user is None:
            return
        _, pid = self._project_path_id(path)
        body, err = self._read_json_body(accounts.PROJECT_BLOB_MAX + 65536)
        if err:
            return self._json(400, {"ok": False, "error": err})
        try:
            proj = ACCOUNTS.update_project(user["id"], pid, body.get("name", ""),
                                           body.get("blob", ""))
        except accounts.AccountError as e:
            return self._auth_err(e)
        return self._json(200, {"ok": True, **proj})

    def _me_projects_delete(self, path):
        user = self._require_user()
        if user is None:
            return
        _, pid = self._project_path_id(path)
        try:
            ACCOUNTS.delete_project(user["id"], pid)
        except accounts.AccountError as e:
            return self._auth_err(e)
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
