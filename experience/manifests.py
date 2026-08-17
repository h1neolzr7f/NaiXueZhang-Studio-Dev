from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from capability.gateway import CapabilityGateway
from capability.personas import PERSONAS


@dataclass(frozen=True, slots=True)
class AgentManifest:
    persona_id: str
    display_name: str
    short_name: str
    role: str
    presence_agent: str
    workspace_href: str
    workspace_label: str
    primary_capabilities: tuple[str, ...] = ()
    adjacent_capabilities: tuple[str, ...] = ()
    memory_policy: str = "confirmed_only"
    proactive_policy: str = "observe_or_suggest"
    visible: bool = True
    status_mapping: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["primary_capabilities"] = list(self.primary_capabilities)
        payload["adjacent_capabilities"] = list(self.adjacent_capabilities)
        payload["authority"] = "capability_gateway"
        payload["self_grant"] = False
        return payload


MANIFESTS: dict[str, AgentManifest] = {
    "acquire": AgentManifest(
        persona_id="acquire",
        display_name="采集助手",
        short_name="采集",
        role="Pixiv 爬虫、AITag 咒语站与法典图鉴提示词采集入库",
        presence_agent="tomori",
        workspace_href="/discover",
        workspace_label="在线发现",
        primary_capabilities=("provider.search", "provider.fetch", "asset.preview"),
        adjacent_capabilities=("asset.materialize", "library.search"),
    ),
    "library": AgentManifest(
        persona_id="library",
        display_name="图库助手",
        short_name="图库",
        role="本地图库、收藏、相似/重复、索引与血缘整理",
        presence_agent="sakiko",
        workspace_href="/library",
        workspace_label="我的图库",
        primary_capabilities=("library.search", "library.collection.add", "asset.preview"),
        adjacent_capabilities=("asset.materialize", "post.upscale"),
    ),
    "studio": AgentManifest(
        persona_id="studio",
        display_name="生成助手",
        short_name="生成",
        role="Prompt、工作台、换角、NovelAI 队列与后处理",
        presence_agent="tomori",
        workspace_href="/generate",
        workspace_label="生成台",
        primary_capabilities=("nai.generate", "transform.character_replace"),
        adjacent_capabilities=("library.search", "asset.preview", "post.upscale"),
    ),
    "support": AgentManifest(
        persona_id="service",
        display_name="客服助手",
        short_name="客服",
        role="用法、Doctor、日志解释、诊断与安全恢复建议",
        presence_agent="sakiko",
        workspace_href="/tools",
        workspace_label="维护与诊断",
        primary_capabilities=("library.search", "asset.preview", "provider.search"),
        adjacent_capabilities=(),
    ),
    "orchestrator": AgentManifest(
        persona_id="orchestrator",
        display_name="编排器",
        short_name="编排",
        role="理解、拆解、路由与交接，不执行业务能力",
        presence_agent="",
        workspace_href="",
        workspace_label="",
        visible=False,
        memory_policy="none",
        proactive_policy="deny_execute",
    ),
}


def load_manifest(persona_id: str) -> AgentManifest:
    key = "support" if persona_id == "service" else str(persona_id or "")
    manifest = MANIFESTS.get(key) or MANIFESTS.get(str(persona_id or ""))
    if manifest is None:
        raise KeyError(f"unknown agent manifest: {persona_id}")
    return manifest


def list_manifests(*, include_hidden: bool = False) -> list[AgentManifest]:
    rows = list(MANIFESTS.values())
    if include_hidden:
        return rows
    return [item for item in rows if item.visible]


def manifest_capability_claims(manifest: AgentManifest) -> set[str]:
    return set(manifest.primary_capabilities) | set(manifest.adjacent_capabilities)


def persona_access_table(persona_id: str) -> dict[str, str]:
    return dict(PERSONAS.get(str(persona_id or ""), {}))


def manifest_cannot_self_grant(
    persona_id: str,
    capability_id: str,
    *,
    gateway: CapabilityGateway | None = None,
) -> bool:
    """Persona text/manifest claims never become authority."""

    decision = (gateway or CapabilityGateway()).decide(persona_id, capability_id)
    return decision.decision == "DENY"
