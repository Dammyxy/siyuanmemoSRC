## Context

`review.session.feedback` is now backend-worker authoritative. The durable Review commit path enters `SqliteDatabaseService`, then `SqliteDeltaCheckpointLayer`, where append preflight reconstructs a SQLite delta snapshot before appending a new durable event.

Prior changes already made ordinary same-runtime appends reuse verified open-segment evidence and preserve newly sealed segment evidence after rollover. The remaining architecture friction is that the module's evidence reuse interface is named and routed as open-segment-only even though the same storage invariant also applies to sealed segments whose identity was verified in the same runtime.

From a global architecture view, the right seam is still `SqliteDeltaCheckpointLayer`:

- Review and Queue callers do not own segment checksums, sequence continuity, manifest identity, legacy recovery, or checkpoint policy.
- The host bridge only moves bytes and reports timing; a bridge cache would split correctness from the module that validates storage evidence.
- Async/fire-and-forget commit would weaken the Review commit interface and contradict fail-closed durability.

## Goals / Non-Goals

**Goals:**

- Deepen the SQLite delta module by making verified segment evidence reuse a single identity-scoped interface that covers open and sealed segments when safe.
- Avoid same-runtime append-preflight sealed msgpack reads after the module itself produced and verified the sealed segment.
- Preserve cold startup/reload behavior: persisted sealed bytes must still be read and verified when no same-runtime evidence exists.
- Preserve fail-closed durable Review commit semantics and existing checksum/sequence evidence checks.
- Keep diagnostics able to attribute any remaining sealed reads to append preflight or recovery substeps.

**Non-Goals:**

- No Review UI, Queue, session cursor, or worker transport cache changes.
- No host bridge `readBinary` cache.
- No native SQLite/WAL migration.
- No manifest write batching.
- No async durability or optimistic success.
- No suppression of recovery, replay, repair, checkpoint, discard, startup, failure, checksum mismatch, or legacy recovery reads.

## Decisions

### Decision 1: Rename the evidence interface around verified segment identity

The existing implementation already stores `verifiedSegmentEvidenceByPath` and validates path, sequence, sealed flag, checksum, entry count, and byte size. The shallow part is the caller-facing option name: `allowVerifiedOpenSegmentEvidence` suggests only open evidence is allowed even though `readVerifiedSegmentEvidence()` can validate sealed evidence under durable checkpoint storage.

Change the internal option to `allowVerifiedSegmentEvidence` and route append-preflight snapshot reconstruction through that identity-scoped interface.

Alternative considered: add a separate `allowVerifiedSealedSegmentEvidence` flag. Rejected because it exposes two knobs for one invariant and makes callers reason about segment classes instead of verified identity.

### Decision 2: Keep evidence ownership inside `SqliteDeltaCheckpointLayer`

Evidence is remembered only after this module builds or reads a segment and proves its manifest entry identity. Callers only ask the module to append/replay/diagnose; they do not receive or pass segment cache tokens.

Alternative considered: expose a snapshot/evidence token to `SqliteDatabaseService` or Review worker code. Rejected because that makes the interface shallow and spreads storage correctness knowledge across callers.

### Decision 3: Preserve explicit invalidation on non-append paths

Diagnostics, replay, discard, clear-after-checkpoint, checkpoint failure, startup/reload, append errors, and checksum mismatch continue to clear append hot-path snapshot and verified evidence where they already do. This keeps cold and recovery paths reading persisted bytes.

Alternative considered: retain sealed evidence across diagnostics. Rejected because diagnostics are an explicit persisted-state inspection surface and must not hide storage corruption.

### Decision 4: Test through the database service seam

Focused tests should use `SqliteDatabaseService` and the memory file adapter, not private checkpoint methods. The behavior users care about is whether consecutive durable Review-like appends avoid redundant sealed `readBinary` host effects while reload still reads persisted sealed bytes.

Alternative considered: test private helper methods. Rejected because private tests would overfit implementation and miss the real commit interface.

## Risks / Trade-offs

- [Risk] Reused sealed evidence hides corrupt storage -> Mitigation: reuse only same-runtime evidence with exact manifest identity; reload, diagnostics, and mismatch paths still read persisted bytes and fail closed.
- [Risk] Cache grows with many sealed segments -> Mitigation: evidence is held only in-process and cleared by existing checkpoint/diagnostic/recovery paths; this change does not add unbounded cross-runtime storage.
- [Risk] Tests prove synthetic behavior but live path still slow -> Mitigation: preserve purpose/substep host attribution and validate with focused tests plus live `hostBreakdown` logs after build.
- [Risk] The real bottleneck is required writes after sealed reads are removed -> Mitigation: keep scope narrow and leave manifest write batching/native SQLite/WAL for separate changes with crash recovery design.

## Migration Plan

- No data migration.
- Rollback is code-only: revert the evidence option rename/reuse path and tests.
- Deployment validation compares `slow review.session.feedback worker-handle summary` before/after. Same-runtime ordinary appends should no longer report avoidable sealed `sqlite.readBinary` under `purpose=sqlite-delta.append-preflight`; reload/recovery diagnostics may still report required sealed reads.

## Open Questions

- Do live slow logs show sealed reads after same-runtime rollover, or mainly after worker reload/cold startup?
- Once avoidable sealed reads are gone, is remaining latency dominated by required open-segment writes, manifest writes, or host bridge wait?
