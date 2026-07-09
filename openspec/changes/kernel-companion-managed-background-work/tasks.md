## 1. Review Truth Lifecycle

- [x] 1.1 Add regression: unload quick flush must not invoke `review.truth.backfill` when startup backfill rows are pending.
- [x] 1.2 Add regression: disposing `SrsBackendClient` clears queued Review truth maintenance and prevents timer re-arm after in-flight work settles.
- [x] 1.3 Implement `SrsBackendClient` disposed/shutting-down state and guard all Review truth schedule/flush/backfill entry points.
- [x] 1.4 Split unload quick flush from heavy startup backfill.

## 2. Application Shutdown

- [x] 2.1 Add ApplicationContext regression for disposal during stuck Review truth maintenance.
- [x] 2.2 Ensure ApplicationContext disposal relies on shutdown-safe backend client behavior and still tears down transport.
- [x] 2.3 Confirm kernel transaction action pump dispose clears polling and ignores late results.

## 3. Architecture Docs

- [x] 3.1 Add Kernel Companion Background Work vocabulary to `CONTEXT.md`.
- [x] 3.2 Update `ARCHITECTURE.md` runtime ownership notes.
- [x] 3.3 Add remaining kernel job migration debt to `docs/DDD_RESCAN_BACKLOG.md`.

## 4. Validation

- [x] 4.1 Run focused SrsBackendClient/ApplicationContext tests.
- [x] 4.2 Run `node scripts/check-hidden-fallbacks.cjs`.
- [x] 4.3 Run `pnpm run check:boundaries`.
- [x] 4.4 Run `pnpm build`.
