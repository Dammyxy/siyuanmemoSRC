## 1. Feedback Loop

- [x] 1.1 Add a regression test for queued Review truth flush suppressed by in-flight feedback pressure
- [x] 1.2 Keep/cover non-pressure truth flush errors as visible pending errors

## 2. Retry Semantics

- [x] 2.1 Classify `review.feedback suppressed SiYuan persistence host effect truth.writeBinary/writeJSON` as retryable pressure
- [x] 2.2 Keep queued journal entries pending after pressure suppression
- [x] 2.3 Re-arm queued truth flush retry without busy-looping while feedback remains active
- [x] 2.4 Preserve synchronous Review feedback durability/fail-closed semantics

## 3. Docs And Validation

- [x] 3.1 Update `ARCHITECTURE.md` if Review truth flush ownership wording changes
- [x] 3.2 Append `docs/DDD_RESCAN_BACKLOG.md` delta for production src changes
- [x] 3.3 Run focused client/transport tests
- [x] 3.4 Run `pnpm run check:boundaries`
- [x] 3.5 Run `pnpm build`
- [x] 3.6 Run `openspec validate retry-review-truth-flush-after-feedback-pressure --strict`
