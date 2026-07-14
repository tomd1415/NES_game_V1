from __future__ import annotations

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
