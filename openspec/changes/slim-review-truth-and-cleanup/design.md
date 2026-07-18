## Context

Current slow-rating evidence shows `review.session.feedback` spends only a few milliseconds in scheduler and SQL row mutation, while the commit is delayed by storage pressure work. The hot path repeatedly pays for exact inventory: reading `siyuanmemo.db` and listing `truth/` files before each ordinary Review feedback mutation.

The exact inventory is triggered because `review-events` is already over the hard storage-pressure threshold. Inspection of bloated `review-events` segments shows generic `storage.review.event.v1` records that carry full SQLite `operations` arrays and broad `affectedAggregates`, including large bulk delete/insert operation sets. Segment compaction can merge files, but it cannot make an already-huge single record skinny.

The active Review feedback path already builds skinny `review.feedback.v2` truth candidates for the journal/flush path. The generic truth promotion path still falls back to a shallow storage record for non-card/non-queue outputs and copies `mutationEnvelope.operations` into `review-events`.

## Goals / Non-Goals

**Goals:**
- Stop new `review-events` truth bloat at the publication interface.
- Keep Review truth records as facts that are projectable/reconstructable without embedding generic SQLite operation arrays.
- Keep old operation-bearing `storage.review.*` records replayable as legacy evidence until cleanup rewrites them.
- Add a verified cleanup path that replaces bloated existing Review truth with skinny Review facts and a fenced generation.
- Remove the old hard-pressure cause so ordinary rating does not synchronously inventory storage because of previous Review truth bloat.

**Non-Goals:**
- No blanket bypass of hard storage pressure for Review feedback.
- No removal of legacy operation replay before existing data is rewritten.
- No redesign of the full SQLite delta log, cross-device sync protocol, or all MessagePack truth families.
- No deployment/copy into a live plugin directory as part of this change.

## Decisions

1. Deepen Review truth publication with a Review-specific encoder.

   `WorkerTruthPublicationModule` will route `requiredTruthOutputs` with `family === 'review'` to a Review truth encoder. The encoder will derive `MessagePackReviewEventTruthRecord` facts from the mutation envelope when enough Review evidence exists, and it will reject Review publication that would require copying raw SQL `operations`.

   Alternative considered: keep the generic `storage.${family}.${kind}.v1` path and omit `operations`. Rejected because it would still publish shallow storage-shaped records that are not the Review truth model and would leave future maintainers unclear about the Review contract.

2. Make bloat prevention explicit at the record boundary.

   Review publication will validate every new `review-events` record before append: no `operations` field, no full `affectedAggregates` field, supported Review record type, and a byte budget small enough to catch bulk SQL payload regressions before manifest writes.

   Alternative considered: only rely on tests around current call sites. Rejected because future bulk/import paths can reach the same publication module through different mutation labels.

3. Preserve legacy operation replay as an adapter, not as the new format.

   `CompactableCanonicalTruth` will keep consuming `record.operations` from existing `storage.review.*` records, but that behavior will be named and tested as legacy operation evidence. New Review publication cannot produce those records.

   Alternative considered: remove operation replay once new publication is fixed. Rejected because existing user storage already contains operation-bearing Review truth and still needs reconstruction until cleanup succeeds.

4. Cleanup rewrites generations rather than compacting segments.

   The cleanup path will replay existing Review truth evidence, normalize it into skinny Review fact records, verify that the normalized facts preserve the Review projection rows needed by the runtime, publish a new `review-events` generation through a fence, retain the previous generation, then reclaim obsolete segment paths only after verification.

   Alternative considered: run `compactSegments()` on `review-events`. Rejected because compaction can reduce file count but cannot shrink a single multi-megabyte operation-bearing record.

5. Startup/background maintenance owns cleanup.

   Cleanup will run through bounded maintenance/recovery plumbing and refresh inventory after completion. Rating remains a local durable mutation path; it should benefit from cleanup but should not directly perform a full rewrite during a button click.

   Alternative considered: let Review feedback perform cleanup when hard pressure is detected. Rejected because it moves multi-file rewrite latency into the rating path.

## Risks / Trade-offs

- [Risk] Some old `storage.review.*` records may contain only operation evidence with no typed Review fact fields. -> Mitigation: keep the legacy adapter for rewrite input and verify projection equivalence before publishing the new generation.
- [Risk] A strict record byte budget could reject a legitimate large Review fact if snapshots expand. -> Mitigation: set the budget above normal `review.feedback.v2` sizes and fail with diagnostics that identify the oversized field set.
- [Risk] Generation-fence publishing for `review-events` must not break startup replay. -> Mitigation: generalize or wrap the existing snapshot generation store with focused tests covering current/previous generation fallback.
- [Risk] Cleanup failure could leave mixed old/new evidence. -> Mitigation: publish via verified generation fence, retain previous generation, and reclaim obsolete paths only after current generation verification.
- [Risk] The first cleanup may still be expensive on already-bloated stores. -> Mitigation: schedule it as bounded maintenance, report progress/diagnostics, and keep ordinary Review feedback out of the rewrite.

## Migration Plan

1. Ship bloat prevention first so new builds stop creating operation-bearing `review-events` records.
2. Add verified Review truth rewrite support and tests against operation-bearing legacy records.
3. Wire cleanup into storage maintenance/recovery and refresh inventory after successful cleanup.
4. Keep previous generation available for rollback; if verification or replay fails, leave the fence unchanged and continue reading old truth.

## Open Questions

- The exact Review truth byte budget should be calibrated against current `review.feedback.v2` records plus expected future metadata.
- Obsolete generation reclamation may need a conservative retention count if cross-window readers can still be replaying the previous generation.
