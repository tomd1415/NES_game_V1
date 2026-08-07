from __future__ import annotations

import pytest  # noqa: E402

# PySide6 is optional in the test environment and absent from the headless
# container. Without this the module raises at import time, pytest reports a
# collection ERROR, and an absent dependency reads like a defect (F3). The
# import below is transitive for some of these modules -- nes_studio.* pulls
# PySide6 in -- so the guard belongs here, ahead of the first such import.
pytest.importorskip("PySide6")  # noqa: E402

from PySide6.QtTest import QSignalSpy

from nes_studio.core.project_document import ProjectDocument
from nes_studio.integrations.direct_build import NativeBuildResult
from nes_studio.ui.build_play import BuildWorker as _BuildWorker


def test_build_worker_reports_artifact_without_touching_the_qt_ui(qapp) -> None:
    class Controller:
        def build(self, document):
            document.state["worker_only"] = True
            return NativeBuildResult(b"NES\\x1a", "clean", "a" * 64)

    worker = _BuildWorker(Controller(), ProjectDocument.preview())
    succeeded = QSignalSpy(worker.succeeded)
    failed = QSignalSpy(worker.failed)
    finished = QSignalSpy(worker.finished)
    worker.run()
    assert succeeded.count() == 1
    assert failed.count() == 0
    assert finished.count() == 1
    result = succeeded.at(0)[0]
    assert result.rom == b"NES\\x1a"
