## Context

Current live logs show the visible Review grading action still splits into:

```
grade()
  feedback      ~2.0s  -> worker review.feedback, host sqlite.readJSON ~600ms
  update-state  ~1.0s  -> Browser projection warmup / repair / queue creation
```

The core Review session-frontier work is already present. The remaining issue is pressure leakage from derived systems:

- Browser warmup defers broad work during Review, but a deferred targeted run uses `fromReviewDeferral` and then bypasses Review pressure, allowing non-current queue `projection_stale` repair during active grading.
- `review.feedback` builds a storage envelope after commit and reads SQLite delta diagnostics. In the browser worker this can issue `sqlite.readJSON` host effects for delta manifests or legacy JSON fallback, adding hundreds of milliseconds to each answer.

## Goals / Non-Goals

**Goals:**

- Prevent non-current Browser warmup/repair from running while Review remains active.
- Keep visible/current queue readiness work allowed.
- Avoid avoidable `sqlite.readJSON` host effects in ordinary formal `review.feedback`.
- Preserve explicit diagnostics and fail-closed durable commit semantics.

**Non-Goals:**

- No native SQLite/WAL migration.
- No kernel-side DB writer.
- No stale Browser fallback.
- No broad redesign of Review session authority.
- No removal of SQLite delta diagnostics from explicit diagnostics/admin paths.

## Decisions

### Decision 1: Review pressure remains active across deferred warmup retries

Deferred warmup should not become privileged merely because it was already delayed once. If Review is still active when the timer fires, non-current queues are deferred again or left in explicit refreshing/stale state. Current visible queue work may still run.

### Decision 2: Repair is stricter than readiness

During Review pressure, a non-current queue may record `refreshing/projection_stale`, but it must not call `repairQueueReadModel`. Repair mutates/rebuilds derived read models and competes with feedback.

### Decision 3: Storage envelope uses hot-path diagnostics only

Ordinary `review.feedback` already knows whether journal evidence was written and whether the last hot-path delta/checkpoint write succeeded. The returned envelope should use cached/in-memory diagnostics when available and skip full SQLite delta manifest reads on the answer path.

### Decision 4: Explicit diagnostic reads remain available elsewhere

`getSqliteDeltaDiagnostics()` remains the explicit diagnostics API and may read manifests/storage. This change only keeps that heavyweight read out of each answer response.

## Risks / Trade-offs

- Browser counts for non-current queues may lag longer during fast review. This is intended; readiness remains explicit and catches up when Review pressure clears.
- If the storage envelope is too skinny, UI diagnostics could lose detail. Mitigation: keep journal state and hot-path write status; full delta diagnostics remain available outside the answer path.
- Re-deferring targeted warmup can starve background repair during very long sessions. Mitigation: coalesced timers keep only latest queued work and flush when Review closes.
