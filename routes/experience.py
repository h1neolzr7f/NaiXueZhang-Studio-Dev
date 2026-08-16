from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from experience.conversation import assert_conversation_workflow_split
from experience.events import apply_projected_events
from experience.handoff_product import consume_product_handoff, create_product_handoff, list_product_handoffs
from experience.manifests import list_manifests, load_manifest
from experience.memory import list_layered_memories, propose_layered_memory
from experience.projector import project_snapshot

router = APIRouter(prefix="/api/experience")


def _snapshot_payload() -> dict[str, Any]:
    return project_snapshot().to_dict()


@router.get("/snapshot")
def api_experience_snapshot() -> dict[str, Any]:
    return _snapshot_payload()


@router.get("/events")
def api_experience_events() -> dict[str, Any]:
    payload = _snapshot_payload()
    return {"ok": True, "revision": payload["revision"], "events": payload["events"], "active_stage": payload["active_stage"]}


@router.get("/events/stream")
async def api_experience_event_stream(request: Request) -> StreamingResponse:
    async def events():
        payload = await asyncio.to_thread(_snapshot_payload)
        last = int(payload.get("revision") or 0)
        yield f"id: {last}\nevent: experience\ndata: {json.dumps(payload, ensure_ascii=False, separators=(',', ':'))}\n\n"
        while not await request.is_disconnected():
            await asyncio.sleep(1.2)
            payload = await asyncio.to_thread(_snapshot_payload)
            revision = int(payload.get("revision") or 0)
            if revision <= last:
                yield ": keepalive\n\n"
                continue
            last = revision
            yield f"id: {last}\nevent: experience\ndata: {json.dumps(payload, ensure_ascii=False, separators=(',', ':'))}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


@router.get("/manifests")
def api_experience_manifests() -> dict[str, Any]:
    return {"ok": True, "manifests": [item.to_dict() for item in list_manifests()]}


@router.get("/manifests/{persona_id}")
def api_experience_manifest(persona_id: str) -> dict[str, Any]:
    try:
        return {"ok": True, "manifest": load_manifest(persona_id).to_dict()}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/memories")
def api_experience_memories(layer: str = Query("")) -> dict[str, Any]:
    return {"ok": True, "memories": list_layered_memories(layer=layer)}


@router.post("/memories")
def api_experience_memory_propose(payload: dict[str, Any] = Body(default_factory=dict)) -> dict[str, Any]:
    try:
        item = propose_layered_memory(
            str(payload.get("text") or ""),
            agent=str(payload.get("agent") or ""),
            source=str(payload.get("source") or "user"),
            layer=str(payload.get("layer") or "user_preference"),
            scope=str(payload.get("scope") or "preference"),
            provenance=str(payload.get("provenance") or "user"),
            confidence=float(payload.get("confidence") or 0.5),
            retention_days=int(payload.get("retention_days") or 90),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "memory": item}


@router.get("/handoffs")
def api_experience_handoffs() -> dict[str, Any]:
    return {"ok": True, "handoffs": list_product_handoffs()}


@router.post("/handoffs")
def api_experience_handoff_create(payload: dict[str, Any] = Body(default_factory=dict)) -> dict[str, Any]:
    try:
        item = create_product_handoff(
            from_persona=str(payload.get("from_persona") or ""),
            to_persona=str(payload.get("to_persona") or ""),
            user_intent=str(payload.get("user_intent") or ""),
            selection=list(payload.get("selection") or []),
            capability_scope=list(payload.get("capability_scope") or []),
            workflow_ref=str(payload.get("workflow_ref") or ""),
            limits=dict(payload.get("limits") or {}),
            provenance=dict(payload.get("provenance") or {}),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "handoff": item}


@router.post("/handoffs/{handoff_id}/consume")
def api_experience_handoff_consume(
    handoff_id: str,
    payload: dict[str, Any] = Body(default_factory=dict),
) -> dict[str, Any]:
    try:
        result = consume_product_handoff(
            handoff_id,
            actor_persona=str(payload.get("actor_persona") or ""),
            capability_id=str(payload.get("capability_id") or ""),
            confirmed=bool(payload.get("confirmed")),
            delegation_token=str(payload.get("delegation_token") or ""),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return result


@router.post("/replay")
def api_experience_replay(payload: dict[str, Any] = Body(default_factory=dict)) -> dict[str, Any]:
    snapshot = project_snapshot()
    _ = payload
    return apply_projected_events(snapshot.events)


@router.get("/conversation-workflow")
def api_experience_conversation_workflow() -> dict[str, Any]:
    snapshot = project_snapshot()
    return {
        "ok": True,
        "conversation": snapshot.conversation,
        "workflows": snapshot.workflows,
        "split": {
            "conversation": "ephemeral_ux",
            "workflow": "durable_authority",
            "delete_chat_keeps_tasks": True,
        },
    }


@router.post("/conversation-workflow/verify-clear")
def api_experience_verify_clear() -> dict[str, Any]:
    from butler.workflow import clear_butler_messages, list_butler_messages, list_butler_tasks

    before = list(list_butler_tasks(limit=30).get("tasks") or [])
    clear_butler_messages()
    after_messages = list(list_butler_messages(limit=30).get("messages") or [])
    after_tasks = list(list_butler_tasks(limit=30).get("tasks") or [])
    return assert_conversation_workflow_split(
        messages_after_clear=after_messages,
        workflows_after_clear=after_tasks,
        workflows_before_clear=before,
    )
