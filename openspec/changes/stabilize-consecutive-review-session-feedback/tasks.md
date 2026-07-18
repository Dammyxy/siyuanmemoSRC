## 1. Review Feedback Protection

- [x] 1.1 Add regression tests proving `review.session.feedback` is counted as protected pending Review feedback in the frontend transport.
- [x] 1.2 Update frontend transport pending-count and host-effect suppression to use the shared Review feedback timing predicate.
- [x] 1.3 Add worker timing-scope regression tests proving `review.session.feedback` suppresses persistence host effects.
- [x] 1.4 Update worker request timing so `review.session.feedback` enters the protected Review feedback scope.
- [x] 1.5 Add worker-entry source guard proving the stale `isReviewFeedback` flag is not referenced after timing generalization.

## 2. Truth Flush And Maintenance Races

- [x] 2.1 Add backend client coverage proving Review truth flush is deferred while session feedback pressure is active.
- [x] 2.2 Update queued Review truth flush scheduling so it never competes with in-flight protected feedback.
- [x] 2.3 Add storage lifecycle coverage proving `storage.maintenance.applyBatch` does not run pre-request canonical truth reconciliation.
- [x] 2.4 Exempt maintenance apply batches from the pre-request truth merge lifecycle without changing the batch mutation path.

## 3. Validation

- [x] 3.1 Run focused transport, backend client, worker timing, and storage maintenance tests.
- [x] 3.2 Run boundary and production build validation for the changed runtime wiring.
