## 1. Feedback Loop

- [x] 1.1 Add a Browser warmup test proving deferred non-current queue work remains deferred if Review pressure is still active when the timer fires.
- [x] 1.2 Add a Browser warmup test proving non-current `projection_stale` repair is not invoked during active Review pressure.
- [x] 1.3 Add a worker/storage test proving ordinary `review.feedback` can build its storage envelope without calling full SQLite delta diagnostics.

## 2. Browser Warmup Pressure

- [x] 2.1 Keep Review pressure checks active for deferred targeted warmups.
- [x] 2.2 Coalesce/re-arm non-current warmup while Review remains active instead of running repair immediately.
- [x] 2.3 Preserve current visible queue warmup and explicit readiness state.

## 3. Review Feedback Storage Envelope

- [x] 3.1 Add a hot-path storage diagnostics provider that avoids host-backed full SQLite delta diagnostics reads.
- [x] 3.2 Route ordinary `review.feedback` envelope construction through hot-path diagnostics.
- [x] 3.3 Keep explicit full SQLite delta diagnostics for diagnostics APIs and repair flows.

## 4. Docs And Validation

- [x] 4.1 Update `ARCHITECTURE.md` if Review pressure or storage envelope ownership wording changes.
- [x] 4.2 Append `docs/DDD_RESCAN_BACKLOG.md` task delta.
- [x] 4.3 Run focused Browser warmup tests.
- [x] 4.4 Run focused worker review/storage tests.
- [x] 4.5 Run `pnpm run check:boundaries`.
- [x] 4.6 Run `pnpm build`.
- [x] 4.7 Run `openspec validate reduce-review-feedback-pressure-latency --strict`.
