## Context

Attached production logs show two coupled Review failures:

- Card rating latency: `ReviewSessionController` reports slow feedback phases around 4s, while backend `review.feedback` worker handling reaches 3-15s.
- Card rating correctness: `review.feedback` transactions fail with backend host-effect timeouts, SQLite persist/restore failure, corrupt open-segment repair failure, queue `handleReview` errors, and pending Review truth flush errors.

Current active path:

`Review UI -> UnifiedQueueStrategy / Review session runtime -> ReviewCommitUseCase -> SrsBackendClient -> BrowserSrsBackendWorkerTransport -> BackendReviewRpcAdapter -> WorkerReviewFeedbackRuntime -> WorkerReviewCardMutationPersistenceModule -> SqliteDatabaseService / truth flush`

Constraints:

- Backend worker remains authoritative for formal `review.feedback`.
- Renderer-side scheduler fallback is not allowed.
- Rating success must stay fail-closed: no committed success unless durable minimum evidence is proven.
- Existing dirty worktree already contains related storage/projection changes, so implementation must be scoped and must not overwrite unrelated work.

## Goals / Non-Goals

**Goals:**

- Make card rating visibly fast under normal backend conditions by removing non-essential synchronous work from the rating hot path.
- Make rating outcomes unambiguous: committed, duplicate committed, retryable pending, unavailable, or repair-required.
- Preserve exactly-once scheduler/review-event behavior through idempotency keys when users retry after ambiguous failures.
- Keep diagnostics tied to the attached trace shape: host-effect timeout, SQLite transaction persist/restore failure, open-segment repair failure, truth flush pending, and derived queue/projection maintenance.
- Add focused regression tests before implementation changes.

**Non-Goals:**

- No native SQLite/WAL migration.
- No kernel-side database writer.
- No local renderer scheduler fallback.
- No broad browser/projection redesign beyond work proven to block the rating path.
- No cleanup of unrelated existing OpenSpec changes.

## Decisions

### Decision: Treat rating as one end-to-end feedback path

Rating bugs are not only UI latency or only SQLite corruption. The user-visible failure is the whole `review.feedback` path reporting slow or wrong state. The change will therefore validate the full path from `ReviewCommitUseCase` result mapping through backend worker durability state.

Alternative considered: split into separate storage and UI changes. Rejected because current logs show UI slow phase, backend host-effect pressure, SQLite failure, and truth flush pressure in the same rating session.

### Decision: Define minimum durable commit before derived work

Synchronous success will require only scheduler/card state, append-only review fact/event evidence, and idempotency identity. Queue projection refresh, Browser projection warmup, truth flush, Xiuyuan/native-Riff sync, and full checkpoint maintenance must be separately reported as derived or deferred unless needed to prove current commit durability.

Alternative considered: keep waiting for all derived work. Rejected because attached logs show secondary host effects timing out while rating blocks or becomes ambiguous.

### Decision: Fail closed on unproven transaction recovery

If SQLite persistence fails and in-memory restore also fails, the backend must not return a successful committed result. It must surface explicit unavailable/repair-required state and preserve enough idempotency evidence to make retry safe when possible.

Alternative considered: optimistic UI success plus background recovery. Rejected because it creates the reported "rating error" class: visible state may advance without durable evidence.

### Decision: Make retry reconciliation idempotency-first

Ambiguous retry handling must use commit idempotency key plus card identity, rating, reviewed timestamp, and queue type. Matching durable evidence returns duplicate committed success; mismatched evidence fails closed.

Alternative considered: retry by latest card state only. Rejected because scheduler state alone cannot prove whether a specific rating event was already applied.

### Decision: Add diagnostics at boundaries, not blanket logs

Instrumentation should tag phase and outcome at the existing boundaries: use case, client, transport, backend RPC, mutation persistence, SQLite transaction, truth flush. Tests should assert result state and retry behavior, not raw timing logs.

Alternative considered: add generic slow logs everywhere. Rejected because the code already has many slow logs; missing contract is outcome classification.

## Risks / Trade-offs

- Host-effect timeouts may still occur under heavy SiYuan/kernel pressure -> synchronous rating must surface retryable/unavailable state and defer non-essential work.
- Existing dirty changes may already modify this path -> implementation must inspect current diff and add minimal patches on top.
- Too much deferral can leave Browser/queue projections stale -> result must explicitly expose projection/truth/derived state so Review can refresh or retry deliberately.
- Tight latency budgets may be flaky in tests -> tests should use deterministic fake host effects and outcome assertions, with only coarse timing thresholds where needed.

## Migration Plan

1. Add failing regression coverage for slow/error trace classes using deterministic fake backend/file-service behavior.
2. Implement result-state and retry semantics at backend worker and client/use-case boundaries.
3. Move or classify secondary maintenance work out of the synchronous committed-success gate.
4. Validate with focused tests, hidden-fallback/boundary checks, and build.
5. Update `ARCHITECTURE.md` only if hot-path ownership changes, and append `docs/DDD_RESCAN_BACKLOG.md` delta when production code changes.

Rollback strategy: revert the scoped implementation patch and keep the OpenSpec change as investigation record. Do not restore renderer scheduler fallback.

## Open Questions

- What user-visible label should Review show for retryable pending versus backend unavailable?
- Which existing related change should own shared SQLite open-segment repair if implementation overlaps: this change or `repair-sqlite-delta-open-segment-checksum`?
- Should truth flush retry remain in `SrsBackendClient`, or move behind a narrower review truth maintenance service after this path is stable?
