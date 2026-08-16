# D-020 · Experience & Agent UX Top-Tier Upgrade

> 当前阶段：**Windows Source RC 已通过，GitHub CI 已绿。**
> 本轮不再重做后端架构，而是把 AI、Agent、前端与整体产品体验补到与现有后端同一水平。

## 0. 开工前

先自行读取并以仓库最新状态为准：

- `docs/top-tier-upgrade/WINDOWS_RC_REPORT.md`
- `docs/top-tier-upgrade/STATUS.md`
- `docs/top-tier-upgrade/NEXT_ACTION.md`
- `docs/top-tier-upgrade/AUTONOMOUS_FINAL_REPORT.md`
- `docs/top-tier-upgrade/CAPABILITY_MATRIX.md`
- `AGENTS.md`
- 当前 `butler/`、`capability/`、`frontend/`、`web/`、Studio、Library、GenerationJobManager 实现

同时深入研究 `https://github.com/SlimeBoyOwO/LingChat` 的真实代码，不只看 README。重点研究角色系统、长期记忆、流式交互、状态驱动 UI、主动交互、前后端消息流与多角色组织方式。

允许继续寻找其他 Best-of-Breed 开源项目作为单项标杆，但遵守木桶法：**按能力借机制，不整体照搬任何项目。**

---

## 1. Protected Baseline

以下默认视为已收敛，不做大重构：

- `Acquire → Curate → Transform → Library`
- Provider / Materialize / LibraryWriter
- GenerationJobManager
- paid authorization、`unknown`、`billing_uncertain`
- WorkRef / provenance / lineage
- Butler durable workflow
- Capability Gateway / Delegation / Handoff / Orchestrator
- DPAPI / path jail / 三图库隔离
- 批量换角色
- 旧图库与旧 API 兼容

新体验必须建立在这些能力之上。若新设计要求破坏 Protected Baseline，优先修改新设计。

---

## 2. 本轮产品目标

把 Nai学长从：

> 功能很多的软件 + AI 聊天框

升级为：

> **由多个专业二次元 Agent 协作操作的一体化 AI 创作工作室。**

建议角色：

- **采集助手**：Online Discovery、Provider、搜索、获取、Materialize
- **图库助手**：Library、搜索、分类、相似、重复、Collection、lineage
- **生成助手**：Prompt、Studio、换角色、NovelAI、生成队列、后处理
- **客服助手**：使用帮助、Doctor、日志解释、诊断与恢复建议
- **Orchestrator**：理解、拆解、路由、handoff，但不能绕过 Capability Gateway

Agent 是高级入口，不是强制入口。熟练用户仍可直接操作原功能。

---

## 3. P0：统一 Agent / Workflow Event Plane

建立统一、typed、可测试的表现事件层，把真实业务状态投影给 UI，例如：

```text
agent.planning
agent.handoff
workflow.started
workflow.progress
workflow.warning
workflow.completed
provider.search_started
provider.results
asset.materializing
asset.materialized
generation.queued
generation.running
generation.partial
generation.billing_uncertain
authorization.required
library.indexing
library.updated
```

规则：

- Event Plane 只是表现层，不是第二套事实源。
- durable workflow / DB / job state 仍是 authoritative truth。
- 业务代码不能直接操作 Live2D 表情或 UI 动画。

---

## 4. P0：Workflow Streaming UX

AI 不应“沉默几十秒后突然完成”。

把真实执行过程持续呈现：

```text
理解请求
→ 搜索来源
→ 找到候选
→ 去重 / 筛选
→ Materialize
→ 等待确认
→ 生成 / 换角进度
→ partial failure / retry
→ 完成并展示 artifacts
```

至少展示：当前阶段、执行 Agent、真实进度、等待确认、warning、partial success、retry、最终产物。

**禁止展示模型私有 chain-of-thought，只展示业务执行状态和简洁说明。**

---

## 5. P0：Conversation ≠ Workflow

正式锁死边界：

- Conversation：用户语言、Agent 回复、上下文与 UX
- Workflow：任务、参数、权限、receipt、artifact、retry、recovery

必须满足：

- 删除聊天不能删除运行中的业务任务；
- LLM 上下文丢失不能破坏任务；
- 软件重启不能靠聊天历史恢复付费任务；
- 模型切换不能修改已冻结参数。

不要新建第二套 workflow engine，复用现有 durable workflow。

---

## 6. P1：Agent Persona Package

把人格与表现资源收敛为正式 manifest，而不是散落代码：

```text
AgentManifest
- identity / display_name / role
- avatar / expressions / status_mapping
- system_behavior
- memory_policy
- primary_capabilities
- adjacent_capabilities
- proactive_policy
- workspace_preferences
- voice (optional)
```

**Persona 声明能力 ≠ 获得权限。** 实际权限只能由 Capability Registry / Gateway 决定。

---

## 7. P1：Workflow State → Character State

借鉴 LingChat 的“状态可感知”思路，但服务于专业工作，而不是陪伴数值。

建议状态：

`idle / listening / thinking / searching / organizing / generating / processing / waiting_confirmation / warning / error / success`

由 Persona 层映射到表情、动作、状态文案、可选 Live2D。业务层只发布业务状态。

---

## 8. P1/P2：分层 Memory

不要复制一个全局向量库。研究并实现小而有用的分层记忆：

- User Preference Memory
- Project / Workspace Memory
- Agent Specialist Memory（Acquire / Library / Studio / Support）
- Episodic Workflow Summary

每条记忆至少包含：scope、provenance、confidence、created_at、last_used、retention，并允许用户查看、编辑、删除。

**权限、付费状态、文件位置、任务状态、provenance 等事实绝不能由 RAG Memory 作为权威来源。**

---

## 9. P1：Bounded Proactive Agent

Agent 可以主动：

- 汇报任务完成/失败；
- 提醒 billing_uncertain；
- 提醒 Provider 掉线；
- 提醒图库未索引/大量重复；
- 建议下一步。

但主动行为必须区分：

`OBSERVE / SUGGEST / CONFIRM_REQUIRED / EXECUTE / DENY`

删除、付费、发布、批量外部采集等继续强制走现有 confirmation / Gateway。

---

## 10. P1：Typed Cross-Agent Handoff 产品化

至少做通一个真实 E2E：

`Acquire → SelectionSet → Typed Handoff → Studio → Transform → Library`

Handoff 应携带结构化内容，例如：

`workflow_ref / requester / target_agent / user_intent / selection_set / asset_refs / provenance / capability_scope / delegation / limits`

不能只靠自由文本“告诉另一个 AI”。

---

## 11. P1：Workspace-oriented Agent UI

不要做“四个头像 + 四个聊天框”。

- Acquire：Online Discovery、Provider、搜索结果、Materialize queue
- Library：Library、Collection、Similarity、Duplicate、lineage
- Studio：Prompt、换角、Generation queue、结果
- Support：Doctor、日志、诊断、恢复动作

**主角是工作空间，聊天只是控制方式之一。**

---

## 12. 前端与视觉

功能链稳定后再做视觉打磨。吸收 LingChat 在角色 presence、streaming、状态反馈、空状态、loading、notification、progress、transition 上的优点。

目标：**专业创作软件 + 二次元角色产品语言**。

要求：

- Live2D 不阻挡核心内容；
- 动画可关闭/降低；
- 小窗口可操作；
- Agent 关闭后核心软件无明显额外开销；
- 不做廉价“AI 套皮”。

---

## 13. 不要重点复制 LingChat 的内容

本轮不重点投入：

- 恋爱/羁绊数值；
- RP 剧情系统；
- 为陪伴服务的复杂情绪模型；
- 深度 TTS 工程。

可以借 Character UX、Memory lifecycle、Streaming、State、Persona、主动交互和多角色组织机制。

---

## 14. 木桶升级与维护成本

建立：

`docs/top-tier-upgrade/EXPERIENCE_CAPABILITY_MATRIX.md`

至少评估：

- AI conversation UX
- Agent identity
- Memory
- Streaming UX
- Workflow observability
- Proactive behavior
- Cross-agent cooperation
- Workspace integration
- Visual feedback
- Error recovery UX
- Onboarding
- **Solo-maintainer sustainability**

每个桶记录 Current Score、Evidence、Benchmark、Mechanism To Borrow、What NOT To Borrow、Maintenance Cost、Validation、Regression Risk、New Score。

**单人可维护性权重很高。** 只增加极小体验收益却显著增加长期维护成本的功能，拒绝实现。

---

## 15. 测试要求

本轮不能只跑 pytest。

至少增加：

- Playwright/E2E
- 关键 Workflow UI 测试
- loading/error/empty/partial failure
- refresh/restart
- modal confirmation
- 页面截图回归
- 多轮“截图 → 分析 → 修改 → 再截图”

同时继续保护 Windows RC、paid safety、Library、NAI、批量换角色、旧 API。

针对新 Agent 层主动攻击：

- Persona privilege escalation
- Memory prompt injection
- Remote metadata prompt injection
- Handoff confused deputy
- Orchestrator indirect superuser
- Proactive unconfirmed paid operation
- Event replay causing duplicate destructive action

---

## 16. 性能与复杂度约束

测量：首屏、Library search、Agent open、streaming latency、memory lookup、长会话 CPU/RAM/GPU。

禁止无必要引入：

- 第二套大型状态管理；
- 第二套 Workflow engine；
- 第二套权限系统；
- 巨型插件框架；
- 微服务化；
- Electron 重写；
- 为“架构漂亮”而增加抽象。

---

## 17. 自主执行方式

按以下循环执行，不要只输出方案：

`Research → Benchmark → Minimal Design → Implement → E2E → Visual Review → Adversarial Test → Regression → Refine`

除真实付费、不可逆用户数据、第三方账号、版权/许可问题或必须由用户判断的最终视觉偏好外，不要频繁停下来询问用户。

从当前最新基线创建独立分支，例如：

`cursor/experience-agent-ux-top-tier`

小步 commit，可回滚，不 force-push，不发 Release。

---

## 18. 阶段交付

至少生成/更新：

- `EXPERIENCE_UPGRADE_PLAN.md`
- `EXPERIENCE_CAPABILITY_MATRIX.md`
- `EXPERIENCE_RESEARCH.md`
- `EXPERIENCE_DECISIONS.md`
- `EXPERIENCE_TEST_EVIDENCE.md`
- `EXPERIENCE_VISUAL_REVIEW.md`
- `EXPERIENCE_FINAL_REPORT.md`

最终报告明确：借了 LingChat 什么、拒绝了什么、其他标杆、升级前后评分、维护成本、Agent 权限变化、测试/E2E/性能/Windows 实机、旧功能 Preservation、已知问题。

---

## 19. Freeze Gate

只有同时满足以下条件才可声明 `EXPERIENCE RC: PASS`：

- Windows RC 原核心路径无回归；
- P0/P1 = 0；
- paid safety 不退化；
- Library / NAI / 批量换角色无明显回归；
- 四个 Agent 的职责用户能真实感知；
- 至少一个真实跨 Agent E2E；
- streaming progress 来源于真实状态，不是假动画；
- Conversation 与 Workflow 生命周期解耦；
- Persona 不能提升权限；
- proactive behavior 有 scope；
- Memory 可删除且有 provenance；
- Agent 关闭时核心软件正常；
- UI 完成至少两轮自主视觉打磨；
- 自动化测试连续两轮通过；
- 单人维护复杂度仍合理。

## 最重要的产品原则

> **LingChat 让 AI 像一个角色；Nai学长要让这个角色成为真正能干活的专业创作助手。**

用户应该看得见它在工作、知道它正在做什么、需要时可以介入，并且即使不用 AI，软件本身仍是一套优秀的创作工作台。
