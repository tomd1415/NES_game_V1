#!/usr/bin/env python3
"""Diagnose a pupil's FamiStudio Sound Engine .s file when uploaded
music isn't playing.

Looks for the failure modes that AUDIO_GUIDE.md's troubleshooting
section describes — most importantly:

  1. Multiple songs in the file with song 0 likely empty.  The
     editor's boot calls `famistudio_music_play(0)`, so if the
     pupil's actual music is at index 1+ they hear silence.
  2. Wrong machine target byte (PAL on NTSC engine = silent).
  3. FamiTone2 export instead of FamiStudio Sound Engine.
  4. Empty channel data (a song with no actual notes).

Usage:

    python3 tools/audio/diagnose_song.py path/to/pupil_song.s
    cat pupil_song.s | python3 tools/audio/diagnose_song.py -

Exit code is 0 if the file looks playable, 1 if at least one
likely-silent issue was detected (so pupils can pipe a folder of
exports through and find the problem ones).
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass


# Per-song record after the song-count + instr-ptr + samples-ptr
# header.  Each song spans 14 bytes:
#   5 channel pointers (10 bytes) + tempo_env_ptr (2) + pal flag (1)
#   + padding (1).
# Layout matches the engine init's FamiStudio-tempo branch.
HEADER_PRELUDE_BYTES = 5            # song_count + instr ptr + samples-4 ptr
PER_SONG_BYTES = 5 * 2 + 4          # channels + tempo_env + pal + pad
PAL_BYTE_OFFSET_IN_SONG = 12        # 0-indexed within the per-song block

# Bytes encoding the engine target's expectations of the song.  The
# engine's tempo_frame_lookup table interprets these as
# `(song_target << 1) | engine_target`:
#   0 = NTSC song on NTSC engine → 1 frame per update (correct)
#   1 = NTSC song on PAL engine  → 2 frames per update
#   2 = PAL  song on NTSC engine → 0 frames most updates (slow / silent-feeling)
#   3 = PAL  song on PAL engine  → 1 frame per update
PAL_FLAG_DESCRIPTIONS = {
    0: "NTSC machine target — correct for our engine.",
    1: ("NTSC song expecting a PAL engine — pupil ticked PAL while "
        "exporting; tempo will be ~20% faster than intended."),
    2: ("PAL song expecting an NTSC engine — pupil composed in PAL "
        "mode; tempo will run very slow on our NTSC engine."),
    3: ("PAL song on PAL engine — completely PAL-targeted; will "
        "play wrong tempo on NTSC."),
}


@dataclass
class Finding:
    severity: str  # 'error' | 'warn' | 'info'
    code: str
    message: str


def _strip_comments(asm: str) -> str:
    """Remove ca65-style ';' comments + blank lines so byte / word
    extraction is straightforward.  Preserves source-line structure
    so error messages can quote raw lines if needed."""
    out_lines = []
    for line in asm.splitlines():
        # ca65 comment char is ';'.  Anything after it on a line is a
        # comment; the engine starter files lean on this heavily.
        idx = line.find(';')
        if idx >= 0:
            line = line[:idx]
        out_lines.append(line)
    return "\n".join(out_lines)


_BYTE_RE = re.compile(r"\.byte\b\s+(.+)", re.IGNORECASE)
_WORD_RE = re.compile(r"\.word\b\s+(.+)", re.IGNORECASE)


def _eval_directive_args(args: str):
    """Best-effort: split a `.byte` / `.word` argument list into
    items.  We don't need *real* values — only number-vs-symbol
    distinction to count song channels — but where a literal integer
    appears we return it; otherwise we return the trimmed source
    fragment so the caller can still detect "looks like a symbol /
    expression"."""
    out = []
    for piece in args.split(','):
        piece = piece.strip()
        if not piece:
            continue
        try:
            if piece.startswith('$'):
                out.append(int(piece[1:], 16))
            elif piece.startswith('%'):
                out.append(int(piece[1:], 2))
            else:
                out.append(int(piece, 0))
        except ValueError:
            out.append(piece)
    return out


def _byte_stream_after(text: str, label: str):
    """Yield (line_no_1indexed, kind, value) tuples for every
    .byte / .word entry that appears at or after `label:` in the
    text.  `kind` is 'b' (byte) or 'w' (word).  `value` is an int
    if the directive contained an integer literal; otherwise the
    raw source fragment.

    Stops at the next top-level `<newlabel>:` line (so we don't
    pick up unrelated arrays defined later in the file).
    """
    lines = text.splitlines()
    started = False
    for i, line in enumerate(lines):
        s = line.strip()
        if not started:
            if re.match(rf"^{re.escape(label)}\s*:\s*$", s):
                started = True
            continue
        # Stop when a different top-level label starts.
        if re.match(r"^[A-Za-z_][A-Za-z0-9_]*\s*:\s*$", s):
            return
        m = _BYTE_RE.match(s)
        if m:
            for v in _eval_directive_args(m.group(1)):
                yield (i + 1, 'b', v)
            continue
        m = _WORD_RE.match(s)
        if m:
            for v in _eval_directive_args(m.group(1)):
                yield (i + 1, 'w', v)
            continue


def _find_music_data_label(asm: str):
    """Return the music_data_<...> label name and the matching
    `_audio_default_music`-style export alias (if any).  Returns
    (None, None) if no obvious music data label is present —
    indicates the file probably isn't a FamiStudio Sound Engine
    music export."""
    # Order matters: prefer an `.export _<name>:=<target>` line
    # because the editor's parser picks that as the song's symbol.
    m = re.search(r"^\s*\.export\s+_([A-Za-z_][A-Za-z0-9_]*)\b", asm, re.MULTILINE)
    sym_export = m.group(1) if m else None
    # The actual data label is `<name>:` somewhere in the file.
    if sym_export:
        if re.search(rf"^\s*{re.escape(sym_export)}\s*:", asm, re.MULTILINE):
            return sym_export, sym_export
    # Fallback: any music_data_<...>: label.
    m = re.search(r"^(music_data_[A-Za-z0-9_]*)\s*:", asm, re.MULTILINE)
    if m:
        return m.group(1), sym_export
    return None, sym_export


def diagnose(asm: str):
    """Return a list of Finding records describing likely playback
    issues with the given .s file.  Empty list = nothing obvious
    wrong; the file may still misbehave for reasons this scanner
    can't detect (e.g. an instrument referencing an undefined
    envelope), but we've ruled out the common ones."""
    findings = []
    text = _strip_comments(asm)

    # 1. FamiTone2 / wrong-engine fingerprint.
    if re.search(r"\bfamitone2\b", asm, re.IGNORECASE):
        findings.append(Finding(
            'error', 'engine-mismatch',
            "File looks like a FamiTone2 export, not FamiStudio Sound "
            "Engine.  FamiStudio's File → Export menu has two engine "
            "options — the editor only understands the FamiStudio "
            "Sound Engine one.  Re-export with that option."))

    # 1b. Newer-FamiStudio `.if FAMISTUDIO_CFG_C_BINDINGS` wrapper.
    # Pupil-reported (2026-04-27): newer FamiStudio versions wrap
    # their underscore-prefixed exports in this conditional, and
    # ca65 errors with "Constant expression expected" if the symbol
    # isn't pre-defined.  The playground server now auto-prepends
    # `FAMISTUDIO_CFG_C_BINDINGS = 0` to staged audio .s files so
    # this is no longer a build-blocker, but the diagnostic still
    # surfaces it as an info-level note so pupils running the tool
    # on a file directly understand what they're seeing.
    if re.search(r"^\s*\.if\s+FAMISTUDIO_CFG_C_BINDINGS\b",
                 asm, re.MULTILINE):
        findings.append(Finding(
            'info', 'newer-famistudio-c-bindings',
            "Newer FamiStudio export — wraps `.export _<sym>` in an "
            "`.if FAMISTUDIO_CFG_C_BINDINGS` conditional.  Bare ca65 "
            "would error here with \"Constant expression expected\"; "
            "the playground server prepends a `FAMISTUDIO_CFG_C_BINDINGS = 0` "
            "definition before assembly so this builds cleanly.  Nothing "
            "to fix on your side."))

    # 2. Locate the music_data label.
    label, exported = _find_music_data_label(asm)
    if not label:
        findings.append(Finding(
            'error', 'no-music-data',
            "Could not find a `music_data_*:` label in the file.  "
            "The export option in FamiStudio is probably wrong "
            "(NSF / WAV / FamiTone2 produce other formats); pick "
            "File → Export → FamiStudio Sound Engine assembly with "
            "format = ca65."))
        return findings

    # 3. Walk the data starting at the label and check the song count
    #    plus per-song PAL flag.
    items = list(_byte_stream_after(text, label))
    if not items:
        findings.append(Finding(
            'error', 'empty-music-data',
            f"`{label}:` exists but has no `.byte` / `.word` data "
            f"after it.  The export is incomplete or truncated."))
        return findings

    # First byte: song count.
    first = items[0]
    if first[1] != 'b' or not isinstance(first[2], int):
        findings.append(Finding(
            'warn', 'unparseable-song-count',
            f"Could not parse the song-count byte at "
            f"line {first[0]} of the data — non-integer .byte arg "
            f"`{first[2]}`.  Diagnostic skipped from here."))
        return findings
    song_count = first[2]

    # 4. Multi-song with empty song-0 is the most common
    #    "music doesn't play" cause.  The editor's boot calls
    #    famistudio_music_play(0); if pupil's real song is at index
    #    1+, they hear silence.  We can't easily inspect the channel
    #    data to confirm song 0 is empty, but we can warn loudly
    #    enough that pupils know to check.
    if song_count > 1:
        findings.append(Finding(
            'warn', 'multi-song-export',
            f"Project exported {song_count} songs (song count byte = "
            f"{song_count}).  Our boot calls "
            f"`famistudio_music_play(0)` which only plays song 0.  "
            f"If song 0 is empty (a leftover \"NewSong\" default in "
            f"FamiStudio), pupils will hear silence even though the "
            f"file looks valid.  Fix: in FamiStudio's Songs panel "
            f"(left side), drag the song you want to be the default "
            f"to the top, or right-click and delete unused empty "
            f"songs.  Then re-export."))

    # 5. Per-song machine target byte.  Walk the bytes following the
    #    header prelude (count + instr + samples), in song-block
    #    chunks.  In the FamiStudio .s format the byte we want sits
    #    at offset PAL_BYTE_OFFSET_IN_SONG within each per-song
    #    block.  Each song block carries 5 channel `.word`s + 1
    #    tempo_env `.word` + 2 byte literals (pal flag + padding) =
    #    14 bytes.  Walking by counting items is fragile (pupils'
    #    exports may format multiple values per directive); we
    #    enumerate by absolute byte position instead.
    flat = []
    for _ln, kind, val in items:
        if kind == 'w':
            # Words contribute two bytes; we don't know the value
            # for symbol references, but the position counts.
            flat.append(('w', val))
            flat.append(('w_hi', None))
        else:
            flat.append(('b', val))

    cursor = HEADER_PRELUDE_BYTES
    for song_idx in range(song_count):
        pal_pos = cursor + PAL_BYTE_OFFSET_IN_SONG
        if pal_pos >= len(flat):
            findings.append(Finding(
                'warn', 'short-song-block',
                f"Song {song_idx} block looks shorter than the "
                f"engine expects (file ends mid-song).  May be "
                f"truncated; re-export."))
            break
        pal_kind, pal_val = flat[pal_pos]
        if pal_kind == 'b' and isinstance(pal_val, int):
            if pal_val != 0:
                desc = PAL_FLAG_DESCRIPTIONS.get(
                    pal_val, f"unrecognised value {pal_val}")
                findings.append(Finding(
                    'warn' if song_idx == 0 else 'info',
                    'machine-target-non-ntsc',
                    f"Song {song_idx} machine-target byte = "
                    f"{pal_val}.  {desc}  Fix: in FamiStudio's "
                    f"Project Properties (or the export dialog), "
                    f"set Machine to NTSC and re-export."))
        cursor += PER_SONG_BYTES

    return findings


def _read_input(path: str) -> str:
    if path == '-':
        return sys.stdin.read()
    with open(path, 'r', encoding='utf-8', errors='replace') as fh:
        return fh.read()


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('path', help="Path to .s file (or '-' for stdin)")
    p.add_argument('-q', '--quiet', action='store_true',
                   help='Suppress info-level findings.')
    args = p.parse_args()

    asm = _read_input(args.path)
    findings = diagnose(asm)

    if not findings:
        print("OK — no obvious issues found in this .s file.")
        print("If music still isn't playing, check that:")
        print("  - The song actually has notes (open it in FamiStudio).")
        print("  - You uploaded the song to the Songs section, not Sfx.")
        print("  - The Audio page shows the file with a non-zero size.")
        return 0

    severity_seen = set()
    for f in findings:
        if args.quiet and f.severity == 'info':
            continue
        marker = {'error': '✗', 'warn': '⚠', 'info': 'ℹ'}.get(f.severity, '?')
        print(f"{marker} [{f.severity:>5}] {f.code}: {f.message}")
        severity_seen.add(f.severity)

    if 'error' in severity_seen or 'warn' in severity_seen:
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
