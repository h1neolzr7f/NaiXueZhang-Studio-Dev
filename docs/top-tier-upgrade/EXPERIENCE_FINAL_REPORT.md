# Experience Final Report (in progress)

Date: 2026-08-17  
Repo: `h1neolzr7f/NaiXueZhang-Studio-Dev`  
Branch: `cursor/experience-agent-ux-top-tier`  
Baseline HEAD: `5769857`

```
EXPERIENCE RC: NOT YET
```

This wave implemented the D-020 P0/P1 control surface. It does not replace the Windows Source RC and does not publish a Release.

## Borrowed from LingChat

State-driven presence, streaming business stages, persona/resource separation, multi-specialist organization, memory lifecycle (propose/confirm/forget).

## Explicitly rejected

Romance/bond meters, RP story, companionship emotion sim, TTS barrel, AGPL source, God Agent, screen/hooks, a second workflow engine.

## Other references

GenerationJobManager progress fields; classic gallery/Studio workspaces; existing Capability Gateway.

## Score changes

See `EXPERIENCE_CAPABILITY_MATRIX.md`. Weakest remaining experience rows: proactive / visual ≈ 7.0. Solo-maintainer cost stayed low: one thin `experience/` package + one rail.

## Agent permissions

No expansion. Manifest claims are not authority. Orchestrator still cannot execute. Acquire still cannot `nai.generate_paid`.

## Tests

- New experience tests + nav/capability/companion regressions: green
- Paid-safety subset (`test_nai_authorization`, `test_char_swap_http_contract`, generation jobs, online E2E, startup): 80 passed
- Playwright visual test present but skipped without `EXPERIENCE_PLAYWRIGHT=1`
- Full pytest twice and quality-gate JSON still required before PASS

## UI / E2E evidence

Four visual rounds. Round 4 follows the user mockups: `/desk` dashboard, left sidebar, top search, right specialist panel. Classic 8-nav is the agent-off fallback. Playwright shell loop passed with Edge.

## Performance / memory

Rail polls snapshot every 4s only when the tab is visible. Agent-off removes the rail. No new frontend framework.

## Windows evidence

Implemented and visually reviewed on this Windows machine against an isolated `data_dir`. No production library writes. No paid NovelAI call.

## Preservation

Classic 8-item primary nav unchanged. Capability Gateway / GenerationJobManager / paid ticket / `billing_uncertain` / companion v1.9 / sakiko-tomori allowlists unchanged.

## Known limits

- Full suite not yet run twice on this branch
- Live2D feel still subjective
- Product handoff store is a small JSON file, not LangGraph
- Online favorites remain process-memory for synthetic providers (pre-existing)

## Next

Continue the D-020 loop: full pytest ×2, quality gate, one more visual pass after dismissing first-run banners, then decide whether to freeze.
