## 1. Native Riff Compatibility Interface

- [x] 1.1 Add a single Native Riff compatibility interface/adapter for built-in deck identity and add-card writes.
- [x] 1.2 Replace `ProgressiveNativeRiffPort` usage in Progressive and Topic-derived services with the shared compatibility interface.
- [x] 1.3 Replace `AutoCardRiffPort` usage in AutoCard wiring with the shared compatibility interface.
- [x] 1.4 Delete duplicate Progressive/AutoCard Riff port and adapter files after all active callers move.

## 2. Ordinary SRS Path Pruning

- [x] 2.1 Update Progressive ordinary card creation so disabled Native Riff policy does not require a Native Riff adapter.
- [x] 2.2 Update Topic-derived item ordinary card creation so disabled Native Riff policy does not require a Native Riff adapter.
- [x] 2.3 Update AutoCard ordinary execution paths so Native Riff deck identity is only read through explicit compatibility routing.

## 3. Runtime Owner Cleanup

- [x] 3.1 Simplify `ApplicationContext` Native Riff sync owner selection to one active owner per settings/runtime state.
- [x] 3.2 Remove or fail closed inactive Native Riff transaction trigger wiring when kernel transaction ingest owns sync.
- [x] 3.3 Keep `RiffSyncEventHandler` behavior only where delete compatibility is explicitly enabled and owned.

## 4. Tests And Documentation

- [x] 4.1 Add or update Native Riff compatibility policy tests for ordinary skip, explicit write, and unavailable runtime.
- [x] 4.2 Update Progressive, Topic-derived, AutoCard, and ApplicationContext focused tests for the shared interface and single owner selection.
- [x] 4.3 Update `docs/DDD_RESCAN_BACKLOG.md` with completed Native Riff debt and separate follow-up entries for Review legacy projection and storage legacy loader cleanup.
- [x] 4.4 Run focused tests, `node scripts/check-hidden-fallbacks.cjs`, `pnpm run check:boundaries`, and `pnpm build`.
