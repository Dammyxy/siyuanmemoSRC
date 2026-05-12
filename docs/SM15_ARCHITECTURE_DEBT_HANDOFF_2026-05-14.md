# SM-15 Architecture Debt Handoff - 2026-05-14

## Purpose

Next session should continue grilling the SM-15-inspired architecture debt that was deliberately kept out of `deepen-review-attempt-kernel`.

Use this as a resume note, not as a source of truth. Source truth stays in code, OpenSpec artifacts, `ARCHITECTURE.md`, and `docs/DDD_RESCAN_BACKLOG.md`.

## Current State

- Active product root: `H:/project-F/flashcard/.worktrees/siyuan-plugin-siyuanmemo/kernel-companion-p0/`.
- Workspace OpenSpec change created: `H:/project-F/flashcard/openspec/changes/deepen-review-attempt-kernel/`.
- Current OpenSpec scope: **Review Attempt Kernel** only.
- Backlog entry created: `docs/DDD_RESCAN_BACKLOG.md`, section `2026-05-13 - SM-15-inspired architecture debt staging`.
- Runtime code was not changed for this architecture planning step.

## Recommended Skills

- Start with `siyuanmemo-plugin-dev`.
- Use `grill-with-docs` for terminology, ownership, and ADR/context pressure.
- Use `improve-codebase-architecture` if comparing candidate modules and depth.
- Use `openspec-explore` or `openspec-propose` only after one debt item is selected.
- Keep caveman communication active because `siyuanmemo-plugin-dev` mandates it.

## Context To Read First

- `openspec/changes/deepen-review-attempt-kernel/proposal.md`
- `openspec/changes/deepen-review-attempt-kernel/design.md`
- `openspec/changes/deepen-review-attempt-kernel/specs/review-attempt-kernel/spec.md`
- `openspec/changes/deepen-review-attempt-kernel/tasks.md`
- `docs/DDD_RESCAN_BACKLOG.md`, newest `SM-15-inspired architecture debt staging` entry
- `CONTEXT.md`
- `ARCHITECTURE.md`
- `docs/ADR-001-runtime-split.md`
- `docs/ADR-002-sql-worker-authority.md`
- `docs/ADR-004-no-ui-sql.md`
- SM-15 reference: `H:/project-F/flashcard/.agents/skills/siyuanmemo-plugin-dev/references/reference-projects/sm-15.md`
- SM-15 source: `H:/project-F/flashcard/SM-15/sm.coffee`

## Key Prior Decision

Do not expand `deepen-review-attempt-kernel` into the full SM-15-style architecture roadmap.

Reason: it already crosses Review, Queue, Scheduler, backend feedback, and projection. Expanding scope would weaken implementation and validation boundaries.

## Best Next Grill Target

Recommended first target: **Queue Projection Readiness Module**.

Why: the recent first-open Browser failure showed projection readiness is a shallow contract. Current behavior has frontend transient retry and materialized echo repair, but backend RPC still does not expose a clear readiness union.

Suggested first grill question:

> Should queue projection readiness become a backend contract (`ready | refreshing | unavailable`) before refactoring Browser lifecycle, or should Browser lifecycle own retry/wait policy first?

Recommended answer:

> Backend contract first. Browser can only be clean if backend/client/manager expose one readiness vocabulary. Keep UI retry bounded, but do not let UI infer projection state from generic unavailable errors.

## Deferred Architecture Candidates

### Queue Projection Readiness Module

Problem: readiness is spread across `UnifiedDataSourceManager`, backend projection RPC, `BaseReviewQueue`, Browser datasource retry, and materialized echo.

Desired shape: one Module owns readiness transitions, materialization, generation/policy identity, unavailable diagnostics, and retry guidance.

Likely code to trace:

- `src/application/services/UnifiedDataSourceManager.ts`
- `src/core/queue/domain/BaseReviewQueue.ts`
- `src/ui/browser/utils/projectionReadiness.ts`
- `src/ui/browser/SRSBrowser.vue`
- `packages/contracts/src/backend-rpc.ts`
- `src/infrastructure/persistence/sqlite/SqlQueueProjectionRepository.ts`

### Browser Queue View Module

Problem: `SRSBrowser.vue` still owns too much lifecycle: queue selection, projection readiness, datasource attachment, first-row loading, focus state, and AG-Grid failure handling.

Desired shape: a testable lifecycle Module: select queue -> prepare projection/readiness -> attach datasource -> expose first rows/empty/error state.

Likely code to trace:

- `src/ui/browser/SRSBrowser.vue`
- `src/ui/browser/datasource/*`
- `src/application/services/BrowserApplicationService.ts`
- `src/application/queries/browser/shared/QueueBrowserQueryKernel.ts`

### Scheduler State Snapshot

Problem: SiYuanMemo has `SrsV2Kernel`, but not a serializable algorithm-state graph like SM-15 `data/load`.

Desired shape: a scheduler-state snapshot Module that can hold algorithm evidence and future adaptive parameters without coupling to UI or queue projection.

Likely code to trace:

- `src/core/scheduler/srs-v2/SrsV2Kernel.ts`
- `src/core/scheduler/SchedulerRouter.ts`
- `src/core/scheduler/strategies/*`
- review log types and persistence paths

### Memory Item vs Content Payload Seam

Problem: card content, block source, scheduling state, and browser row projection still leak into each other.

Desired shape: clarify three snapshots: `MemoryItemSnapshot`, `SourceContentProjection`, and `BrowserRowProjection`.

Likely code to trace:

- `src/types/card.ts`
- `src/types/browser.ts`
- `src/core/queue/domain/queueCardProjection.ts`
- `src/application/services/queue-projection/QueueProjectionBuilder.ts`

### Learning Curve Evidence Module

Problem: SM-15 has curve evidence/fitting locality; SiYuanMemo has revlogs and external SRS foundations, but no active advisory Module that converts review history into curve evidence.

Desired shape: advisory-only evidence Module reading revlog/history and producing diagnostics or parameter suggestions, not formal schedule writes.

Likely code to trace:

- review log persistence/read paths
- `src/application/services/ArenaKernelService.ts`
- external SRS algorithm foundation if still deferred
- scheduler configuration paths

## Guardrails

- Do not edit `H:/project-F/flashcard/siyuan-plugin-siyuanmemo/`; it is baseline mirror unless explicitly redirected.
- Do not add fallback/degrade/compat dual paths to hide missing backend readiness.
- Do not move `siyuanmemo.db` writes into UI or kernel companion.
- If touching runtime ownership/call-chain, update `ARCHITECTURE.md`.
- If fixing or deferring production debt, update `docs/DDD_RESCAN_BACKLOG.md`.
- If proposing implementation, create a focused OpenSpec change rather than appending to `deepen-review-attempt-kernel`.

## Suggested Next Outcomes

Good outcome for next session:

1. Pick one debt item.
2. Grill the key branch decisions against code and docs.
3. Update `CONTEXT.md` only if a domain term is resolved.
4. Create an OpenSpec proposal only after scope is narrow.

Bad outcome:

- A single mega-proposal that tries to do readiness, browser lifecycle, scheduler snapshots, and content seams together.
