"""Read-only resource discovery for source and installed layouts."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

RESOURCE_ROOT_ENV = "NES_STUDIO_RESOURCE_ROOT"


@dataclass(frozen=True, slots=True)
class ResourceLocator:
    """Locate immutable engine and application resources.

    The locator never creates directories. Mutable application data is owned by
    the persistence layer and must use XDG locations.
    """

    root: Path
    source_checkout: bool

    @classmethod
    def from_root(cls, root: str | Path, *, source_checkout: bool = True) -> "ResourceLocator":
        return cls(Path(root).expanduser().resolve(), source_checkout)

    @classmethod
    def discover(cls, start: str | Path | None = None) -> "ResourceLocator":
        override = os.environ.get(RESOURCE_ROOT_ENV)
        if override:
            return cls.from_root(override)

        start_path = Path(start).resolve() if start is not None else Path(__file__).resolve()
        current = start_path if start_path.is_dir() else start_path.parent
        for candidate in (current, *current.parents):
            if (candidate / "tools" / "engines").is_dir() and (
                candidate / "steps" / "Step_Playground"
            ).is_dir():
                return cls(candidate, True)

        packaged_root = Path(__file__).resolve().parents[1] / "resources"
        return cls(packaged_root, False)

    @property
    def engines_dir(self) -> Path:
        if self.source_checkout:
            return self.root / "tools" / "engines"
        return self.root / "engines"

    @property
    def playground_dir(self) -> Path:
        if self.source_checkout:
            return self.root / "steps" / "Step_Playground"
        return self.root / "Step_Playground"

    @property
    def web_assets_dir(self) -> Path | None:
        if not self.source_checkout:
            return None
        return self.root / "tools" / "tile_editor_web"

    def missing_required(self) -> tuple[Path, ...]:
        """Return required resource paths that do not currently exist."""

        return tuple(path for path in (self.engines_dir, self.playground_dir) if not path.is_dir())
