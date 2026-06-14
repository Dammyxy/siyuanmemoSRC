## 1. Characterization

- [x] 1.1 Add focused Progressive tests for source-child excerpt creation through current `ProgressiveReadingService`.
- [x] 1.2 Add focused tests for daily-note and configured-library excerpt storage modes.
- [x] 1.3 Add duplicate excerpt tests covering existing `ExcerptRecordService` behavior.
- [x] 1.4 Add failure-path tests for missing source root/notebook identity and failed entity creation.

## 2. Materialization Module

- [x] 2.1 Create `ProgressiveExcerptMaterializer` with a small materialize Interface.
- [x] 2.2 Move storage target resolution and excerpt entity creation decisions behind the materializer.
- [x] 2.3 Move source lineage, source availability, parent topic/excerpt attrs, and topic-card linkage behind the materializer.
- [x] 2.4 Preserve duplicate excerpt result shape and record ownership.

## 3. Service Integration

- [x] 3.1 Refactor `ProgressiveReadingService.createExcerptFromSelectionLocal()` to delegate materialization.
- [x] 3.2 Keep public `ProgressiveReadingService` methods compatible for existing callers.
- [x] 3.3 Remove private helpers that become pass-through after materializer extraction.
- [x] 3.4 Document any remaining Progressive split or Topic-derived write debt that stays outside this slice.

## 4. Verification And Documentation

- [x] 4.1 Run focused Progressive service/materializer tests.
- [x] 4.2 Run `openspec validate deepen-progressive-excerpt-materialization --strict`.
- [x] 4.3 Run `pnpm run check:boundaries`, `node scripts/check-hidden-fallbacks.cjs`, `git diff --check`, and `pnpm build`.
- [x] 4.4 Update `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md` with fixed and deferred Progressive / Excerpt debt.
