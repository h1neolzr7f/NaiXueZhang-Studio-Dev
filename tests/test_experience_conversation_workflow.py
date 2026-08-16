from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from butler.store import ButlerTaskStore
from experience.conversation import assert_conversation_workflow_split, conversation_view, workflow_view
from experience.projector import project_snapshot


class ExperienceConversationWorkflowTests(unittest.TestCase):
    def test_clearing_chat_does_not_delete_tasks(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            store = ButlerTaskStore(Path(raw) / "butler.db")
            try:
                store.create_task(
                    "wf-keep",
                    thread_id="thread-keep",
                    kind="studio_generate",
                    title="frozen generate",
                    input_data={"seed": 1},
                )
                store.add_message("user", "画一张", workflow_id="wf-keep")
                before = store.list_tasks()
                store.clear_messages()
                after_messages = store.list_messages()
                after_tasks = store.list_tasks()
                assert_conversation_workflow_split(
                    messages_after_clear=after_messages,
                    workflows_after_clear=after_tasks,
                    workflows_before_clear=before,
                )
                self.assertEqual(after_tasks[0]["id"], "wf-keep")
                self.assertEqual(after_tasks[0]["kind"], "studio_generate")
            finally:
                store.close()

    def test_snapshot_keeps_conversation_non_authoritative(self) -> None:
        snapshot = project_snapshot(
            butler_tasks=[{"id": "wf-a", "status": "running", "kind": "studio_generate"}],
            generation_job=None,
            messages=[{"role": "user", "content": "hello"}],
            companion_events=[],
            revision=2,
        )
        self.assertFalse(snapshot.conversation["authoritative"])
        self.assertTrue(snapshot.workflows["authoritative"])
        self.assertEqual(conversation_view()["kind"], "conversation")
        self.assertEqual(workflow_view()["kind"], "workflow")


if __name__ == "__main__":
    unittest.main()
