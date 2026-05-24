## 1. Browser Grid Model Budget

- [x] 1.1 Add/adjust Browser grid lifecycle regression tests for pending datasource attach readiness and latest-generation-only model work.
- [x] 1.2 Implement bounded datasource attach behavior inside `BrowserGridDatasourceLifecycle` without moving Browser row reads out of the application datasource path.

## 2. Kernel Action Pump Health Noise

- [x] 2.1 Add action-pump regression tests for repeated backend-unavailable and timeout dequeue failures, first-warning-only backoff, recovery reset, and no local fallback.
- [x] 2.2 Implement backend-health failure classification/backoff/warning throttling while preserving writer-relay unavailable reporting.

## 3. Documentation and Validation

- [x] 3.1 Update `docs/DDD_RESCAN_BACKLOG.md` for Browser grid and pump health behavior; `ARCHITECTURE.md` unchanged because ownership/call-chain boundaries did not change.
- [x] 3.2 Run focused Browser/Pump tests.
- [x] 3.3 Run `openspec validate reduce-browser-grid-model-and-pump-noise --strict`.
- [x] 3.4 Run `pnpm run check:boundaries` and `pnpm build`.
