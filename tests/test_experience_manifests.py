from __future__ import annotations

import unittest

from capability.gateway import CapabilityGateway
from experience.character_state import map_event_to_character_state, situation_for_state, situation_from_task
from experience.manifests import list_manifests, load_manifest, manifest_cannot_self_grant


class ExperienceManifestTests(unittest.TestCase):
    def test_four_visible_specialists_are_distinct(self) -> None:
        visible = list_manifests()
        self.assertEqual([item.short_name for item in visible], ["采集", "图库", "生成", "客服"])
        self.assertEqual(visible[-1].persona_id, "service")
        names = {item.display_name for item in visible}
        self.assertEqual(len(names), 4)
        hrefs = {item.workspace_href for item in visible}
        self.assertGreaterEqual(len(hrefs), 3)

    def test_manifest_claims_are_not_authority(self) -> None:
        acquire = load_manifest("acquire")
        self.assertIn("provider.search", acquire.primary_capabilities)
        self.assertTrue(manifest_cannot_self_grant("acquire", "nai.generate_paid"))
        self.assertTrue(manifest_cannot_self_grant("service", "library.delete"))
        mutated = acquire.to_dict()
        mutated["primary_capabilities"].append("nai.generate_paid")
        decision = CapabilityGateway().decide("acquire", "nai.generate_paid")
        self.assertEqual(decision.decision, "DENY")
        self.assertNotIn("nai.generate_paid", load_manifest("acquire").primary_capabilities)

    def test_orchestrator_is_hidden_and_cannot_execute(self) -> None:
        hidden = load_manifest("orchestrator")
        self.assertFalse(hidden.visible)
        self.assertTrue(manifest_cannot_self_grant("orchestrator", "library.search"))

    def test_character_state_comes_from_events_not_play_expression(self) -> None:
        self.assertEqual(map_event_to_character_state("generation.running"), "generating")
        self.assertEqual(situation_for_state("generating"), "generate")
        self.assertEqual(
            situation_from_task({"status": "running", "kind": "studio_generate", "phase": "work"}),
            "generate",
        )
        self.assertEqual(
            situation_from_task({"status": "awaiting_confirmation", "phase": "authorization"}),
            "ready",
        )


if __name__ == "__main__":
    unittest.main()
