from __future__ import annotations

import os
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ExperiencePlaywrightTests(unittest.TestCase):
    @unittest.skipUnless(os.environ.get("EXPERIENCE_PLAYWRIGHT") == "1", "optional visual loop")
    def test_rail_renders_four_desks(self) -> None:
        from playwright.sync_api import sync_playwright

        from tests.asgi_client import TestClient
        import server

        client = TestClient(server.app)
        html = client.get("/").text
        self.assertIn("site-nav.js", html)
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page(viewport={"width": 1280, "height": 800})
            page.goto("http://127.0.0.1:8805/", wait_until="domcontentloaded")
            page.wait_for_selector("#experienceRail", timeout=8000)
            desks = page.locator(".experience-desk")
            self.assertEqual(desks.count(), 4)
            out = ROOT / ".tmp" / "experience-visual"
            out.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(out / "home-rail.png"), full_page=False)
            browser.close()


if __name__ == "__main__":
    unittest.main()
