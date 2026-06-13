## Why

`ApplicationContext` is the active composition root, but its Interface is too wide: callers and factory modules can reach broad service getters, backend runtime policy, SQL persistence adapters, UI managers, and feature bundles from one surface. This weakens Locality when changing Browser, Review, storage, or sync wiring and keeps type debt concentrated in the largest module.

## What Changes

- Add a composition-interface audit that identifies which bounded-context slices need which `ApplicationContext` dependencies.
- Introduce narrow internal composition Interfaces for high-traffic bundles before changing runtime behavior.
- Start with low-risk factory seams such as Review/Browser service wiring and backend runtime bundle dependencies.
- Keep the public `ApplicationContext` facade stable during this change so existing callers are not migrated repo-wide in one pass.
- Document remaining broad getters and next safe migration slices.
- Do not change service lifetimes, startup order, SQL worker ownership, writer relay behavior, kernel sidecar coordination, or AI workbench behavior.

## Capabilities

### New Capabilities

- `application-context-composition-interface`: ApplicationContext composition dependencies are audited and narrowed through slice-specific internal Interfaces while preserving runtime behavior.

### Modified Capabilities

- None.

## Impact

- Affected code: `src/application/ApplicationContext.ts`, `src/application/factories/createReviewBrowserServiceBundle.ts`, `src/application/factories/createApplicationBackendRuntimeBundle.ts`, nearby composition types/tests, `ARCHITECTURE.md`, and `docs/DDD_RESCAN_BACKLOG.md`.
- Runtime behavior: no intended behavior change; this is an Interface-depth and wiring-readability change.
- Boundaries: keeps `ApplicationContext` as the only composition root while reducing broad getter knowledge at internal seams.
