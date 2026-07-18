## 1. Review Admission

- [x] 1.1 Change `ReviewAdmissionModule` to reject non-writable startup readiness instead of returning `read-only-recovery-queue-state`.
- [x] 1.2 Update Review admission tests to expect recovery-required rejection and no projection materialization during storage recovery.
- [x] 1.3 Derive Review write capability from the latest complete backend readiness rather than truth identity alone.
- [x] 1.4 Add a regression for writable identity with `read-only-recovery-required` storage.

## 2. Review Strategy

- [x] 2.1 Remove feedback-capable read-only recovery loading from `UnifiedQueueStrategy`.
- [x] 2.2 Update Review strategy tests so recovery-required startup does not advance from local recovery cards or call backend feedback.

## 3. Browser Inspection

- [x] 3.1 Keep Browser queue rows/counts readable from explicit recovery inspection paths.
- [x] 3.2 Update Browser recovery tests to assert inspection metadata without implying Review admission.

## 4. Validation

- [x] 4.1 Run focused Review admission, Review strategy, Browser recovery, and queue snapshot tests.
- [x] 4.2 Run `pnpm build` and `pnpm run check:boundaries`.
- [x] 4.3 Validate `remove-read-only-recovery-review-mode` with OpenSpec strict mode.
