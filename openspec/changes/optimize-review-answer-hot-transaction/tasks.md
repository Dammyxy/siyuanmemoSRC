## 1. Regression Coverage

- [x] 1.1 Add Review feedback coverage proving the hot path uses O(1) mutation stamp and does not call full `touchSyncMetadata()`
- [x] 1.2 Add SQLite delta coverage proving append pending-byte accounting avoids full snapshot serialization
- [x] 1.3 Add/adjust diagnostics expectations for renamed pending-size accounting spans if needed

## 2. Review Mutation Stamp

- [x] 2.1 Add a lightweight Review mutation metadata method to `SqlUnifiedStorageRepository`
- [x] 2.2 Route `WorkerReviewCardMutationPersistenceModule` through the lightweight stamp during committed Review answers
- [x] 2.3 Preserve full `touchSyncMetadata()` behavior for non-hot-path full-store metadata callers

## 3. SQLite Delta Pending Accounting

- [x] 3.1 Add normalized pending-byte accounting to `SqliteDeltaLogSnapshot` handling
- [x] 3.2 Use current pending bytes plus `entry.byteEstimate` for append threshold checks
- [x] 3.3 Preserve checkpoint/replay/discard diagnostics and recovery semantics

## 4. Review Answer Transaction Envelope

- [x] 4.1 Deepen the Review answer transaction implementation so the hot transaction order is owned behind one Module Interface
- [x] 4.2 Keep callers on one answer Interface without exposing stamp or delta accounting details
- [x] 4.3 Update `CONTEXT.md`, `ARCHITECTURE.md`, and backlog with the new hot transaction contract

## 5. Validation

- [x] 5.1 Run focused Review feedback and SQLite persistence tests
- [x] 5.2 Run OpenSpec validation, hidden-fallback check, boundary check, build, and diff check
