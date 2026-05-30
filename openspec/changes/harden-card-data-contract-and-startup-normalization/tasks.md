## 1. Startup Scheduling Normalization Repro

- [x] 1.1 Add mapper/repository regression tests for an unreviewed `New` card DTO with `difficulty = 0` and `stability = 0` passing SQL validation/save.
- [x] 1.2 Add regression tests proving `Review` / reviewed-state DTOs with empty or out-of-range FSRS memory still fail or enter explicit repair diagnostics.
- [x] 1.3 Add an ApplicationContext or UnifiedStorageManager startup-normalization test that reproduces the reported `Failed to persist scheduling normalization` failure before the fix.

## 2. Startup Scheduling Normalization Fix

- [x] 2.1 Align `CardMapper.validate()` and SQL canonicalization with scheduler empty-memory semantics: allow valid unreviewed empty memory, reject unrepaired reviewed dirty memory.
- [x] 2.2 Ensure `SqlUnifiedStorageRepository.saveStore()` reports card-scoped validation errors and does not abort on recoverable empty-new-card DTOs.
- [x] 2.3 Ensure `UnifiedStorageManager.normalizeMalformedReviewScheduling()` and startup save remain idempotent after repair.

## 3. Review Concept-Roam Focus Contract

- [x] 3.1 Add `reviewConceptRoam` tests for `fieldMapping.concept` winning over stale `meta.templateID/typeMarker`.
- [x] 3.2 Add tests for ambiguous concept-definition/descriptor focus returning no target rather than guessing.
- [x] 3.3 Migrate `reviewConceptRoam.ts` to a semantic focus helper that prefers field mapping, semantic locator/render policy tokens, and only then legacy projection fallback.

## 4. Special Renderer Component Identity

- [x] 4.1 Add `ConceptDefinitionCardRenderer` identity tests where `faceKey` disagrees with legacy `meta.faceIndex/typeMarker`.
- [x] 4.2 Add `MultiClozeCardRenderer` identity tests where `faceKey.faceIndex` disagrees with legacy `meta.faceIndex`.
- [x] 4.3 Update renderer identity keys to use `faceKey` / render policy cache tokens / prepared identity before legacy meta fallback.

## 5. Review Adapter Raw Meta Purpose Split

- [x] 5.1 Add focused `UnifiedReviewAdapter` tests proving render policy selects renderer while answer block/native Riff/list-template helpers keep their own behavior.
- [x] 5.2 Extract named helpers for answer block selection, native Riff behavior, list-template display, dependency block collection, and diagnostic projection.
- [x] 5.3 Replace direct mixed-purpose `item.meta.templateID/typeMarker/faceIndex/frontBlockIDs/backBlockIDs` reads in `UnifiedReviewAdapter` with those helpers where practical.

## 6. Browser Display Projection

- [x] 6.1 Add Browser preview breadcrumb tests proving list-template trim decisions flow through a display projection helper.
- [x] 6.2 Implement the display projection helper with legacy `templateID` fallback hidden behind the helper.
- [x] 6.3 Replace inline Browser preview structural checks such as `meta.templateID === 'builtin-list-item'`.

## 7. Historical Riff Shadow Audit

- [x] 7.1 Add storage/domain-sync audit tests for same-block plugin-owned Xiuyuan cards plus `builtin-riff-sync` shadow cards.
- [x] 7.2 Implement an audit/report path that returns block ids, plugin card ids, shadow card ids, ownership evidence, and proposed action without deleting rows.
- [x] 7.3 If Review hiding is included in this slice, add explicit tests and a named policy; otherwise document deletion/hide policy as deferred.

## 8. Review Render Fallback Retirement Gate

- [x] 8.1 Add grep/test coverage proving active Review adapter/factory states include `meta.renderContext.renderPolicy`.
- [x] 8.2 Remove UI-local render compatibility fallback only if every active state is covered; otherwise mark the exact remaining state constructor as deferred debt.
- [x] 8.3 Update tests/fixtures that omitted render context policy without representing a real legacy compatibility state.

## 9. Documentation And Validation

- [x] 9.1 Update `ARCHITECTURE.md` if card-data ownership, startup normalization, or Review policy wording changes.
- [x] 9.2 Update `docs/DDD_RESCAN_BACKLOG.md` with debt fixed, remaining deferred debt, and startup error validation.
- [x] 9.3 Run focused Vitest suites for mapper/SQL storage/startup normalization, Review concept-roam, renderer components, `UnifiedReviewAdapter`, Browser preview, and shadow audit.
- [x] 9.4 Run `pnpm run check:boundaries`.
- [x] 9.5 Run `node scripts/check-hidden-fallbacks.cjs`.
- [x] 9.6 Run `node scripts/check-no-runtime-msgpack.cjs` if storage/runtime migration code changed.
- [x] 9.7 Run `pnpm build`.
- [x] 9.8 Run `openspec validate harden-card-data-contract-and-startup-normalization --strict`.
