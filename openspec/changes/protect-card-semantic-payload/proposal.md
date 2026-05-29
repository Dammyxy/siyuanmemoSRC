## Why

SiYuanMemo now treats SQL as the active card runtime, but card semantic payload can be more valuable than scheduling state for custom card types. Two concrete gaps need protection now: initial SQL migration can miss DTO-only legacy stores, and SRS editor type/render changes can silently overwrite custom semantic fields such as template and render markers.

## What Changes

- Move the card model toward the Anki-shaped final contract: `CardTypeDefinition` defines field/rule/render semantics, `Xiuyuan` owns semantic instance data and faces, and `FSRSCard` owns only schedulable card identity plus scheduling state.
- Add a stable `faceKey` on `FSRSCard`/DTOs. `faceKey` identifies which derived review card is scheduled (`ruleId` plus optional `faceIndex`); it does not own front/back content.
- Evolve the existing `ICardTemplate`/`TemplateRegistry` into the single `CardTypeDefinition` registry instead of adding a parallel notetype system. `typeMarker` remains as a legacy/display marker, not stable identity.
- Preserve DTO-only legacy cards during initial SQLite migration: `cardDTOs` SHALL be imported even when legacy `cards` is empty or incomplete.
- Define a protected card semantic payload contract covering card type, render/template markers, Xiuyuan field mappings, card faces/source links, and unknown custom metadata.
- Guard SRS editor type/render transitions so custom semantic payload is not silently overwritten by built-in defaults.
- Add regression coverage for DTO-only migration, semantic payload round-trip, and editor guard behavior.
- Keep scheduling-only changes free to update scheduling state without modifying semantic payload.

## Capabilities

### New Capabilities
- `card-semantic-payload-protection`: Defines protected card semantic payload and the rules for migration, editor transitions, and scheduling-only updates.

### Modified Capabilities
- `sql-first-card-runtime`: Tightens SQL-first migration and persistence requirements so legacy `cardDTOs` and protected semantic payload survive SQL cutover.

## Impact

- Affected runtime areas:
  - `src/types/card.ts`
  - `src/core/xiuyuan/types.ts`
  - `src/core/xiuyuan/templates/TemplateRegistry.ts`
  - `src/core/card/semanticPayload.ts`
  - `src/infrastructure/persistence/sqlite/SqlUnifiedStorageRepository.ts`
  - `src/infrastructure/persistence/sqlite/SqliteMigrationService.ts`
  - `src/infrastructure/persistence/mappers/CardMapper.ts`
  - `src/application/services/CardEditorApplicationService.ts`
  - `src/application/services/card-editor/applyCardTypeTransition.ts`
  - `src/application/services/card-editor/applyRenderTargetTransition.ts`
  - `src/ui/srs/SrsEditorDialog.vue`
- Affected tests:
  - SQLite migration and unified storage repository tests
  - Card mapper semantic round-trip tests
  - Card editor transition/dialog tests
- No public API dependency change. Behavior change is fail-closed/confirmation-required for protected semantic overwrites.
