## Why

Live Review logs show `review.feedback suppressed SiYuan persistence host effect truth.writeBinary` followed by `Review truth flush finished with pending error` and queued journal entries. SQLite delta repair is no longer failing, but Review truth flush can still run while `review.feedback` requests are in flight and gets rejected by the transport pressure guard.

## What Changes

- Keep Review feedback host-effect pressure protection for synchronous in-flight commits.
- Treat pressure-suppressed truth flush as retryable, not a terminal pending error.
- Re-arm queued truth flush after feedback pressure clears so journal truth segments can drain.
- Add focused regression coverage for suppressed `truth.writeBinary` during in-flight feedback.

## Impact

- Affected path: `SrsBackendClient.scheduleReviewTruthFlushAfterFeedback -> runQueuedReviewTruthFlush -> executeQueuedReviewTruthFlush -> BrowserSrsBackendWorkerTransport`.
- Affected tests: focused SrsBackendClient / BrowserSrsBackendWorkerTransport tests.
- Non-goals: native SQLite/WAL, DB ownership changes, kernel writer, broad storage topology migration.
