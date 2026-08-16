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

    def test_online_workspace_query_opens_acquire_surface(self) -> None:
        js = (ROOT / "web" / "online-discover.js").read_text(encoding="utf-8")
        self.assertIn('params.get("workspace") === "acquire"', js)

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


if __name__ == "__main__":
    unittest.main()
