from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from butler import companion_state
from experience.memory import forget_layered_memory, list_layered_memories, propose_layered_memory
from tests.asgi_client import TestClient


class ExperienceMemoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "companion_state.json"
        self.patcher = patch.object(companion_state, "STATE_PATH", self.path)
        self.patcher.start()

    def tearDown(self) -> None:
        self.patcher.stop()
        self.temp.cleanup()

    def test_layered_memory_is_user_deletable_and_not_authoritative(self) -> None:
        item = propose_layered_memory(
            "竖图优先",
            agent="tomori",
            layer="specialist",
            scope="preference",
            provenance="user",
        )
        self.assertEqual(item["layer"], "specialist")
        self.assertFalse(item["authoritative"])
        rows = list_layered_memories(layer="specialist")
        self.assertEqual(rows[0]["id"], item["id"])
        forgotten = forget_layered_memory(item["id"])
        self.assertEqual(forgotten["status"], "forgotten")
        self.assertEqual(list_layered_memories(layer="specialist"), [])

    def test_memory_forget_route_uses_existing_companion_store(self) -> None:
        import server

        item = propose_layered_memory("少用高饱和", layer="user_preference", scope="preference")
        client = TestClient(server.app)
        listed = client.get("/api/experience/memories")
        self.assertEqual(listed.status_code, 200)
        self.assertTrue(any(row.get("id") == item["id"] for row in listed.json()["memories"]))
        forgotten = client.post(f"/api/experience/memories/{item['id']}/forget", json={})
        self.assertEqual(forgotten.status_code, 200)
        self.assertEqual(forgotten.json()["memory"]["status"], "forgotten")
        self.assertEqual(list_layered_memories(), [])

    def test_unknown_layer_and_authority_scope_are_rejected(self) -> None:
        with self.assertRaises(ValueError):
            propose_layered_memory("x", layer="vector_god")
        with self.assertRaises(ValueError):
            propose_layered_memory("token=secret", scope="token")


if __name__ == "__main__":
    unittest.main()
