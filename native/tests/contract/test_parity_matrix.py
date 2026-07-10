from __future__ import annotations

import hashlib
import json
import re
import unittest
from dataclasses import dataclass
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
POLICY_PATH = REPOSITORY_ROOT / "docs" / "native-parity-policy.json"
CHECKLIST_PATH = REPOSITORY_ROOT / "docs" / "design" / "feature-parity.md"
CHECKBOX = re.compile(r"^- \[(?P<state>[ x~])\] (?P<capability>.+)$")


@dataclass(frozen=True, slots=True)
class ParityRow:
    row_id: str
    section: str
    area: str | None
    capability: str
    owners: tuple[str, ...]
    disposition: str
    test: str


def load_policy() -> dict[str, object]:
    return json.loads(POLICY_PATH.read_text(encoding="utf-8"))


def build_matrix() -> tuple[ParityRow, ...]:
    policy = load_policy()
    sections = policy["sections"]
    allowed = set(policy["allowed_dispositions"])
    improvement_markers = tuple(policy["improvement_markers"])
    shared_areas = set(policy["test_policy"]["shared_contract_areas"])
    default_test = policy["test_policy"]["default"]

    section: str | None = None
    area: str | None = None
    rows: list[ParityRow] = []
    for line in CHECKLIST_PATH.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            candidate = line[3:].strip()
            section = candidate if candidate in sections else None
            area = None
            continue
        if line.startswith("**") and line.endswith("**"):
            area = line.strip("*")
            continue

        match = CHECKBOX.match(line)
        if not match:
            continue
        if section is None:
            raise AssertionError(f"Unmapped parity capability: {line}")

        capability = match.group("capability")
        disposition = (
            "improve"
            if any(marker.casefold() in capability.casefold() for marker in improvement_markers)
            else str(policy["default_disposition"])
        )
        if disposition not in allowed:
            raise AssertionError(f"Invalid disposition {disposition!r}")
        normalized = re.sub(r"[^a-z0-9]+", "-", capability.casefold()).strip("-")
        digest = hashlib.sha256(f"{section}\n{capability}".encode()).hexdigest()[:8]
        row_id = f"{normalized[:64]}-{digest}"
        test = "cross-target differential contract" if area in shared_areas else default_test
        rows.append(
            ParityRow(
                row_id=row_id,
                section=section,
                area=area,
                capability=capability,
                owners=tuple(sections[section]),
                disposition=disposition,
                test=test,
            )
        )
    return tuple(rows)


class NativeParityMatrixTests(unittest.TestCase):
    def test_full_union_scope_is_explicit(self) -> None:
        policy = load_policy()
        self.assertEqual(policy["scope"], "studio_plus_legacy_union")
        self.assertEqual(policy["source"], "design/feature-parity.md")

    def test_every_checklist_capability_has_an_executable_matrix_row(self) -> None:
        rows = build_matrix()
        checklist_count = sum(
            1
            for line in CHECKLIST_PATH.read_text(encoding="utf-8").splitlines()
            if CHECKBOX.match(line)
        )
        self.assertGreater(checklist_count, 0)
        self.assertEqual(len(rows), checklist_count)
        self.assertEqual(len({row.row_id for row in rows}), len(rows))
        for row in rows:
            with self.subTest(row=row.row_id):
                self.assertTrue(row.owners)
                self.assertTrue(row.test)
                self.assertIn(row.disposition, {"preserve", "improve", "defer", "drop"})

    def test_no_capability_is_deferred_or_dropped_without_an_explicit_override(self) -> None:
        rows = build_matrix()
        exceptions = [row for row in rows if row.disposition in {"defer", "drop"}]
        self.assertEqual(exceptions, [])


if __name__ == "__main__":
    unittest.main()
