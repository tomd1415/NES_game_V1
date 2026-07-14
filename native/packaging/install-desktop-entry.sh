#!/usr/bin/env bash
# Install the launcher entry and icons for the current user.
#
# Puts NES Studio in the applications menu, gives it an icon in the task
# switcher, and associates it with project files. Everything lands under
# ~/.local, so it needs no root and can be undone by deleting those files.
#
#   native/packaging/install-desktop-entry.sh
#   native/packaging/install-desktop-entry.sh --uninstall
#
# For a whole classroom, run it with XDG_DATA_HOME pointed at /usr/local/share
# as root, or copy the same files into the image.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ICONS="$HERE/../src/nes_studio/resources/icons"
APP_ID="io.github.tomd1415.NESStudio.Devel"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"

uninstall() {
  rm -f "$DATA/applications/$APP_ID.desktop"
  rm -f "$DATA/metainfo/$APP_ID.metainfo.xml"
  for size in 16 32 48 64 128 256; do
    rm -f "$DATA/icons/hicolor/${size}x${size}/apps/$APP_ID.png"
  done
  echo "Removed the NES Studio launcher entry."
}

install_entry() {
  install -Dm644 "$HERE/$APP_ID.desktop"      "$DATA/applications/$APP_ID.desktop"
  install -Dm644 "$HERE/$APP_ID.metainfo.xml" "$DATA/metainfo/$APP_ID.metainfo.xml"

  for size in 16 32 48 64 128 256; do
    install -Dm644 "$ICONS/nes-studio-$size.png" \
      "$DATA/icons/hicolor/${size}x${size}/apps/$APP_ID.png"
  done
  echo "Installed the NES Studio launcher entry and icons into $DATA."
}

if [[ "${1:-}" == "--uninstall" ]]; then
  uninstall
else
  install_entry
fi

# Refresh the caches, where the tools exist. A desktop that has neither still
# picks the entry up on the next login, so a missing tool is not an error.
command -v update-desktop-database >/dev/null && \
  update-desktop-database "$DATA/applications" || true
command -v gtk-update-icon-cache >/dev/null && \
  gtk-update-icon-cache -f -t "$DATA/icons/hicolor" 2>/dev/null || true
