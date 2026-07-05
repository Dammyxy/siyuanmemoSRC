## 1. Regression Coverage

- [x] 1.1 Add worker SQLite repair preview regression coverage for repairable evidence hashing.
- [x] 1.2 Add Review safety regression coverage for non-blocking repairable drift and current-card blocking.

## 2. Implementation

- [x] 2.1 Restore worker SQLite FNV-1a hashing used by domain sync plan ids and fingerprints.
- [x] 2.2 Tighten Review domain sync safety decisions so only actionable repairable drift blocks Review.

## 3. Validation And Cleanup

- [x] 3.1 Run focused worker/domain sync tests and OpenSpec strict validation.
- [x] 3.2 Update DDD backlog with fixed and deferred debt.
- [x] 3.3 Inspect live plugin storage and remove only safe stale conflict/projection artifacts.
