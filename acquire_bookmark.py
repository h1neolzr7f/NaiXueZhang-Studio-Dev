"""书签小工具（bookmarklet）的专用入库令牌。

与全局会话令牌分离：书签令牌只授权「把当前目标站页面入库」这一个动作，
即使泄露也无法驱动生成、删除、发布等其他写操作。令牌持久化在数据目录，
首次读取时生成。
"""

from __future__ import annotations

import hmac
import json
import secrets
import threading
from pathlib import Path

from atomic_io import atomic_write_text
from paths import data_dir

# Tests may patch this. Production resolves through data_dir() on each call.
TOKEN_PATH: Path | None = None

_LOCK = threading.RLock()


def _token_path() -> Path:
    return Path(TOKEN_PATH) if TOKEN_PATH is not None else data_dir() / "acquire_bookmark.json"


def get_or_create_token() -> str:
    with _LOCK:
        path = _token_path()
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            token = str(payload.get("token") or "").strip()
            if token:
                return token
        except (OSError, ValueError):
            pass
        token = secrets.token_urlsafe(24)
        path.parent.mkdir(parents=True, exist_ok=True)
        atomic_write_text(path, json.dumps({"version": 1, "token": token}, indent=2) + "\n", encoding="utf-8")
        return token


def verify_token(candidate: str) -> bool:
    candidate = str(candidate or "").strip()
    if not candidate:
        return False
    return hmac.compare_digest(candidate, get_or_create_token())
