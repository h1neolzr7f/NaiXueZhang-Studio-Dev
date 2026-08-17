"""On-demand 法典图鉴（quicktagcloud）discovery client.

法典图鉴是只读提示词参考源：版本化法典 JSON 发布在固定 R2 数据域，
图片在同域静态资源。客户端只拉取 JSON 元数据、保持有界磁盘缓存，
不下载图片、不写图库；词条的本地收藏由 ``tagcloud_collection`` 承担。
与 AITag 一样，数据域是固定信任边界，不接受调用方控制的镜像地址。
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlparse

import httpx

from aitag_core.storage.http_cache import DiskResponseCache

TAGCLOUD_SITE_URL = "https://novelai.quicktagcloud.com"
TAGCLOUD_DATA_BASE_URL = "https://assets.quicktagcloud.com/data"
TAGCLOUD_MEDIA_BASE_URL = "https://assets.quicktagcloud.com"
TAGCLOUD_TIMEOUT_SECONDS = 30.0
TAGCLOUD_CACHE_TTL_SECONDS = 600.0
# Release 文件按其内容哈希寻址（releases/r-<hash>/…），不可变：
# 词条 JSON 可以长缓存，只有 current.json 指针需要短 TTL。
TAGCLOUD_POINTER_CACHE_TTL_SECONDS = 60.0
TAGCLOUD_RELEASE_CACHE_TTL_SECONDS = 7 * 24 * 3600.0
TAGCLOUD_CACHE_MAX_BYTES = 64 * 1024 * 1024
TAGCLOUD_PAGE_SIZE = 24
MAX_PAGE_SIZE = 60
MAX_SEARCH_TOKENS = 12
MAX_NOTE_LENGTH = 500
_RELEASE_RE = re.compile(r"^r-[0-9a-f]{20}$")
_CODEX_ID_RE = re.compile(r"^[a-z0-9_]{1,80}$")
_ENTRY_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,120}$")
_ALLOWED_HOSTS = {"assets.quicktagcloud.com", "novelai.quicktagcloud.com"}


class TagcloudClientError(RuntimeError):
    """A user-safe error raised when remote codex discovery is unavailable."""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


def validate_tagcloud_base_url(value: str = TAGCLOUD_DATA_BASE_URL) -> str:
    """Accept only the canonical, fixed quicktagcloud R2 data origin."""

    raw = str(value or TAGCLOUD_DATA_BASE_URL).strip().rstrip("/")
    parsed = urlparse(raw)
    if (
        parsed.scheme.casefold() != "https"
        or parsed.hostname != "assets.quicktagcloud.com"
        or parsed.port not in (None, 443)
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.path not in ("", "/data")
    ):
        raise ValueError(
            "tagcloud data base URL must be exactly https://assets.quicktagcloud.com/data"
        )
    return TAGCLOUD_DATA_BASE_URL


def _validate_response_origin(response: Any) -> None:
    if getattr(response, "history", None):
        raise TagcloudClientError("法典图鉴的重定向不被接受")
    response_url = getattr(response, "url", None)
    if response_url is None:
        return
    parsed = urlparse(str(response_url))
    if (
        parsed.scheme.casefold() != "https"
        or parsed.hostname not in _ALLOWED_HOSTS
        or parsed.port not in (None, 443)
        or parsed.username
        or parsed.password
    ):
        raise TagcloudClientError("法典图鉴响应逃逸出固定 HTTPS 域")


def _text(value: Any, *, limit: int) -> str:
    return str(value or "").strip()[:limit]


def _entry_tokens(query: str) -> list[str]:
    tokens: list[str] = []
    for part in str(query or "").replace("，", " ").split():
        token = part.strip().casefold()
        if token and token not in tokens:
            tokens.append(token)
        if len(tokens) >= MAX_SEARCH_TOKENS:
            break
    return tokens


class TagcloudClient:
    """Small synchronous client used by the FastAPI read/collect bridge."""

    def __init__(
        self,
        *,
        base_url: str = TAGCLOUD_DATA_BASE_URL,
        cache_root: Path | str | None = None,
        cache_ttl_seconds: float = TAGCLOUD_CACHE_TTL_SECONDS,
        cache_max_bytes: int = TAGCLOUD_CACHE_MAX_BYTES,
        timeout_seconds: float = TAGCLOUD_TIMEOUT_SECONDS,
        http_client: Any | None = None,
    ) -> None:
        self.base_url = validate_tagcloud_base_url(base_url)
        cache_root = Path(cache_root) if cache_root is not None else Path("data") / ".cache" / "tagcloud-online"
        self.cache = DiskResponseCache(
            cache_root / "release",
            ttl_seconds=TAGCLOUD_RELEASE_CACHE_TTL_SECONDS,
            max_bytes=cache_max_bytes,
        )
        self.pointer_cache = DiskResponseCache(
            cache_root / "pointer",
            ttl_seconds=cache_ttl_seconds if cache_ttl_seconds else TAGCLOUD_POINTER_CACHE_TTL_SECONDS,
            max_bytes=1024 * 1024,
        )
        self._owns_client = http_client is None
        self.http_client = http_client or httpx.Client(
            timeout=float(timeout_seconds),
            follow_redirects=False,
            headers={"Accept": "application/json", "User-Agent": "Pixiv-NAI-Gallery/tagcloud"},
        )

    def _get_json(self, url: str, *, cache: DiskResponseCache | None = None) -> Any:
        store = cache or self.cache
        cached = store.get(url)
        if cached:
            try:
                return json.loads(cached.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                pass
        try:
            response = self.http_client.get(url)
        except Exception as exc:
            raise TagcloudClientError(f"法典图鉴请求失败: {exc}") from exc
        status_code = int(getattr(response, "status_code", 0) or 0)
        _validate_response_origin(response)
        if 300 <= status_code < 400:
            raise TagcloudClientError("法典图鉴的重定向不被接受", status_code=status_code)
        if status_code < 200 or status_code >= 300:
            raise TagcloudClientError(
                f"法典图鉴返回 HTTP {status_code}",
                status_code=status_code or None,
            )
        try:
            payload = response.json()
        except Exception as exc:
            raise TagcloudClientError("法典图鉴返回了无效 JSON", status_code=status_code) from exc
        try:
            store.put(
                url,
                json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
            )
        except (OSError, ValueError):
            pass
        return payload

    def get_release(self) -> dict[str, str]:
        payload = self._get_json(f"{self.base_url}/current.json", cache=self.pointer_cache)
        if not isinstance(payload, dict):
            raise TagcloudClientError("法典图鉴 release 指针格式无效")
        release = str(payload.get("release") or "")
        if not _RELEASE_RE.fullmatch(release):
            raise TagcloudClientError("法典图鉴 release 指针未通过校验")
        return {
            "release": release,
            "published_at": _text(payload.get("publishedAt"), limit=80),
        }

    def _release_url(self, name: str) -> str:
        release = self.get_release()["release"]
        stem = name[:-5] if name.endswith(".json") else name
        if not _CODEX_ID_RE.fullmatch(stem):
            raise ValueError("无效的 release 文件名")
        return f"{self.base_url}/releases/{release}/{name}"

    def get_media(self) -> dict[str, str]:
        payload = self._get_json(self._release_url("media.json"))
        if not isinstance(payload, dict):
            raise TagcloudClientError("法典图鉴媒体索引格式无效")
        base = str(payload.get("baseUrl") or TAGCLOUD_MEDIA_BASE_URL).strip().rstrip("/")
        parsed = urlparse(base)
        if parsed.scheme.casefold() != "https" or parsed.hostname not in _ALLOWED_HOSTS:
            raise TagcloudClientError("法典图鉴媒体域未通过校验")
        image_prefix = str(payload.get("imagePrefix") or "images").strip().strip("/")
        original_prefix = str(payload.get("originalPrefix") or "originals").strip().strip("/")
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,40}", image_prefix):
            image_prefix = "images"
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,40}", original_prefix):
            original_prefix = "originals"
        return {
            "base_url": base,
            "image_prefix": image_prefix,
            "original_prefix": original_prefix,
        }

    def list_codexes(self) -> list[dict[str, Any]]:
        payload = self._get_json(self._release_url("codexes.json"))
        if not isinstance(payload, list):
            raise TagcloudClientError("法典索引格式无效")
        codexes: list[dict[str, Any]] = []
        for raw in payload:
            if not isinstance(raw, dict):
                continue
            codex_id = str(raw.get("id") or "").strip()
            if not _CODEX_ID_RE.fullmatch(codex_id):
                continue
            codexes.append(
                {
                    "id": codex_id,
                    "type": _text(raw.get("type"), limit=20) or "codex",
                    "title": _text(raw.get("title"), limit=200) or codex_id,
                    "author": _text(raw.get("author"), limit=200),
                    "version": _text(raw.get("version"), limit=80),
                    "entry_count": max(0, int(raw.get("entryCount") or 0)),
                    "imaged_count": max(0, int(raw.get("imagedCount") or 0)),
                    "nsfw": bool(raw.get("nsfw")),
                    "source": _text(raw.get("source"), limit=300),
                }
            )
        return codexes

    def get_codex(self, codex_id: str) -> dict[str, Any] | None:
        wanted = str(codex_id or "").strip()
        for codex in self.list_codexes():
            if codex["id"] == wanted:
                return codex
        return None

    def get_entries(self, codex_id: str) -> list[dict[str, Any]]:
        codex = self.get_codex(codex_id)
        if codex is None:
            raise ValueError("未知的法典 ID")
        payload = self._get_json(self._release_url(f"{codex['id']}.json"))
        if not isinstance(payload, dict) or not isinstance(payload.get("entries"), list):
            raise TagcloudClientError("法典词条文件格式无效")
        return [dict(item) for item in payload["entries"] if isinstance(item, dict)]

    def image_url(self, codex_id: str, file_name: str, rev: str = "", *, kind: str = "image") -> str:
        file = str(file_name or "").strip()
        if not file or ".." in file or file.startswith("/"):
            return ""
        media = self.get_media()
        prefix = media["original_prefix"] if kind == "original" else media["image_prefix"]
        parts = [prefix, codex_id, file]
        url = media["base_url"] + "/" + "/".join(quote(part, safe="") for part in parts)
        rev_text = str(rev or "").strip()
        if rev_text and re.fullmatch(r"[0-9a-f]{1,32}", rev_text):
            url += "?v=" + rev_text
        return url

    def serialize_entry(self, codex: dict[str, Any], entry: dict[str, Any]) -> dict[str, Any] | None:
        entry_id = str(entry.get("id") or "").strip()
        if not _ENTRY_ID_RE.fullmatch(entry_id):
            return None
        codex_id = codex["id"]
        rev = str(entry.get("assetRev") or "")
        thumb = self.image_url(codex_id, str(entry.get("image") or ""), rev)
        original = self.image_url(codex_id, str(entry.get("original") or ""), rev, kind="original")
        path = [str(part)[:120] for part in (entry.get("path") or []) if str(part).strip()]
        characters: list[dict[str, str]] = []
        for raw_char in (entry.get("characterPrompts") or [])[:6]:
            if not isinstance(raw_char, dict):
                continue
            prompt = _text(raw_char.get("prompt"), limit=2000)
            if not prompt:
                continue
            characters.append({"label": _text(raw_char.get("label"), limit=60), "prompt": prompt})
        return {
            "id": entry_id,
            "codex_id": codex_id,
            "codex_title": codex["title"],
            "nsfw": bool(codex.get("nsfw")),
            "title": _text(entry.get("title"), limit=300) or entry_id,
            "path": path,
            "tags": _text(entry.get("tags"), limit=8000),
            "characters": characters,
            "note": _text(entry.get("note"), limit=MAX_NOTE_LENGTH),
            "is_new": bool(entry.get("isNew")),
            "thumb": thumb,
            "image": original or thumb,
            "source_url": TAGCLOUD_SITE_URL + "/",
        }

    def get_entry(self, codex_id: str, entry_id: str) -> dict[str, Any] | None:
        codex = self.get_codex(codex_id)
        if codex is None:
            raise ValueError("未知的法典 ID")
        wanted = str(entry_id or "").strip()
        if not _ENTRY_ID_RE.fullmatch(wanted):
            raise ValueError("无效的法典词条 ID")
        for entry in self.get_entries(codex["id"]):
            if str(entry.get("id") or "") == wanted:
                return self.serialize_entry(codex, entry)
        return None

    def search(
        self,
        *,
        query: str = "",
        codex_id: str = "",
        page: int = 1,
        page_size: int = TAGCLOUD_PAGE_SIZE,
        safe_only: bool = True,
    ) -> dict[str, Any]:
        tokens = _entry_tokens(query)
        page = max(1, min(int(page or 1), 100_000))
        page_size = max(1, min(int(page_size or TAGCLOUD_PAGE_SIZE), MAX_PAGE_SIZE))
        wanted = str(codex_id or "").strip()
        codexes = [
            codex
            for codex in self.list_codexes()
            if (not safe_only or not codex["nsfw"]) and (not wanted or codex["id"] == wanted)
        ]
        if wanted and not codexes:
            raise ValueError("未知的法典 ID")
        matched: list[tuple[int, dict[str, Any]]] = []
        for codex in codexes:
            for entry in self.get_entries(codex["id"]):
                score = 0
                if tokens:
                    title_text = str(entry.get("title") or "").casefold()
                    path_text = " ".join(str(part) for part in (entry.get("path") or [])).casefold()
                    tags_text = str(entry.get("tags") or "").casefold()
                    note_text = str(entry.get("note") or "").casefold()
                    haystack = " ".join([title_text, path_text, tags_text, note_text])
                    if not all(token in haystack for token in tokens):
                        continue
                    # 标题命中权重最高，其次分类路径，最后才是提示词与注释正文。
                    for token in tokens:
                        score += 3 * (token in title_text)
                        score += 2 * (token in path_text)
                        score += 1 * (token in tags_text)
                        score += 1 * (token in note_text)
                item = self.serialize_entry(codex, entry)
                if item is not None:
                    if item["is_new"]:
                        score += 1
                    matched.append((score, item))
        if tokens:
            matched.sort(key=lambda pair: -pair[0])
        items_all = [item for _, item in matched]
        total = len(items_all)
        start = (page - 1) * page_size
        items = items_all[start : start + page_size]
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "has_more": start + len(items) < total,
        }

    def status(self) -> dict[str, Any]:
        release = self.get_release()
        codexes = self.list_codexes()
        cache_stats = self.cache.stats()
        pointer_stats = self.pointer_cache.stats()
        return {
            "configured": True,
            "base_url": self.base_url,
            "site_url": TAGCLOUD_SITE_URL,
            "release": release["release"],
            "published_at": release["published_at"],
            "codex_count": len(codexes),
            "safe_codex_count": len([item for item in codexes if not item["nsfw"]]),
            "cache": {
                "count": int(cache_stats.get("count", 0)) + int(pointer_stats.get("count", 0)),
                "bytes": int(cache_stats.get("bytes", 0)) + int(pointer_stats.get("bytes", 0)),
                "max_bytes": cache_stats.get("max_bytes", 0),
            },
            "cache_ttl_seconds": self.cache.ttl_seconds,
        }

    def clear_cache(self) -> int:
        return self.cache.clear() + self.pointer_cache.clear()

    def close(self) -> None:
        if self._owns_client:
            try:
                self.http_client.close()
            except Exception:
                pass


__all__ = [
    "TAGCLOUD_DATA_BASE_URL",
    "TAGCLOUD_MEDIA_BASE_URL",
    "TAGCLOUD_PAGE_SIZE",
    "TAGCLOUD_SITE_URL",
    "TagcloudClient",
    "TagcloudClientError",
    "validate_tagcloud_base_url",
]
