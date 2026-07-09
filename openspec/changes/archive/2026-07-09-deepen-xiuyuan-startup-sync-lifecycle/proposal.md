## Why

Xiuyuan startup sync now uses Kernel Companion Background Work for outer lifecycle state, but the sync body still behaves as one long black-box command once it starts. The next slice should deepen the Xiuyuan startup sync lifecycle so cancellation, deferment, staged diagnostics, and retry safety are owned inside the Xiuyuan sync Module rather than spread across callers.

## What Changes

- Introduce staged Xiuyuan startup sync execution for scan/plan/apply/checkpoint phases.
- Make startup sync observe cancellation between phases and report canceled/deferred/failed/completed state without claiming physical interruption of already-issued writes.
- Preserve existing Xiuyuan sync ownership: existing Xiuyuan/backend sync owners still plan and write Riff/card/SQLite changes.
- Move shallow startup lifecycle helpers out of `XiuyuanSyncService` only when the deletion test shows complexity would otherwise return to callers.
- Keep manual full/incremental sync behavior unchanged.
- Add focused tests for staged lifecycle diagnostics, cancellation, backend unavailable/fail-closed behavior, and no hidden fallback.

## Capabilities

### New Capabilities
- `xiuyuan-startup-sync-lifecycle`: staged lifecycle contract for Xiuyuan startup sync jobs behind Kernel Companion Background Work.

### Modified Capabilities
- None.

## Impact

- Affected code:
  - `src/application/services/XiuyuanSyncService.ts`
  - `src/application/services/XiuyuanSyncChangeSetPlanner.ts`
  - `src/application/services/XiuyuanSyncApplyRuntime.ts`
  - `src/application/backgroundWork/KernelCompanionBackgroundWorkRegistry.ts`
  - focused Xiuyuan sync tests
- Runtime boundary:
  - Kernel Companion Background Work remains lifecycle-only.
  - Xiuyuan/backend sync owners still perform sync planning and write side effects.
  - No scheduler, native Riff, SQLite, msgpack truth, or card ownership moves into `kernel.js`.

