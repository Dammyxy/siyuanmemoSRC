## Why

Long maintenance work still leaks lifecycle rules into caller-owned timers and unload paths. P0 made Review truth and action polling shutdown-safe, but callers still need to know which work is quick, heavy, deferred, or cancelable; that keeps the Kernel Companion Background Work Module shallow.

This change introduces a small background-work registry Interface and migrates Review truth startup backfill into it first. The registry gives callers one place to submit/status/cancel/defer/shutdown maintenance work while keeping scheduler, Riff/card writes, msgpack truth, and SQLite ownership out of `kernel.js`.

## What Changes

- Add a Kernel Companion Background Work Registry Module in the application/backend-client layer.
- Register Review truth SQL backfill as a named background job instead of running it inline through unload-oriented flush calls.
- Keep before-unload Review truth behavior as quick flush only; heavy backfill is submitted/deferred/canceled through the registry.
- Expose explicit job state and diagnostics for pending/running/completed/failed/deferred/canceled background work.
- Ensure shutdown cancels/defer-marks registry work and prevents timer re-arm or late-result scheduling.
- Preserve P0 ownership: no scheduler, Riff/card writes, msgpack truth, or SQLite DB writes in `kernel.js`.

## Capabilities

### New Capabilities
- `kernel-companion-background-work-registry`: Lifecycle registry for long maintenance work with submit/status/cancel/defer/shutdown semantics, initially covering Review truth backfill.

### Modified Capabilities

## Impact

- Affected code: `src/application/clients/SrsBackendClient.ts`, new application background-work Module/tests, Review truth startup maintenance tests, ApplicationContext unload tests, docs/backlog/OpenSpec artifacts.
- Affected runtime: Review truth startup SQL backfill becomes registry-managed background work; unload remains bounded quick flush.
- No new external dependency.
- No kernel JS data ownership change.
