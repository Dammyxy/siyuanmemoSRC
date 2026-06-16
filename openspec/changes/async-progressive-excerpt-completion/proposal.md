## Why

Progressive excerpt creation currently waits for Topic card creation and native Riff registration before reporting success. In real Siyuan runtime logs, the excerpt document is created earlier, but user-visible completion is delayed by card persistence, Xiuyuan normalization, attr writes, and Riff registration.

## What Changes

- Treat excerpt success as durable excerpt entity + excerpt record creation.
- Move excerpt Topic card completion to a bounded background application service.
- Persist minimal completion state on `ExcerptRecord` so restart repair can recover without a separate pending-job database.
- Add capped startup repair for incomplete excerpt completion records.
- Keep Browser/Review entry repair as a callable service API and tests, without wiring new UI entrypoints in this change.

## Capabilities

### New Capabilities
- `async-progressive-excerpt-completion`: Progressive excerpts complete foreground materialization before background Topic card completion.

### Modified Capabilities
- `progressive-excerpt-materialization`: excerpt creation no longer requires synchronous Topic card id availability.

## Impact

- Affected code: `src/application/services/ProgressiveExcerptMaterializer.ts`, `src/application/services/ProgressiveReadingService.ts`, `src/application/services/ExcerptRecordService.ts`, new completion service, `src/application/ApplicationContext.ts`, focused Progressive tests, `ARCHITECTURE.md`, and `docs/DDD_RESCAN_BACKLOG.md`.
- Runtime behavior: excerpt toast can appear as soon as the excerpt entity and record exist; Topic card completion happens in background.
- Boundaries: completion stays in Progressive / Excerpt + Card CRUD seams; no transaction-triggered repair, no new persistent job database, no Browser/Review UI wiring in this change.
