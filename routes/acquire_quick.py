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

from acquire_bookmark import get_or_create_token, rotate_token, verify_token
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

        payload: dict[str, object] = {"work_id": str(target["work_id"])}
        payload["image_index"] = int(target.get("image_index") or 0)
        payload["slot_index"] = int(target.get("slot_index") or 0)
        if str(target.get("candidate_id") or ""):
            payload["candidate_id"] = str(target["candidate_id"])
        result = api_aitag_import(payload)
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


_FRAME_SCRIPT = """
<script>
try { if (window.parent && window.parent !== window) window.parent.postMessage("nxz-acquire-ready", "*"); } catch (_) {}
function nxzClose() {
  try { if (window.parent && window.parent !== window) window.parent.postMessage("nxz-acquire-close", "*"); } catch (_) {}
  try { window.close(); } catch (_) {}
}
</script>
"""


def _page_shell(title: str, body: str) -> HTMLResponse:
    page = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{html.escape(title)} · Nai学长工作室</title>
<style>
body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#070a11;color:#e6edfb;font:14px/1.7 "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}}
.card{{width:min(420px,90vw);padding:26px 24px;border:1px solid rgba(148,180,255,.28);border-radius:18px;background:#10182a;box-shadow:0 24px 60px rgba(0,0,0,.5);text-align:center}}
.icon{{width:52px;height:52px;margin:0 auto 12px;border-radius:50%;display:grid;place-items:center;font-size:26px;font-weight:800;color:#06251a}}
img{{width:100%;max-height:240px;object-fit:cover;border-radius:12px;margin:10px 0}}
h1{{font-size:18px;margin:6px 0}}
.detail{{color:#9db4cc;font-size:12px;word-break:break-all}}
.btn{{display:inline-block;margin:14px 6px 0;padding:9px 16px;border-radius:999px;text-decoration:none;color:#e6edfb;border:1px solid rgba(148,180,255,.35);cursor:pointer;background:transparent;font:inherit}}
.btn.primary{{background:linear-gradient(135deg,#8b5cf6,#3b82f6);border:0;font-weight:700}}
.pick{{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin:12px 0}}
.pick label{{cursor:pointer;border:2px solid transparent;border-radius:10px;overflow:hidden;display:block}}
.pick input{{display:none}}
.pick label:has(input:checked){{border-color:#3b82f6;box-shadow:0 0 14px rgba(59,130,246,.45)}}
.pick img{{margin:0;max-height:150px}}
.pick span{{display:block;font-size:11px;color:#9db4cc;padding:4px 2px}}
</style>
</head>
<body>
<div class="card">
{body}
</div>
{_FRAME_SCRIPT}
</body>
</html>"""
    return HTMLResponse(page)


def _result_page(*, ok: bool, title: str, message: str, detail: str = "", thumb: str = "", library_url: str = "") -> HTMLResponse:
    icon = "✓" if ok else "✕"
    tone = "#3ee0a2" if ok else "#fb7185"
    thumb_html = f'<img src="{html.escape(thumb, quote=True)}" alt="" />' if thumb else ""
    detail_html = f'<p class="detail">{html.escape(detail)}</p>' if detail else ""
    action_html = (
        f'<a class="btn primary" href="{html.escape(library_url, quote=True)}">打开查看</a>' if library_url else ""
    )
    body = f"""
  <div class="icon" style="background:{tone}">{icon}</div>
  <h1>{html.escape(title or ('入库成功' if ok else '未能入库'))}</h1>
  {thumb_html}
  <p>{html.escape(message)}</p>
  {detail_html}
  {action_html}
  <button class="btn" type="button" onclick="nxzClose()">关闭本页</button>"""
    return _page_shell('入库成功' if ok else '入库结果', body)


def _aitag_chooser_page(*, url: str, token: str, work_id: str) -> HTMLResponse:
    """Second step for AITag works: pick the image and character slot first."""

    from routes.aitag import _load_detail, get_aitag_client

    detail = _load_detail(get_aitag_client(), work_id)
    work = detail.work
    images = []
    for index, image in enumerate(detail.images):
        proxy = f"/api/nai/aitag/image/{image.image_type}/{image.author_id}/{image.file_name}"
        if not str(image.file_name).casefold().endswith(".webp"):
            proxy += ".webp"
        images.append((index, proxy))
    candidates = []
    try:
        from aitag_core.recipe import discover_character_candidates

        for cand in discover_character_candidates(detail):
            candidates.append(
                (
                    str(cand.candidate_id),
                    int(cand.image_index),
                    int(cand.slot_index),
                    str(cand.character.label or cand.candidate_id),
                )
            )
    except Exception:
        candidates = []
    title = str(work.title or work_id)
    image_options = "".join(
        f'<label><input type="radio" name="image_index" value="{index}"{" checked" if index == 0 else ""} />'
        f'<img src="{html.escape(proxy, quote=True)}" alt="" loading="lazy" /><span>第 {index + 1} 张</span></label>'
        for index, proxy in images[:12]
    )
    candidate_options = "".join(
        f'<label><input type="radio" name="candidate" value="{html.escape(cid, quote=True)}|{ii}|{si}" />'
        f'<span class="cand">{html.escape(label)}（第 {ii + 1} 张 · 槽位 {si + 1}）</span></label>'
        for cid, ii, si in candidates[:12]
    )
    candidate_block = (
        f'<h2 style="font-size:14px">导入哪个角色槽</h2><div class="pick pick-text">{candidate_options}</div>'
        if candidates
        else ""
    )
    body = f"""
  <h1>{html.escape(title)}</h1>
  <p>选择要入库的图与角色槽，再确认导入。</p>
  <form method="POST" action="/acquire/quick-import">
    <input type="hidden" name="url" value="{html.escape(url, quote=True)}" />
    <input type="hidden" name="token" value="{html.escape(token, quote=True)}" />
    <input type="hidden" name="confirm" value="1" />
    <h2 style="font-size:14px">导入哪张图</h2>
    <div class="pick">{image_options}</div>
    {candidate_block}
    <button class="btn primary" type="submit">确认导入</button>
    <button class="btn" type="button" onclick="nxzClose()">取消</button>
  </form>"""
    return _page_shell("选择入库内容", body)


@router.get("/api/acquire/bookmark")
def api_acquire_bookmark() -> dict[str, object]:
    """Same-origin read for the discover page to build the bookmarklet."""

    return {"ok": True, "token": get_or_create_token()}


@router.post("/api/acquire/bookmark/rotate")
def api_acquire_bookmark_rotate() -> dict[str, object]:
    """Rotate the bookmark token.  Session-token middleware guards this write,
    so only same-origin app pages can call it; old bookmarklets stop working."""

    return {"ok": True, "token": rotate_token(), "message": "令牌已重置，旧书签已失效，请重新拖一次。"}


@router.post("/acquire/quick-import", response_class=HTMLResponse)
def api_acquire_quick_import(
    url: str = Form(""),
    title: str = Form(""),
    token: str = Form(""),
    confirm: str = Form(""),
    image_index: int = Form(0),
    candidate: str = Form(""),
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
    if target["site"] == "aitag" and not confirm:
        # AITag 作品先选图与角色槽，确认后才真正导入。
        try:
            return _aitag_chooser_page(url=url, token=token, work_id=str(target["work_id"]))
        except Exception as exc:
            return _result_page(
                ok=False,
                title="读取作品失败",
                message=f"{type(exc).__name__}: {exc}",
            )
    if target["site"] == "aitag" and candidate:
        parts = str(candidate).split("|")
        if len(parts) == 3:
            target["candidate_id"], target["image_index"], target["slot_index"] = parts[0], parts[1], parts[2]
    elif target["site"] == "aitag":
        target["image_index"] = image_index
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
