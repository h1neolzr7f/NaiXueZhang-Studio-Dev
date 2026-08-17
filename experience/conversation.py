from __future__ import annotations

from typing import Any


def assert_conversation_workflow_split(
    *,
    messages_after_clear: list[Any],
    workflows_after_clear: list[Any],
    workflows_before_clear: list[Any],
) -> dict[str, Any]:
    """Conversation delete must not remove durable workflows."""

    if messages_after_clear:
        raise AssertionError("conversation clear left messages behind")
    before_ids = {str(item.get("id") or item.get("workflow_id") or "") for item in workflows_before_clear}
    after_ids = {str(item.get("id") or item.get("workflow_id") or "") for item in workflows_after_clear}
    if before_ids != after_ids:
        raise AssertionError("clearing chat mutated workflow identity")
    return {
        "ok": True,
        "conversation": "ephemeral_ux",
        "workflow": "durable_authority",
        "workflow_count": len(after_ids),
    }


def conversation_view(messages: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "kind": "conversation",
        "authoritative": False,
        "messages": list(messages or []),
    }


def workflow_view(tasks: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "kind": "workflow",
        "authoritative": True,
        "tasks": list(tasks or []),
    }
