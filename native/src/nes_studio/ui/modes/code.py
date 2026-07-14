"""CODE — inspect or edit the generated C and 6502 assembly source."""

from __future__ import annotations

from PySide6.QtCore import QRegularExpression, QSize, Qt
from PySide6.QtGui import (
    QColor,
    QPainter,
    QSyntaxHighlighter,
    QTextCharFormat,
    QTextCursor,
)
from PySide6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QMessageBox,
    QPlainTextEdit,
    QPushButton,
    QSplitter,
    QVBoxLayout,
    QWidget,
)

from ...codegen.differential import CodegenDifferential
from .base import Level, Mode, ModeContext

#: What `_refresh` shows before the codegen has ever run.
_PLACEHOLDER = "Select CODE to generate a preview."


class SourceHighlighter(QSyntaxHighlighter):
    """A small dependency-free highlighter for the C and ca65 panes."""

    def __init__(self, document: object) -> None:
        super().__init__(document)
        self.language = "c"

    @staticmethod
    def _format(colour: str, bold: bool = False) -> QTextCharFormat:
        value = QTextCharFormat()
        value.setForeground(QColor(colour))
        if bold:
            value.setFontWeight(700)
        return value

    def highlightBlock(self, text: str) -> None:  # noqa: N802 - Qt API spelling
        comment = self._format("#7f9f7f")
        keyword = self._format("#ff79c6", True)
        number = self._format("#bd93f9")
        directive = self._format("#8be9fd", True)
        rules = [
            (r"//.*$|/\*.*\*/", comment),
            (r"\b(0x[0-9a-fA-F]+|\d+)\b", number),
        ]
        if self.language == "asm":
            rules += [
                (r";.*$", comment),
                (r"^\s*\.[a-zA-Z]+|^\s*[A-Za-z_][\w]*:", directive),
                (
                    r"\b(lda|sta|ldx|ldy|jmp|jsr|rts|bne|beq|cmp|adc|sbc|inc|dec|and|ora|eor)\b",
                    keyword,
                ),
            ]
        else:
            rules += [
                (r"^\s*#\s*\w+", directive),
                (r"\b(void|int|char|unsigned|const|static|if|else|for|while|return|struct)\b",
                 keyword),
            ]
        for expression, style in rules:
            match = QRegularExpression(expression).globalMatch(text)
            while match.hasNext():
                hit = match.next()
                self.setFormat(hit.capturedStart(), hit.capturedLength(), style)


class _LineNumbers(QWidget):
    """The gutter. Painted by the editor that owns it."""

    def __init__(self, editor: "NumberedEditor") -> None:
        super().__init__(editor)
        self._editor = editor
        self.setObjectName("lineNumbers")

    def sizeHint(self) -> QSize:  # noqa: N802 - Qt API
        return QSize(self._editor.gutter_width(), 0)

    def paintEvent(self, event) -> None:  # noqa: N802 - Qt API
        self._editor.paint_gutter(event)


class NumberedEditor(QPlainTextEdit):
    """A source editor with line numbers.

    cc65 reports its errors as `main.c:112: error: …`. Without a line number in
    the margin, "line 112" is a number the pupil cannot act on.
    """

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._gutter = _LineNumbers(self)
        self.blockCountChanged.connect(lambda _count: self._resize_gutter())
        self.updateRequest.connect(self._scroll_gutter)
        self._resize_gutter()

    def gutter_width(self) -> int:
        digits = max(3, len(str(max(1, self.blockCount()))))
        return 12 + self.fontMetrics().horizontalAdvance("9") * digits

    def _resize_gutter(self) -> None:
        self.setViewportMargins(self.gutter_width(), 0, 0, 0)

    def _scroll_gutter(self, rect, dy: int) -> None:
        if dy:
            self._gutter.scroll(0, dy)
        else:
            self._gutter.update(0, rect.y(), self._gutter.width(), rect.height())
        if rect.contains(self.viewport().rect()):
            self._resize_gutter()

    def resizeEvent(self, event) -> None:  # noqa: N802 - Qt API
        super().resizeEvent(event)
        area = self.contentsRect()
        self._gutter.setGeometry(area.left(), area.top(), self.gutter_width(), area.height())

    def paint_gutter(self, event) -> None:
        painter = QPainter(self._gutter)
        painter.fillRect(event.rect(), QColor("#12122a"))
        painter.setPen(QColor("#6868a8"))

        block = self.firstVisibleBlock()
        number = block.blockNumber()
        top = self.blockBoundingGeometry(block).translated(self.contentOffset()).top()
        bottom = top + self.blockBoundingRect(block).height()

        while block.isValid() and top <= event.rect().bottom():
            if block.isVisible() and bottom >= event.rect().top():
                painter.drawText(
                    0,
                    int(top),
                    self._gutter.width() - 6,
                    self.fontMetrics().height(),
                    int(Qt.AlignmentFlag.AlignRight),
                    str(number + 1),
                )
            block = block.next()
            top = bottom
            bottom = top + self.blockBoundingRect(block).height()
            number += 1


class CodeMode(Mode):
    """The generated source — and the pupil's edits to it.

    Two traps live here, both of which have already bitten:

    1. **Populating the editor must not count as editing it.** `customMainC`
       feeds the build, so writing it changes how the game compiles. Merely
       *opening* CODE used to set it to the generated source, because the
       highlighter re-touches the document and fires `textChanged` after the
       `blockSignals()` window has closed. We remember what was loaded and
       ignore a "change" back to it.
    2. **Generating the C source runs the cc65 codegen.** Never call `refresh()`
       for a CODE pane nobody is looking at.
    """

    id = "CODE"
    title = "CODE"
    help_text = "Inspect or edit the generated C and 6502 assembly source."
    min_level = Level.ADVANCED

    def __init__(self, context: ModeContext, parent: QWidget | None = None) -> None:
        super().__init__(context, parent)
        self.setObjectName("codeModePage")
        self._language = "c"
        self._loaded_text: str | None = None

        panel = QWidget(self)
        panel.setObjectName("codeEditor")
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.addWidget(panel)

        layout = QVBoxLayout(panel)
        toolbar = QHBoxLayout()
        toolbar.addWidget(QLabel("SOURCE", panel))
        self.code_c_button = QPushButton("C  main.c", panel)
        self.code_c_button.setObjectName("codeCButton")
        self.code_c_button.setCheckable(True)
        self.code_c_button.clicked.connect(lambda: self.select_language("c"))
        toolbar.addWidget(self.code_c_button)
        self.code_asm_button = QPushButton("ASM  main.s", panel)
        self.code_asm_button.setObjectName("codeAsmButton")
        self.code_asm_button.setCheckable(True)
        self.code_asm_button.clicked.connect(lambda: self.select_language("asm"))
        toolbar.addWidget(self.code_asm_button)
        self.code_language_note = QLabel(panel)
        self.code_language_note.setObjectName("codeLanguageNote")
        toolbar.addWidget(self.code_language_note, 1)
        layout.addLayout(toolbar)

        # The editor and the compiler's own words, one above the other. The log
        # used to be discarded entirely, so a failed build told the pupil
        # "the ROM could not be built" and nothing else.
        splitter = QSplitter(Qt.Orientation.Vertical, panel)
        splitter.setObjectName("codeSplitter")
        splitter.setChildrenCollapsible(False)

        self.code_preview = NumberedEditor(splitter)
        self.code_preview.setObjectName("codePreview")
        self.code_preview.setReadOnly(False)
        self.code_preview.setAccessibleName("Editable project C source")
        self.code_preview.setLineWrapMode(QPlainTextEdit.LineWrapMode.NoWrap)
        self.code_preview.textChanged.connect(self._save_source)
        self._highlighter = SourceHighlighter(self.code_preview.document())
        splitter.addWidget(self.code_preview)

        log_panel = QWidget(splitter)
        log_layout = QVBoxLayout(log_panel)
        log_layout.setContentsMargins(0, 6, 0, 0)
        log_header = QHBoxLayout()
        self.build_log_title = QLabel("BUILD LOG", log_panel)
        self.build_log_title.setObjectName("sectionLabel")
        log_header.addWidget(self.build_log_title)
        log_header.addStretch(1)
        log_layout.addLayout(log_header)
        self.build_log = QPlainTextEdit(log_panel)
        self.build_log.setObjectName("buildLog")
        self.build_log.setReadOnly(True)
        self.build_log.setAccessibleName("cc65 build log")
        self.build_log.setPlaceholderText("Build the ROM (F5) to see the compiler's output here.")
        log_layout.addWidget(self.build_log)
        splitter.addWidget(log_panel)
        splitter.setSizes([600, 200])
        layout.addWidget(splitter)

    # ---- dock -------------------------------------------------------------

    def build_dock(self) -> QWidget:
        dock = QWidget()
        layout = QVBoxLayout(dock)
        layout.setContentsMargins(0, 0, 0, 0)

        source_label = QLabel("SOURCE", dock)
        source_label.setObjectName("sectionLabel")
        layout.addWidget(source_label)
        self.state_label = QLabel(dock)
        self.state_label.setObjectName("codeStateLabel")
        self.state_label.setWordWrap(True)
        layout.addWidget(self.state_label)

        self.restore_button = QPushButton("Restore generated source", dock)
        self.restore_button.setObjectName("restoreGeneratedButton")
        self.restore_button.setAccessibleDescription(
            "Discard hand-edited source and go back to the source the Studio generates"
        )
        self.restore_button.clicked.connect(self.restore_generated)
        layout.addWidget(self.restore_button)

        warning = QLabel(
            "Once you edit the source, the Studio builds *your* code — changes in "
            "WORLD, CHARS and RULES stop reaching the ROM. Restore to hand it back.",
            dock,
        )
        warning.setObjectName("codeEjectionWarning")
        warning.setWordWrap(True)
        layout.addWidget(warning)
        layout.addStretch(1)
        return dock

    # ---- source -----------------------------------------------------------

    @property
    def language(self) -> str:
        return self._language

    def select_language(self, language: str) -> None:
        if language not in {"c", "asm"} or language == self._language:
            return
        self._save_source()
        self._language = language
        self.refresh()

    def refresh(self) -> None:
        saved = self.document.custom_source(self._language)
        if saved == _PLACEHOLDER:
            saved = None
        if saved is not None:
            source = saved
        elif self._language == "asm":
            source = self._default_asm_source()
        else:
            source = self._generated_c_source()

        # Populating the editor must not count as the pupil editing it.
        # blockSignals() is not enough: the highlighter re-touches the document,
        # so textChanged fires after the blocked window has closed. Remember what
        # we loaded and ignore a "change" back to it.
        self._loaded_text = source
        self.code_preview.blockSignals(True)
        self.code_preview.setPlainText(source)
        self.code_preview.blockSignals(False)

        self.code_c_button.setChecked(self._language == "c")
        self.code_asm_button.setChecked(self._language == "asm")
        self.code_language_note.setText(
            "Editable cc65 source" if self._language == "c" else "Editable ca65 source"
        )
        self.code_preview.setAccessibleName(
            f"Editable {'C' if self._language == 'c' else '6502 assembly'} source"
        )
        self._highlighter.language = self._language
        self._highlighter.rehighlight()
        self._refresh_state()
        self.status(
            f"Loaded editable {'C' if self._language == 'c' else 'assembly'} source"
        )

    def _refresh_state(self) -> None:
        if self._dock is None:
            return
        edited = self.document.custom_source(self._language) is not None
        self.state_label.setText(
            "This project builds from **your** edited source."
            if edited
            else "This project builds from the generated source."
        )
        self.restore_button.setEnabled(edited)

    def _generated_c_source(self) -> str:
        locator = self.context.window.resource_locator
        if not locator.source_checkout:
            return "// Generated source is unavailable: this installation lacks the engine bundle.\n"
        try:
            return CodegenDifferential(locator.root).assemble(self.document.snapshot())
        except Exception as exc:  # surfaced in the pane, not an event-loop traceback
            self.status("Could not generate CODE preview")
            return f"// Could not generate C source:\n// {exc}\n"

    def _default_asm_source(self) -> str:
        path = (
            self.context.window.resource_locator.root
            / "steps"
            / "Step_Playground"
            / "src"
            / "main_asm.s"
        )
        try:
            return path.read_text(encoding="utf-8")
        except OSError:
            return "; Assembly starter is unavailable in this installation.\n"

    def _save_source(self) -> None:
        text = self.code_preview.toPlainText()
        if text == self._loaded_text:
            return  # the editor was populated, not edited
        self.document.set_custom_source(self._language, text)
        self._refresh_state()
        self.edited("")

    def restore_generated(self) -> None:
        """Hand the project back to the generator.

        Until now there was no way back: once `customMainC` was set, WORLD,
        CHARS and RULES silently stopped reaching the ROM, for good.
        """

        if self.document.custom_source(self._language) is None:
            return
        confirm = QMessageBox.question(
            self.context.window,
            "Restore generated source",
            "Discard your edits to this source and go back to the source the Studio "
            "generates from WORLD, CHARS and RULES?\n\nThis can be undone with Ctrl+Z.",
        )
        if confirm != QMessageBox.StandardButton.Yes:
            return
        self.document.clear_custom_source(self._language)
        self.refresh()
        self.edited("Restored the generated source")

    # ---- the build log ----------------------------------------------------

    def set_build_log(self, log: str, *, failed: bool = False) -> None:
        self.build_log.setPlainText(log or "")
        self.build_log_title.setText("BUILD LOG — FAILED" if failed else "BUILD LOG")
        self.build_log_title.setObjectName("buildLogFailed" if failed else "sectionLabel")
        self.build_log_title.style().unpolish(self.build_log_title)
        self.build_log_title.style().polish(self.build_log_title)
        if failed:
            # Compiler errors are at the end of the log, which is where the pupil
            # needs to be looking. Scroll now, not on a singleShot: a deferred
            # lambda outlives the widget when the window closes first.
            self.build_log.moveCursor(QTextCursor.MoveOperation.End)
