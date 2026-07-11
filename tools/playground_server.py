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

from nes_studio_core import graphics as graphics_core
from nes_studio_core import collision as collision_core
from nes_studio_core import world as world_core
from nes_studio_core import scene as scene_core
from nes_studio_core import build as build_core
from nes_studio_core import play as play_core
from nes_studio_core import project as project_core
from nes_studio_core import preparation as preparation_core

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
BUILD_SERVICE = build_core.BuildService(
    STEP_DIR,
    audio_engine_directory=AUDIO_ENGINE_DIR,
    semaphore=BUILD_SEM,
    profile=build_core.SANDBOXED_REMOTE,
)

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
    return graphics_core.tile_to_chr(pixels)


def _encode_pool(tiles, label):
    return graphics_core.encode_tile_pool(tiles, label)


# Palette adapters need only this predicate; glyph and CHR augmentation live in
# the transport-independent graphics core.

def _dialogue_module_enabled(state):
    try:
        mods = (state.get("builder") or {}).get("modules") or {}
        return bool((mods.get("dialogue") or {}).get("enabled"))
    except AttributeError:
        return False


def build_chr(state):
    """Generate the complete dual-pool 8 KiB CHR artifact."""
    return graphics_core.build_chr(state)


def _active_nametable(state):
    """Pull the selected background's nametable.

    New-format state keeps a list under `backgrounds` with `selectedBgIdx`.
    Legacy state had a single top-level `nametable` — fall back to that so
    older saves (and the example assets used in tests) still build.
    """
    return graphics_core.active_nametable(state)


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
    return graphics_core.nametable_bytes(nt)


def build_nam(state):
    """32x30 tile bytes + 64 attribute bytes = 1024-byte NES nametable."""
    return graphics_core.build_nam(state)


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
    return graphics_core.expand_metatile_background(bg)


def _expand_metatiles(state):
    """In-place: replace every `tileMode=='16x16'` background's nametable +
    behaviour with the 8x8 grids expanded from its metatile map, and set its
    `dimensions` to span the expansion.  No-op for 8x8 (default) backgrounds, so
    existing projects and the byte-identical baseline are untouched."""
    return graphics_core.expand_metatiles(state)


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
    return graphics_core.palette_rows(state, _dialogue_module_enabled(state))


def build_palettes_inc(state):
    return graphics_core.build_palettes_inc(state, _dialogue_module_enabled(state))


def _hex_row(values):
    return ", ".join(f"${v:02X}" for v in values)


def build_palettes_asminc(state):
    """ca65-flavoured counterpart to build_palettes_inc.

    Emits the same 32-byte `palette_bytes` table in RODATA, reachable as
    an ordinary label from main.s.  Uses .pushseg/.popseg so including
    this file mid-stream doesn't change the caller's current segment.
    """
    return graphics_core.build_palettes_asminc(state, _dialogue_module_enabled(state))


def _scene_world_bounds(state):
    """(world_w, world_h) in pixels for the active background.  Scene-sprite
    positions are clamped to these so a sprite can sit anywhere in a
    multi-screen level, not just the first screen.  Shared by the C and asm
    scene emitters so they can never disagree on the clamp."""
    return scene_core.world_bounds(state)


def _scene_sprite_xy(item, world_w, world_h):
    """Clamp one scene sprite's authored (x, y) to the world bounds.  Used by
    both scene emitters.  The C emitter keeps the full value (going 16-bit when
    a sprite sits past the first screen); the asm emitter takes the low byte
    (its layout is first-screen / 8-bit by design).  For the single-screen
    projects the asm path targets this is identical to the old `& 0xFF`; the
    only change is that out-of-range positions now clamp to the world edge
    instead of wrapping around — matching the C path's long-standing clamp."""
    return scene_core.sprite_position(item, world_w, world_h)


def build_scene_asminc(state, player_idx, scene_sprites, start_x, start_y):
    """ca65-flavoured counterpart to build_scene_inc.

    Constants become `.define` macros (text replacement) and byte tables
    become labelled data in RODATA, matching the identifier names used in
    the C header so the pedagogy carries across.
    """
    return scene_core.build_scene_asminc(state, player_idx, scene_sprites, start_x, start_y)


def cell_tile(cell):
    return scene_core.cell_tile(cell)


def cell_attr(cell):
    return scene_core.cell_attribute(cell)


def _resolve_animation(state, kind, pw, ph):
    """Return (frames, fps) for assignment `kind` if valid, else None.

    Each frame is a sprite; all frames in an animation must share (pw, ph)
    so the player's footprint in C is a fixed W*H. Frames that don't
    match are dropped (server-side defensive — the editor also warns).
    """
    return scene_core.resolve_animation(state, kind, pw, ph)


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
    return scene_core.flatten_sprite(sp)


# --- E3-3: top-down racer auto-rotated car art -----------------------------
# The NES can't rotate sprites in hardware, so a racer car can't face its
# heading on its own.  At build time we take the player's single drawn car
# (assumed to face RIGHT → heading 0) and bake RACER_ROT_FRAMES rotated copies
# (45° steps) into spare sprite-CHR slots; the engine picks the frame from
# racer_heading (16 headings → 8 frames, "8 directions reused across 16").
# Nearest-neighbour rotation is rough on the 45° diagonals at 16×16 but fine for
# a pupil tool; the 90° frames are exact.  Runs ONLY for racer games (and only
# when there's CHR room), so every other ROM stays byte-identical.
def _inject_racer_rotation(state, player_idx):
    return graphics_core._inject_racer_rotation(state, player_idx)


# T7.6a: single source of truth for sprite role codes.  Both scene emitters
# render this — the C path as `#define ROLE_<NAME> <code>` and the asm path as
# `.define ROLE_<NAME> <code>` — so the two tables can no longer drift (they
# used to be duplicated verbatim).  Order = numeric code; HUD is the Phase B
# chunk-A addition (tagged sprites drive the HUD render).
ROLE_TABLE = scene_core.ROLE_TABLE
ROLE_CODES = scene_core.ROLE_CODES
# Width that aligns the code column exactly as the original hand-written tables
# did (longest token is "ROLE_PROJECTILE"), so the emitted bytes are unchanged.
_ROLE_TOKEN_WIDTH = scene_core.ROLE_TOKEN_WIDTH


def _role_defs(directive):
    """Role table as `<directive> ROLE_<NAME> <code>` lines (`.define`/`#define`)."""
    return scene_core.role_definitions(directive)


def _role_code(sp):
    return scene_core.role_code(sp)


def build_scene_inc(state, player_idx, scene_sprites, start_x, start_y,
                    player_idx2=-1, start_x2=180, start_y2=120):
    return scene_core.build_scene_inc(
        state, player_idx, scene_sprites, start_x, start_y,
        player_idx2, start_x2, start_y2,
    )


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
    return collision_core.behaviour_map_for_background(bg, cols, rows)


def _sprite_reaction_table(state):
    """Return (flat_table_bytes, num_sprites).

    Flat layout: sprite_idx * 8 + behaviour_id -> reaction verb id.
    Missing entries default to REACT_IGNORE so an incomplete project still
    builds cleanly.
    """
    return collision_core.sprite_reaction_table(state)


def build_collision_h(state):
    """Emit src/collision.h — BEHAVIOUR_* / REACT_* enums + prototypes."""
    return collision_core.build_collision_h(state)


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
    return collision_core.build_behaviour_c(state)


def build_project_inc(state, player_idx, scene_sprites, start_y=120, player_idx2=-1):
    return project_core.build_project_inc(
        state, player_idx, scene_sprites, start_y, player_idx2
    )


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
    return world_core.world_nametable(state)


def build_bg_world_h(state):
    """Emit src/bg_world.h — world-nametable dimensions + array prototypes."""
    return world_core.build_bg_world_h(state)


def build_bg_world_c(state):
    """Emit src/bg_world.c — flat tile + attribute arrays for the whole world."""
    return world_core.build_bg_world_c(state)

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
    return world_core.project_needs_four_screen(state)


def _patch_ines_four_screen(rom_bytes):
    """Set bit 3 of the iNES header byte 6 (the 4-screen-VRAM flag).
    cc65 v2.18's nes.lib hard-codes byte 6 to 0x03 (vertical mirroring
    + a stray battery bit) regardless of the cfg's `NES_MIRRORING`
    weak symbol, so reaching it via the cfg is a dead end on this
    toolchain.  Patching the produced ROM in-place is reliable, costs
    one byte to mutate, and lets the regression suite sha1 a stable
    output."""
    return world_core.patch_ines_four_screen(rom_bytes)


def _build_rom(body):
    """Generate and compile a ROM through the transport-independent core."""
    builder = preparation_core.ProjectBuilder(
        BUILD_SERVICE,
        asm_makefile=ASM_MAKEFILE,
        songs_stub=_AUTO_SONGS_STUB_ASM,
        sfx_stub=_AUTO_SFX_STUB_ASM,
    )
    return builder.build(
        body,
        disable_all_asm=bool(os.environ.get("PLAYGROUND_NO_ASM")),
        disable_player_draw=bool(os.environ.get("PLAYGROUND_NO_PDRAW")),
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
    return BUILD_SERVICE.build_asm(
        build_core.AsmBuildInputs(
            custom_main=custom_main_asm,
            chr_bytes=chr_bytes,
            nam_bytes=nam_bytes,
            palettes_source=pal_asm,
            scene_source=scene_asm,
        ),
        ASM_MAKEFILE,
    )


def _build_in_tempdir(custom_main, chr_bytes, nam_bytes, pal_src, scene_src,
                      collision_h, behaviour_c, bg_world_h, bg_world_c,
                      audio_songs_asm=None, audio_sfx_asm=None,
                      nes_asm_leaf=False, nes_asm_scroll=False,
                      nes_asm_scene=False, nes_asm_ai=False,
                      nes_asm_player=False, nes_asm_smb=False, nes_asm_racer=False,
                      nes_asm_player2=False, nes_asm_pdraw=False, project_inc=None):
    flags = []
    if not os.environ.get("PLAYGROUND_NO_ASM"):
        for enabled, flag in (
            (nes_asm_leaf, "NES_ASM_LEAF=1"),
            (nes_asm_scroll, "NES_ASM_SCROLL=1"),
            (nes_asm_scene, "NES_ASM_SCENE=1"),
            (nes_asm_ai, "NES_ASM_AI=1"),
        ):
            if enabled:
                flags.append(flag)
        if nes_asm_smb:
            flags.append("NES_ASM_SMB=1")
        elif nes_asm_racer:
            flags.append("NES_ASM_RACER=1")
        elif nes_asm_player:
            flags.append("NES_ASM_PLAYER=1")
        if nes_asm_player2:
            flags.append("NES_ASM_PLAYER2=1")
        if nes_asm_pdraw:
            flags.append("NES_ASM_PDRAW=1")
    return BUILD_SERVICE.build_c(
        build_core.CBuildInputs(
            custom_main=custom_main, chr_bytes=chr_bytes, nam_bytes=nam_bytes,
            palettes_source=pal_src, scene_source=scene_src,
            collision_header=collision_h, behaviour_source=behaviour_c,
            world_header=bg_world_h, world_source=bg_world_c,
            project_inc=project_inc, audio_songs_asm=audio_songs_asm,
            audio_sfx_asm=audio_sfx_asm, asm_flags=tuple(flags),
        )
    )


BuildError = build_core.BuildError


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


def run_play(body):
    target_engine, current_engine = _resolve_engine_versions(body)
    return play_core.PlayService(
        _build_rom,
        native_executable=FCEUX_PATH,
        native_rom_path=STEP_DIR / "_play_latest.nes",
    ).run(body, target_engine=target_engine, current_engine=current_engine)


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
