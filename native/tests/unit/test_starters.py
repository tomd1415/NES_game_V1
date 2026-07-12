from __future__ import annotations

import gzip
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

NATIVE_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(NATIVE_ROOT / "src"))

from nes_studio.metadata import APP_VERSION  # noqa: E402
from nes_studio.core.starters import StarterCatalog  # noqa: E402


RESOURCE_ROOT = NATIVE_ROOT / "src" / "nes_studio" / "resources" / "starters"
CORPUS_ROOT = NATIVE_ROOT / "tests" / "fixtures" / "phase0" / "starters"
EXPECTED = ("basics", "geodash", "racer", "runner", "scratch", "smb", "topdown")


def test_packaged_starters_are_the_frozen_browser_fixture_bytes() -> None:
    manifest = json.loads((RESOURCE_ROOT / "manifest.json").read_text("utf-8"))
    assert tuple(manifest["fixtures"]) == EXPECTED
    for style, record in manifest["fixtures"].items():
        packaged = gzip.decompress((RESOURCE_ROOT / style / "project.json.gz").read_bytes())
        frozen = gzip.decompress((CORPUS_ROOT / style / "project.json.gz").read_bytes())
        assert packaged == frozen
        assert hashlib.sha256(packaged).hexdigest() == record["project_json_sha256"]


def test_creation_clones_fixture_and_stamps_fresh_identity_name_and_metadata() -> None:
    instant = datetime(2026, 7, 12, 9, 30, 1, 123000, tzinfo=timezone.utc)
    catalog = StarterCatalog(
        RESOURCE_ROOT,
        current_engine=63,
        clock=lambda: instant,
        identity=lambda: "project-123",
    )
    created = catalog.create("topdown", name="My Quest")
    assert created.project_id == "project-123"
    assert created.style == "topdown"
    assert created.document.name == "My Quest"
    assert created.document.engine_version == 63
    assert created.document.state["metadata"] == {
        "created": "2026-07-12T09:30:01.123Z",
        "modified": "2026-07-12T09:30:01.123Z",
        "nativeAppVersion": APP_VERSION,
    }
    created.document.state["name"] = "mutated"
    assert catalog.create("topdown").document.name == "Top-down Adventure"


def test_unknown_style_is_actionable() -> None:
    catalog = StarterCatalog(RESOURCE_ROOT)
    try:
        catalog.create("not-a-style")
    except KeyError as exc:
        assert "Unknown starter style" in str(exc)
    else:
        raise AssertionError("unknown starter was accepted")
