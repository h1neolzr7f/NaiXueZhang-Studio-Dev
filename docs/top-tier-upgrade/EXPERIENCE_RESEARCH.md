# Experience Research

Date: 2026-08-17  
Baseline: `NaiXueZhang-Studio-Dev` `5769857`  
Branch: `cursor/experience-agent-ux-top-tier`

## LingChat (https://github.com/SlimeBoyOwO/LingChat)

Read the real repository tree, not just the README. LingChat is a Vue + Tauri companion/galgame client (`src/App.vue`, `src/stores`, `src/composables`, `src/core`, `src-tauri`). License is AGPL. This tree is MIT; no LingChat source was copied.

Borrowed mechanisms:

- Character presence is a projection of application state, not a `play_expression()` call from business code.
- Streaming / continuous feedback instead of a silent wait.
- Persona resources (avatar, costumes, situations) stay separate from permission logic.
- Multi-character organization: different specialists, not one fused God Agent.
- Memory has a lifecycle (propose / confirm / forget) and is not the system of record.

Explicitly rejected:

- Romance / bond meters
- RP story modules
- Deep emotion simulation for companionship
- TTS as a core barrel item
- AGPL code, God Agent, screen/hooks

## Other Best-of-Breed references

| Bucket | Reference | Mechanism borrowed | Not borrowed |
|---|---|---|---|
| Workflow observability | Existing Butler SSE + GenerationJobManager | Project real job/task fields; label estimate vs exact | Second workflow engine |
| Asset workspace | Current classic gallery / Studio / Remix | Workspace is the product; chat is a control surface | Four identical chat windows |
| Task queue | GenerationJobManager | `done/total`, `billing_uncertain`, queue position | Fake determinate bars |
| Desktop assistant UX | Current companion-dock + Live2D | Keep two presence characters; map four specialist roles onto them | Extra Live2D cast this round |

## Current-code facts used

- Capability Gateway remains the only authority (`EXECUTION_WIRED=False`).
- Butler `sakiko` / `tomori` remain the Live2D presence and tool allowlists.
- Companion memory v1.9 remains the storage; D-020 only adds layer/scope metadata.
- Classic `web/*.html` is the product shell. React `/app` stays a stub/redirect.
