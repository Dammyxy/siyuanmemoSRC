## 1. Shared Fan-out Policy

- [x] 1.1 Add focused tests for shared fan-out planning: marker candidates, provenance suppression, delete cancellation, document-tree routing, and Native Riff upsert/remove block IDs.
- [x] 1.2 Implement `transaction-fanout-coordinator` as a pure shared module that returns classification plus plan and reasons.
- [x] 1.3 Add short-lived transaction provenance registry tests and implementation.

## 2. Renderer Wiring

- [x] 2.1 Wire `TransactionWebSocketService` to compute and pass fan-out plans to registered handlers without moving handler execution ownership.
- [x] 2.2 Update AutoCard handler to use fan-out plan suppressed operations before candidate scheduling.
- [x] 2.3 Record progressive excerpt provenance for known source/highlight/excerpt/topic block IDs during materialization.
- [x] 2.4 Update legacy `NativeRiffSyncTriggerHandler` to consume fan-out plans and scoped upsert block IDs.

## 3. Backend Worker Wiring

- [x] 3.1 Update kernel transaction ingest payloads/snapshots to carry provenance snapshots without trusting renderer plans as authority.
- [x] 3.2 Replace worker kernel action collection logic with a shared fan-out plan adapter.
- [x] 3.3 Add worker tests proving renderer and worker plan behavior stays aligned.

## 4. Scoped Native Riff Sync

- [x] 4.1 Preserve Native Riff upsert block IDs in `KernelTransactionActionPump` and call `handleNativeRiffUpsert(blockIds)`.
- [x] 4.2 Extend `XiuyuanSyncService` incremental options and backend sync request scope to include block IDs.
- [x] 4.3 Expose `getRiffCardsByBlockIDs` through the Xiuyuan sync port/adapter and prefer it for scoped backend reads.

## 5. Validation And Docs

- [x] 5.1 Run targeted vitest suites for fan-out coordinator, transaction WebSocket dispatch, AutoCard listener, worker kernel transaction runtime, action pump, Native Riff handler, and Xiuyuan sync.
- [x] 5.2 Run boundary/fallback checks and `pnpm build`.
- [x] 5.3 Update `docs/DDD_RESCAN_BACKLOG.md` and architecture/context docs if runtime ownership wording changes.
