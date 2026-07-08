## Why

After startup, opening SRS Browser can show no cards, log `QUEUE_COUNT_UNAVAILABLE`, and leave SiYuan unable to exit cleanly. Current diagnostics say queue projection snapshot is unavailable, but do not expose whether the owner is missing derived cache, stale projection rows, backend worker pending work, or unload-time Review truth flush.

## What Changes

- Add focused diagnostics for Browser queue projection non-ready pages and passive queue counts.
- Add focused diagnostics for QueueProjection Runtime snapshot non-ready results, including cache state, freshness evidence, policy/generation validity, counters, and capped affected IDs.
- Add backend worker transport pending-request summaries so unload hangs show method, card, generation, and request age before disposal clears state.
- Add ApplicationContext unload diagnostics before Review truth flush and Worker transport disposal.
- No behavior fallback, no projection repair change, no Review answer/storage semantics change.

## Capabilities

### New Capabilities
- `browser-projection-open-diagnostics`: Diagnostic-only observability for Browser projection open failures and unload hangs.

### Modified Capabilities
- None.

## Impact

- Affected Browser/Queue modules: `BrowserApplicationService`, `QueueProjectionRuntime`, `BrowserSrsBackendWorkerTransport`, `ApplicationContext`, focused tests, and backlog/OpenSpec artifacts.
- Runtime behavior: unchanged except additional low-volume diagnostic logs on unavailable/non-ready paths and unload cleanup.
- Follow-up: user reloads, opens SRS Browser, attempts exit, then shares logs; root-cause fix happens after evidence.
