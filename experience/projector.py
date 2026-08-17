from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .character_state import character_state_for_events
from .conversation import conversation_view, workflow_view
from .events import ExperienceEvent, make_event
from .manifests import list_manifests
from .proactive import annotate_companion_events


@dataclass
class ExperienceSnapshot:
    revision: int
    events: list[ExperienceEvent] = field(default_factory=list)
    conversation: dict[str, Any] = field(default_factory=dict)
    workflows: dict[str, Any] = field(default_factory=dict)
    character_states: dict[str, dict[str, Any]] = field(default_factory=dict)
    specialists: list[dict[str, Any]] = field(default_factory=list)
    proactive: list[dict[str, Any]] = field(default_factory=list)
    active_stage: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": True,
            "revision": self.revision,
            "events": [item.to_dict() for item in self.events],
            "conversation": self.conversation,
            "workflows": self.workflows,
            "character_states": self.character_states,
            "specialists": self.specialists,
            "proactive": self.proactive,
            "active_stage": self.active_stage,
            "authoritative_sources": ["butler_tasks", "generation_jobs", "companion_state"],
        }


def _task_event(task: dict[str, Any]) -> ExperienceEvent | None:
    workflow_id = str(task.get("id") or task.get("workflow_id") or "")
    if not workflow_id:
        return None
    status = str(task.get("status") or "")
    phase = str(task.get("phase") or "")
    kind = str(task.get("kind") or "")
    agent_id = str(task.get("agent") or task.get("agent_id") or "")
    revision = str(task.get("updated_at") or task.get("revision") or status)
    if task.get("terminal") or status in {"succeeded", "done"}:
        event_type = "workflow.completed" if status in {"succeeded", "done"} else "workflow.failed"
        severity = "info" if event_type == "workflow.completed" else "error"
    elif status in {"awaiting_confirmation", "waiting"} or phase in {"confirm", "authorization"}:
        event_type = "authorization.required" if "author" in phase or "paid" in phase else "workflow.waiting"
        severity = "warning"
    elif status in {"queued", "created"}:
        event_type = "workflow.created"
        severity = "info"
    elif "warn" in status or "uncertain" in status:
        event_type = "workflow.warning"
        severity = "warning"
    else:
        event_type = "workflow.started" if status in {"running", "processing"} and phase in {"", "start"} else "workflow.progress"
        severity = "info"
        if kind in {"studio_generate", "batch_generate", "director"}:
            event_type = "generation.running"
    progress = task.get("progress") if isinstance(task.get("progress"), dict) else {}
    current = progress.get("done")
    total = progress.get("total")
    basis = "exact" if current is not None and total else "unknown"
    if str(progress.get("eta_basis") or "") == "initial_estimate":
        basis = "estimate"
    return make_event(
        event_type,
        source="butler",
        subject=workflow_id,
        revision=revision,
        agent_id=agent_id,
        capability_id=str(task.get("capability_id") or ""),
        workflow_ref=workflow_id,
        severity=severity,
        progress_current=int(current) if current is not None else None,
        progress_total=int(total) if total is not None else None,
        progress_basis=basis,  # type: ignore[arg-type]
        payload={"status": status, "phase": phase, "kind": kind, "title": task.get("title") or ""},
        occurred_at=str(task.get("updated_at") or task.get("created_at") or ""),
    )


def _generation_event(job: dict[str, Any]) -> ExperienceEvent | None:
    task_id = str(job.get("task_id") or job.get("id") or "")
    if not task_id:
        return None
    status = str(job.get("status") or "")
    if job.get("billing_uncertain") or status == "unknown":
        event_type = "generation.billing_uncertain"
        severity = "warning"
    elif status == "queued":
        event_type = "generation.queued"
        severity = "info"
    elif status in {"done"}:
        event_type = "generation.completed"
        severity = "info"
    elif status in {"error", "cancelled"}:
        event_type = "workflow.failed"
        severity = "error"
    else:
        fail_count = int(job.get("fail_count") or job.get("effective_fail_count") or 0)
        event_type = "generation.partial" if fail_count else "generation.running"
        severity = "info"
    progress = job.get("progress") if isinstance(job.get("progress"), dict) else {}
    current = progress.get("done", job.get("done"))
    total = progress.get("total", job.get("total"))
    return make_event(
        event_type,
        source="generation_jobs",
        subject=task_id,
        revision=str(job.get("updated_at") or status),
        agent_id="tomori",
        capability_id="nai.generate_paid" if job.get("requires_ticket") or not job.get("free_eligible", True) else "nai.generate",
        workflow_ref=task_id,
        severity=severity,
        progress_current=int(current) if current is not None else None,
        progress_total=int(total) if total is not None else None,
        progress_basis="exact" if current is not None and total else "unknown",
        payload={
            "status": status,
            "queue_position": job.get("queue_position"),
            "billing_uncertain": bool(job.get("billing_uncertain")),
        },
    )


def _live_butler_tasks() -> tuple[list[dict[str, Any]], int]:
    try:
        from butler.workflow import butler_task_revision, list_butler_tasks

        payload = list_butler_tasks(limit=20)
        tasks = list(payload.get("tasks") or []) if isinstance(payload, dict) else []
        return tasks, int(butler_task_revision() or 0)
    except Exception:
        return [], 0


def _live_generation_job() -> tuple[dict[str, Any] | None, int]:
    try:
        from nai_batch import batch_status

        job = batch_status(None)
        revision = 0
        if isinstance(job, dict):
            revision = int(job.get("revision") or 0)
        return job if isinstance(job, dict) else None, revision
    except Exception:
        return None, 0


def _live_messages() -> list[dict[str, Any]]:
    try:
        from butler.workflow import list_butler_messages

        payload = list_butler_messages(limit=20)
        return list(payload.get("messages") or []) if isinstance(payload, dict) else []
    except Exception:
        return []


def _live_companion_events() -> list[dict[str, Any]]:
    try:
        from butler.companion_state import collect_local_events

        return collect_local_events()
    except Exception:
        return []


_UNSET = object()


def project_snapshot(
    *,
    butler_tasks: list[dict[str, Any]] | None = None,
    generation_job: Any = _UNSET,
    messages: list[dict[str, Any]] | None = None,
    companion_events: list[dict[str, Any]] | None = None,
    extra_events: list[ExperienceEvent] | None = None,
    revision: int | None = None,
) -> ExperienceSnapshot:
    tasks = list(butler_tasks) if butler_tasks is not None else _live_butler_tasks()[0]
    job = _live_generation_job()[0] if generation_job is _UNSET else generation_job
    chat = list(messages) if messages is not None else _live_messages()
    proactive = list(companion_events) if companion_events is not None else _live_companion_events()
    events: list[ExperienceEvent] = []
    for task in tasks:
        item = _task_event(task)
        if item is not None:
            events.append(item)
    if job:
        item = _generation_event(job)
        if item is not None:
            events.append(item)
    if extra_events:
        events.extend(extra_events)
    if revision is None:
        live_tasks_rev = _live_butler_tasks()[1] if butler_tasks is None else len(tasks)
        live_job_rev = _live_generation_job()[1] if generation_job is _UNSET else 0
        revision = live_tasks_rev * 1_000_003 + live_job_rev + len(events)
    specialists = [item.to_dict() for item in list_manifests()]
    character_states = {
        agent: character_state_for_events(events, agent_id=agent)
        for agent in ("sakiko", "tomori", "acquire", "library", "studio", "support")
    }
    active = events[-1].to_dict() if events else {
        "stage_label": "空闲",
        "type": "",
        "progress": {"current": None, "total": None, "basis": "unknown"},
    }
    return ExperienceSnapshot(
        revision=int(revision),
        events=events,
        conversation=conversation_view(chat),
        workflows=workflow_view(tasks),
        character_states=character_states,
        specialists=specialists,
        proactive=annotate_companion_events(proactive),
        active_stage=active,
    )
