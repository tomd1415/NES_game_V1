"""File dialogs for the NES's native asset formats."""

from __future__ import annotations

from pathlib import Path

from PySide6.QtCore import QIODevice, QSaveFile
from PySide6.QtWidgets import QFileDialog, QInputDialog, QMessageBox

from ..core import assets

CHR_FILTER = "NES tile data (*.chr);;All files (*)"
PAL_FILTER = "NES palette (*.pal);;All files (*)"
NAM_FILTER = "NES nametable (*.nam);;All files (*)"


class AssetDialogs:
    """Import and export `.chr` / `.pal` / `.nam`, both ways.

    Kept off `MainWindow`: the shell should not grow six more methods just
    because the NES has three file formats.
    """

    def __init__(self, window) -> None:
        self._window = window

    # ---- helpers ----------------------------------------------------------

    @property
    def _document(self):
        return self._window.document

    def _ask_bank(self, title: str) -> str | None:
        bank, accepted = QInputDialog.getItem(
            self._window,
            title,
            "Which bank?",
            ["Background tiles", "Sprite tiles"],
            0,
            False,
        )
        if not accepted:
            return None
        return "sprite" if bank.startswith("Sprite") else "bg"

    def _read(self, title: str, file_filter: str) -> bytes | None:
        path, _filter = QFileDialog.getOpenFileName(self._window, title, "", file_filter)
        if not path:
            return None
        try:
            return Path(path).read_bytes()
        except OSError as exc:
            QMessageBox.warning(self._window, title, str(exc))
            return None

    def _write(self, title: str, suggested: str, file_filter: str, data: bytes) -> bool:
        path, _filter = QFileDialog.getSaveFileName(
            self._window, title, suggested, file_filter
        )
        if not path:
            return False
        suffix = Path(suggested).suffix
        if suffix and not path.casefold().endswith(suffix):
            path += suffix
        target = QSaveFile(path)
        if not target.open(QIODevice.OpenModeFlag.WriteOnly):
            QMessageBox.critical(self._window, title, target.errorString())
            return False
        if target.write(data) != len(data) or not target.commit():
            target.cancelWriting()
            QMessageBox.critical(self._window, title, target.errorString())
            return False
        self._window.statusBar().showMessage(f"Exported {len(data):,} bytes to {path}")
        return True

    # ---- CHR --------------------------------------------------------------

    def import_chr(self) -> None:
        bank = self._ask_bank("Import tiles")
        if bank is None:
            return
        data = self._read("Import tiles (.chr)", CHR_FILTER)
        if data is None:
            return
        try:
            count = assets.import_chr(self._document, bank, data)
        except assets.AssetFormatError as exc:
            QMessageBox.warning(self._window, "Could not import tiles", str(exc))
            return
        self._window.document_edited(f"Imported {count} tiles into the {bank} bank")
        self._window.refresh_all_editors()

    def export_chr(self) -> None:
        bank = self._ask_bank("Export tiles")
        if bank is None:
            return
        self._write(
            "Export tiles (.chr)",
            f"{self._document.name}-{bank}.chr",
            CHR_FILTER,
            assets.export_chr(self._document, bank),
        )

    # ---- PAL --------------------------------------------------------------

    def import_pal(self) -> None:
        data = self._read("Import palette (.pal)", PAL_FILTER)
        if data is None:
            return
        try:
            count = assets.import_pal(self._document, data)
        except assets.AssetFormatError as exc:
            QMessageBox.warning(self._window, "Could not import palette", str(exc))
            return
        self._window.document_edited(f"Imported {count} palette entries")
        self._window.refresh_all_editors()

    def export_pal(self) -> None:
        self._write(
            "Export palette (.pal)",
            f"{self._document.name}.pal",
            PAL_FILTER,
            assets.export_pal(self._document),
        )

    # ---- NAM --------------------------------------------------------------

    def import_nam(self) -> None:
        data = self._read("Import nametable (.nam)", NAM_FILTER)
        if data is None:
            return
        world = self._window.modes["WORLD"]
        try:
            written = assets.import_nam(self._document, data, world.screen_x, world.screen_y)
        except assets.AssetFormatError as exc:
            QMessageBox.warning(self._window, "Could not import nametable", str(exc))
            return
        self._window.document_edited(f"Imported a screen ({written} cells)")
        self._window.refresh_all_editors()

    def export_nam(self) -> None:
        world = self._window.modes["WORLD"]
        self._write(
            "Export nametable (.nam)",
            f"{self._document.name}-screen.nam",
            NAM_FILTER,
            assets.export_nam(self._document, world.screen_x, world.screen_y),
        )
