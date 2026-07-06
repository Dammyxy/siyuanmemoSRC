## Context

The latest live logs show the CDF/frontend preparation problem is resolved:

- `consume-advance.prepare-selected-review-card` is now about 1ms.
- `preMerge=kernel:sync-divergent-diagnostic 0ms skipped=true reason=review-rating-repair-gate`.
- Remaining slow Review grade phases match `session-runtime-answer`.
- Worker summaries attribute 0.5-1.1s to `session-feedback-commit`, `database:reviewFeedback.total`, and SQLite delta host effects (`sqlite.writeBinary`, `sqlite.writeJSON`, `sqlite.readBinary`) with large `hostTotal`.

Existing related changes already improved some SQLite delta append behavior:

- `deepen-sqlite-delta-append-hot-path` kept verified open-segment evidence inside `SqliteDeltaCheckpointLayer`.
- `preserve-sqlite-delta-hot-evidence-through-persist-preflight` kept same-runtime verified segment evidence through append preflight/rollover.

This change should not assume those were insufficient in code. First task is to reproduce the exact current `review.session.feedback` commit attribution in tests or diagnostics, then optimize the measured redundant step.

## Goals / Non-Goals

**Goals:**

- Build a tight feedback loop for Review session feedback commit latency.
- Distinguish session transaction time from SQLite delta append, manifest write, open/sealed segment read, queue-impact/projection, and host bridge wait.
- Reduce redundant SQLite delta host effects on ordinary consecutive Review session feedback commits when safe.
- Keep durable commit semantics fail-closed: no acknowledged Review commit without required storage evidence.
- Keep the optimization local to the measured Review session commit / SQLite delta path.

**Non-Goals:**

- No async fire-and-forget durability.
- No native SQLite/WAL migration.
- No kernel-side database writer.
- No Session Read Model or prepared-card window in this change.
- No CDF preparation changes.
- No host bridge cache unless code tracing proves the storage layer cannot own the invariant.

## Decisions

### Decision 1: Start with attribution, not a broad storage rewrite

The live logs are strong enough to classify the bottleneck, but not enough to choose the final optimization. The first implementation slice must add or sharpen focused diagnostics/tests around `review.session.feedback` commit, especially the SQLite delta host effect breakdown.

Alternative considered: immediately move Review commit durability off the hot path. Rejected because it would weaken the commit contract and mask failures as success.

### Decision 2: Keep the seam inside the owner of the invariant

If redundant segment/manifest IO remains the cause, the fix belongs in `SqliteDeltaCheckpointLayer` or `SqliteDatabaseService`, not `UnifiedQueueStrategy` or UI Review code. Those Review callers do not own msgpack segment identity, checksum rules, checkpoint policy, or host effect durability.

Alternative considered: cache host `readBinary`/`writeBinary` at the transport layer. Rejected unless tracing proves all higher-level storage evidence is already optimal, because a bridge cache would split correctness from the code that validates storage evidence.

### Decision 3: Optimize only same-runtime verified evidence

Same-runtime verified evidence can be reused only when it is keyed by exact manifest/segment identity and invalidated on explicit diagnostics, replay, repair, checkpoint, discard, startup, failure, or checksum mismatch. Cold recovery paths must continue reading persisted bytes.

Alternative considered: time-based caching. Rejected because Review durability and segment corruption handling need identity-based evidence boundaries.

### Decision 4: Preserve diagnostics as product surface

The output must continue to produce copyable `slow review.session.feedback worker-handle summary ...` logs, but with enough sub-attribution to tell whether the next bottleneck is host wait, segment encoding, manifest write, database transaction, queue impact, or session advance.

Alternative considered: rely only on unit test timing. Rejected because the original symptom is live host-path latency.

## Risks / Trade-offs

- [Risk] Over-optimizing tests rather than the live path -> Mitigation: use the exact `review.session.feedback` / `SqliteDatabaseService` path in focused tests and keep live diagnostic fields.
- [Risk] Cached evidence hides corrupt storage -> Mitigation: keep cold diagnostics/replay/repair paths invalidating and re-reading persisted bytes.
- [Risk] Commit appears faster by weakening durability -> Mitigation: tests must assert committed success still requires storage envelope/delta evidence.
- [Risk] Prior SQLite delta cache changes already cover the code path -> Mitigation: if tracing proves remaining time is host bridge write latency rather than redundant reads, update design/tasks before optimizing.

## Migration Plan

- No data migration expected.
- Rollback is code-only: disable/remove the narrow hot-path reuse or diagnostic attribution change.
- Live validation requires rebuilding the plugin and comparing `slow review.session.feedback worker-handle summary` before/after.

## Open Questions

- Is the 300-700ms `hostTotal` mostly SiYuan file API latency for required writes, or repeated redundant reads/writes?
  - Current finding: focused SQLite coverage now proves ordinary consecutive `review.feedback` appends reuse same-runtime verified open-segment evidence and do not re-read the open segment before diagnostics; the remaining ordinary append host work is the required open-segment `writeBinary` plus manifest `writeJSON`.
- Does `review.session.feedback` still read sealed/open msgpack bytes during ordinary consecutive commits after the previous delta evidence changes?
  - Current finding: no for ordinary consecutive append. The only open-segment read in the focused test is the explicit later diagnostics read, not the commit append itself.
- Is manifest JSON write frequency reducible without weakening crash recovery?
  - Deferred. The manifest is the durable pointer carrying segment checksum, entry count, sequence, and recovery metadata. Reducing its write frequency needs a separate recovery-semantics design rather than a hot-path cache tweak.

## Current Implementation Slice

This slice stops at attribution and evidence locking:

- `review.session.feedback` worker summaries now include host-effect breakdowns grouped by kind/path/storage class/count/total/max/bytes.
- Focused tests prove the copyable summary can distinguish open-segment writes, manifest JSON effects, SQL projection DB writes, and other SQLite host effects.
- Focused SQLite tests lock the current ordinary consecutive Review append behavior: no redundant open-segment read during commit, but one open-segment msgpack write and one manifest JSON write per append.

The measured next optimization is therefore not another same-runtime read cache. Reducing manifest writes, replacing host file writes, or moving durability off the click path remains out of this slice until a follow-up change defines crash recovery and fail-closed semantics.
