## Why

`TabManager` still restores Review tab queue snapshots through broad `Record<string, unknown>` values, leaving TypeScript unable to prove restored cards and counter snapshots satisfy the active queue contracts. This keeps a narrow type-debt warning alive in the Review tab resume path after the tab runtime bridge cleanup.

## What Changes

- Add explicit DTO narrowing for Review queue snapshot cards and queue counter snapshots before `TabManager` passes restored data to `UnifiedQueueStrategy.restoreSessionSnapshot()`.
- Preserve Review tab data shape, queue type strings, tab open/restore behavior, and queue ownership.
- Add focused coverage for restoring a valid Review queue snapshot and rejecting malformed snapshot DTO entries.
- Keep broader Review adapter projection, `ApplicationContext`, and repo-wide `strict` work out of scope.

## Capabilities

### New Capabilities
- `review-queue-snapshot-dto-types`: Internal Review tab queue snapshot DTO typing and normalization.

### Modified Capabilities
- None.

## Impact

- Affected code: `src/application/managers/TabManager.ts`, focused TabManager tests, and `docs/DDD_RESCAN_BACKLOG.md`.
- APIs: no public API, JSON-RPC method, storage, scheduler, writer relay, kernel sidecar, or tab payload schema changes.
- Dependencies: no new runtime dependency.
