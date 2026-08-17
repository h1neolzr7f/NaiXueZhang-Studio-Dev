# Experience Capability Matrix

Scoring: 0 none, 5 path exists but weaker than benchmark, 8 production-usable, 10 leading with evidence.

| Capability | Current Score | Evidence | User Value | Weakness | Benchmark | Mechanism To Borrow | What NOT To Borrow | Proposed Change | Maintenance Cost | Validation | Regression Risk | New Score |
|---|---:|---|---|---|---|---|---|---|---|---|---|---:|
| AI conversation UX | 6.0 | butler.js chat + confirm tickets | High | Long silence on durable work | LingChat streaming | Show business stages only | Chain-of-thought | Event rail + snapshot | Low | pytest + UI contract | Chat/workflow mix | 7.5 |
| Agent identity | 6.5 | sakiko/tomori AGENTS | High | Two desks, four jobs unnamed | LingChat multi-character | Specialist labels + workspace | Extra cast / romance | AgentManifest | Low | manifests tests | Tool allowlist drift | 8.0 |
| Agent memory | 6.5 | companion_state v1.9 | Medium | Flat list, no layer/scope | LingChat memory lifecycle | propose/confirm/forget + metadata | Global vector authority | layered memory fields | Low | memory + adversarial | Prompt injection | 7.5 |
| streaming UX | 5.5 | butler planned progress `initial_estimate` | High | Estimate shown as if exact | Job managers | exact/estimate/unknown basis | Fake bars | Event progress fields | Low | event plane tests | Fake UX claim | 7.5 |
| workflow observability | 6.5 | butler SSE + nai jobs | High | Three disconnected channels | Existing job/task stores | Projection only | Second engine | `/api/experience/*` | Low | snapshot HTTP | Dual truth | 7.5 |
| proactive behavior | 6.0 | companion events + quiet hours | Medium | Not classified by risk | LingChat proactive | OBSERVE/SUGGEST/CONFIRM/DENY | Unconfirmed paid execute | classify_proactive | Low | adversarial tests | Paid bypass | 7.0 |
| cross-agent cooperation | 5.0 | companion handoff + unused TypedHandoff | High | Free-text / no product API | Finish plan §5.3 | TypedHandoff + delegation | NL as authority | product handoff API | Medium | E2E + confused-deputy | Confused deputy | 7.5 |
| workspace integration | 6.0 | classic 8-nav + pages | High | Chat feels like the product | Classic studio pages | Rail → existing workspaces | 4 chat windows | experience-rail | Low | site-nav still 8 | 9th nav item | 7.5 |
| visual feedback | 6.0 | Live2D dock + butler mood regex | Medium | Title regex → costume | LingChat state-driven UI | Event → state → situation | Anime skin over work | mapping table | Low | butler fallback kept | Costume flicker | 7.0 |
| error recovery UX | 7.0 | unknown / billing_uncertain | High | Not visible in a single rail | GenerationJobManager | Surface warning events | Auto-retry paid | billing_uncertain event | Low | event tests | Retry semantics | 7.5 |
| onboarding | 6.5 | responsibility notice + 小祥 | Medium | New specialists undiscoverable | Current dock chips | Four desk chips | Extra wizard | rail desks | Low | UI contract | Nav clutter | 7.0 |
| solo-maintainer sustainability | 8.0 | FastAPI + classic JS | Critical | New package must stay thin | This repo | Additive `experience/` | New framework | no Vue/Electron | Low | file count small | Abstraction pile | 8.0 |

Barrel lowest after this wave: **proactive behavior / visual feedback = 7.0**.
TTS remains non-core.
