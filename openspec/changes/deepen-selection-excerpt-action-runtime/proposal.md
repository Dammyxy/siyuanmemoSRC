## Why

Progressive excerpt creation currently repeats the same materialize, highlight, duplicate-open, and result-message flow across editor hotkey/menu, block menu, and Review surface callers. `SelectionExcerptService` is documented as the owner for renderer-only selection materialization facts, but its current Interface is a shallow pass-through to `ProgressiveReadingService`, so stale DOM facts, highlight failure policy, duplicate handling, and source-preservation diagnostics remain spread across callers.

## What Changes

- Deepen `SelectionExcerptService` into an application-owned selection excerpt action runtime with one `executeSelectionExcerptAction(...)` Interface for editor, block-menu, and Review callers.
- Move shared selection excerpt flow behind that runtime: source materialization, source-mark preparation/application, create/duplicate result interpretation, duplicate outcome mapping, preservation diagnostics, and typed action result.
- Keep surface-specific behavior as injected adapters: toast/message copy, opening duplicate excerpt tabs, Review queue/hyperspace routing, and current-card context.
- Keep `ProgressiveReadingService` as the progressive command facade and `ProgressiveExcerptMaterializer` as artifact materialization owner; do not move split/session/backend command ownership in this change.
- Tighten new-source semantics for freshly created excerpts by carrying only identity and semantic facts (`sourceLineage`, `payloadIdentity`, `disclosureState`, `sourceBlockIds`, `excerptEntityId`, `topicCardId`) through the action result where callers need routing context.
- Treat the selection materialization output as the authoritative source semantics for next-item routing; callers must not infer those semantics from returned DOM or content.
- Tighten touched `ProgressiveLineage` typing for this creation chain instead of carrying the current `unknown` lineage boundary forward.
- Hard-cut the old public pass-through methods on `SelectionExcerptService` instead of keeping short-term compatibility aliases.
- Remove duplicated helper code from `ProgressiveExcerptHotkeyHandler`, `BlockMenuHandler`, and `reviewProgressiveExcerptCommands.ts` after the shared runtime covers the same cases.

## Capabilities

### New Capabilities
- `selection-excerpt-action-runtime`: Defines the application-owned selection excerpt action contract used by editor, block-menu, and Review surfaces.

### Modified Capabilities

## Impact

- Affected code: `src/application/services/SelectionExcerptService.ts`, `src/application/handlers/ProgressiveExcerptHotkeyHandler.ts`, `src/application/managers/BlockMenuHandler.ts`, `src/ui/review/v2/reviewProgressiveExcerptCommands.ts`, focused Progressive/Excerpt and Review tests, `ARCHITECTURE.md`, and `docs/DDD_RESCAN_BACKLOG.md`.
- Runtime ownership: no new SQL, no UI SQL, no new backend-worker ownership, no follower-local mutation fallback. Existing `progressive.command.execute` and writer relay behavior stay intact.
- User-facing behavior should stay stable except error/diagnostic consistency across the three excerpt entry surfaces.
