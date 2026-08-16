from __future__ import annotations

import json
import secrets
import threading
from datetime import datetime, timezone
from typing import Any

from atomic_io import atomic_write_text
from capability.delegation import DelegationStore, issue_delegation
from capability.gateway import CapabilityGateway
from capability.handoff import TypedHandoff
from paths import data_dir

_LOCK = threading.RLock()
STORE_PATH = data_dir() / "experience_handoffs.json"


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _load() -> list[dict[str, Any]]:
    if not STORE_PATH.exists():
        return []
    try:
        payload = json.loads(STORE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    rows = payload.get("handoffs") if isinstance(payload, dict) else payload
    return [item for item in list(rows or []) if isinstance(item, dict)]


def _save(rows: list[dict[str, Any]]) -> None:
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_text(
        STORE_PATH,
        json.dumps({"handoffs": rows[-40:]}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def create_product_handoff(
    *,
    from_persona: str,
    to_persona: str,
    user_intent: str,
    selection: list[dict[str, Any]] | None = None,
    capability_scope: list[str] | None = None,
    workflow_ref: str = "",
    limits: dict[str, Any] | None = None,
    provenance: dict[str, Any] | None = None,
    issue_token: bool = True,
    store: DelegationStore | None = None,
) -> dict[str, Any]:
    if from_persona == to_persona:
        raise ValueError("handoff must change specialist")
    if from_persona == "orchestrator":
        raise ValueError("orchestrator cannot own a product handoff")
    requested = [str(item) for item in list(capability_scope or []) if str(item)]
    # Claims in the handoff are requests, never grants.
    typed = TypedHandoff(
        selection=list(selection or []),
        user_intent=str(user_intent or ""),
        provenance=dict(provenance or {"kind": "typed_handoff"}),
        scope={"capability_scope": requested, "limits": dict(limits or {})},
        granted_capabilities=[],
        workflow_ref=str(workflow_ref or f"wf-handoff-{secrets.token_hex(4)}"),
        from_persona=str(from_persona),
        to_persona=str(to_persona),
    )
    token_id = ""
    if issue_token and requested:
        issuer = store.issue if store is not None else issue_delegation
        first = requested[0]
        token = issuer(
            requester_agent=from_persona,
            capability_id=first,
            workflow_id=typed.workflow_ref,
            asset_scope=",".join(
                str(item.get("remote_id") or item.get("work_id") or "")
                for item in typed.selection
                if isinstance(item, dict)
            ),
            quantity_ceiling=int((limits or {}).get("quantity") or max(1, len(typed.selection) or 1)),
        )
        token_id = token.token_id
    record = {
        "id": f"handoff-{secrets.token_hex(6)}",
        "created_at": _now(),
        "consumed": False,
        "delegation_token": token_id,
        "requested_capabilities": requested,
        **typed.to_dict(),
    }
    with _LOCK:
        rows = _load()
        rows.append(record)
        _save(rows)
    return record


def consume_product_handoff(
    handoff_id: str,
    *,
    actor_persona: str,
    capability_id: str,
    confirmed: bool = False,
    delegation_token: str = "",
    gateway: CapabilityGateway | None = None,
) -> dict[str, Any]:
    with _LOCK:
        rows = _load()
        found = None
        for item in rows:
            if str(item.get("id") or "") == str(handoff_id):
                found = item
                break
        if found is None:
            raise ValueError("handoff not found")
        if found.get("consumed"):
            raise ValueError("handoff already consumed")
        if str(found.get("to_persona") or "") != str(actor_persona):
            raise ValueError("handoff actor mismatch")
        requested = list(found.get("requested_capabilities") or [])
        if requested and capability_id not in requested:
            raise ValueError("capability is outside handoff scope")
        decision = (gateway or CapabilityGateway()).decide(
            actor_persona,
            capability_id,
            confirmed=confirmed,
            delegation_token=delegation_token or str(found.get("delegation_token") or ""),
            workflow_id=str(found.get("workflow_ref") or ""),
            asset_scope=",".join(
                str(item.get("remote_id") or item.get("work_id") or "")
                for item in list(found.get("selection") or [])
                if isinstance(item, dict)
            ),
        )
        if decision.decision == "DENY":
            return {"ok": False, "handoff": found, "decision": decision.decision, "reason": decision.reason}
        found["consumed"] = True
        found["consumed_at"] = _now()
        found["consumed_by"] = actor_persona
        _save(rows)
        return {
            "ok": True,
            "handoff": found,
            "decision": decision.decision,
            "workflow_request": decision.workflow_request,
            "reason": decision.reason,
        }


def list_product_handoffs(*, include_consumed: bool = False) -> list[dict[str, Any]]:
    with _LOCK:
        rows = _load()
    if include_consumed:
        return rows
    return [item for item in rows if not item.get("consumed")]
