from __future__ import annotations

import re
import unittest
from pathlib import Path

from tests.asgi_client import TestClient


ROOT = Path(__file__).resolve().parents[1]


class ExperienceUiTests(unittest.TestCase):
    def test_rail_is_not_a_ninth_primary_nav_item(self) -> None:
        nav = (ROOT / "web" / "shared" / "site-nav.js").read_text(encoding="utf-8")
        primary = nav.split("const NAV_SECONDARY", 1)[0]
        self.assertNotIn("experience", primary)
        self.assertIn("loadExperienceRail", nav)
        self.assertIn("/assets/shared/experience-rail.js?v=", nav)
        self.assertIn('path === "/butler"', nav)
        self.assertEqual(primary.count("href:"), 8)

    def test_rail_uses_api_client_and_supports_agent_off(self) -> None:
        js = (ROOT / "web" / "shared" / "experience-rail.js").read_text(encoding="utf-8")
        css = (ROOT / "web" / "shared" / "experience-rail.css").read_text(encoding="utf-8")
        self.assertIsNone(re.search(r"\bfetch\s*\(", js))
        self.assertIn("window.ApiClient", js)
        self.assertIn("/api/experience/snapshot", js)
        self.assertIn("nxzExperienceAgentOff", js)
        self.assertIn("experience-agent-off", js)
        self.assertIn("采集", js + (ROOT / "experience" / "manifests.py").read_text(encoding="utf-8"))
        self.assertIn("prefers-reduced-motion", css)
        self.assertIn("ExperienceCharacter", js)
        self.assertIn("situationFromTask", js)
        self.assertIn("aria-current", js)
        self.assertIn("workspace_label", js)
        self.assertIn("experience-shell-on", js)
        self.assertIn("experienceShell", js)
        self.assertIn("/desk", js)
        self.assertIn("工作台", js)
        self.assertIn("experience-shell-on .responsibility-notice", css)
        self.assertIn("experience-shell-on", css)
        self.assertIn('document.body.classList.remove("experience-shell-on"', js)

    def test_online_workspace_query_opens_acquire_surface(self) -> None:
        js = (ROOT / "web" / "online-discover.js").read_text(encoding="utf-8")
        self.assertIn('params.get("workspace") === "acquire"', js)

    def test_discover_page_hosts_existing_pixiv_crawler(self) -> None:
        html = (ROOT / "web" / "discover.html").read_text(encoding="utf-8")
        js = (ROOT / "web" / "discover.js").read_text(encoding="utf-8")
        self.assertIn('id="pixivNaiPanel"', html)
        self.assertIn('id="pixivStartWatch"', html)
        self.assertIn("/assets/pixiv-intake-control.js?v=", html)
        self.assertIn("/api/crawler/status", js)
        self.assertNotIn("/api/crawler/start", js)
        self.assertIn("只采集 Pixiv 和 AITag", html)
        self.assertIn("ex-howto", html)
        self.assertIn("先试跑（不入库）", html)
        self.assertIn("window.confirm", js)
        self.assertIn("/api/nai/aitag/search", js)
        self.assertIn("/api/nai/aitag/import", js)
        self.assertNotIn("/api/online/search", js)
        self.assertNotIn("aitag.win", html)
        self.assertLess(html.find("pixiv-intake-control.js"), html.find("discover.js"))

        import server

        client = TestClient(server.app)
        page = client.get("/discover")
        self.assertEqual(page.status_code, 200)
        self.assertIn("data-site=\"aitag\"", page.text)
        self.assertIn("pixivNaiPanel", page.text)

    def test_discover_page_keeps_progress_and_aitag_detail_on_page(self) -> None:
        html = (ROOT / "web" / "discover.html").read_text(encoding="utf-8")
        js = (ROOT / "web" / "discover.js").read_text(encoding="utf-8")
        self.assertIn('data-pixiv-live', html)
        self.assertIn('data-pixiv-live-process', html)
        self.assertIn('data-aitag-view="favorites"', html)
        self.assertIn('data-aitag-detail', html)
        self.assertIn('data-aitag-more', html)
        self.assertIn("/api/crawler/pixiv/report", js)
        self.assertIn("/api/nai/aitag/favorites/works", js)
        self.assertIn("/api/nai/aitag/work/", js)
        self.assertIn("/api/nai/aitag/favorites/", js)
        self.assertNotIn("/api/online/search", js)
        self.assertNotIn("aitag.win", html + js)

    def test_library_page_uses_real_gallery_apis(self) -> None:
        html = (ROOT / "web" / "library.html").read_text(encoding="utf-8")
        js = (ROOT / "web" / "library-desk.js").read_text(encoding="utf-8")
        self.assertIn('data-gallery', html)
        self.assertIn('data-view="favorites"', html)
        self.assertIn('data-view="queue"', html)
        self.assertIn('data-view="dupes"', html)
        self.assertIn('data-detail', html)
        self.assertIn('data-more', html)
        self.assertIn("/api/galleries", js)
        self.assertIn("/api/ai_works_search", js)
        self.assertIn("/api/favorites/works", js)
        self.assertIn("/api/queue/works", js)
        self.assertIn("/api/work/", js)
        self.assertIn("/similar?work_id=", js)
        self.assertIn("/duplicates?kind=", js)
        self.assertIn("/index/status", js)
        self.assertIn("/api/favorites/", js)
        self.assertIn("/api/queue/", js)
        self.assertNotIn("/api/online/", js)

        import server

        client = TestClient(server.app)
        page = client.get("/library")
        self.assertEqual(page.status_code, 200)
        self.assertIn('data-page="library"', page.text)

    def test_generate_desk_hands_off_without_calling_generate(self) -> None:
        html = (ROOT / "web" / "generate.html").read_text(encoding="utf-8")
        js = (ROOT / "web" / "generate-desk.js").read_text(encoding="utf-8")
        self.assertIn('data-prompt', html)
        self.assertIn('data-start', html)
        self.assertIn('data-results', html)
        self.assertIn('data-job', html)
        self.assertIn('data-studio-queue', html)
        # The desk must hand drafts into the real Studio workbench, never call
        # the paid generation endpoint itself.
        self.assertNotIn("/api/nai/generate", js)
        self.assertIn("aitag.studio.draft.v1", js)
        self.assertIn("/api/capability/decide", js)
        self.assertIn("/api/studio/optimize", js)
        self.assertIn("/api/studio/sanitize", js)
        self.assertIn("/api/studio/queue", js)
        self.assertIn("/api/nai/jobs", js)
        self.assertIn("/api/generated", js)

        import server

        client = TestClient(server.app)
        page = client.get("/generate")
        self.assertEqual(page.status_code, 200)
        self.assertIn('data-page="generate"', page.text)

    def test_http_snapshot_and_manifests(self) -> None:
        import server

        client = TestClient(server.app)
        snapshot = client.get("/api/experience/snapshot")
        self.assertEqual(snapshot.status_code, 200)
        body = snapshot.json()
        self.assertTrue(body["ok"])
        self.assertEqual(len(body["specialists"]), 4)
        self.assertIn("conversation", body)
        self.assertFalse(body["conversation"]["authoritative"])
        self.assertTrue(body["workflows"]["authoritative"])
        manifests = client.get("/api/experience/manifests")
        self.assertEqual(manifests.status_code, 200)
        names = [item["display_name"] for item in manifests.json()["manifests"]]
        self.assertEqual(names, ["采集助手", "图库助手", "生成助手", "客服助手"])
        replay = client.post("/api/experience/replay", json={})
        self.assertEqual(replay.status_code, 200)
        self.assertFalse(replay.json()["executed"])
        paid = client.post(
            "/api/capability/decide",
            json={"persona_id": "acquire", "capability_id": "nai.generate_paid"},
        )
        self.assertEqual(paid.json()["decision"], "DENY")
        desk = client.get("/desk")
        self.assertEqual(desk.status_code, 200)
        self.assertIn("data-page=\"desk\"", desk.text)
        self.assertIn("创作工作流", desk.text)


if __name__ == "__main__":
    unittest.main()
