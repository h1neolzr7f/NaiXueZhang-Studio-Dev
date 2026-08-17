from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import acquire_bookmark
from routes.acquire_quick import parse_acquire_url
from tests.asgi_client import TestClient


class ParseAcquireUrlTests(unittest.TestCase):
    def test_pixiv_routes_to_crawler_guidance(self):
        # 产品决策：Pixiv 不做网页单采，任何 pixiv.net 页面都引导去爬虫。
        for url in (
            "https://www.pixiv.net/artworks/12345678",
            "https://www.pixiv.net/en/artworks/12345678",
            "https://pixiv.net/ranking.php",
        ):
            target = parse_acquire_url(url)
            self.assertEqual(target, {"site": "pixiv-crawler"})

    def test_aitag_work(self):
        target = parse_acquire_url("https://aitag.win/i/987654")
        self.assertEqual(target, {"site": "aitag", "work_id": "987654"})

    def test_tagcloud_entry_from_query_or_hash(self):
        target = parse_acquire_url("https://novelai.quicktagcloud.com/?codex=suozhang&entry=suozhang-1667")
        self.assertEqual(target["site"], "tagcloud")
        self.assertEqual(target["codex_id"], "suozhang")
        self.assertEqual(target["entry_id"], "suozhang-1667")
        via_hash = parse_acquire_url("https://novelai.quicktagcloud.com/?codex=suozhang#entry=suozhang-1667")
        self.assertEqual(via_hash["entry_id"], "suozhang-1667")
        with self.assertRaises(ValueError):
            parse_acquire_url("https://novelai.quicktagcloud.com/")

    def test_unsupported_host_and_bad_url(self):
        with self.assertRaises(ValueError):
            parse_acquire_url("https://example.com/artworks/1")
        with self.assertRaises(ValueError):
            parse_acquire_url("not-a-url")


class BookmarkTokenTests(unittest.TestCase):
    def test_token_created_once_and_verified(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(acquire_bookmark, "TOKEN_PATH", Path(tmp) / "bookmark.json"):
                first = acquire_bookmark.get_or_create_token()
                second = acquire_bookmark.get_or_create_token()
                self.assertEqual(first, second)
                self.assertTrue(acquire_bookmark.verify_token(first))
                self.assertFalse(acquire_bookmark.verify_token("wrong"))
                self.assertFalse(acquire_bookmark.verify_token(""))

    def test_rotate_invalidates_old_token(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(acquire_bookmark, "TOKEN_PATH", Path(tmp) / "bookmark.json"):
                old = acquire_bookmark.get_or_create_token()
                new = acquire_bookmark.rotate_token()
                self.assertNotEqual(old, new)
                self.assertFalse(acquire_bookmark.verify_token(old))
                self.assertTrue(acquire_bookmark.verify_token(new))


class QuickImportRouteTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.token_patch = patch.object(
            acquire_bookmark, "TOKEN_PATH", Path(self.tmp.name) / "bookmark.json"
        )
        self.token_patch.start()

    def tearDown(self):
        self.token_patch.stop()
        self.tmp.cleanup()

    def _client(self):
        import server

        return TestClient(server.app)

    def test_bookmark_endpoint_returns_token(self):
        client = self._client()
        resp = client.get("/api/acquire/bookmark")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["token"])

    def test_post_without_any_token_is_rejected_by_result_page(self):
        client = self._client()
        resp = client.post("/acquire/quick-import", data={"url": "https://www.pixiv.net/artworks/1"})
        self.assertEqual(resp.status_code, 200)
        self.assertIn("令牌无效", resp.text)

    def test_quick_import_is_the_only_session_token_exemption(self):
        import server

        self.assertIn("/acquire/quick-import", server._SESSION_TOKEN_EXEMPT_PATHS)
        self.assertEqual(len(server._SESSION_TOKEN_EXEMPT_PATHS), 1)

    def test_guidance_for_unsupported_url(self):
        client = self._client()
        token = acquire_bookmark.get_or_create_token()
        resp = client.post("/acquire/quick-import", data={"url": "https://example.com/x", "token": token})
        self.assertEqual(resp.status_code, 200)
        self.assertIn("不支持", resp.text)

    def test_pixiv_quick_import_shows_crawler_guidance(self):
        client = self._client()
        token = acquire_bookmark.get_or_create_token()
        resp = client.post(
            "/acquire/quick-import",
            data={"url": "https://www.pixiv.net/artworks/123", "token": token},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn("爬虫", resp.text)
        self.assertIn("/discover", resp.text)

    def test_aitag_quick_import_is_two_step_with_chooser(self):
        client = self._client()
        token = acquire_bookmark.get_or_create_token()
        with patch("routes.acquire_quick._aitag_chooser_page") as mock_chooser:
            from fastapi.responses import HTMLResponse

            mock_chooser.return_value = HTMLResponse("<html><body>选择入库内容</body></html>")
            first = client.post(
                "/acquire/quick-import",
                data={"url": "https://aitag.win/i/987", "token": token},
            )
        self.assertEqual(first.status_code, 200)
        self.assertIn("选择入库内容", first.text)
        mock_chooser.assert_called_once()

    def test_aitag_quick_import_delegates_to_existing_route(self):
        client = self._client()
        token = acquire_bookmark.get_or_create_token()
        with patch("routes.aitag.api_aitag_import") as mock_import:
            mock_import.return_value = {"ok": True, "work_id": "987", "item": {"label": "角色卡"}}
            resp = client.post(
                "/acquire/quick-import",
                data={
                    "url": "https://aitag.win/i/987",
                    "token": token,
                    "confirm": "1",
                    "image_index": "2",
                    "candidate": "cand-1|2|3",
                },
            )
        self.assertEqual(resp.status_code, 200)
        self.assertIn("标签资产", resp.text)
        mock_import.assert_called_once()
        payload = mock_import.call_args[0][0]
        self.assertEqual(payload["work_id"], "987")
        self.assertEqual(payload["image_index"], 2)
        self.assertEqual(payload["slot_index"], 3)
        self.assertEqual(payload["candidate_id"], "cand-1")

    def test_tagcloud_quick_import_collects_once(self):
        client = self._client()
        token = acquire_bookmark.get_or_create_token()
        entry = {
            "id": "composition_style_0001",
            "codex_id": "composition_style",
            "codex_title": "构图风格",
            "title": "运河小船",
            "tags": "1.3::medium shot::",
            "thumb": "https://assets.quicktagcloud.com/images/x.jpg",
        }

        class _Client:
            def get_entry(self, codex_id, entry_id):
                return dict(entry)

        with patch("routes.tagcloud.get_tagcloud_client", return_value=_Client()), patch.object(
            __import__("tagcloud_collection"),
            "COLLECTION_PATH",
            Path(self.tmp.name) / "collection.json",
        ):
            resp = client.post(
                "/acquire/quick-import",
                data={"url": "https://novelai.quicktagcloud.com/?codex=composition_style&entry=composition_style_0001", "token": token},
            )
            self.assertEqual(resp.status_code, 200)
            self.assertIn("提示词库", resp.text)
            again = client.post(
                "/acquire/quick-import",
                data={"url": "https://novelai.quicktagcloud.com/?codex=composition_style&entry=composition_style_0001", "token": token},
            )
            self.assertIn("已在提示词库", again.text)


if __name__ == "__main__":
    unittest.main()
