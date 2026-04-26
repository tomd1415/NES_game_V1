#!/usr/bin/env bash
# Refresh the vendored FamiStudio sound engine from upstream.
#
# Usage: tools/audio/famistudio/sync.sh [/path/to/FamiStudio/repo]
#
# Defaults to /home/duguid/git-stuff/FamiStudio/ if no argument given.
# Copies famistudio_ca65.s + famistudio_cc65.h verbatim, bumps
# VERSION.txt, and refreshes the upstream LICENSE.
set -eu

REPO="${1:-/home/duguid/git-stuff/FamiStudio}"
SRC="$REPO/SoundEngine"
DST="$(dirname "$(readlink -f "$0")")"

if [ ! -f "$SRC/famistudio_ca65.s" ]; then
    echo "no famistudio_ca65.s under $SRC — bad path?" >&2
    exit 1
fi

cp "$SRC/famistudio_ca65.s"   "$DST/famistudio_ca65.s"
cp "$SRC/famistudio_cc65.h"   "$DST/famistudio_cc65.h"
[ -f "$REPO/LICENSE" ] && cp "$REPO/LICENSE" "$DST/LICENSE"
# Note tables — the engine `.incbin`s these for note → APU period
# lookup.  We only strictly need the NTSC base tables for our
# config, but pulling the whole directory keeps future feature
# flips trivial and the cost is ~5 KB on disk.
rm -rf "$DST/NoteTables"
cp -r "$SRC/NoteTables" "$DST/NoteTables"

# Pull the version stamp out of the engine source.  The file's first
# comment block holds the version number (e.g. "FAMISTUDIO SOUND
# ENGINE (4.5.0)").
VERSION="$(grep -m1 -oE 'SOUND ENGINE \([0-9]+\.[0-9]+\.[0-9]+\)' "$SRC/famistudio_ca65.s" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo unknown)"
printf '%s\n' "$VERSION" > "$DST/VERSION.txt"

echo "synced FamiStudio engine $VERSION from $SRC"
