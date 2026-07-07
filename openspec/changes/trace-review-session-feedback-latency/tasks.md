## 1. Regression Coverage

- [x] 1.1 Add Review session runtime timing coverage for slow undo-journal append attribution
- [x] 1.2 Add SQLite delta host-effect metadata coverage for append writes

## 2. Implementation

- [x] 2.1 Instrument unmeasured `review.session.feedback` post-commit steps, especially undo-journal append
- [x] 2.2 Add SQLite delta append purpose/substep metadata to manifest/open/sealed writes
- [x] 2.3 Keep normal-path logs quiet and preserve existing slow-summary thresholds

## 3. Documentation

- [x] 3.1 Update architecture/backlog docs with the new latency attribution contract

## 4. Validation

- [x] 4.1 Run focused Review timing and SQLite persistence tests
- [x] 4.2 Run OpenSpec validation, fallback/boundary checks, build, and diff checks
