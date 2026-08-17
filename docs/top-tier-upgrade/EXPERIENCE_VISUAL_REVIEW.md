# Experience Visual Review

Screenshots: `.tmp/experience-visual/` (local only).

## Round 1

Captured `/` with Edge headless.

Findings:

- Four specialist chips rendered: 采集 / 图库 / 生成 / 客服
- Idle subtitle incorrectly always said「任务独立于聊天」
- Left-bottom placement would collide with Live2D docks

Fixes:

- Center the rail, leave side gutters
- Only mention chat/workflow split when a real event exists

## Round 2

Captured `/`, `/?workspace=acquire`, `/studio`, `/butler`.

Findings:

- Acquire workspace query opens Online Discovery cards (加入我的图库 / 收藏不下载)
- Idle copy is now「助手待命，可直接操作图库或工作台」
- Studio rail sat on the prompt column
- Butler already has a full agent desk; the rail duplicated the footer

Fixes:

- Skip rail on `/butler` (same rule as companion-dock)
- `body.experience-rail-on { padding-bottom: 96px }` so Studio/gallery content is not covered
- Stronger active-chip outline

## Remaining visual debt

- First-run banners + legal notice still make the home page dense
- Live2D subjective feel not re-scored
- Optional Playwright loop still skipped unless `EXPERIENCE_PLAYWRIGHT=1`

## Round 4

User-provided mockups: dashboard / online discovery / library / generation desk.

Implemented:

- `#experienceShell` with sidebar, Ctrl+K search, right specialist panel, status bar
- `/desk` dashboard: four specialist cards, Acquire→Library→Swap→Generate flow, real task/queue/storage numbers
- Notice sits in the center column, not over the agent panel
- Agent-off restores classic 8-item top nav
- No Pro/membership CTA

Still not copied from the mockups: paid membership, window min/max/close, four unique anime portraits (no extra cast assets this round).
