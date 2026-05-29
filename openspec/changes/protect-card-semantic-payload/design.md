## Context

SQL-first card runtime stores each card as projection columns plus full JSON payloads. The projection columns serve Browser/search/sort paths, while `payload_json` and `dto_json` preserve the full card. `UnifiedStorageManager.getStoreData()` normally emits both `cards` and `cardDTOs`, but existing migration code can receive legacy stores where `cardDTOs` is present and `cards` is empty. `SqlUnifiedStorageRepository.saveStore()` currently writes only from `store.cards`, so a DTO-only store can be backed up but not imported into SQL.

SRS editor type/render controls are legitimate user actions, but the same fields they mutate are also the fields that encode custom card semantics: `type`, `cardTypeMarker`, `meta.cardTypeMarker`, `meta.typeMarker`, `meta.templateID`, `meta.renderProfile`, `meta.clozeRenderMode`, Xiuyuan block/field mappings, faces, and unknown custom metadata. Built-in transition helpers currently overwrite built-in render markers directly, which is fine for built-in cards but unsafe for user-owned custom card types unless the overwrite is explicit.

## Goals / Non-Goals

**Goals:**

- Import every active legacy card during initial SQL migration, including DTO-only cards.
- Define protected card semantic payload independently from scheduling state.
- Keep scheduling-only updates able to persist without touching semantic payload.
- Prevent SRS editor type/render changes from silently overwriting custom semantic payload.
- Add focused regression tests around migration, mapper round-trip, and editor guard behavior.

**Non-Goals:**

- No new card type system or custom template authoring UI.
- No rewrite of Xiuyuan aggregate model.
- No automatic repair of unknown custom cards beyond preserving existing data.
- No hidden fallback to legacy msgpack after SQL cutover.
- No broad Browser or Review UI redesign.

## Decisions

### Decision 0: final card model follows Anki ownership

The final ownership model is:

- `CardTypeDefinition` (evolved from existing `ICardTemplate`) is the global type/notetype-like definition. It owns field schema, card generation rules, render defaults, version/origin, and overwrite policy.
- `Xiuyuan` is the semantic instance. It owns fields, block bindings, faces, source lineage, and the selected card type definition id.
- `FSRSCard` is the schedulable review instance. It owns stable card id, `xiuyuanID`, `faceKey`, and scheduling state.
- `review_events` is review history. It does not own card semantics.

`faceKey` is a locator, not content. It answers "which derived card is being reviewed" by carrying `ruleId` plus optional `faceIndex`. Front/back content is derived from `Xiuyuan + CardTypeDefinition + faceKey`.

`typeMarker` is downgraded to a legacy/display marker. It can seed `ruleId` during migration, but it is not the long-term stable identity field.

Alternatives considered:

- Create a new parallel notetype registry. Rejected because `ICardTemplate` and `TemplateRegistry` already provide the right skeleton; parallel truth would make creation/render/migration/editor guards diverge.
- Put all type information inside each Xiuyuan. Rejected because type definitions are global rules and should not be duplicated into every semantic instance.
- Keep `meta.faceIndex/typeMarker` as the stable identity. Rejected because those fields are overloaded with render/display compatibility and are too weak for custom card types.

### Decision 1: SQL import uses canonical DTO set as card source

Initial SQL import will build the active card set from `store.cardDTOs` when present, falling back to `store.cards` only for old stores that lack DTOs. Each DTO will be converted through `CardMapper.toDomain()` and written through the same `writeCardRecord()` path so SQL rows still contain both `payload_json` and `dto_json`.

Alternatives considered:

- Keep iterating `store.cards` and rely on `UnifiedStorageManager` to always emit both maps. Rejected because existing tests and older snapshots already model DTO-only stores.
- Write DTO rows directly without domain conversion. Rejected because it would bypass canonical scheduling cleanup, algorithm state derivation, projection generation, and source-existence preservation.

### Decision 2: protected semantic payload is a named contract

Protected payload will be defined as a small local contract covering identity/source fields, card type/render/template markers, Xiuyuan field/face mapping, and unknown custom metadata. This contract is used by migration tests, mapper tests, and editor transition guards.

Alternatives considered:

- Treat all `meta` as opaque and forbid every edit. Rejected because built-in cards need type/render controls.
- Protect only `templateID`. Rejected because custom cards can encode semantics across `typeMarker`, `renderProfile`, `cardTypeMarker`, `clozeRenderMode`, `faces`, and custom keys.

### Decision 3: editor transitions require explicit semantic overwrite when custom fields are present

`CardEditorApplicationService` or transition helpers will detect whether a requested type/render change would overwrite protected semantic payload that is not already one of the known built-in values. Without explicit confirmation/override intent, the operation returns a blocked result and leaves the card unchanged. Built-in-to-built-in transitions remain one-click.

Alternatives considered:

- Let UI warn after overwrite. Rejected because silent mutation is the data-loss class.
- Add confirmation only in Vue component. Rejected because service-level tests need to enforce the invariant regardless of UI entrypoint.

### Decision 4: scheduling-only paths preserve semantic payload by construction

Priority, dismissed state, reset-progress, and reschedule flows will be tested to prove they preserve protected semantic payload. Review feedback and backend scheduling writes remain allowed to update scheduling fields, but they must not reconstruct cards from partial scheduling DTOs that drop semantic fields.

Alternatives considered:

- Put all protection in SQL repository. Rejected because editor transitions can intentionally change semantic fields and need user intent before persistence.

## Risks / Trade-offs

- Custom-card detection may initially be conservative -> show blocked/confirmation-required for ambiguous cards rather than overwrite data.
- Built-in values may drift as new card types are added -> keep known built-in render/type markers centralized and covered by tests.
- DTO-only migration repair could expose malformed legacy DTOs -> fail closed with migration backup intact instead of importing partial rows.
- Service-level block result may require UI adjustment -> keep the return shape explicit so the dialog can show a direct confirmation path later.

## Migration Plan

1. Add final-shape type contract: `CardTypeDefinition`, rule `ruleId`, `CardFaceKey`, and mapper persistence for `faceKey`.
2. Normalize legacy `faceIndex/typeMarker` into `faceKey` while keeping old fields as compatibility/display projection.
3. Add failing tests for DTO-only `cardDTOs` SQL migration and repository `saveStore()` import.
4. Change SQL unified repository import to use the canonical card DTO set and write all active cards through `writeCardRecord()`.
5. Add protected semantic payload helpers/tests for mapper round-trip and scheduling-only preservation.
6. Add service-level guard for SRS editor type/render transitions when custom semantic payload would be overwritten.
7. Wire the SRS editor dialog to surface blocked/confirmation-required results without mutating the card.
8. Validate with targeted migration/repository/mapper/card-editor tests, `pnpm run check:boundaries`, hidden fallback/msgpack checks, and `pnpm build`.

## Open Questions

- Which custom metadata keys should be promoted from "preserved unknown" into named Xiuyuan semantic fields later?
- Should confirmed editor overwrite also update the Xiuyuan aggregate/template facts, or only the FSRS card render override?
- Which old UI/render paths can stop reading `meta.faceIndex/typeMarker` once all cards have `faceKey`?
