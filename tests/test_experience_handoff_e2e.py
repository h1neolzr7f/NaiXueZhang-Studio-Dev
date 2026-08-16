from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from capability.delegation import DelegationStore
from capability.gateway import CapabilityGateway
from experience.handoff_product import consume_product_handoff, create_product_handoff
from experience.projector import project_snapshot
from experience.events import make_event


class ExperienceHandoffE2ETests(unittest.TestCase):
    def test_acquire_selection_handoff_to_studio_transform(self) -> None:
        store = DelegationStore()
        gateway = CapabilityGateway(store)
        with tempfile.TemporaryDirectory() as raw:
            path = Path(raw) / "handoffs.json"
            with patch("experience.handoff_product.STORE_PATH", path):
                selection = [
                    {"provider": "synthetic", "remote_id": "night-1"},
                    {"provider": "synthetic", "remote_id": "night-2"},
                ]
                search = make_event(
                    "provider.results",
                    source="acquire",
                    subject="search-1",
                    agent_id="tomori",
                    capability_id="provider.search",
                    payload={"count": 2},
                    progress_current=2,
                    progress_total=2,
                    progress_basis="exact",
                )
                snapshot = project_snapshot(
                    butler_tasks=[],
                    generation_job=None,
                    messages=[],
                    companion_events=[],
                    extra_events=[search],
                    revision=4,
                )
                self.assertEqual(snapshot.events[0].type, "provider.results")
                handoff = create_product_handoff(
                    from_persona="acquire",
                    to_persona="studio",
                    user_intent="找夜景素材后换成这个角色",
                    selection=selection,
                    capability_scope=["transform.character_replace"],
                    limits={"quantity": 2},
                    provenance={"from_event": search.event_id},
                    store=store,
                )
                self.assertEqual(len(handoff["selection"]), 2)
                self.assertEqual(handoff["to_persona"], "studio")
                result = consume_product_handoff(
                    handoff["id"],
                    actor_persona="studio",
                    capability_id="transform.character_replace",
                    delegation_token=handoff["delegation_token"],
                    gateway=gateway,
                )
                self.assertTrue(result["ok"])
                self.assertIn(result["decision"], {"ALLOW", "CONFIRM"})
                library = CapabilityGateway().decide("studio", "library.search")
                self.assertEqual(library.decision, "ALLOW")


if __name__ == "__main__":
    unittest.main()
