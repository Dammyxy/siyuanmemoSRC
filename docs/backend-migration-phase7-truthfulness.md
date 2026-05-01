# Phase 7 Truthfulness Status (R6 RM027/RM031)

Date: 2026-05-02
Runtime root: `.worktrees/siyuan-plugin-siyuanmemo/kernel-companion-p0/`

## Decision (RM027)

Phase 7 is **foundation-only** for this release slice.

Evidence:
- `src/application/services/AIWorkbenchPromptRuntime.ts` still calls `llmPort.chat(...)` directly at lines 250, 348, 414, 552.
- `scripts/backend-migration-compat-allowlist.json` already tracks this as `owner: foundation-only` with `trackingTask: RM031`.
- `ARCHITECTURE.md` records "Phase 7 foundation" rather than full runtime cutover.

## Remaining Runtime Migration Work (RM031)

The following is still open and must stay unchecked until implemented with tests:

1. Route prompt execution in `AIWorkbenchPromptRuntime` through backend session/job/network proxy under runtime policy (`RM028`).
2. Add tests proving migrated backend-AI mode does not use `llmPort.chat(...)` (`RM029`).
3. Add unhappy-path tests for cancellation, timeout, network unavailable, secret missing, backend unavailable, and sidecar unavailable (`RM030`).
4. Run and record manual AI network/streaming smoke only after runtime migration is enabled (`specs/.../tasks.md` `T092`).

## Scope Clarification

Completed Phase 7 work in this branch should be interpreted as scaffolding/foundation:
- backend contracts
- session/job runtime helpers
- diagnostics
- wiring hooks

It must not be interpreted as fully migrated runtime prompt/network streaming ownership.
