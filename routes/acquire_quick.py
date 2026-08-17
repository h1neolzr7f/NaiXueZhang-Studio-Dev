"""书签小工具快速入库：在目标站页面点一下书签，就把当前作品收进本机。

安全模型：书签令牌只授权入库这一个动作（与全局会话令牌分离）；端点走
表单 POST 导航（顶层跳转不受 CORS 限制），因此不需要为第三方站点放开
CORS，会话令牌也继续只发给本机同源页面。
"""

from __future__ import annotations

import html
import re
from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, Form
from fastapi.responses import HTMLResponse

from acquire_bookmark import get_or_create_token, verify_token
from pixiv_quick_intake import quick_import_pixiv_work

router = APIRouter()

_PIXIV_HOSTS = {"pixiv.net", "www.pixiv.net"}
_AITAG_HOSTS = {"aitag.win", "www.aitag.win"}
_TAGCLOUD_HOSTS = {"novelai.quicktagcloud.com", "novelai-tag.pages.dev"}
_PIXIV_ARTWORK_RE = re.compile(r"/artworks/(\d{1,12})")
_AITAG_WORK_RE = re.compile(r"^/i/(\d{1,20})/?$")


def parse_acquire_url(raw: str) -> dict[str, object]:
    """Map a target-site URL to a supported quick-import action."""

    text = str(raw or "").strip()
    parsed = urlparse(text)
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in {"http", "https"} or not host:
        raise ValueError("不是有效的网址")
    if host in _PIXIV_HOSTS:
        match = _PIXIV_ARTWORK_RE.search(parsed.path or "")
        if match:
            return {"site": "pixiv", "work_id": int(match.group(1))}
        raise ValueError("请在 Pixiv 的作品页（网址带 /artworks/数字）点书签")
    if host in _AITAG_HOSTS:
        match = _AITAG_WORK_RE.fullmatch(parsed.path or "")
        if match:
            return {"site": "aitag", "work_id": match.group(1)}
        raise ValueError("请在 AITag 的作品页（网址是 aitag.win/i/数字）点书签")
    if host in _TAGCLOUD_HOSTS:
        params = parse_qs(parsed.query or "")
        hash_params = parse_qs((parsed.fragment or "").lstrip("#"))
        codex = (params.get("codex") or [""])[0]
        entry = (params.get("entry") or hash_params.get("entry") or [""])[0]
        if codex and entry:
            return {"site": "tagcloud", "codex_id": codex, "entry_id": entry}
        raise ValueError("请在法典图鉴打开词条后再点书签（地址栏应带 ?codex=…&entry=…）")
    raise ValueError("这个网站不支持一键入库。目前支持：Pixiv 作品页、AITag 作品页、法典图鉴词条页")


def _run_action(target: dict[str, object]) -> dict[str, object]:
    site = str(target.get("site") or "")
    if site == "pixiv":
        return quick_import_pixiv_work(int(target["work_id"]))
    if site == "aitag":
        from routes.aitag import api_aitag_import

        result = api_aitag_import({"work_id": str(target["work_id"]), "image_index": 0, "slot_index": 0})
        return {
            "ok": bool(result.get("ok")),
            "site": "aitag",
            "title": str(((result.get("item") or {}).get("label")) or result.get("work_id") or ""),
            "message": "已导入标签资产。" if result.get("ok") else "导入失败。",
            "library_url": "/tag-assets",
            "thumb": f"/api/nai/aitag/cover/{target['work_id']}",
        }
    if site == "tagcloud":
        from routes.tagcloud import get_tagcloud_client
        from tagcloud_collection import has as collection_has
        from tagcloud_collection import toggle as collection_toggle

        client = get_tagcloud_client()
        entry = client.get_entry(str(target["codex_id"]), str(target["entry_id"]))
        if entry is None:
            return {"ok": False, "site": "tagcloud", "message": "这条词条在法典里没有找到。"}
        key = f"{entry['codex_id']}:{entry['id']}"
        if collection_has(key):
            return {
                "ok": True,
                "site": "tagcloud",
                "title": entry["title"],
                "thumb": entry.get("thumb") or "",
                "message": "这条词条已在提示词库里。",
                "library_url": "/discover?site=tagcloud",
            }
        collection_toggle(key, entry)
        return {
            "ok": True,
            "site": "tagcloud",
            "title": entry["title"],
            "thumb": entry.get("thumb") or "",
            "message": "已收进提示词库（只存文本与远程链接，未下载图片）。",
            "library_url": "/discover?site=tagcloud",
        }
    raise ValueError("不支持的来源")


def _result_page(*, ok: bool, title: str, message: str, detail: str = "", thumb: str = "", library_url: str = "") -> HTMLResponse:
    icon = "✓" if ok else "✕"
    tone = "#3ee0a2" if ok else "#fb7185"
    thumb_html = f'<img src="{html.escape(thumb, quote=True)}" alt="" />' if thumb else ""
    detail_html = f'<p class="detail">{html.escape(detail)}</p>' if detail else ""
    action_html = (
        f'<a class="btn primary" href="{html.escape(library_url, quote=True)}">打开查看</a>' if library_url else ""
    )
    page = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{'入库成功' if ok else '入库结果'} · Nai学长工作室</title>
<style>
body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#070a11;color:#e6edfb;font:14px/1.7 "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}}
.card{{width:min(420px,90vw);padding:26px 24px;border:1px solid rgba(148,180,255,.28);border-radius:18px;background:#10182a;box-shadow:0 24px 60px rgba(0,0,0,.5);text-align:center}}
.icon{{width:52px;height:52px;margin:0 auto 12px;border-radius:50%;display:grid;place-items:center;font-size:26px;font-weight:800;color:#06251a;background:{tone}}}
img{{width:100%;max-height:240px;object-fit:cover;border-radius:12px;margin:10px 0}}
h1{{font-size:18px;margin:6px 0}}
.detail{{color:#9db4cc;font-size:12px;word-break:break-all}}
.btn{{display:inline-block;margin:14px 6px 0;padding:9px 16px;border-radius:999px;text-decoration:none;color:#e6edfb;border:1px solid rgba(148,180,255,.35)}}
.btn.primary{{background:linear-gradient(135deg,#8b5cf6,#3b82f6);border:0;font-weight:700}}
</style>
</head>
<body>
<div class="card">
  <div class="icon">{icon}</div>
  <h1>{html.escape(title or ('入库成功' if ok else '未能入库'))}</h1>
  {thumb_html}
  <p>{html.escape(message)}</p>
  {detail_html}
  {action_html}
  <a class="btn" href="#" onclick="window.close();return false;">关闭本页</a>
</div>
</body>
</html>"""
    return HTMLResponse(page)


@router.get("/api/acquire/bookmark")
def api_acquire_bookmark() -> dict[str, object]:
    """Same-origin read for the discover page to build the bookmarklet."""

    return {"ok": True, "token": get_or_create_token()}


@router.post("/acquire/quick-import", response_class=HTMLResponse)
def api_acquire_quick_import(
    url: str = Form(""),
    title: str = Form(""),
    token: str = Form(""),
) -> HTMLResponse:
    _ = title
    if not verify_token(token):
        return _result_page(
            ok=False,
            title="令牌无效",
            message="书签里的入库令牌对不上。请到「在线发现」页重新拖一次书签。",
        )
    try:
        target = parse_acquire_url(url)
    except ValueError as exc:
        return _result_page(ok=False, title="这个页面不能入库", message=str(exc))
    try:
        result = _run_action(target)
    except Exception as exc:
        return _result_page(
            ok=False,
            title="入库失败",
            message=f"{type(exc).__name__}: {exc}",
            detail=str(url)[:300],
        )
    return _result_page(
        ok=bool(result.get("ok")),
        title=str(result.get("title") or ""),
        message=str(result.get("message") or ""),
        thumb=str(result.get("thumb") or ""),
        library_url=str(result.get("library_url") or ""),
    )


__all__ = ["router", "parse_acquire_url"]
