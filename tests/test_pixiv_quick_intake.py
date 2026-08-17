from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

import pixiv_quick_intake
from pixiv_quick_intake import quick_import_pixiv_work


def _fake_work() -> SimpleNamespace:
    return SimpleNamespace(work_id=123, title="测试作品", pages=(object(),))


def _receipt(status: str, accepted: int, rejected: int, reason: str = "") -> SimpleNamespace:
    pages = tuple(
        SimpleNamespace(status="rejected", reason=reason) for _ in range(rejected)
    )
    return SimpleNamespace(
        status=status,
        accepted_pages=accepted,
        rejected_pages=rejected,
        pages=pages,
    )


class _FakeSource:
    def __init__(self, work):
        self._work = work

    def fetch_work(self, work_id):
        return self._work

    def download_original(self, url, destination):  # pragma: no cover - never called
        raise AssertionError("tests must not download")


class _FakeIntake:
    def __init__(self, receipt, *args, **kwargs):
        self._receipt = receipt

    def __call__(self, *args, **kwargs):
        return self

    def ingest_work(self, work, download):
        return self._receipt


_UNSET = object()


def _run(receipt, work=_UNSET):
    work = _fake_work() if work is _UNSET else work
    with (
        patch.object(pixiv_quick_intake, "PixivPublicWebSource", lambda **kwargs: _FakeSource(work)),
        patch.object(pixiv_quick_intake, "PixivNAIIntake", _FakeIntake(receipt)),
        patch.object(pixiv_quick_intake, "Database", lambda *args, **kwargs: object()),
    ):
        return quick_import_pixiv_work(123)


class QuickImportMessageTests(unittest.TestCase):
    def test_accepted(self):
        result = _run(_receipt("accepted", 2, 0))
        self.assertTrue(result["ok"])
        self.assertIn("已入库", result["message"])

    def test_updated_means_already_in_library_synced(self):
        result = _run(_receipt("updated", 2, 0))
        self.assertTrue(result["ok"])
        self.assertIn("已在图库", result["message"])

    def test_unchanged_with_pages_means_already_in_library(self):
        result = _run(_receipt("unchanged", 1, 0))
        self.assertTrue(result["ok"])
        self.assertIn("没有重复入库", result["message"])

    def test_unchanged_without_accepted_means_permanently_rejected(self):
        result = _run(_receipt("unchanged", 0, 1, "nai_metadata_missing"))
        self.assertFalse(result["ok"])
        self.assertIn("不再重复下载", result["message"])

    def test_rejected_reports_reason(self):
        result = _run(_receipt("rejected", 0, 1, "nai_metadata_missing"))
        self.assertFalse(result["ok"])
        self.assertIn("nai_metadata_missing", result["message"])

    def test_missing_work(self):
        result = _run(_receipt("rejected", 0, 0), work=None)
        self.assertFalse(result["ok"])
        self.assertIn("没有取到", result["message"])


if __name__ == "__main__":
    unittest.main()
