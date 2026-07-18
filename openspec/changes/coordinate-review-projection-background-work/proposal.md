## Why

Browser projection work currently infers active Review pressure from non-reactive manager getters, then repeatedly reschedules deferred work every 750 ms while projection reads log the same stale state on every call. This leaves Review and Browser activity out of sync, creates a permanent timer loop during long Review sessions, and floods diagnostics without adding new evidence.

## What Changes

- Introduce one Review Projection Work Coordinator that owns the observable Review activity snapshot for dialog and tab surfaces.
- Coalesce deferred Browser projection warmup and queue-count work by stable work key, and release eligible work on Review activity transitions instead of polling.
- Preserve the current work policy: the active Review queue and visible Browser queue may prepare immediately while unrelated projection work waits until eligible.
- Replace DialogManager and TabManager active-queue polling getters with explicit surface lifecycle registration.
- Record projection non-ready diagnostics only when the per-queue state signature changes, resetting the diagnostic state after readiness recovers.
- Remove the Browser-local deferred count flag and the 750 ms Review deferral timer loop.

## Capabilities

### New Capabilities

- `review-projection-work-coordination`: Defines observable Review activity, lifecycle-driven admission and release of coalesced Browser projection work, and transition-based projection readiness diagnostics.

### Modified Capabilities

None.

## Impact

- Application runtime: `ApplicationContext`, `DialogManager`, `TabManager`, and a new application service.
- Browser UI: `SRSBrowser.vue`, projection warmup scheduling, and queue-count refresh coordination.
- Projection diagnostics: `QueueProjectionRuntime` non-ready logging behavior.
- Tests and domain language for Review activity and Browser projection background work.
