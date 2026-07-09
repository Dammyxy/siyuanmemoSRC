## Why

`XiuyuanSyncService.start()` still schedules startup full/incremental sync through a service-local Promise helper. Startup sync has real write side effects and can outlive plugin unload, so it needs the same lifecycle vocabulary already used for Review truth backfill and kernel transaction action polling.

## What Changes

- Route Xiuyuan startup full/incremental sync through `KernelCompanionBackgroundWorkRegistry`.
- Preserve startup ordering: legacy card-type attr migration still runs before the registry job is submitted.
- Preserve existing sync ownership: `fullSync()` and `incrementalSync()` still own sync planning and backend/local writes.
- Keep startup non-blocking while surfacing accepted/running/completed/failed/deferred/canceled state through the registry.
- Cancel/defer startup jobs on registry shutdown or service stop without pretending already-issued backend/SiYuan writes were physically interrupted.

## Capabilities

### New Capabilities
- `kernel-companion-xiuyuan-startup-sync-lifecycle`: Background-work lifecycle contract for Xiuyuan startup sync jobs.

### Modified Capabilities
- None.

## Impact

- Affected production code:
  - `src/application/backgroundWork/KernelCompanionBackgroundWorkRegistry.ts`
  - `src/application/services/XiuyuanSyncService.ts`
  - `src/application/factories/createAutoCardKernelXiuyuanServiceBundle.ts`
  - `src/application/ApplicationContext.ts`
- Affected tests:
  - `src/application/backgroundWork/__tests__/KernelCompanionBackgroundWorkRegistry.test.ts`
  - `src/application/services/__tests__/XiuyuanSyncService.backend-facade.test.ts`
  - `src/application/factories/__tests__/createAutoCardKernelXiuyuanServiceBundle.test.ts`
  - `src/application/__tests__/ApplicationContext.backend-worker-runtime.test.ts`
- Runtime boundary:
  - `kernel.js` remains coordination/relay only.
  - Xiuyuan/backend owners still perform sync planning, Riff/card writes, and SQLite writes.

