from __future__ import annotations

from typing import Any, Literal

from capability.gateway import CapabilityGateway
from capability.registry import get_capability

PROACTIVE_MODES = ("OBSERVE", "SUGGEST", "CONFIRM_REQUIRED", "EXECUTE", "DENY")
ProactiveMode = Literal["OBSERVE", "SUGGEST", "CONFIRM_REQUIRED", "EXECUTE", "DENY"]

RISKY_CAPABILITIES = frozenset(
    {
        "library.delete",
        "nai.generate_paid",
        "nai.generate",
        "transform.character_replace",
        "crawler.start",
        "acquire.plan",
        "publish.pixiv",
        "asset.materialize",
        "post.upscale",
    }
)


def classify_proactive(
    kind: str,
    *,
    capability_id: str = "",
    persona_id: str = "service",
    gateway: CapabilityGateway | None = None,
) -> dict[str, Any]:
    """An agent may notice a problem without gaining permission to execute it."""

    event_kind = str(kind or "")
    cap = str(capability_id or "")
    if cap in RISKY_CAPABILITIES or event_kind in {
        "paid_unconfirmed",
        "delete_suggested",
        "publish_suggested",
        "billing_uncertain",
    }:
        mode: ProactiveMode = "CONFIRM_REQUIRED"
        if cap:
            decision = (gateway or CapabilityGateway()).decide(persona_id, cap)
            if decision.decision == "DENY":
                mode = "DENY"
        return {
            "mode": mode,
            "can_execute": False,
            "kind": event_kind,
            "capability_id": cap,
            "reason": "risky operations stay behind confirmation / gateway",
        }
    if event_kind in {
        "token_missing",
        "gallery_index_dirty",
        "provider_unavailable",
        "queue_pending",
        "handoff_waiting",
        "memory_unconfirmed",
        "duplicates_large",
        "workflow_failed",
        "workflow_completed",
    }:
        return {
            "mode": "SUGGEST" if event_kind != "workflow_completed" else "OBSERVE",
            "can_execute": False,
            "kind": event_kind,
            "capability_id": cap,
            "reason": "bounded notice only",
        }
    if cap:
        spec = None
        try:
            spec = get_capability(cap)
        except KeyError:
            return {
                "mode": "DENY",
                "can_execute": False,
                "kind": event_kind,
                "capability_id": cap,
                "reason": "unknown capability",
            }
        if spec.confirmation != "none":
            return {
                "mode": "CONFIRM_REQUIRED",
                "can_execute": False,
                "kind": event_kind,
                "capability_id": cap,
                "reason": spec.confirmation,
            }
    return {
        "mode": "OBSERVE",
        "can_execute": False,
        "kind": event_kind,
        "capability_id": cap,
        "reason": "default observe",
    }


def annotate_companion_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    annotated = []
    for item in events:
        row = dict(item)
        row["proactive"] = classify_proactive(
            str(item.get("kind") or ""),
            persona_id="service" if str(item.get("agent") or "") == "sakiko" else "studio",
        )
        annotated.append(row)
    return annotated
