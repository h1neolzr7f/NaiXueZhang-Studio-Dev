# Experience Decisions

## ED-001 Event Plane is a projection

Date: 2026-08-17  
Chosen: `experience.projector.project_snapshot` reads Butler tasks and GenerationJobManager snapshots. Replay cannot execute.  
Rejected: a second event-sourced workflow engine.

## ED-002 Two presence characters, four specialist roles

Date: 2026-08-17  
Chosen: Keep 小祥 / 凑企鹅 Live2D. Map acquire+studio → tomori, library+support → sakiko.  
Rejected: four new Live2D casts this round (maintenance cost).

## ED-003 Persona claims are not authority

Date: 2026-08-17  
Chosen: `AgentManifest.primary_capabilities` is documentation. `CapabilityGateway.decide` remains the only permission check. Handoff `granted_capabilities` is always empty.

## ED-004 Layered memory without a vector database

Date: 2026-08-17  
Chosen: add layer/scope/provenance/confidence/retention onto `companion_state` memories. Reject scopes in `AUTHORITATIVE_SCOPES`.  
Rejected: global embedding index as system of record.

## ED-005 Rail is not a ninth primary nav item

Date: 2026-08-17  
Chosen: overlay rail loaded by `site-nav.js`. `NAV_PRIMARY` stays 8 items.

## ED-006 Experience chrome follows the specialist-studio mockups

Date: 2026-08-17  
Chosen: left sidebar + top search + right specialist panel + `/desk` dashboard. Classic 8-item top nav remains the agent-off fallback. Sidebar items map to existing routes.  
Rejected: Pro/membership paywall, Electron window chrome, a second workflow engine, rewriting `NAV_PRIMARY`.
