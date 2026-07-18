## Context

The active rating surface uses `review.session.feedback`, not only legacy `review.feedback`. Runtime timing already recognizes both methods for slow-feedback diagnostics, but several protection paths still key only on `review.feedback`.

The reported logs show a first rating spending about 3s in `session-feedback-commit` while SQL and scheduler work are tiny. The host attribution points at `sqlite.readBinary`, `truth.listFiles`, and sqlite-delta manifest reads, which matches storage pressure inventory and truth publication host effects around the mutation. A rapid next rating then waits for a generic backend response until the 30s request timeout restarts the worker, after which queued Review truth flush can fail because the restarted worker has not completed the backend load path.

Startup maintenance also reports a receipt write failure from canonical truth reconciliation. `storage.maintenance.status` is already lifecycle-exempt, but `storage.maintenance.applyBatch` still runs the normal pre-request merge path, so receipt writes can collide with previous-generation truth fences and cause repeat startup rescans.

## Goals / Non-Goals

**Goals:**
- Treat `review.session.feedback` as protected Review feedback for frontend pending-count suppression and worker active timing.
- Defer Review truth flush work while any protected feedback request is in flight.
- Keep startup maintenance apply batches from running canonical truth reconciliation before the batch itself.
- Add focused regression tests for the consecutive-rating failure mode and the maintenance apply lifecycle.

**Non-Goals:**
- Do not bypass durable Review feedback persistence or change scheduler semantics.
- Do not introduce a new storage format, delta schema, or public backend method.
- Do not hide worker initialization failures behind fallback review state.

## Decisions

1. Extend the existing Review feedback method predicate instead of adding a parallel session-only guard.
   - Rationale: `review.feedback` and `review.session.feedback` have the same user-visible rating contract and already share timing diagnostics.
   - Alternative considered: add a second suppression path for session feedback. Rejected because it would keep the current split-brain method classification.

2. Defer truth publication when protected feedback is pending, rather than allowing flush to compete with the next answer.
   - Rationale: rating success is the hot-path durability boundary; truth publication is downstream convergence and already has retry behavior.
   - Alternative considered: increase the 30s timeout. Rejected because it leaves the host-effect race and storage inventory latency in place.

3. Make worker-side active Review timing cover `review.session.feedback`.
   - Rationale: worker host-effect suppression reads the active timing scope, so frontend-only changes cannot protect work executed inside the worker transaction.
   - Alternative considered: suppress truth writes based on request method strings at individual storage adapters. Rejected because it scatters policy across low-level persistence code.

4. Exempt maintenance apply batches from pre-request canonical merge when the batch is already the storage maintenance operation.
   - Rationale: maintenance receipt writes must be allowed to finish without forcing the same truth reconciliation that maintenance is repairing or accounting for.
   - Alternative considered: ignore receipt write failures. Rejected because it preserves repeat startup rescans.

## Risks / Trade-offs

- Review truth publication may lag one or more answers -> Mitigate by using the existing queued flush retry path after feedback pressure clears.
- Broad method-level maintenance exemption could skip useful merge checks for unrelated apply batches -> Mitigate with tests around the maintenance request shape and by keeping the exemption limited to the maintenance RPC lifecycle.
- Worker restart/load recovery may still need a deeper barrier if timeout restarts remain reproducible after host-effect suppression -> Mitigate by keeping restart behavior covered by transport tests and treating any remaining timeout as a separate follow-up.
