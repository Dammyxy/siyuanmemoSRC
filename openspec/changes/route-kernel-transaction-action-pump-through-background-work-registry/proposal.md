## Why

`KernelTransactionActionPump` still owns its own polling lifecycle with timer state, in-flight state, dispose guards, and late-result suppression. Now that Kernel Companion Background Work exists, ActionPump polling should use the same lifecycle vocabulary as Review truth backfill so shutdown and diagnostics stay concentrated in one Module.

## What Changes

- Route kernel transaction action polling through `KernelCompanionBackgroundWorkRegistry`.
- Keep native Riff writes, AutoCard handoff, backend dequeue/requeue, and writer relay ownership in their existing application/backend owners.
- Expose action-polling lifecycle state through the existing background work status Interface.
- Preserve fail-closed behavior for backend/writer unavailability and late polling results after dispose.
- Leave durable registry persistence and kernel RPC status out of scope.

## Capabilities

### New Capabilities
- `kernel-companion-action-polling-lifecycle`: Background-work lifecycle contract for kernel transaction action polling jobs.

### Modified Capabilities
- None.

## Impact

- Affected production code:
  - `src/application/backgroundWork/KernelCompanionBackgroundWorkRegistry.ts`
  - `src/application/handlers/KernelTransactionActionPump.ts`
  - `src/application/ApplicationContext.ts`
- Affected tests:
  - `src/application/backgroundWork/__tests__/KernelCompanionBackgroundWorkRegistry.test.ts`
  - `src/application/handlers/__tests__/KernelTransactionActionPump.test.ts`
  - Application wiring tests if constructor wiring changes.
- Runtime boundary:
  - `kernel.js` and `src/kernel.ts` remain coordination/relay only.
  - Scheduler, Riff/card writes, msgpack truth, SQLite DB ownership remain with current owners.
