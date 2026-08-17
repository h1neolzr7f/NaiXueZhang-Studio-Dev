"""法典图鉴（novelai.quicktagcloud.com）在线搜索与词条收藏桥。

只读远程 JSON、不下载图片、不触发生成；词条收藏只落本地清单。
"""

from __future__ import annotations

import threading
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Query

from server_shared import CONFIG, DATA_DIR
from tagcloud_core.online import TagcloudClient, TagcloudClientError
from tagcloud_collection import clear as collection_clear
from tagcloud_collection import has as collection_has
from tagcloud_collection import summary as collection_summary
from tagcloud_collection import toggle as collection_toggle

router = APIRouter(prefix="/api/nai/tagcloud")
_CLIENT: TagcloudClient | None = None
_CLIENT_LOCK = threading.Lock()


def _online_enabled() -> bool:
    return bool(CONFIG.get("tagcloud_online_enabled", True))


def get_tagcloud_client() -> TagcloudClient:
    global _CLIENT
    if _CLIENT is None:
        with _CLIENT_LOCK:
            if _CLIENT is None:
                _CLIENT = TagcloudClient(
                    cache_root=DATA_DIR / ".cache" / "tagcloud-online",
                    cache_ttl_seconds=float(CONFIG.get("tagcloud_online_cache_ttl_sec", 600) or 600),
                    cache_max_bytes=int(CONFIG.get("tagcloud_online_cache_max_bytes", 64 * 1024 * 1024) or 0),
                    timeout_seconds=float(CONFIG.get("tagcloud_online_timeout_sec", 30) or 30),
                )
    return _CLIENT


def _require_online() -> TagcloudClient:
    if not _online_enabled():
        raise HTTPException(status_code=503, detail="法典图鉴在线发现已在配置中停用")
    try:
        return get_tagcloud_client()
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=503, detail=f"法典图鉴在线发现不可用: {exc}") from exc


def _remote_error(exc: TagcloudClientError) -> HTTPException:
    return HTTPException(status_code=502, detail=str(exc))


@router.get("/status")
def api_tagcloud_status() -> dict[str, Any]:
    if not _online_enabled():
        return {"ok": False, "enabled": False, "source": "tagcloud", "generation_calls": 0}
    try:
        client = get_tagcloud_client()
        return {
            "ok": True,
            "enabled": True,
            "source": "tagcloud",
            "generation_calls": 0,
            **client.status(),
        }
    except Exception as exc:
        return {"ok": False, "enabled": True, "source": "tagcloud", "generation_calls": 0, "error": str(exc)}


@router.get("/codexes")
def api_tagcloud_codexes(safe_only: bool = Query(True)) -> dict[str, Any]:
    client = _require_online()
    try:
        codexes = client.list_codexes()
    except TagcloudClientError as exc:
        raise _remote_error(exc) from exc
    items = [
        {
            **codex,
            "cover": client.image_url(codex["id"], f"{codex['id']}-0001.jpg"),
        }
        for codex in codexes
        if not safe_only or not codex["nsfw"]
    ]
    return {"ok": True, "source": "tagcloud", "items": items, "generation_calls": 0}


@router.get("/search")
def api_tagcloud_search(
    q: str = Query("", max_length=300),
    codex: str = Query("", max_length=80),
    page: int = Query(1, ge=1, le=100_000),
    page_size: int = Query(24, ge=1, le=60),
    safe_only: bool = Query(True),
) -> dict[str, Any]:
    client = _require_online()
    try:
        result = client.search(
            query=q,
            codex_id=codex,
            page=page,
            page_size=page_size,
            safe_only=safe_only,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except TagcloudClientError as exc:
        raise _remote_error(exc) from exc
    return {
        "ok": True,
        "source": "tagcloud",
        "query": str(q or "").strip(),
        **result,
        "generation_calls": 0,
    }


@router.get("/collection")
def api_tagcloud_collection() -> dict[str, Any]:
    return {**collection_summary(), "source": "tagcloud", "generation_calls": 0}


@router.post("/collection/toggle")
def api_tagcloud_collection_toggle(payload: dict[str, Any] = Body(default_factory=dict)) -> dict[str, Any]:
    codex_id = str(payload.get("codex_id") or "").strip()
    entry_id = str(payload.get("entry_id") or "").strip()
    client = _require_online()
    try:
        entry = client.get_entry(codex_id, entry_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except TagcloudClientError as exc:
        raise _remote_error(exc) from exc
    if entry is None:
        raise HTTPException(status_code=404, detail="法典词条不存在")
    key = f"{entry['codex_id']}:{entry['id']}"
    if collection_has(key):
        result = collection_toggle(key)
        return {**result, "generation_calls": 0}
    # 收藏快照以服务端刚读到的词条为准，不信任浏览器回传的文本。
    result = collection_toggle(key, entry)
    return {
        **result,
        "generation_calls": 0,
        "message": "已收进提示词库；图片仍是远程链接，未下载。"
        if result.get("collected")
        else "已从提示词库移除。",
    }


@router.post("/cache/clear")
def api_tagcloud_cache_clear() -> dict[str, Any]:
    client = _require_online()
    return {"ok": True, "removed": client.clear_cache(), "source": "tagcloud", "generation_calls": 0}


__all__ = ["router", "get_tagcloud_client"]
