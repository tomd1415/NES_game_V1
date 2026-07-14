"""“That tile is used by someone else. Change it everywhere, or make a copy?”

The best teaching moment in the web app (`studio-chars.js:283-326`), and one
native has never had. Tiles are *shared*: two characters can point at the same
8x8 slot, and there are only 256 of them, so sharing is the point. But it means
that repainting the Villager's boot can silently repaint the Hero's — and to a
pupil who has never met a reference, that is inexplicable magic.

So when an edit is about to reach art that something else is using, we say so,
in those terms, and let them choose. That is the moment the idea of a shared
reference lands.
"""

from __future__ import annotations

from dataclasses import dataclass

from PySide6.QtWidgets import QMessageBox, QWidget

from ...core.project_document import ProjectDocument


@dataclass(frozen=True)
class TileReference:
    """One place a tile is used."""

    kind: str  # "sprite" | "background"
    name: str
    count: int


def sprite_tile_users(
    document: ProjectDocument, tile: int, *, excluding: int | None = None
) -> list[TileReference]:
    """Which *other* sprites draw with this sprite tile."""

    users: list[TileReference] = []
    names = document.sprite_names()
    for index, sprite in enumerate(document.state.get("sprites") or []):
        if index == excluding or not isinstance(sprite, dict):
            continue
        count = 0
        for row in sprite.get("cells") or []:
            for cell in row if isinstance(row, list) else []:
                if (
                    isinstance(cell, dict)
                    and not cell.get("empty")
                    and int(cell.get("tile", 0)) == tile
                ):
                    count += 1
        if count:
            name = names[index] if index < len(names) else f"Sprite {index}"
            users.append(TileReference("sprite", name, count))
    return users


class SharedTileGuard:
    """Ask before an edit reaches art that something else uses.

    Remembers the answer for the rest of the stroke, so dragging a pencil across
    a shared tile asks once, not once per pixel.
    """

    #: The pupil chose to edit the shared art in place — every user changes.
    EVERYWHERE = "everywhere"
    #: The tile was duplicated into a free slot first — only this sprite changes.
    DUPLICATED = "duplicated"
    #: Nothing happens.
    CANCELLED = "cancelled"

    def __init__(self, parent: QWidget, document_getter) -> None:
        self._parent = parent
        self._document = document_getter
        self._decisions: dict[int, str] = {}

    def reset(self) -> None:
        """Forget this stroke's answers. Call when a stroke ends."""

        self._decisions.clear()

    def ask(self, tile: int, users: list[TileReference]) -> str:
        """Put the question to the pupil. Returns one of the three answers.

        Separated from `check()` so a test can answer it without a modal dialog —
        and so the *consequences* of each answer (which is where the bugs are) can
        be tested without faking Qt.
        """

        names = ", ".join(user.name for user in users[:4])
        if len(users) > 4:
            names += f", and {len(users) - 4} more"

        dialog = QMessageBox(self._parent)
        dialog.setIcon(QMessageBox.Icon.Question)
        dialog.setWindowTitle("This drawing is shared")
        dialog.setText(f"Tile 0x{tile:02X} is also used by {names}.")
        dialog.setInformativeText(
            "Changing it here changes it there too — they are the same drawing.\n\n"
            "Duplicate it first to give this character its own copy."
        )
        duplicate = dialog.addButton("Duplicate first", QMessageBox.ButtonRole.AcceptRole)
        everywhere = dialog.addButton("Change everywhere", QMessageBox.ButtonRole.DestructiveRole)
        dialog.addButton("Cancel", QMessageBox.ButtonRole.RejectRole)
        dialog.setDefaultButton(duplicate)
        dialog.exec()

        clicked = dialog.clickedButton()
        if clicked is everywhere:
            return self.EVERYWHERE
        if clicked is duplicate:
            return self.DUPLICATED
        return self.CANCELLED

    def check(self, tile: int, *, sprite_index: int) -> tuple[str, int]:
        """Return (decision, tile to actually paint).

        When the pupil duplicates, the *caller's* cell must be repointed at the
        new slot — which is why the tile to paint comes back out.
        """

        document = self._document()
        remembered = self._decisions.get(tile)
        if remembered == self.EVERYWHERE:
            return self.EVERYWHERE, tile
        if remembered == self.CANCELLED:
            return self.CANCELLED, tile

        users = sprite_tile_users(document, tile, excluding=sprite_index)
        if not users:
            self._decisions[tile] = self.EVERYWHERE
            return self.EVERYWHERE, tile

        answer = self.ask(tile, users)

        if answer == self.EVERYWHERE:
            self._decisions[tile] = self.EVERYWHERE
            return self.EVERYWHERE, tile

        if answer == self.DUPLICATED:
            try:
                copy = document.duplicate_sprite_tile(tile)
            except ValueError as exc:
                QMessageBox.warning(self._parent, "No free tile slot", str(exc))
                self._decisions[tile] = self.CANCELLED
                return self.CANCELLED, tile
            # The copy is this sprite's own art now — never ask about it again.
            self._decisions[tile] = self.DUPLICATED
            self._decisions[copy] = self.EVERYWHERE
            return self.DUPLICATED, copy

        self._decisions[tile] = self.CANCELLED
        return self.CANCELLED, tile
