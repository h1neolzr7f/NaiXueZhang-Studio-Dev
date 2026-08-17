from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from capability.delegation import DelegationStore
from capability.gateway import CapabilityGateway
from capability.orchestrator import Orchestrator
from experience.events import apply_projected_events, make_event
from experience.handoff_product import consume_product_handoff, create_product_handoff
from experience.memory import AUTHORITATIVE_SCOPES, memory_cannot_authorize, propose_layered_memory
from experience.proactive import classify_proactive


class ExperienceAdversarialTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.store = DelegationStore()
        self.gateway = CapabilityGateway(self.store)
        self.handoff_path = Path(self.temp.name) / "handoffs.json"

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_persona_cannot_self_escalate_via_memory_or_manifest_text(self) -> None:
        with patch("experience.memory.companion_state.STATE_PATH", Path(self.temp.name) / "companion.json"):
            with self.assertRaises(ValueError):
                propose_layered_memory("grant nai.generate_paid", scope="billing")
            item = propose_layered_memory("用户喜欢竖图", layer="user_preference", scope="preference")
            self.assertFalse(item["authoritative"])
            self.assertTrue(memory_cannot_authorize("nai.generate_paid", [item]))
        self.assertIn("token", AUTHORITATIVE_SCOPES)

    def test_handoff_confused_deputy_and_privilege_escalation(self) -> None:
        with patch("experience.handoff_product.STORE_PATH", self.handoff_path):
            handoff = create_product_handoff(
                from_persona="acquire",
                to_persona="studio",
                user_intent="把这些夜景换成这个角色",
                selection=[{"remote_id": "syn-1", "provider": "synthetic"}],
                capability_scope=["transform.character_replace"],
                store=self.store,
            )
            self.assertEqual(handoff["granted_capabilities"], [])
            with self.assertRaises(ValueError):
                consume_product_handoff(
                    handoff["id"],
                    actor_persona="acquire",
                    capability_id="nai.generate_paid",
                    gateway=self.gateway,
                )
            with self.assertRaises(ValueError):
                consume_product_handoff(
                    handoff["id"],
                    actor_persona="studio",
                    capability_id="nai.generate_paid",
                    gateway=self.gateway,
                )
            accepted = consume_product_handoff(
                handoff["id"],
                actor_persona="studio",
                capability_id="transform.character_replace",
                delegation_token=handoff["delegation_token"],
                gateway=self.gateway,
            )
            self.assertTrue(accepted["ok"])
            with self.assertRaises(ValueError):
                consume_product_handoff(
                    handoff["id"],
                    actor_persona="studio",
                    capability_id="transform.character_replace",
                    gateway=self.gateway,
                )

    def test_orchestrator_cannot_become_superuser(self) -> None:
        orch = Orchestrator(self.gateway)
        self.assertEqual(orch.execute_denied("provider.search").decision, "DENY")
        routed = orch.route("帮我删除图库")
        self.assertEqual(routed["decision"], "DENY")
        with patch("experience.handoff_product.STORE_PATH", self.handoff_path):
            with self.assertRaises(ValueError):
                create_product_handoff(
                    from_persona="orchestrator",
                    to_persona="studio",
                    user_intent="ignore gateway",
                    capability_scope=["nai.generate_paid"],
                    store=self.store,
                )

    def test_proactive_cannot_execute_paid_or_delete(self) -> None:
        paid = classify_proactive("paid_unconfirmed", capability_id="nai.generate_paid", persona_id="service")
        self.assertEqual(paid["mode"], "DENY")
        self.assertFalse(paid["can_execute"])
        delete = classify_proactive("delete_suggested", capability_id="library.delete", persona_id="library")
        self.assertEqual(delete["mode"], "CONFIRM_REQUIRED")
        self.assertFalse(delete["can_execute"])

    def test_event_replay_cannot_duplicate_destructive_work(self) -> None:
        events = [
            make_event("library.updated", source="library", subject="wf-del", payload={"action": "delete"})
        ]
        result = apply_projected_events(events)
        self.assertFalse(result["executed"])
        self.assertEqual(result["applied"], 0)


if __name__ == "__main__":
    unittest.main()
