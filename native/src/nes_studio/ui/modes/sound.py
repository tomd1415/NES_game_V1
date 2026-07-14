"""SOUND — import songs and sound effects, and watch the ROM budget."""

from __future__ import annotations

from pathlib import Path

from PySide6.QtWidgets import (
    QFileDialog,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QMessageBox,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from ..widgets.budget import BudgetMeter
from .base import Level, Mode, ModeContext, scroll_body

#: A song and an SFX pack are assembled into the same 32 KB cartridge as the
#: rest of the game, so the budget is the honest thing to show a pupil.
CARTRIDGE_BYTES = 32 * 1024


def asset_size(asset: object) -> int:
    if not isinstance(asset, dict):
        return 0
    declared = asset.get("size")
    if isinstance(declared, int) and declared > 0:
        return declared
    return len(str(asset.get("asm") or "").encode("utf-8"))


class SoundMode(Mode):
    """Songs and one SFX pack, imported as ca65 assembly."""

    id = "SOUND"
    title = "SOUND"
    help_text = "Import songs and sound effects and watch the ROM budget."
    min_level = Level.MAKER

    def __init__(self, context: ModeContext, parent: QWidget | None = None) -> None:
        super().__init__(context, parent)
        self.setObjectName("soundModePage")
        content = scroll_body(self, "soundEditor")
        layout = QVBoxLayout(content)
        layout.setContentsMargins(18, 16, 18, 24)
        layout.setSpacing(8)

        layout.addWidget(QLabel("MUSIC & SOUND EFFECTS", content))
        self.song_list = QListWidget(content)
        self.song_list.setObjectName("songList")
        self.song_list.setAccessibleName("Project songs")
        layout.addWidget(self.song_list)

        self.sfx_label = QLabel("No SFX pack loaded", content)
        self.sfx_label.setObjectName("sfxStatus")
        layout.addWidget(self.sfx_label)

        self.audio_budget = QLabel(content)
        self.audio_budget.setObjectName("audioBudget")
        self.audio_budget.setWordWrap(True)
        layout.addWidget(self.audio_budget)

        self.budget_meter = BudgetMeter("Audio", CARTRIDGE_BYTES, content)
        self.budget_meter.setObjectName("audioBudgetMeter")
        layout.addWidget(self.budget_meter)

        note = QLabel(
            "Songs are ca65 assembly, as exported by FamiTracker or FamiStudio. "
            "The default song plays when the game starts.",
            content,
        )
        note.setWordWrap(True)
        layout.addWidget(note)
        layout.addStretch(1)

    # ---- dock -------------------------------------------------------------

    def build_dock(self) -> QWidget:
        dock = QWidget()
        layout = QVBoxLayout(dock)
        layout.setContentsMargins(0, 0, 0, 0)

        songs_label = QLabel("SONGS", dock)
        songs_label.setObjectName("sectionLabel")
        layout.addWidget(songs_label)
        for label, name, callback in (
            ("▶ Hear this song", "previewSongButton", self._preview),
            ("Import song…", "importSongButton", lambda: self._import(False)),
            ("Make default", "makeDefaultSongButton", self._make_default),
            ("Remove song", "removeSongButton", self._remove_song),
        ):
            button = QPushButton(label, dock)
            button.setObjectName(name)
            button.clicked.connect(callback)
            layout.addWidget(button)
        preview_hint = QLabel(
            "There is no way to hear a NES song except on a NES — so this makes it "
            "the default, builds the ROM, and plays it.",
            dock,
        )
        preview_hint.setWordWrap(True)
        layout.addWidget(preview_hint)

        sfx_label = QLabel("SOUND EFFECTS", dock)
        sfx_label.setObjectName("sectionLabel")
        layout.addWidget(sfx_label)
        actions = QHBoxLayout()
        for label, name, callback in (
            ("Import SFX…", "importSfxButton", lambda: self._import(True)),
            ("Remove SFX", "removeSfxButton", self._remove_sfx),
        ):
            button = QPushButton(label, dock)
            button.setObjectName(name)
            button.clicked.connect(callback)
            actions.addWidget(button)
        layout.addLayout(actions)
        layout.addStretch(1)
        return dock

    # ---- refresh ----------------------------------------------------------

    def refresh(self) -> None:
        audio = self.document.state.get("audio") or {}
        songs = audio.get("songs") if isinstance(audio.get("songs"), list) else []
        default = int(audio.get("defaultSongIdx") or 0)

        self.song_list.blockSignals(True)
        selected = self.song_list.currentRow()
        self.song_list.clear()
        for index, song in enumerate(songs):
            if not isinstance(song, dict):
                continue
            marker = "★ " if index == default else "☆ "
            name = song.get("name") or song.get("filename") or f"song {index}"
            self.song_list.addItem(f"{marker}{name} — {asset_size(song):,} bytes")
        if 0 <= selected < self.song_list.count():
            self.song_list.setCurrentRow(selected)
        self.song_list.blockSignals(False)

        sfx = audio.get("sfx")
        self.sfx_label.setText(
            f"SFX: {sfx.get('name') or sfx.get('filename')}"
            if isinstance(sfx, dict)
            else "No SFX pack loaded"
        )

        used = sum(asset_size(song) for song in songs) + asset_size(sfx)
        self.audio_budget.setText(
            f"Audio uses ~{used / 1024:.1f} KB "
            f"({round(used / CARTRIDGE_BYTES * 100)}% of a 32 KB cartridge)."
        )
        self.budget_meter.set_used(used)

    # ---- edits ------------------------------------------------------------

    def _import(self, sfx: bool) -> None:
        path, _filter = QFileDialog.getOpenFileName(
            self.context.window,
            "Import SFX" if sfx else "Import song",
            "",
            "Assembly source (*.s *.asm)",
        )
        if not path:
            return
        try:
            asm = Path(path).read_text(encoding="utf-8")
            if sfx:
                self.document.set_audio_sfx(path, asm)
            else:
                self.document.add_audio_song(path, asm)
        except (OSError, ValueError) as exc:
            QMessageBox.warning(self.context.window, "Could not import audio", str(exc))
            return
        self.refresh()
        self.edited(f"Imported {'SFX pack' if sfx else 'song'}")

    def _preview(self) -> None:
        """Hear the selected song.

        A `.s` file is ca65 assembly for the NES's APU — there is nothing on the
        host that can play it. The only honest preview is the real one: make it
        the default, build the ROM, and run it on the embedded core.
        """

        index = self.song_list.currentRow()
        if index < 0:
            self.status("Select a song first")
            return
        self.document.set_default_song(index)
        self.refresh()
        self.edited("Playing your game with this song")
        window = self.context.window
        window.build_play.forget_rom()  # the ROM predates this change
        window.build_play.start()

    def _make_default(self) -> None:
        index = self.song_list.currentRow()
        if index < 0:
            self.status("Select a song first")
            return
        self.document.set_default_song(index)
        self.refresh()
        self.edited("Default song changed")

    def _remove_song(self) -> None:
        index = self.song_list.currentRow()
        if index < 0:
            self.status("Select a song first")
            return
        self.document.remove_audio_song(index)
        self.refresh()
        self.edited("Removed song")

    def _remove_sfx(self) -> None:
        self.document.clear_audio_sfx()
        self.refresh()
        self.edited("Removed the SFX pack")
