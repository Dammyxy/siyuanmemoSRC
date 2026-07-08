## 1. Admission Seam

- [x] 1.1 Add Review Admission ticket types and module.
- [x] 1.2 Build canonical projection readiness request for projection-backed Review queues.
- [x] 1.3 Materialize stale/recoverable projections and fail closed when no ready identity exists.

## 2. Runtime Wiring

- [x] 2.1 Wire DialogManager review entry through Review Admission Module.
- [x] 2.2 Pass admission ticket through review dialog factory and UnifiedQueueStrategy.
- [x] 2.3 Pass ticket through WorkerReviewSessionQueueRuntime and backend review RPC contract.
- [x] 2.4 Make worker session start read admitted projection identity and reject missing tickets for admitted queues.

## 3. Tests And Docs

- [x] 3.1 Add focused tests for admission readiness/materialization behavior.
- [x] 3.2 Add worker session tests for explicit projection identity and missing-ticket failure.
- [x] 3.3 Update architecture/backlog docs for Review Admission ownership.
- [x] 3.4 Run focused validation plus boundary/build checks.
