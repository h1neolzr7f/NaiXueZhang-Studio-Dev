# Experience Test Evidence

## Targeted suite

```text
pytest -q tests/test_experience_*.py tests/test_site_nav_ui.py tests/test_companion_dock_ui.py tests/test_capability_gateway.py tests/test_companion_v19.py tests/test_butler_ui.py
# 56 passed, 3 subtests
```

## Invariants locked

- Event progress basis is `exact` or `estimate`, never a silent fake bar.
- Replay of projected events sets `executed=False`.
- Clearing `butler_messages` keeps `butler_tasks`.
- Acquire cannot self-grant `nai.generate_paid`.
- Orchestrator cannot execute or own a product handoff.
- Handoff confused-deputy: acquire cannot consume a studio transform; paid capability is out of scope.
- Acquire → selection → typed handoff → studio `transform.character_replace` E2E passes via delegation.
- Memory billing/token scopes are rejected; forget works.
- Primary nav remains 8 items. Rail uses `ApiClient`, no bare `fetch`.
- Agent-off is a first-class local flag.

## Still required before EXPERIENCE RC: PASS

- Full pytest twice
- `product_quality_gate`
- Windows visual loop (screenshot → fix → screenshot)
- Paid-safety regression files (`test_nai_authorization`, `test_char_swap_http_contract`)
