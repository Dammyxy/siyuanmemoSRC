## Why

Recent card semantic work protected `CardTypeDefinition`, `Xiuyuan`, `faceKey`, SQL migration, and Review render routing, but seven debt seams remain close enough that they should be handled as one card-data hardening change:

- Review concept-roam still derives semantic focus from legacy `meta.templateID/typeMarker` and block arrays.
- Special renderer component identities still use legacy `meta.faceIndex/templateID/typeMarker`.
- `UnifiedReviewAdapter` still mixes answer block selection, native Riff behavior, list-template flags, and debug payloads through raw legacy card meta.
- Browser preview/display helpers still infer structure from `meta.templateID`.
- Historical live DB rows can still contain same-block native Riff shadow cards that should be audited before deletion/hiding.
- Review compatibility fallback still exists for states without `renderContext.renderPolicy`.
- Plugin startup can abort while persisting scheduling normalization when a legacy/new-card DTO has `difficulty: 0`, because `ScheduleInfo` and algorithm-state code allow empty FSRS memory for non-review cards but `CardMapper.validate()` rejects DTO difficulty outside `1..10`.

These are not independent cleanup chores. They all come from the same boundary problem: persisted card rows, Review UI routing, display projection, and scheduling normalization do not yet share one explicit card-data contract.

## What Changes

- Introduce a startup-safe scheduling normalization contract so empty non-review FSRS memory (`difficulty: 0`, `stability: 0`) is normalized/accepted intentionally, while invalid review-state memory still fails closed or repairs through the existing scheduling cleanliness path.
- Prevent startup from failing on a single legacy DTO during scheduling normalization persistence; the system must either canonicalize valid empty-new-card state or report the exact unrecoverable row without corrupting storage.
- Add a Review concept-roam focus contract that resolves concept focus from `fieldMapping`, `CardTypeDefinition`/semantic locator, and `renderContext.renderPolicy` before legacy projection fields.
- Move special renderer component cache/identity keys to `faceKey` / render policy cache tokens so stale `meta.faceIndex/templateID/typeMarker` cannot keep or reload the wrong view model.
- Split `UnifiedReviewAdapter` raw-meta reads into named contracts: answer block selection, native Riff sync behavior, list-template rendering, dependency blocks, and diagnostic projection.
- Replace Browser preview structural display decisions based on `meta.templateID` with an explicit card display/render projection helper.
- Add an audit-first cleanup path for same-block `builtin-riff-sync` shadow cards: detect, report, and optionally hide/delete only after explicit policy and tests.
- Retire Review render compatibility fallback only after all active Review states in the traced call chain are proven to carry `renderContext.renderPolicy`.

## Capabilities

### New Capabilities
- `card-data-contract-hardening`: Defines the remaining card-data contract hardening work across scheduling normalization, Review routing/focus, display projection, and shadow-card cleanup.
- `startup-scheduling-normalization`: Defines startup behavior for malformed or empty scheduling DTOs so plugin initialization does not abort on recoverable empty-new-card state.

### Modified Capabilities
- `review-render-context-routing`: Extends the Review render context work to concept-roam focus and component identity/cache keys.
- `card-semantic-authority-debt`: Completes remaining semantic authority retirement by separating legacy projection from active routing/focus/display decisions.
- `sql-first-card-runtime`: Tightens SQL save/load behavior around DTO validation and scheduling state canonicalization.

## Impact

- Affected runtime areas:
  - `src/application/ApplicationContext.ts`
  - `src/core/storage/UnifiedStorageManager.ts`
  - `src/core/scheduler/schedulingStateCleanliness.ts`
  - `src/infrastructure/persistence/mappers/CardMapper.ts`
  - `src/infrastructure/persistence/sqlite/SqlUnifiedStorageRepository.ts`
  - `src/ui/review/v2/reviewConceptRoam.ts`
  - `src/ui/review/v2/reviewPresentationPreparer.ts`
  - `src/ui/review/v2/ReviewContent.vue`
  - `src/ui/review/components/{ConceptDefinitionCardRenderer.vue,MultiClozeCardRenderer.vue}`
  - `src/application/adapters/UnifiedReviewAdapter.ts`
  - Browser preview/display helpers under `src/ui/browser/**`
  - shadow-card diagnostics/cleanup surface under existing storage/domain-sync infrastructure
- Affected tests:
  - startup normalization and SQL repository tests for DTO difficulty `0` / invalid review memory
  - Review concept-roam focus tests
  - renderer component identity tests
  - Review adapter answer/native-riff/list-template contract tests
  - Browser preview display projection tests
  - shadow-card audit tests
- No storage schema break is intended. Existing legacy meta fields may remain persisted as compatibility/display projection, but active authority reads must be named and covered by tests.
