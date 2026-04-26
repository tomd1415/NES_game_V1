#!/usr/bin/env bash
# Regenerate the starter audio .s files from their .fmstxt sources.
#
# Each .fmstxt is a FamiStudio text-format project (see
# https://famistudio.org/doc/textformat/).  The FamiStudio CLI reads
# them and writes the .s blobs the playground server consumes.
#
# Usage:
#   tools/audio/starter/build.sh                              # default path
#   tools/audio/starter/build.sh /path/to/FamiStudio.dll      # explicit path
#
# Defaults to /tmp/famistudio-build/FamiStudio.dll, which is what
# `dotnet build /home/duguid/git-stuff/FamiStudio/FamiStudio/FamiStudio.Linux.csproj`
# produces.  Builds the C# CLI on the fly if the DLL is missing.
set -eu

DLL="${1:-/tmp/famistudio-build/FamiStudio.dll}"
HERE="$(dirname "$(readlink -f "$0")")"

if [ ! -f "$DLL" ]; then
    REPO="${FAMISTUDIO_REPO:-/home/duguid/git-stuff/FamiStudio}"
    if [ ! -d "$REPO" ]; then
        echo "FamiStudio.dll not found at $DLL and no upstream repo at $REPO." >&2
        echo "Either build FamiStudio first or pass the DLL path as the first arg." >&2
        exit 1
    fi
    echo "Building FamiStudio CLI from $REPO ..."
    dotnet build "$REPO/FamiStudio/FamiStudio.Linux.csproj" -c Release -o "$(dirname "$DLL")" >/dev/null
fi

build_song() {
    local src="$1" name
    name="$(basename "$src" .fmstxt)"
    echo "  song  $name"
    dotnet "$DLL" "$HERE/$src" famistudio-asm-export "$HERE/$name.s" \
        -famistudio-asm-format:ca65 >/dev/null
}

build_sfx() {
    local src="$1" name
    name="$(basename "$src" .fmstxt)"
    echo "  sfx   $name"
    dotnet "$DLL" "$HERE/$src" famistudio-asm-sfx-export "$HERE/$name.s" \
        -famistudio-asm-format:ca65 >/dev/null
}

echo "Building starter audio assets via FamiStudio CLI ($DLL):"
for f in "$HERE"/song_*.fmstxt; do
    build_song "$(basename "$f")"
done
for f in "$HERE"/sfx_*.fmstxt; do
    build_sfx "$(basename "$f")"
done

echo "Done.  Files refreshed:"
ls -la "$HERE"/*.s
