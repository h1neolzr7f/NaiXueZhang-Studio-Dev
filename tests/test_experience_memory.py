from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from butler import companion_state
from experience.memory import list_layered_memories, propose_layered_memory


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
        forgotten = companion_state.forget_memory(item["id"])
        self.assertEqual(forgotten["status"], "forgotten")
        self.assertEqual(list_layered_memories(layer="specialist"), [])

    def test_unknown_layer_and_authority_scope_are_rejected(self) -> None:
        with self.assertRaises(ValueError):
            propose_layered_memory("x", layer="vector_god")
        with self.assertRaises(ValueError):
            propose_layered_memory("token=secret", scope="token")


if __name__ == "__main__":
    unittest.main()
