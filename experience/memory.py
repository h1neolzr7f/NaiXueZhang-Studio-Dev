from __future__ import annotations

from typing import Any

from butler import companion_state

LAYERS = ("user_preference", "workspace", "specialist", "episodic")
AUTHORITATIVE_SCOPES = frozenset(
    {
        "permission",
        "billing",
        "payment",
        "task_lifecycle",
        "file_path",
        "asset_provenance",
        "account",
        "token",
    }
)
MAX_LAYERED = 40


def propose_layered_memory(
    text: str,
    *,
    agent: str = "",
    source: str = "user",
    layer: str = "user_preference",
    scope: str = "preference",
    provenance: str = "user",
    confidence: float = 0.5,
    retention_days: int = 90,
) -> dict[str, Any]:
    layer_key = str(layer or "user_preference").strip() or "user_preference"
    scope_key = str(scope or "preference").strip() or "preference"
    if layer_key not in LAYERS:
        raise ValueError("unknown memory layer")
    if scope_key in AUTHORITATIVE_SCOPES:
        raise ValueError("memory cannot store authoritative facts")
    item = companion_state.propose_memory(text, agent=agent, source=source)
    item.update(
        {
            "layer": layer_key,
            "scope": scope_key,
            "provenance": str(provenance or "user"),
            "confidence": max(0.0, min(1.0, float(confidence))),
            "retention_days": max(1, int(retention_days)),
            "authoritative": False,
        }
    )
    with companion_state._STATE_LOCK:
        state = companion_state._load_state_unlocked()
        memories = []
        for row in list(state.get("memories") or []):
            if str(row.get("id") or "") == item["id"]:
                merged = dict(row)
                merged.update(item)
                memories.append(merged)
            else:
                memories.append(row)
        state["memories"] = memories[:MAX_LAYERED]
        companion_state._save_state_unlocked(state)
    return item


def list_layered_memories(*, layer: str = "", include_forgotten: bool = False) -> list[dict[str, Any]]:
    state = companion_state.load_state()
    rows = []
    for item in list(state.get("memories") or []):
        if not include_forgotten and str(item.get("status") or "") == "forgotten":
            continue
        if layer and str(item.get("layer") or "user_preference") != layer:
            continue
        row = dict(item)
        row.setdefault("layer", "user_preference")
        row.setdefault("scope", "preference")
        row.setdefault("provenance", str(item.get("source") or "user"))
        row.setdefault("confidence", 0.5)
        row.setdefault("retention_days", 90)
        row["authoritative"] = False
        rows.append(row)
    return rows


def forget_layered_memory(memory_id: str) -> dict[str, Any]:
    return companion_state.forget_memory(str(memory_id or "").strip())


def memory_cannot_authorize(capability_id: str, memories: list[dict[str, Any]] | None = None) -> bool:
    _ = capability_id
    _ = memories
    return True
