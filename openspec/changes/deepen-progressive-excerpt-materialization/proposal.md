## Why

`ProgressiveReadingService.createExcerptFromSelectionLocal()` still coordinates selection normalization, source lookup, storage target resolution, excerpt doc/block creation, topic-card creation, attrs, and lineage in one long Implementation. This makes Progressive / Excerpt changes hard to test through one stable Interface.

## What Changes

- Add a Progressive Excerpt Materialization capability that owns excerpt storage target selection and materialization outcomes.
- Move excerpt entity creation, attrs, topic-card linkage, source lineage, duplicate handling, and source availability reporting behind one application-owned module.
- Keep `ProgressiveReadingService` as the orchestration facade while reducing direct knowledge of doc/block storage variants.
- Preserve current source-child, daily-note, configured-library, and duplicate excerpt behavior.
- Do not change Review feedback, queue membership, scheduler rules, writer relay, kernel sidecar behavior, AI workbench, or agent behavior.

## Capabilities

### New Capabilities
- `progressive-excerpt-materialization`: Progressive excerpt creation is materialized through one application-owned Interface with explicit storage and lineage results.

### Modified Capabilities

## Impact

- Affected code: `src/application/services/ProgressiveReadingService.ts`, `src/application/services/SelectionExcerptService.ts`, `src/application/services/ExcerptRecordService.ts`, `src/application/ports/ProgressiveSiyuanPort.ts`, `src/infrastructure/siyuan/ProgressiveSiyuanAdapter.ts`, focused Progressive tests, `ARCHITECTURE.md`, and `docs/DDD_RESCAN_BACKLOG.md`.
- Runtime behavior: no intended happy-path UX change for excerpt creation.
- Boundaries: Progressive document writes stay behind Progressive ports/adapters; UI remains a consumer of application results.
