"""单作品 Pixiv 快速入库：书签小工具的后端动作。

复用与爬虫完全同一条入库管线（PixivPublicWebSource 取详情 +
PixivNAIIntake 验证 NovelAI 元数据并落库），只是范围变成用户正在看的
这一件作品。不另起引擎，不绕过 NAI 元数据门槛。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from db import Database
from paths import data_dir
from pixiv_nai_crawler import load_task
from pixiv_nai_intake import PixivNAIIntake
from pixiv_nai_source import PixivSourceError
from pixiv_public_source import PixivPublicWebSource


def quick_import_pixiv_work(work_id: int, *, root: Path | None = None) -> dict[str, Any]:
    """Fetch one public Pixiv work by id and run it through the NAI intake."""

    wid = int(work_id)
    if wid <= 0:
        raise ValueError("无效的 Pixiv 作品 ID")
    task = load_task(root=Path(root).resolve()) if root else load_task()
    data = data_dir()
    source = PixivPublicWebSource(
        max_download_bytes=int(task["max_download_bytes"]),
        # 用户显式挑了这一件：不做站点 AI 标记预过滤，最终仍以 NAI 元数据为准。
        ai_prefilter=False,
        request_delay_sec=float(task["request_delay_sec"]),
        proxy_url=str(task.get("proxy_url") or ""),
    )
    db = Database(data / "aitag.db")
    intake = PixivNAIIntake(
        db=db,
        images_dir=data / "images",
        staging_dir=data / "pixiv_nai_staging",
        max_download_bytes=int(task["max_download_bytes"]),
        storage_quota_bytes=int(task["storage_quota_bytes"]),
        thumbnail_only_pages=bool(task["thumbnail_only_pages"]),
    )
    try:
        work = source.fetch_work(wid)
        if work is None:
            return {
                "ok": False,
                "site": "pixiv",
                "work_id": wid,
                "message": "这件作品没有取到（可能已删除或不可公开访问）。",
            }
        receipt = intake.ingest_work(work, source.download_original)
    except PixivSourceError as exc:
        return {
            "ok": False,
            "site": "pixiv",
            "work_id": wid,
            "message": f"从 Pixiv 读取失败：{exc}",
        }
    status = str(receipt.status or "")
    rejected = [page for page in receipt.pages if page.status == "rejected"]
    reason = str(rejected[0].reason) if rejected else ""
    if status in {"accepted", "partial"}:
        message = f"已入库：{work.title or wid}（接受 {receipt.accepted_pages} 页"
        if receipt.rejected_pages:
            message += f"，{receipt.rejected_pages} 页未过 NAI 校验"
        message += "）"
        ok = True
    elif status == "updated":
        # 缓存命中：本地已有各页校验结果，按最新作品数据重新落库，未重复下载。
        message = f"已在图库，作品信息已同步（{int(receipt.accepted_pages)} 页）。"
        ok = True
    elif status == "unchanged" and int(receipt.accepted_pages) > 0:
        message = "这件作品已在图库里，没有重复入库。"
        ok = True
    elif status == "unchanged":
        # 此前已永久判定「无 NAI 元数据」并记录，按设计不再重复下载。
        message = "这件作品此前已判定不含 NovelAI 元数据，按规则不再重复下载。"
        ok = False
    else:
        ok = False
        message = f"未入库：{reason or '未通过本机 NovelAI 元数据校验'}"
    return {
        "ok": ok,
        "site": "pixiv",
        "work_id": wid,
        "title": str(work.title or ""),
        "status": status,
        "accepted_pages": int(receipt.accepted_pages),
        "rejected_pages": int(receipt.rejected_pages),
        "message": message,
        "library_url": f"/library?q={wid}",
    }


__all__ = ["quick_import_pixiv_work"]
