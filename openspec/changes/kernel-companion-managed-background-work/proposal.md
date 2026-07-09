## Why

SiYuan shutdown can unload the kernel companion while renderer-owned backend worker work is still running. Review truth backfill, Xiuyuan startup sync, and kernel transaction polling can then hold long frontend RPC/worker requests open and make exit feel stuck.

## What Changes

- Introduce kernel-companion-managed background work as the lifecycle contract for long maintenance jobs.
- Separate Review truth quick flush from heavy startup backfill so unload never starts or waits on backfill work.
- Add shutdown semantics for backend client work: disposed clients stop timers, reject/ignore new maintenance, and do not re-arm queued jobs.
- Gate frontend startup sync and transaction action polling through short lifecycle-aware work instead of long unmanaged backend requests.
- Keep P0 kernel companion as coordination/relay authority only; no scheduler, card DB, msgpack truth, or SQLite ownership moves into `kernel.js`.

## Capabilities

### New Capabilities
- `kernel-companion-background-work`: Lifecycle contract for long backend maintenance work, shutdown cancellation/deferment, and unavailable diagnostics.

### Modified Capabilities
- `frontend-runtime-unload`: Unload must stop/skip backend maintenance work before long worker requests can block exit.

## Impact

- Affects `SrsBackendClient`, `ApplicationContext`, Review truth maintenance scheduling, Xiuyuan startup sync, and kernel transaction action polling.
- Adds regression tests for shutdown during stuck Review truth backfill/backend host effects.
- Updates architecture docs to name the new lifecycle seam.
- No native DB owner, kernel-side DB writer, hidden fallback, or dual-path scheduler behavior is introduced.
