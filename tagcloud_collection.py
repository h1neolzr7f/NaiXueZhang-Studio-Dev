"""法典图鉴词条的本地收藏（JSON 持久化）。

只保存词条文本、来源链接与远程封面地址，不下载图片、不写图库。
与 favorites.json / production_queue.json 同级：一个可审计的本地清单。
"""

from __future__ import annotations

import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from atomic_io import atomic_write_text
from paths import data_dir

# Tests may patch this. Production resolves through data_dir() on each call.
COLLECTION_PATH: Path | None = None

_LOCK = threading.RLock()
_KEY_RE = re.compile(r"^[a-z0-9_]{1,80}:[A-Za-z0-9_-]{1,120}$")
_MAX_ITEMS = 2000

_SNAPSHOT_LIMITS = {
    "title": 300,
    "tags": 8000,
    "note": 500,
    "thumb": 2000,
    "image": 2000,
    "codex_title": 200,
    "source_url": 2000,
    "release": 60,
}


def collection_path() -> Path:
    return Path(COLLECTION_PATH) if COLLECTION_PATH is not None else data_dir() / "tagcloud_collection.json"


def make_key(codex_id: str, entry_id: str) -> str:
    key = f"{str(codex_id or '').strip()}:{str(entry_id or '').strip()}"
    if not _KEY_RE.fullmatch(key):
        raise ValueError("无效的法典词条键")
    return key


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _load() -> list[dict[str, Any]]:
    path = collection_path()
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    rows = payload.get("items") if isinstance(payload, dict) else None
    return [dict(item) for item in rows if isinstance(item, dict)] if isinstance(rows, list) else []


def _save(items: list[dict[str, Any]]) -> None:
    path = collection_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_text(
        path,
        json.dumps({"version": 1, "updated_at": _now(), "items": items[-_MAX_ITEMS:]}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _snapshot(payload: dict[str, Any]) -> dict[str, Any]:
    snapshot = {
        field: str(payload.get(field) or "").strip()[:limit]
        for field, limit in _SNAPSHOT_LIMITS.items()
        if str(payload.get(field) or "").strip()
    }
    path = payload.get("path")
    if isinstance(path, (list, tuple)):
        snapshot["path"] = [str(part).strip()[:120] for part in path if str(part).strip()][:8]
    return snapshot


def list_items() -> list[dict[str, Any]]:
    with _LOCK:
        return list(_load())


def has(key: str) -> bool:
    with _LOCK:
        return any(str(item.get("key") or "") == key for item in _load())


def toggle(key: str, snapshot: dict[str, Any] | None = None) -> dict[str, Any]:
    key = str(key or "").strip()
    if not _KEY_RE.fullmatch(key):
        raise ValueError("无效的法典词条键")
    with _LOCK:
        items = _load()
        existing = next((item for item in items if str(item.get("key") or "") == key), None)
        if existing is not None:
            items = [item for item in items if str(item.get("key") or "") != key]
            _save(items)
            return {"ok": True, "collected": False, "count": len(items), "key": key}
        item = {
            "key": key,
            "codex_id": key.split(":", 1)[0],
            "entry_id": key.split(":", 1)[1],
            "collected_at": _now(),
            **_snapshot(snapshot or {}),
        }
        items.append(item)
        _save(items)
        return {"ok": True, "collected": True, "count": len(items), "key": key, "item": item}


def summary() -> dict[str, Any]:
    items = list_items()
    return {"ok": True, "count": len(items), "items": items}


def clear() -> dict[str, Any]:
    with _LOCK:
        count = len(_load())
        _save([])
    return {"ok": True, "cleared": count}
