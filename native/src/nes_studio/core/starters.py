"""Canonical starter-project resources and fresh-project creation."""

from __future__ import annotations

import gzip
import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from nes_studio.metadata import APP_VERSION

from .project_document import ProjectDocument


@dataclass(frozen=True, slots=True)
class CreatedProject:
    project_id: str
    style: str
    document: ProjectDocument


class StarterCatalog:
    def __init__(
        self,
        root: str | Path | None = None,
        *,
        current_engine: int = 63,
        clock: Callable[[], datetime] | None = None,
        identity: Callable[[], str] | None = None,
    ) -> None:
        self.root = (
            Path(root)
            if root is not None
            else Path(__file__).resolve().parents[1] / "resources" / "starters"
        )
        self.current_engine = current_engine
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.identity = identity or (lambda: str(uuid.uuid4()))
        self._manifest = json.loads((self.root / "manifest.json").read_text("utf-8"))

    def styles(self) -> tuple[str, ...]:
        return tuple(self._manifest["fixtures"])

    def create(self, style: str, *, name: str | None = None) -> CreatedProject:
        try:
            record = self._manifest["fixtures"][style]
        except KeyError as exc:
            raise KeyError(f"Unknown starter style: {style}") from exc
        canonical = gzip.decompress((self.root / style / "project.json.gz").read_bytes())
        digest = hashlib.sha256(canonical).hexdigest()
        if digest != record["project_json_sha256"]:
            raise ValueError(f"Starter fixture checksum mismatch: {style}")
        state = json.loads(canonical)
        now = self.clock().astimezone(timezone.utc).isoformat(timespec="milliseconds").replace(
            "+00:00", "Z"
        )
        state["name"] = name or state.get("name") or "Untitled"
        state["engineVersion"] = self.current_engine
        metadata = state.get("metadata") if isinstance(state.get("metadata"), dict) else {}
        state["metadata"] = {
            **metadata,
            "created": now,
            "modified": now,
            "nativeAppVersion": APP_VERSION,
        }
        return CreatedProject(
            project_id=self.identity(),
            style=style,
            document=ProjectDocument.from_json(json.dumps(state, ensure_ascii=False)),
        )
