from __future__ import annotations

import os
import socket
import threading
import time
import unittest
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def _free_port() -> int:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def _boxes_overlap(left: dict, right: dict) -> bool:
    return not (
        left["x"] + left["width"] <= right["x"]
        or right["x"] + right["width"] <= left["x"]
        or left["y"] + left["height"] <= right["y"]
        or right["y"] + right["height"] <= left["y"]
    )


class ExperiencePlaywrightTests(unittest.TestCase):
    @unittest.skipUnless(os.environ.get("EXPERIENCE_PLAYWRIGHT") == "1", "optional visual loop")
    def test_shell_matches_specialist_workspace_layout(self) -> None:
        import uvicorn

        import server
        from playwright.sync_api import sync_playwright

        class _Server(uvicorn.Server):
            def install_signal_handlers(self) -> None:
                return

        port = _free_port()
        config = uvicorn.Config(server.app, host="127.0.0.1", port=port, log_level="warning")
        http = _Server(config)
        thread = threading.Thread(target=http.run, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{port}"
        deadline = time.time() + 20
        while time.time() < deadline:
            try:
                urlopen(base + "/", timeout=1).read(64)
                break
            except (URLError, OSError):
                time.sleep(0.2)
        else:
            self.fail("experience visual server did not start")

        out = ROOT / ".tmp" / "experience-visual" / "round4"
        out.mkdir(parents=True, exist_ok=True)
        try:
            with sync_playwright() as playwright:
                try:
                    browser = playwright.chromium.launch(channel="msedge")
                except Exception:
                    browser = playwright.chromium.launch()
                page = browser.new_page(viewport={"width": 1440, "height": 900})
                page.add_init_script("window.localStorage.removeItem('nxzExperienceAgentOff')")
                page.goto(base + "/desk", wait_until="domcontentloaded")
                page.wait_for_selector("#experienceShell", timeout=8000)
                page.wait_for_selector(".ex-agent-card", timeout=8000)
                self.assertEqual(page.locator(".ex-agent-card").count(), 4)
                self.assertGreaterEqual(page.locator(".ex-nav a").count(), 8)
                notice = page.locator("#responsibilityNotice")
                try:
                    notice.wait_for(state="visible", timeout=4000)
                except Exception:
                    pass
                if notice.count() and notice.is_visible():
                    shell_box = page.locator(".ex-agent").bounding_box()
                    notice_box = notice.bounding_box()
                    if shell_box and notice_box:
                        self.assertFalse(_boxes_overlap(shell_box, notice_box))
                    page.screenshot(path=str(out / "desk-first-run.png"), full_page=False)
                    notice.locator("[data-acknowledge]").click()
                    page.wait_for_selector("#responsibilityNotice", state="detached", timeout=8000)
                page.screenshot(path=str(out / "desk.png"), full_page=False)

                page.goto(base + "/?workspace=acquire", wait_until="domcontentloaded")
                page.wait_for_selector("#experienceShell", timeout=8000)
                page.wait_for_timeout(600)
                page.screenshot(path=str(out / "acquire.png"), full_page=False)

                page.goto(base + "/", wait_until="domcontentloaded")
                page.wait_for_selector("#experienceShell", timeout=8000)
                page.screenshot(path=str(out / "library.png"), full_page=False)

                page.goto(base + "/studio", wait_until="domcontentloaded")
                page.wait_for_selector("#experienceShell", timeout=8000)
                page.screenshot(path=str(out / "studio.png"), full_page=False)

                page.goto(base + "/discover", wait_until="domcontentloaded")
                page.wait_for_selector("[data-pixiv-live]", timeout=8000)
                page.screenshot(path=str(out / "discover.png"), full_page=False)

                page.goto(base + "/library", wait_until="domcontentloaded")
                page.wait_for_selector("[data-grid]", timeout=8000)
                page.wait_for_selector("[data-detail]", timeout=8000)
                page.screenshot(path=str(out / "library-desk.png"), full_page=False)

                page.goto(base + "/generate", wait_until="domcontentloaded")
                page.wait_for_selector("[data-start]", timeout=8000)
                page.wait_for_selector("[data-results]", timeout=8000)
                page.screenshot(path=str(out / "generate-desk.png"), full_page=False)

                page.goto(base + "/butler", wait_until="domcontentloaded")
                page.wait_for_timeout(800)
                self.assertEqual(page.locator("#experienceShell").count(), 0)
                page.screenshot(path=str(out / "butler-classic.png"), full_page=False)

                page.goto(base + "/desk", wait_until="domcontentloaded")
                page.wait_for_selector("[data-agent-off]", timeout=8000)
                page.locator("[data-agent-off]").click()
                page.wait_for_selector("#experienceShell", state="detached", timeout=8000)
                page.screenshot(path=str(out / "desk-agent-off.png"), full_page=False)
                browser.close()
        finally:
            http.should_exit = True


if __name__ == "__main__":
    unittest.main()
