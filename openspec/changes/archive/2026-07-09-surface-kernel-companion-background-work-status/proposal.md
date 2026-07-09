## Why

Kernel Companion Background Work now coordinates Review truth backfill, kernel transaction action polling, and Xiuyuan startup sync, but status is still only an in-memory registry surface consumed by nearby code/tests. Before adding UI or kernel companion visibility, the project needs a narrow read-model Interface for background-work status that does not widen the lifecycle registry or turn `kernel.js` into a data owner.

## What Changes

- Add a Kernel Companion Background Work status read Module over the existing registry records.
- Surface normalized job status for supported work kinds without exposing handler internals.
- Add a narrow backend/client status family only for background-work status if a runtime read path is needed.
- Preserve registry lifecycle ownership: submit/cancel/defer/shutdown stay with the registry.
- Preserve current work ownership: Review truth, Xiuyuan sync, and kernel transaction action polling still own their business side effects.
- Do not implement durable persistence or UI redesign in this change.

## Capabilities

### New Capabilities
- `kernel-companion-background-work-status`: read-model contract for Kernel Companion Background Work status and diagnostics.

### Modified Capabilities
- None.

## Impact

- Affected code:
  - `src/application/backgroundWork/KernelCompanionBackgroundWorkRegistry.ts`
  - new or nearby background-work status read Module/tests
  - `src/application/clients/SrsBackendClient.ts` or backend client facets only if status read routing is required
  - `packages/contracts/src/backend-rpc*` only for a narrow background-work status read method
- Runtime boundary:
  - No scheduler, native Riff, card DB, msgpack truth, or SQLite ownership moves into `kernel.js`.
  - Status remains diagnostic/read-only.

