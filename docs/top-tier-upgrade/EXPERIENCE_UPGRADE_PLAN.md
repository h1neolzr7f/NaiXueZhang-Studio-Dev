# Experience Upgrade Plan

Minimal integration over the Windows RC baseline. No second engine.

## P0

1. Typed Event Plane in `experience/` projecting Butler tasks + GenerationJobManager + companion signals.
2. Streaming UX via `/api/experience/snapshot` and the classic experience rail.
3. Conversation ≠ Workflow: chat clear only deletes `butler_messages`.

## P1

1. `AgentManifest` for acquire / library / studio / support (+ hidden orchestrator).
2. Workflow/event → character state → existing Live2D situation map.
3. Layered memory metadata on top of `companion_state` (no vector DB).
4. Bounded proactive classifier: OBSERVE / SUGGEST / CONFIRM_REQUIRED / DENY. Never EXECUTE paid/delete.
5. Product Typed Handoff + scoped delegation. Gateway still decides.
6. Workspace-oriented rail: four specialist chips link to existing pages.

## Out of scope this commit series

- Live2D redesign, TTS, Pixiv login, paid NovelAI calls, Electron, new plugin sandbox.
