from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from hashlib import sha256
from typing import Any, Literal


ProgressBasis = Literal["exact", "estimate", "unknown"]

EVENT_TYPES: tuple[str, ...] = (
    "agent.intent_received",
    "agent.planning",
    "agent.handoff",
    "workflow.created",
    "workflow.started",
    "workflow.progress",
    "workflow.waiting",
    "workflow.warning",
    "workflow.failed",
    "workflow.completed",
    "provider.search_started",
    "provider.results",
    "provider.unavailable",
    "asset.favorite_added",
    "asset.materializing",
    "asset.materialized",
    "transform.started",
    "transform.progress",
    "generation.queued",
    "generation.running",
    "generation.partial",
    "generation.billing_uncertain",
    "generation.completed",
    "authorization.required",
    "authorization.cancelled",
    "library.indexing",
    "library.updated",
)

STAGE_LABELS: dict[str, str] = {
    "agent.intent_received": "理解请求",
    "agent.planning": "拆解任务",
    "agent.handoff": "交接给专业助手",
    "workflow.created": "已建立工作流",
    "workflow.started": "工作流开始",
    "workflow.progress": "工作流进行中",
    "workflow.waiting": "等待确认",
    "workflow.warning": "需要留意",
    "workflow.failed": "工作流失败",
    "workflow.completed": "工作流完成",
    "provider.search_started": "搜索来源",
    "provider.results": "已找到候选",
    "provider.unavailable": "来源暂不可用",
    "asset.favorite_added": "已收藏引用",
    "asset.materializing": "加入我的图库",
    "asset.materialized": "已入库",
    "transform.started": "开始变换",
    "transform.progress": "变换进行中",
    "generation.queued": "生成排队",
    "generation.running": "生成中",
    "generation.partial": "部分完成",
    "generation.billing_uncertain": "扣费状态未知",
    "generation.completed": "生成完成",
    "authorization.required": "需要一次非免费确认",
    "authorization.cancelled": "已取消确认",
    "library.indexing": "图库索引中",
    "library.updated": "图库已更新",
}


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stable_event_id(event_type: str, source: str, subject: str, revision: int | str = "") -> str:
    raw = f"{event_type}|{source}|{subject}|{revision}"
    return "evt_" + sha256(raw.encode("utf-8")).hexdigest()[:20]


@dataclass(frozen=True, slots=True)
class ExperienceEvent:
    type: str
    source: str
    subject: str
    event_id: str
    occurred_at: str
    stage_label: str
    agent_id: str = ""
    capability_id: str = ""
    workflow_ref: str = ""
    severity: str = "info"
    progress_current: int | None = None
    progress_total: int | None = None
    progress_basis: ProgressBasis = "unknown"
    payload: dict[str, Any] = field(default_factory=dict)
    replay_safe: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_id": self.event_id,
            "type": self.type,
            "source": self.source,
            "subject": self.subject,
            "occurred_at": self.occurred_at,
            "stage_label": self.stage_label,
            "agent_id": self.agent_id,
            "capability_id": self.capability_id,
            "workflow_ref": self.workflow_ref,
            "severity": self.severity,
            "progress": {
                "current": self.progress_current,
                "total": self.progress_total,
                "basis": self.progress_basis,
            },
            "payload": dict(self.payload),
            "replay_safe": True,
        }


def make_event(
    event_type: str,
    *,
    source: str,
    subject: str,
    revision: int | str = "",
    agent_id: str = "",
    capability_id: str = "",
    workflow_ref: str = "",
    severity: str = "info",
    progress_current: int | None = None,
    progress_total: int | None = None,
    progress_basis: ProgressBasis = "unknown",
    payload: dict[str, Any] | None = None,
    occurred_at: str = "",
) -> ExperienceEvent:
    if event_type not in EVENT_TYPES:
        raise ValueError(f"unknown experience event type: {event_type}")
    return ExperienceEvent(
        type=event_type,
        source=source,
        subject=subject,
        event_id=stable_event_id(event_type, source, subject, revision),
        occurred_at=occurred_at or _now(),
        stage_label=STAGE_LABELS[event_type],
        agent_id=agent_id,
        capability_id=capability_id,
        workflow_ref=workflow_ref or subject,
        severity=severity,
        progress_current=progress_current,
        progress_total=progress_total,
        progress_basis=progress_basis,
        payload=dict(payload or {}),
        replay_safe=True,
    )


def apply_projected_events(events: list[ExperienceEvent]) -> dict[str, Any]:
    """Replay is presentation-only. Never execute side effects."""

    if any(not item.replay_safe for item in events):
        raise RuntimeError("refusing to apply a non-replay-safe experience event")
    return {
        "ok": True,
        "applied": 0,
        "executed": False,
        "reason": "experience events are projections; replay cannot mutate business state",
        "count": len(events),
    }
