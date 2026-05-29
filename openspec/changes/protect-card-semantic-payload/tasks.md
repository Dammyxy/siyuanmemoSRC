## 1. Final Card Shape Contract

- [x] 1.1 Add `CardFaceKey` to FSRSCard/DTOs as the stable review-instance locator (`ruleId` + optional `faceIndex`).
- [x] 1.2 Evolve `ICardTemplate` into a `CardTypeDefinition` alias/contract and add stable `ruleId` support to card rules.
- [x] 1.3 Normalize registered templates so old rules without `ruleId` get stable rule ids while `typeMarker` remains legacy/display metadata.
- [x] 1.4 Add mapper tests proving `faceKey` round-trips and legacy `meta.faceIndex/typeMarker` seed `faceKey` without becoming authority.
- [x] 1.5 Keep old `meta.faceIndex/typeMarker/templateID` readable as compatibility projections until render paths are migrated.

## 2. Migration Protection

- [x] 2.1 Add failing SQLite migration/repository tests for a legacy store where `cardDTOs` contains active cards and `cards` is empty.
- [x] 2.2 Add a stale-domain-card test proving `cardDTOs` wins over stale `cards` metadata during SQL import.
- [x] 2.3 Change `SqlUnifiedStorageRepository.saveStore()` to build import rows from the canonical DTO set, falling back to `store.cards` only when DTOs are absent.
- [x] 2.4 Ensure imported DTO-only cards populate both `payload_json` and `dto_json` and preserve projection columns.
- [x] 2.5 Add a malformed DTO migration test proving migration fails closed and does not mark `initial-msgpack-json-import-v1` complete.

## 3. Semantic Payload Contract

- [x] 3.1 Introduce a small protected semantic payload helper for identity/source fields, type/render/template markers, Xiuyuan mapping fields, face metadata, and unknown custom metadata.
- [x] 3.2 Add CardMapper round-trip tests for custom `meta`, `templateID`, `typeMarker`, `renderProfile`, `clozeRenderMode`, face/mapping data, and unknown semantic keys.
- [x] 3.3 Add scheduling-only preservation tests for priority, dismissed, reset-progress, and reschedule paths.
- [x] 3.4 Keep the helper independent from SQL projection columns so projection-only reads cannot become semantic authority.

## 4. SRS Editor Guard

- [x] 4.1 Add service-level tests where type/render transitions on built-in cards still persist directly.
- [x] 4.2 Add service-level tests where type/render transitions on custom semantic payload return blocked or confirmation-required without calling `updateCard`.
- [x] 4.3 Add explicit overwrite intent support that records which protected fields would be overwritten.
- [x] 4.4 Update `CardEditorApplicationService` and transition helpers to enforce semantic overwrite guard before mutation.
- [x] 4.5 Update `SrsEditorDialog.vue` to surface blocked/confirmation-required results without mutating the card.

## 5. Validation And Documentation

- [x] 5.1 Run targeted tests for TemplateRegistry, SQLite migration, SQL unified repository, CardMapper, CardEditorApplicationService, and SRS editor dialog.
- [x] 5.2 Run `pnpm run check:boundaries`, `node scripts/check-no-runtime-msgpack.cjs`, `node scripts/check-hidden-fallbacks.cjs`, and `pnpm build`.
- [x] 5.3 Update `ARCHITECTURE.md` if runtime ownership/call-chain wording changes.
- [x] 5.4 Update `docs/DDD_RESCAN_BACKLOG.md` with fixed/deferred debt after production code changes.
