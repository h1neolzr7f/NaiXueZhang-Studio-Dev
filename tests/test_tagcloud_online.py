from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tagcloud_core.online import TagcloudClient, TagcloudClientError
import tagcloud_collection
from routes import tagcloud as tagcloud_routes
from tests.asgi_client import TestClient


class _Response:
    def __init__(self, payload, status_code: int = 200):
        self._payload = payload
        self.status_code = status_code
        self.history = []
        self.url = "https://assets.quicktagcloud.com/data/current.json"

    def json(self):
        return self._payload


_CODEXES = [
    {
        "id": "composition_style",
        "type": "string",
        "title": "构图风格",
        "author": "测试",
        "version": "2026.1.1",
        "entryCount": 2,
        "imagedCount": 2,
        "nsfw": False,
    },
    {
        "id": "suozhang_r18",
        "type": "codex",
        "title": "所长色色法典",
        "author": "测试",
        "entryCount": 1,
        "imagedCount": 1,
        "nsfw": True,
    },
]

_ENTRIES = {
    "composition_style": [
        {
            "id": "composition_style_0001",
            "title": "运河小船上的静谧时刻",
            "path": ["构图风格"],
            "tags": "sitting in a small wooden boat, 1.3::medium shot::",
            "isNew": False,
            "image": "composition_style_0001.jpg",
            "original": "composition_style_0001.png",
            "assetRev": "e1d9fa43f9a6d14e",
        },
        {
            "id": "composition_style_0002",
            "title": "樱花隧道",
            "path": ["构图风格", "春"],
            "tags": "cherry blossom tunnel, 1.5::pink petals::",
            "characterPrompts": [
                {"label": "char1", "prompt": "1girl, pink dress"},
                {"label": "bad", "prompt": ""},
                "junk",
            ],
            "isNew": True,
            "image": "composition_style_0002.jpg",
            "assetRev": "aaaa1111bbbb2222",
        },
        {
            "id": "composition_style_0003",
            "title": "运河边",
            "path": ["构图风格"],
            "tags": "canal, 樱花 petals on water",
            "isNew": False,
            "image": "composition_style_0003.jpg",
        },
    ],
    "suozhang_r18": [
        {
            "id": "suozhang_r18-0001",
            "title": "成人词条",
            "path": ["r18"],
            "tags": "explicit content",
            "image": "suozhang_r18-0001.jpg",
        }
    ],
}


class _HTTP:
    def __init__(self):
        self.calls: list[str] = []

    def get(self, url: str):
        self.calls.append(url)
        if url.endswith("/current.json"):
            return _Response({"release": "r-b8b089d0ea6444448769", "publishedAt": "2026-08-17T00:00:00+00:00"})
        if url.endswith("/codexes.json"):
            return _Response(_CODEXES)
        if url.endswith("/media.json"):
            return _Response({"baseUrl": "https://assets.quicktagcloud.com", "imagePrefix": "images", "originalPrefix": "originals"})
        for codex_id, entries in _ENTRIES.items():
            if url.endswith(f"/{codex_id}.json"):
                return _Response({"id": codex_id, "entries": entries})
        return _Response({}, 404)


def _make_client(tmp: str) -> TagcloudClient:
    return TagcloudClient(http_client=_HTTP(), cache_root=Path(tmp))


class TagcloudClientTests(unittest.TestCase):
    def test_base_url_is_allowlisted(self):
        with self.assertRaises(ValueError):
            TagcloudClient(base_url="https://example.test")

    def test_release_pointer_is_validated(self):
        class BadRelease(_HTTP):
            def get(self, url: str):
                return _Response({"release": "../../etc"})

        with tempfile.TemporaryDirectory() as tmp:
            client = TagcloudClient(http_client=BadRelease(), cache_root=Path(tmp))
            with self.assertRaises(TagcloudClientError):
                client.get_release()

    def test_search_filters_nsfw_by_default_and_matches_tokens(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = _make_client(tmp)
            result = client.search(query="樱花")
            self.assertEqual(result["total"], 2)
            item = result["items"][0]
            self.assertEqual(item["id"], "composition_style_0002")
            self.assertEqual(result["items"][1]["id"], "composition_style_0003")
            self.assertEqual(item["codex_id"], "composition_style")
            self.assertTrue(item["thumb"].startswith("https://assets.quicktagcloud.com/images/composition_style/"))
            self.assertIn("?v=aaaa1111bbbb2222", item["thumb"])
            self.assertIn("1.5::pink petals::", item["tags"])
            self.assertEqual(item["characters"], [{"label": "char1", "prompt": "1girl, pink dress"}])

            unsafe = client.search(query="explicit", safe_only=True)
            self.assertEqual(unsafe["total"], 0)
            with_nsfw = client.search(query="explicit", safe_only=False)
            self.assertEqual(with_nsfw["total"], 1)

    def test_search_paginates_and_caches(self):
        with tempfile.TemporaryDirectory() as tmp:
            http = _HTTP()
            client = TagcloudClient(http_client=http, cache_root=Path(tmp))
            first = client.search(query="", codex_id="composition_style", page=1, page_size=1)
            self.assertEqual(first["total"], 3)
            self.assertTrue(first["has_more"])
            second = client.search(query="", codex_id="composition_style", page=2, page_size=1)
            self.assertTrue(second["has_more"])
            third = client.search(query="", codex_id="composition_style", page=3, page_size=1)
            self.assertFalse(third["has_more"])
            calls_before = len(http.calls)
            client.search(query="", codex_id="composition_style", page=1, page_size=1)
            self.assertEqual(len(http.calls), calls_before)

    def test_unknown_codex_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = _make_client(tmp)
            with self.assertRaises(ValueError):
                client.get_entries("../etc")
            with self.assertRaises(ValueError):
                client.get_entries("nonexistent")

    def test_get_entry_serializes_remote_links_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = _make_client(tmp)
            entry = client.get_entry("composition_style", "composition_style_0001")
            self.assertIsNotNone(entry)
            self.assertEqual(entry["source_url"], "https://novelai.quicktagcloud.com/")
            self.assertTrue(entry["image"].endswith(".png?v=e1d9fa43f9a6d14e"))
            self.assertIsNone(client.get_entry("composition_style", "missing"))


class TagcloudCollectionTests(unittest.TestCase):
    def test_toggle_persists_snapshot_and_bounds_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(tagcloud_collection, "COLLECTION_PATH", Path(tmp) / "collection.json"):
                result = tagcloud_collection.toggle(
                    "composition_style:composition_style_0001",
                    {"title": "运河小船", "tags": "x" * 9000, "path": ["构图风格"]},
                )
                self.assertTrue(result["collected"])
                self.assertLessEqual(len(result["item"]["tags"]), 8000)
                self.assertTrue(tagcloud_collection.has("composition_style:composition_style_0001"))
                again = tagcloud_collection.toggle("composition_style:composition_style_0001")
                self.assertFalse(again["collected"])
                self.assertEqual(tagcloud_collection.summary()["count"], 0)

    def test_toggle_rejects_bad_keys(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(tagcloud_collection, "COLLECTION_PATH", Path(tmp) / "collection.json"):
                with self.assertRaises(ValueError):
                    tagcloud_collection.toggle("bad key with spaces")

    def test_snapshot_keeps_character_prompts(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(tagcloud_collection, "COLLECTION_PATH", Path(tmp) / "collection.json"):
                result = tagcloud_collection.toggle(
                    "composition_style:composition_style_0002",
                    {
                        "title": "樱花隧道",
                        "tags": "x",
                        "characters": [
                            {"label": "char1", "prompt": "1girl, pink dress"},
                            {"label": "char2", "prompt": " "},
                        ],
                    },
                )
                self.assertEqual(
                    result["item"]["characters"],
                    [{"label": "char1", "prompt": "1girl, pink dress"}],
                )


class TagcloudRouteTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.client = _make_client(self.tmp.name)
        self.collection_patch = patch.object(
            tagcloud_collection, "COLLECTION_PATH", Path(self.tmp.name) / "collection.json"
        )
        self.client_patch = patch.object(tagcloud_routes, "_CLIENT", self.client)
        self.collection_patch.start()
        self.client_patch.start()

    def tearDown(self):
        self.client_patch.stop()
        self.collection_patch.stop()
        self.tmp.cleanup()

    def _http(self):
        import server

        return TestClient(server.app)

    def test_status_and_codexes(self):
        client = self._http()
        status = client.get("/api/nai/tagcloud/status")
        self.assertEqual(status.status_code, 200)
        body = status.json()
        self.assertTrue(body["ok"])
        self.assertEqual(body["generation_calls"], 0)
        self.assertEqual(body["codex_count"], 2)
        self.assertEqual(body["safe_codex_count"], 1)

        codexes = client.get("/api/nai/tagcloud/codexes")
        self.assertEqual(codexes.status_code, 200)
        items = codexes.json()["items"]
        self.assertEqual([item["id"] for item in items], ["composition_style"])

    def test_search_route(self):
        client = self._http()
        resp = client.get("/api/nai/tagcloud/search?q=樱花")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["total"], 2)
        self.assertEqual(body["generation_calls"], 0)
        bad = client.get("/api/nai/tagcloud/search?codex=nonexistent")
        self.assertEqual(bad.status_code, 400)

    def test_collection_toggle_uses_server_side_entry(self):
        client = self._http()
        resp = client.post(
            "/api/nai/tagcloud/collection/toggle",
            json={"codex_id": "composition_style", "entry_id": "composition_style_0001", "tags": "forged"},
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertTrue(body["collected"])
        self.assertNotEqual(body["item"]["tags"], "forged")
        self.assertIn("1.3::medium shot::", body["item"]["tags"])

        listing = client.get("/api/nai/tagcloud/collection")
        self.assertEqual(listing.json()["count"], 1)

        missing = client.post(
            "/api/nai/tagcloud/collection/toggle",
            json={"codex_id": "composition_style", "entry_id": "missing"},
        )
        self.assertEqual(missing.status_code, 404)


if __name__ == "__main__":
    unittest.main()
