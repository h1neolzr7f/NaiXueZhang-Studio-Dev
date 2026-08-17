from __future__ import annotations

import unittest

from experience.events import EVENT_TYPES, apply_projected_events, make_event
from experience.projector import project_snapshot


class ExperienceEventPlaneTests(unittest.TestCase):
    def test_generation_progress_is_exact_not_fake(self) -> None:
        snapshot = project_snapshot(
            butler_tasks=[],
            generation_job={
                "task_id": "gen-1",
                "status": "running",
                "progress": {"done": 7, "total": 24},
                "free_eligible": True,
            },
            messages=[],
            companion_events=[],
            revision=3,
        )
        types = [item.type for item in snapshot.events]
        self.assertIn("generation.running", types)
        event = snapshot.events[0]
        self.assertEqual(event.progress_current, 7)
        self.assertEqual(event.progress_total, 24)
        self.assertEqual(event.progress_basis, "exact")
        self.assertTrue(event.replay_safe)
        self.assertEqual(snapshot.active_stage["stage_label"], "生成中")

    def test_estimated_butler_progress_is_labeled(self) -> None:
        snapshot = project_snapshot(
            butler_tasks=[
                {
                    "id": "wf-1",
                    "status": "running",
                    "phase": "work",
                    "kind": "gallery_audit",
                    "agent": "sakiko",
                    "progress": {"done": 1, "total": 4, "eta_basis": "initial_estimate"},
                }
            ],
            generation_job=None,
            messages=[],
            companion_events=[],
            revision=1,
        )
        self.assertEqual(snapshot.events[0].progress_basis, "estimate")
        self.assertEqual(snapshot.events[0].type, "workflow.progress")

    def test_same_snapshot_replays_same_ids_without_executing(self) -> None:
        job = {"task_id": "gen-2", "status": "queued", "progress": {"done": 0, "total": 2}}
        first = project_snapshot(butler_tasks=[], generation_job=job, messages=[], companion_events=[], revision=1)
        second = project_snapshot(butler_tasks=[], generation_job=job, messages=[], companion_events=[], revision=1)
        self.assertEqual([item.event_id for item in first.events], [item.event_id for item in second.events])
        applied = apply_projected_events(first.events)
        self.assertFalse(applied["executed"])
        self.assertEqual(applied["applied"], 0)

    def test_billing_uncertain_is_a_first_class_event(self) -> None:
        snapshot = project_snapshot(
            butler_tasks=[],
            generation_job={"task_id": "gen-3", "status": "unknown", "billing_uncertain": True},
            messages=[],
            companion_events=[],
            revision=8,
        )
        self.assertEqual(snapshot.events[0].type, "generation.billing_uncertain")
        self.assertEqual(snapshot.events[0].severity, "warning")

    def test_explicit_none_job_does_not_pull_live_generation(self) -> None:
        snapshot = project_snapshot(
            butler_tasks=[],
            generation_job=None,
            messages=[],
            companion_events=[],
            extra_events=[make_event("provider.results", source="acquire", subject="search-iso")],
            revision=9,
        )
        self.assertEqual([item.type for item in snapshot.events], ["provider.results"])

    def test_event_catalog_covers_required_families(self) -> None:
        for name in (
            "agent.handoff",
            "workflow.progress",
            "provider.results",
            "asset.materialized",
            "generation.billing_uncertain",
            "authorization.required",
            "library.indexing",
        ):
            self.assertIn(name, EVENT_TYPES)
            event = make_event(name, source="test", subject="x", revision="1")
            self.assertTrue(event.stage_label)


if __name__ == "__main__":
    unittest.main()
