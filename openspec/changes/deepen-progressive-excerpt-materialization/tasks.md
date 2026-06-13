## 1. Characterization

- [ ] 1.1 Add focused Progressive tests for source-child excerpt creation through current `ProgressiveReadingService`.
- [ ] 1.2 Add focused tests for daily-note and configured-library excerpt storage modes.
- [ ] 1.3 Add duplicate excerpt tests covering existing `ExcerptRecordService` behavior.
- [ ] 1.4 Add failure-path tests for missing source root/notebook identity and failed entity creation.

## 2. Materialization Module

- [ ] 2.1 Create `ProgressiveExcerptMaterializer` with a small materialize Interface.
- [ ] 2.2 Move storage target resolution and excerpt entity creation decisions behind the materializer.
- [ ] 2.3 Move source lineage, source availability, parent topic/excerpt attrs, and topic-card linkage behind the materializer.
- [ ] 2.4 Preserve duplicate excerpt result shape and record ownership.

## 3. Service Integration

- [ ] 3.1 Refactor `ProgressiveReadingService.createExcerptFromSelectionLocal()` to delegate materialization.
- [ ] 3.2 Keep public `ProgressiveReadingService` methods compatible for existing callers.
- [ ] 3.3 Remove private helpers that become pass-through after materializer extraction.
- [ ] 3.4 Document any remaining Progressive split or Topic-derived write debt that stays outside this slice.

## 4. Verification And Documentation

- [ ] 4.1 Run focused Progressive service/materializer tests.
- [ ] 4.2 Run `openspec validate deepen-progressive-excerpt-materialization --strict`.
- [ ] 4.3 Run `pnpm run check:boundaries`, `node scripts/check-hidden-fallbacks.cjs`, `git diff --check`, and `pnpm build`.
- [ ] 4.4 Update `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md` with fixed and deferred Progressive / Excerpt debt.

