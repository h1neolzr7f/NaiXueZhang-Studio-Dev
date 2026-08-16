from __future__ import annotations

from typing import Any, Iterable

from .events import ExperienceEvent

CHARACTER_STATES: tuple[str, ...] = (
    "idle",
    "listening",
    "thinking",
    "searching",
    "organizing",
    "generating",
    "processing",
    "waiting_confirmation",
    "warning",
    "error",
    "success",
)

EVENT_TO_STATE: dict[str, str] = {
    "agent.intent_received": "listening",
    "agent.planning": "thinking",
    "agent.handoff": "organizing",
    "workflow.created": "thinking",
    "workflow.started": "processing",
    "workflow.progress": "processing",
    "workflow.waiting": "waiting_confirmation",
    "workflow.warning": "warning",
    "workflow.failed": "error",
    "workflow.completed": "success",
    "provider.search_started": "searching",
    "provider.results": "searching",
    "provider.unavailable": "warning",
    "asset.favorite_added": "organizing",
    "asset.materializing": "processing",
    "asset.materialized": "success",
    "transform.started": "processing",
    "transform.progress": "processing",
    "generation.queued": "listening",
    "generation.running": "generating",
    "generation.partial": "generating",
    "generation.billing_uncertain": "warning",
    "generation.completed": "success",
    "authorization.required": "waiting_confirmation",
    "authorization.cancelled": "idle",
    "library.indexing": "organizing",
    "library.updated": "success",
}

# Persona presentation only. Business code must not call play_expression().
STATE_TO_SITUATION: dict[str, str] = {
    "idle": "ready",
    "listening": "ready",
    "thinking": "thinking",
    "searching": "working",
    "organizing": "working",
    "generating": "generate",
    "processing": "working",
    "waiting_confirmation": "ready",
    "warning": "sorry",
    "error": "sorry",
    "success": "happy",
}

STATE_LABELS: dict[str, str] = {
    "idle": "空闲",
    "listening": "在听",
    "thinking": "在想",
    "searching": "在搜",
    "organizing": "在整理",
    "generating": "在生成",
    "processing": "处理中",
    "waiting_confirmation": "等你确认",
    "warning": "需要留意",
    "error": "出错了",
    "success": "完成",
}


def map_event_to_character_state(event_type: str) -> str:
    return EVENT_TO_STATE.get(str(event_type or ""), "idle")


def situation_for_state(state: str) -> str:
    return STATE_TO_SITUATION.get(str(state or ""), "ready")


def character_state_for_events(events: Iterable[ExperienceEvent], *, agent_id: str = "") -> dict[str, Any]:
    chosen: ExperienceEvent | None = None
    for item in events:
        if agent_id and item.agent_id and item.agent_id != agent_id:
            continue
        chosen = item
    state = map_event_to_character_state(chosen.type) if chosen else "idle"
    return {
        "agent_id": agent_id,
        "state": state,
        "label": STATE_LABELS[state],
        "situation": situation_for_state(state),
        "event_id": chosen.event_id if chosen else "",
        "stage_label": chosen.stage_label if chosen else "",
    }


def situation_from_task(task: dict[str, Any] | None) -> str:
    """Map a durable task snapshot to a persona situation. No regex on titles."""

    if not task:
        return "ready"
    if task.get("terminal"):
        return "happy" if str(task.get("status") or "") in {"succeeded", "done"} else "sorry"
    status = str(task.get("status") or "")
    phase = str(task.get("phase") or "")
    if status in {"awaiting_confirmation", "waiting"} or phase in {"confirm", "authorization"}:
        return situation_for_state("waiting_confirmation")
    if "generat" in phase or status in {"running", "processing"}:
        kind = str(task.get("kind") or "")
        if kind in {"studio_generate", "batch_generate", "director"}:
            return situation_for_state("generating")
        return situation_for_state("processing")
    if status in {"queued", "created"}:
        return situation_for_state("listening")
    return situation_for_state("thinking")
