## Context

After `unify-review-answer-transaction`, `review.session.feedback` no longer performs a second durable undo-journal append. New live logs show the dominant cost moved to `session-feedback-commit`, while the host-effect summary reports only SQLite delta manifest/segment IO totaling tens of milliseconds.

That means the next architectural step is not speculative storage optimization. The Review answer transaction Module needs a deeper diagnostic Interface: callers still submit one answer, but the implementation records enough internal evidence to distinguish scheduler compute, SQL writes, transaction bookkeeping, delta capture, delta encode, append preflight, and append writes.

## Goals / Non-Goals

**Goals:**
- Attribute slow Review answer commits to narrow internal transaction spans.
- Preserve the Anki-style one durable answer transaction established by `unify-review-answer-transaction`.
- Reuse existing worker timing evidence and slow-summary surfaces.
- Keep normal fast-path logging quiet.

**Non-Goals:**
- Do not optimize scheduler, SQL, or SQLite delta persistence yet.
- Do not split the durable answer transaction.
- Do not reintroduce UI/Browser/renderer Review answer authority.
- Do not add a second durable write or async success path.

## Decisions

1. Add transaction spans inside the SRS Review Kernel commit Module.
   - Rationale: the caller should not learn extra transaction phases. The Module keeps a small answer Interface but exposes diagnostic evidence when slow summaries need it.
   - Alternative rejected: emit ad hoc logs from transport or UI. That would increase log noise and scatter locality.

2. Add SQLite transaction diagnostics through an optional recorder on `runTransaction`.
   - Rationale: SQL.js transaction internals are only known by the persistence Module, while the worker timing scope is known by the Review call site. A callback keeps the seam explicit without creating a Review dependency inside infrastructure.
   - Alternative rejected: import worker timing directly from infrastructure. That would invert layering.

3. Add SQLite delta diagnostics inside `SqliteDeltaCheckpointLayer`.
   - Rationale: only the delta Module can distinguish preflight snapshot read, pending estimate, entry build, segment encode, segment write, manifest write, and total append.
   - Alternative rejected: infer substeps from host effects. Host effects measure bridge IO only, not CPU-side encode and bookkeeping.

## Risks / Trade-offs

- The slow summary has a fixed inner-step cap, so span names stay compact and scoped to Review feedback transactions.
- Timing calls add small overhead, but only around already synchronous hot-path work.
- If a later log still shows `sqlite.transaction-writer` dominating, the next change should optimize Review commit implementation rather than storage append.
