## Context

Latest live Review logs show `review.session.feedback` still costs roughly 480-669ms after previous CDF preparation and repair-merge work:

- Frontend summary is dominated by `session-runtime-answer`; `consume-advance` is 0-2ms.
- Worker summary duration matches frontend duration, so worker queueing / receive delay is not the dominant cause.
- `preMerge=kernel:sync-divergent-diagnostic 0ms skipped=true reason=review-rating-repair-gate`, so pre-request merge is not the dominant cause.
- `hostBreakdown` repeatedly shows multiple `sqlite.readBinary sealed-*.msgpack` effects during one Review feedback commit.

The previous change proved ordinary consecutive appends do not re-read the open segment before diagnostics and that required open-segment writes are relatively small in the latest logs. The new question is narrower: which commit substep asks SQLite delta to read sealed segments, and whether that belongs in the hot Review rating path.

## Goals / Non-Goals

**Goals:**

- Attribute each sealed `sqlite.readBinary sealed-*.msgpack` effect to a named Review/SQLite commit substep.
- Distinguish replay, diagnostics, projection rebuild, checkpoint recovery, transaction preflight, queue impact, and ordinary append work.
- Produce copyable slow-log evidence that tells whether sealed reads are required durability evidence or avoidable hot-path rebuild work.
- Add focused regression coverage around the sealed-read attribution seam.
- Preserve fail-closed Review commit durability.

**Non-Goals:**

- No async/fire-and-forget Review commit.
- No native SQLite/WAL migration in this change.
- No kernel-side database writer.
- No manifest write frequency change in this change.
- No broad storage rewrite before attribution proves the owner and invariant.
- No CDF/frontend preparation changes.

## Decisions

### Decision 1: Instrument the storage owner, not the UI caller

The sealed reads appear inside `database:reviewFeedback.total`, below `session-feedback-commit`. UI and Review queue callers do not own segment manifests, checksums, replay policy, or checkpoint recovery. Attribution therefore belongs around `SqliteDatabaseService` / SQLite delta checkpoint operations, with worker timing carrying the result upward.

Alternative considered: add more frontend timers. Rejected because frontend already shows the wait is `session-runtime-answer` and cannot explain sealed segment paths.

### Decision 2: Classify sealed reads by purpose

Every sealed-segment read in a slow Review feedback commit must be grouped by purpose such as replay, diagnostics, projection rebuild, checkpoint recovery, transaction preflight, or queue impact. Path-only timing is insufficient because the same `readBinary` host effect can be legitimate on cold recovery and suspicious on ordinary hot rating.

Alternative considered: only report aggregate `hostTotal`. Rejected because the current logs already have host totals but still leave the root cause ambiguous.

### Decision 3: Treat optimization as a follow-up unless proof is narrow

This change may add a tiny safe optimization only if tracing proves a sealed read is purely diagnostic/rebuild work inside ordinary Review feedback and can be skipped without changing durable success semantics. Otherwise it stops at attribution and records the next optimization option.

Alternative considered: immediately cache all sealed segment reads in-process. Rejected because stale sealed evidence could hide corruption, replay, repair, or checkpoint recovery bugs.

### Decision 4: Keep recovery paths cold and explicit

Diagnostics, replay, repair, checkpoint recovery, startup, discard, checksum mismatch, and explicit projection rebuild paths must continue to read persisted sealed bytes when they need durable evidence. Hot-path attribution must not make those paths look clean by suppressing required reads.

Alternative considered: reuse same-runtime sealed evidence globally. Rejected because sealed-segment correctness is identity/checksum scoped, not time scoped.

## Risks / Trade-offs

- [Risk] Extra diagnostics add overhead to already slow Review feedback -> Mitigation: collect compact labels/counts/totals only on existing timing scope and keep payload copyable.
- [Risk] Tests reproduce a synthetic path, not live Review feedback -> Mitigation: use the same `reviewFeedback` / SQLite delta service seam and assert host-effect paths by sealed/open segment class.
- [Risk] Attribution reveals required recovery work, not avoidable hot-path work -> Mitigation: stop at classification and update tasks/backlog instead of forcing an unsafe optimization.
- [Risk] Sealed reads come from multiple owners -> Mitigation: group by purpose and substep, then optimize only the owner with a clear invariant.

## Migration Plan

- No data migration.
- Rollback is code-only: remove the added attribution fields/log formatting.
- Live validation compares `slow review.session.feedback worker-handle summary ... hostBreakdown=...` before/after and checks whether sealed reads now include a purpose/substep label.

## Open Questions

- Are sealed reads triggered by replay/projection rebuild during every Review feedback commit?
- Are sealed reads caused by queue-impact/counter refresh after commit rather than the commit envelope itself?
- Does `database:reviewFeedback.total` have a large CPU/decode component after host reads complete?
- Is there already a same-runtime projection state that can satisfy the hot path without replaying sealed delta segments?
