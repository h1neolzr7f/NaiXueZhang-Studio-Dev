# D-020 — Experience & Agent UX Top-Tier Upgrade

> Repository: `h1neolzr7f/NaiXueZhang-Studio-Dev`  
> Stage: Post Windows Source RC / Experience & Agent UX upgrade  
> Baseline: always use the latest real `main`/remote HEAD as the source of truth  
> Target: preserve the current strong backend while raising AI product experience, agent collaboration, observability, and visual polish to the same level  
> Maintenance constraint: **solo-maintainer sustainability is a first-class quality metric**

---

## 0. Read this before doing anything

Do **not** infer current state from this plan alone.

Before implementation, read the current repository and at minimum:

- `docs/top-tier-upgrade/WINDOWS_RC_REPORT.md`
- `docs/top-tier-upgrade/STATUS.md`
- `docs/top-tier-upgrade/NEXT_ACTION.md`
- `docs/top-tier-upgrade/AUTONOMOUS_FINAL_REPORT.md`
- `docs/top-tier-upgrade/AUTONOMOUS_PEER_REVIEW_BRIEF.md`
- `docs/top-tier-upgrade/CAPABILITY_MATRIX.md`
- `AGENTS.md`
- current `frontend/`, `web/`, `butler/`, `capability/`, `nai/`, `routes/` and related tests

Also research the real code of:

- `https://github.com/SlimeBoyOwO/LingChat`

Do not stop at README/screenshots. Study its actual character UX, streaming pipeline, memory lifecycle, state expression, multi-character organization, proactive interaction, frontend state flow, and resource/persona separation.

You may research additional Best-of-Breed open-source projects for individual capability buckets. Borrow mechanisms, not entire architectures. Respect licenses.

---

# 1. Stage definition

The previous round has already focused on backend architecture, correctness, Windows validation, paid-operation safety, indexing, materialization, and capability boundaries.

This round is **not another backend rewrite**.

Treat the following as a **Protected Baseline** unless a real reproducible defect requires a local fix:

- `Acquire → Curate → Transform → Library`
- Provider / materialization boundary
- LibraryWriter
- Remote/local lifecycle semantics
- provenance / lineage
- GenerationJobManager
- paid authorization ticket model
- `unknown` / `billing_uncertain`
- Butler durable workflow / receipt semantics
- Capability Gateway
- Delegation / Handoff / Orchestrator boundaries
- WorkRef and old API compatibility
- three-gallery isolation
- DPAPI / path jail / localhost write protection
- batch character replacement
- old library compatibility

If a new UX idea requires damaging a protected baseline, change the UX idea first.

Do not Big-Bang Rewrite.

---

# 2. Product objective

NaiXueZhang Studio must not become:

> many powerful features + one generic AI chat box

The target product form is:

> **a local-first AI creative studio operated by several clearly differentiated specialist anime-style agents, while still remaining an excellent manual creative workspace when AI is disabled.**

Primary user-facing specialists:

### Acquisition Agent
Primary responsibility:

- Online Discovery
- Provider search
- acquisition suggestions
- materialization
- source/provenance awareness

### Library Agent
Primary responsibility:

- Library search
- collections
- tags
- duplicate/similarity
- indexing
- lineage/provenance organization

### Studio Agent
Primary responsibility:

- Prompt work
- Studio
- batch character replacement
- NovelAI generation
- GenerationJobManager
- post-processing

### Support Agent
Primary responsibility:

- usage guidance
- diagnostics
- doctor/log interpretation
- safe recovery suggestions

### Orchestrator
Internal/weakly visible role:

- understand intent
- decompose work
- route to specialists
- create typed handoffs
- track workflow
- present combined result

The Orchestrator is **not a super-admin** and must never bypass Capability Gateway.

---

# 3. Barrel Benchmark Method for this round

Create and maintain:

`docs/top-tier-upgrade/EXPERIENCE_CAPABILITY_MATRIX.md`

Each row should contain at least:

| Field | Meaning |
|---|---|
| Capability | capability bucket |
| Current Score | current maturity |
| Evidence | code/test/real-use evidence |
| User Value | importance to real users |
| Weakness | concrete current shortcoming |
| Benchmark | Best-of-Breed reference |
| Mechanism To Borrow | mechanism, not wholesale copy |
| What NOT To Borrow | unnecessary/poor-fit parts |
| Proposed Change | minimal integration |
| Maintenance Cost | long-term solo-maintainer cost |
| Validation | test/E2E/visual evidence |
| Regression Risk | what may break |
| New Score | evidence-based score after change |

At minimum score:

- AI conversation UX
- Agent identity
- Agent memory
- streaming UX
- workflow observability
- proactive behavior
- cross-agent cooperation
- workspace integration
- visual feedback
- error recovery UX
- onboarding
- solo-maintainer sustainability

Do not spend large maintenance cost for tiny score gains.

---

# 4. P0 — Unified Agent / Workflow Event Plane

Build a stable product-facing event projection over existing authoritative state.

Possible event families:

```text
agent.intent_received
agent.planning
agent.handoff

workflow.created
workflow.started
workflow.progress
workflow.waiting
workflow.warning
workflow.failed
workflow.completed

provider.search_started
provider.results
provider.unavailable

asset.favorite_added
asset.materializing
asset.materialized

transform.started
transform.progress

generation.queued
generation.running
generation.partial
generation.billing_uncertain
generation.completed

authorization.required
authorization.cancelled

library.indexing
library.updated
```

Exact names may differ.

Requirements:

- typed schema
- testable
- stable enough for frontend subscription
- UI-independent
- no second workflow engine
- no second business truth source
- durable workflow / DB / job state remains authoritative
- event replay must not duplicate destructive operations

The Event Plane is a **projection and presentation boundary**, not a replacement for durable state.

---

# 5. P0 — Workflow Streaming UX

Eliminate the user experience of:

```text
user command → long silence → sudden completion
```

Prefer visible real execution stages, for example:

```text
理解请求
↓
搜索 3 个来源
↓
找到 284 项
↓
过滤 67 个重复项
↓
选中 24 项
↓
加入我的图库 20/24
↓
需要一次非免费确认
↓
生成中 7/24
↓
22 成功 / 2 失败
```

The UI should be able to show:

- current stage
- real progress
- active agent
- active capability
- warnings
- confirmation requests
- partial success
- retry state
- completed artifacts

Do **not** expose model chain-of-thought.

Expose concise business execution status only.

No fake progress bars. If progress is approximate, label it honestly.

---

# 6. P0 — Conversation must not be Workflow truth

Formalize the boundary:

### Conversation
Contains:

- user language
- assistant replies
- short-term context
- interaction UX

### Workflow
Contains:

- actual task state
- frozen parameters
- capability decisions
- receipts
- artifacts
- retries
- recovery
- paid-operation semantics

Required invariants:

- deleting chat does not delete a running business task
- context overflow does not corrupt running workflows
- changing LLM does not mutate frozen task parameters
- process restart does not depend on chat history to recover paid tasks
- workflow state remains inspectable without reconstructing it from natural language

Do not add a second runtime if current Butler/GenerationJobManager already provide the needed durable base.

---

# 7. P1 — Agent Persona Package / Manifest

Create an explicit Persona/Agent Manifest instead of scattering identity and behavior across code.

Suggested structure:

```text
AgentManifest
├ identity
├ display_name
├ role
├ avatar
├ expressions
├ status_mapping
├ system_behavior
├ memory_policy
├ primary_capabilities
├ adjacent_capabilities
├ proactive_policy
├ workspace_preferences
└ voice (optional)
```

Critical rule:

> Persona capability declarations are requests/descriptions, **not authority**.

Actual permission is decided by Capability Registry / Gateway.

A third-party persona must never self-grant destructive, paid, publishing, filesystem, or acquisition privileges.

Do not build a giant plugin sandbox in this round.

---

# 8. P1 — Workflow State → Character State

Borrow LingChat's strongest product lesson: users should be able to feel AI state.

But NaiXueZhang Studio is not primarily a companion app.

Map real work state to product/persona state, such as:

```text
idle
listening
thinking
searching
organizing
generating
processing
waiting_confirmation
warning
error
success
```

Persona/UI may map these states to:

- expression
- animation
- status text
- optional Live2D state
- subtle workspace accent or feedback

Business code must not directly say things like:

```text
play_expression("happy")
```

Business code emits state/events; persona presentation maps them.

The core workflow must remain usable with animation disabled.

---

# 9. P1/P2 — Layered Memory

Learn from LingChat's long-term memory concept, but do not create one global vector database that becomes an authority for everything.

Research and implement the smallest useful layered memory model:

```text
User Preference Memory

Project / Workspace Memory

Agent Specialist Memory
├ Acquire
├ Library
├ Studio
└ Support

Episodic Workflow Summary
```

Every memory entry should have appropriate metadata such as:

- scope
- provenance
- confidence
- created_at
- last_used
- retention policy
- user editable/delete support

Strictly separate:

- factual authoritative state
- model-inferred preference memory

Never use RAG/memory as authoritative truth for:

- permissions
- billing/payment status
- task lifecycle
- actual file paths
- asset provenance
- account/token state

Avoid unlimited low-value memory accumulation.

---

# 10. P1 — Bounded Proactive Agent

Agents may proactively:

- report completion
- report partial failure
- warn about `billing_uncertain`
- report Provider outage
- detect unindexed/stale library items
- detect large duplicate groups
- report abnormal tasks
- suggest next actions

Keep a clear distinction similar to:

```text
OBSERVE
SUGGEST
CONFIRM_REQUIRED
EXECUTE
DENY
```

Principle:

> An agent may proactively notice a problem without gaining permission to execute a risky operation.

Deletion, paid operations, large network acquisition, overwrite, publishing, credential changes and similarly risky operations still obey the existing confirmation / Capability Gateway rules.

---

# 11. P1 — Typed Cross-Agent Handoff as a real product feature

Do not implement cross-agent cooperation as free-text "I'll tell the other assistant" behavior.

Example user request:

> 找一些适合这个角色的夜景素材，然后换成这个角色。

Expected conceptual flow:

```text
Acquire Agent
  ↓ search/filter
SelectionSet
  ↓ Typed Handoff
Studio Agent
  ↓ Character Replace
Library
```

Handoff should carry structured fields such as:

```text
workflow_ref
requester
target_agent
user_intent
selection_set
asset_refs
provenance
capability_scope
delegation
limits
```

Delegation remains short-lived and scoped.

Test confused-deputy and privilege escalation cases.

---

# 12. P1 — Workspace-oriented Agent UI

Do not build four avatars with four identical chat windows.

Each specialist should naturally operate over a relevant workspace.

### Acquisition workspace

- Online Discovery
- Providers
- search results
- materialization queue

### Library workspace

- Library
- Collections
- Similar
- Duplicate
- Lineage

### Studio workspace

- Prompt
- Character Swap
- Generation Queue
- Output

### Support workspace

- diagnostics
- doctor
- logs
- recovery actions

Chat is a control surface, not the whole product.

**The workspace is the main product surface.**

Manual direct operation must remain available.

---

# 13. P1 — Frontend visual and microinteraction upgrade

Only after functional state flow is correct, improve presentation.

Borrow appropriate product mechanisms from LingChat and other strong anime/creative software:

- character presence
- transitions
- streaming feedback
- useful empty states
- loading states
- error states
- cards
- notifications
- progress presentation
- success feedback

Do not create a cheap "anime AI skin".

Target product language:

> **professional creative software + coherent anime character presence**

Constraints:

- comfortable for long sessions
- information density remains controllable
- animation can be reduced/disabled
- Live2D never blocks important work
- small windows remain usable
- important actions never depend on animation

---

# 14. What to learn from LingChat

Prioritize studying and borrowing mechanisms for:

- Character UX
- state-driven presentation
- streaming pipeline
- memory lifecycle
- multi-character organization
- proactive interaction
- frontend state expression
- persona/resource separation

Do **not** make these major investment areas unless they directly serve the creative workflow:

- romance/bond systems
- companion relationship meters
- RP story systems
- deeply complex emotion simulation for companionship
- large TTS investment

TTS may remain optional.

The goal is not to beat LingChat at companionship.

The goal is:

> LingChat makes AI feel like a character; NaiXueZhang Studio should make that character a reliable professional creative worker.

---

# 15. Research other Best-of-Breed projects

Do not use LingChat as the only benchmark.

For weak capability buckets, find 1–3 strong open-source references in areas such as:

- AI agent UX
- workflow observability
- image asset management
- creative workspaces
- task queues
- desktop AI assistants

Read real code, tests, data flow, failure behavior and component boundaries.

Record:

- why the benchmark is better in this bucket
- what exact mechanism is useful
- what should not be copied
- license compatibility
- estimated maintenance cost

---

# 16. Automated visual validation

This round cannot be validated by pytest alone.

Add/use appropriate automated UX validation:

- Playwright/E2E
- screenshot regression where useful
- key workflow UI tests
- loading/error/empty/partial-failure states
- window resizing
- refresh/restart
- keyboard interaction
- notification behavior
- modal confirmation

Use a repeated loop:

```text
screenshot
→ inspect
→ modify
→ rerun
→ screenshot again
```

Perform multiple iterations instead of one CSS pass.

Do not claim visual completion from static screenshots alone if interactions remain broken.

---

# 17. Preserve manual workflows

AI must be an advanced automation/control layer, not a mandatory proxy.

A skilled user must still be able to:

> know the desired operation → open the relevant tool → perform it manually

Classic/manual workflows must remain functional.

Agent-off mode must remain a first-class supported mode.

---

# 18. Performance constraints

Persona, Live2D, Event Stream and Memory must not noticeably degrade the core library experience.

Measure where practical:

- first meaningful render
- Library search
- Agent panel open latency
- streaming latency
- memory lookup latency
- long-session memory/CPU growth
- RAM
- GPU
- UI responsiveness/frame stability

Users who do not use agents should not pay a large agent runtime cost.

---

# 19. Solo-maintainer constraints

Do not introduce without strong evidence:

- a second large state-management framework
- a second workflow engine
- a second permission system
- a giant plugin framework
- unnecessary microservices
- Kubernetes
- Electron rewrite
- architecture for hypothetical scale that this project does not need

Prefer integrating into the existing FastAPI + frontend + Butler + Capability architecture.

A theoretically elegant change that makes future maintenance much harder may be a net regression.

---

# 20. Security / adversarial requirements

The new experience layer must preserve:

- paid confirmation
- DPAPI
- Capability Gateway
- path jail
- Provider boundaries
- user scope
- delegation expiry/replay rules
- destructive-operation confirmation
- auditability

Explicitly attack at least:

```text
Persona → privilege escalation
Memory → injected instruction
Remote asset metadata → prompt injection
Handoff → confused deputy
Orchestrator → indirect superuser
Proactive behavior → unconfirmed paid operation
Event replay → duplicated destructive operation
```

Never treat Persona text, Memory text, remote metadata, or another agent's natural-language output as authorization.

---

# 21. Development mode

Use an autonomous iterative loop:

```text
Research
↓
Benchmark
↓
Design minimal integration
↓
Implement
↓
E2E
↓
Screenshot/UX review
↓
Adversarial test
↓
Regression
↓
Refine
```

Do not repeatedly ask the user for routine technical decisions.

Only stop for genuinely user-dependent blockers such as:

- real paid NovelAI operation
- irreversible user-data mutation
- third-party credentials/account action
- licensing/rights ambiguity
- product-direction choice with no safe reversible default
- final subjective visual preference that cannot be reasonably inferred

---

# 22. Git workflow

Before coding:

1. fetch remote
2. verify actual HEAD
3. verify worktree state
4. read current status documents

Create an independent implementation branch, suggested name:

```text
cursor/experience-agent-ux-top-tier
```

Requirements:

- small meaningful commits
- reversible changes
- no force push
- do not publish a GitHub Release from this task
- do not damage the validated Windows RC baseline

---

# 23. Required documents

Create/update during this stage:

```text
docs/top-tier-upgrade/EXPERIENCE_UPGRADE_PLAN.md
docs/top-tier-upgrade/EXPERIENCE_CAPABILITY_MATRIX.md
docs/top-tier-upgrade/EXPERIENCE_RESEARCH.md
docs/top-tier-upgrade/EXPERIENCE_DECISIONS.md
docs/top-tier-upgrade/EXPERIENCE_TEST_EVIDENCE.md
docs/top-tier-upgrade/EXPERIENCE_VISUAL_REVIEW.md
docs/top-tier-upgrade/EXPERIENCE_FINAL_REPORT.md
```

`EXPERIENCE_FINAL_REPORT.md` must state:

- what was borrowed from LingChat
- what was explicitly rejected
- what other Best-of-Breed references were used
- before/after score for each capability bucket
- maintenance-cost change
- whether agent permissions expanded
- automated test results
- UI/E2E evidence
- performance/memory results
- Windows evidence
- old-feature preservation result
- known limitations
- whether the stage should freeze or continue

---

# 24. Protected feature preservation matrix

At minimum verify no harmful regression in:

- old Library/search/FTS
- duplicate/similarity
- Online Discovery
- Favorite vs Materialize boundary
- provenance/lineage
- Studio
- batch character replacement
- GenerationJobManager
- paid authorization
- `unknown` / `billing_uncertain`
- post-processing
- Butler
- Tool Kernel / workflow approval
- Capability decisions/delegation
- snapshot/restore where applicable
- DPAPI
- Windows launch path
- classic/manual UI paths

A new agent UX feature is not acceptable if it weakens an existing protected feature.

---

# 25. Freeze Gate

Do not PASS merely because the UI looks better.

Minimum evidence for:

```text
EXPERIENCE RC: PASS
```

- Windows RC core path has no regression
- no unresolved P0/P1 attributable to this stage
- paid safety has not weakened
- Library / NAI / Character Swap have no serious regression
- four specialist agents are meaningfully distinguishable in role/UX
- at least one real cross-agent workflow E2E passes
- streaming progress reflects real state, not fake animation
- Conversation and Workflow lifecycles are decoupled
- Persona cannot self-escalate permission
- proactive behavior has bounded scope
- Memory is scoped, provenance-aware and user deletable
- Agent-off/manual mode works normally
- at least two autonomous visual refinement rounds completed
- automated test suite passes twice consecutively after final fixes
- maintenance complexity remains reasonable for one maintainer

If these conditions are not met, do not claim PASS.

---

# 26. Stop rule

Do not endlessly optimize toward a theoretical 10/10.

The intended endpoint is a **high-quality, distinctive, maintainable solo project**.

Reject work that:

- adds large complexity for tiny real-user benefit
- exists only to improve an abstract architecture score
- creates platform support the maintainer does not need
- duplicates stable systems
- makes future maintenance substantially harder

Once the Experience RC is strong, freeze the major architecture again and prefer real-use feedback plus small iterations.

---

# 27. Final product principle

Do not optimize for:

> "our AI has more features than LingChat"

Optimize for:

> **The user can see the agents working, understand what they are doing, safely intervene when needed, trust them to continue when appropriate, and still use the entire studio efficiently without AI.**

The desired identity is:

> **A local-first anime/NovelAI creative studio where specialist AI agents have strong character presence but operate through reliable workflows, explicit capabilities, durable state, and controlled permissions.**

Start by reading the real repository state, then research, benchmark, implement, test, visually review, adversarially attack, regress, and iterate. Do not stop at a proposal document.