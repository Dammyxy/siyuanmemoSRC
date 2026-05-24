## Why

Browser first paint still has red spans after source-existence and snapshot overlap were removed: AG Grid datasource attach and model update can dominate the first visible page. At the same time, `KernelTransactionActionPump` emits repeated warning noise when the backend worker is already unhealthy or timing out, making real runtime problems harder to identify.

## What Changes

- Reduce Browser grid first-page work that happens before the user sees rows, especially `grid.apply-datasource` and `grid.model-updated` red spans.
- Keep Browser data ownership on the existing application read path; do not add UI-side SQL, backend bypasses, or hidden fallback paths.
- Make kernel transaction action polling treat backend-unavailable or backend-timeout states as an explicit health condition with bounded warning emission instead of repeated console warnings.
- Keep action polling failure semantics explicit: failed polls must not be reported as successful, silently swallowed forever, or retried through an alternate mutation path.
- Add targeted tests and diagnostics for first-page Browser behavior and action pump warning throttling.

## Capabilities

### New Capabilities
- `browser-runtime-budget`: Browser/runtime-facing responsiveness requirements for first-page grid render and repeated backend-health warning behavior.

### Modified Capabilities

## Impact

- Affected UI/application code: `src/ui/browser/SRSBrowser.vue`, Browser datasource/composables, `src/application/services/BrowserApplicationService.ts` if diagnostics or read timing need tightening.
- Affected kernel/backend coordination code: `src/application/handlers/KernelTransactionActionPump.ts` and nearby tests.
- Affected docs: `ARCHITECTURE.md` if runtime call-chain behavior changes; `docs/DDD_RESCAN_BACKLOG.md` for fixed/deferred debt.
- No public API or storage schema change expected.
