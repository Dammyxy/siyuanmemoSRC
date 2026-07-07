## 1. Regression Coverage

- [x] 1.1 Add Review feedback runtime coverage for transaction-internal timing spans
- [x] 1.2 Add SQLite persistence coverage for transaction and delta diagnostic recorder spans

## 2. Implementation

- [x] 2.1 Instrument Review answer transaction phases inside `WorkerReviewCardMutationPersistenceModule`
- [x] 2.2 Add optional SQL transaction diagnostic recorder support to `SqliteDatabaseService.runTransaction`
- [x] 2.3 Add SQLite delta append/capture/encode/write diagnostic spans inside `SqliteDeltaCheckpointLayer`
- [x] 2.4 Preserve existing Review answer behavior, storage durability, and slow-summary-only log behavior

## 3. Documentation

- [x] 3.1 Update architecture/backlog docs with the new transaction-internals diagnostic contract

## 4. Validation

- [x] 4.1 Run focused Review feedback and SQLite persistence tests
- [x] 4.2 Run OpenSpec validation, fallback/boundary checks, build, and diff checks
