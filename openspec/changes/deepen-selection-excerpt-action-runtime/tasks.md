## 1. Characterization

- [x] 1.1 Add focused tests for `SelectionExcerptService.executeSelectionExcerptAction(...)` covering created, duplicate, source marking enabled/disabled, source-mark prepare failure, source-mark persist failure diagnostics, degraded preservation diagnostics, and progressive command failure.
- [x] 1.2 Add or update editor handler tests to prove editor hotkey/menu calls the shared action and preserves existing messages.
- [x] 1.3 Add or update block menu tests to prove full-block excerpts call the shared action and preserve duplicate/source mark behavior.
- [x] 1.4 Add or update Review command tests to prove Review calls the shared action before Review-specific routing.

## 2. Shared Action Runtime

- [x] 2.1 Define typed action input/output types in `SelectionExcerptService` for `executeSelectionExcerptAction(...)`, created/duplicate discriminated-union outcomes, thrown hard failures, identity/source semantics, preservation diagnostics, and separate source-mark diagnostics.
- [x] 2.2 Move source materialization, preservation diagnostics, source mark prepare/apply, create/duplicate branching, and color result mapping into `SelectionExcerptService`.
- [x] 2.3 Keep duplicate-open, Review queue insertion, hyperspace injection, and user-facing messages outside the core action runtime as caller-owned or injected adapter behavior.
- [x] 2.4 Ensure `SelectionExcerptService` still invokes `ProgressiveReadingService.createExcerptFromSelection()` so existing `progressive.command.execute` and writer relay policy remain unchanged.
- [x] 2.5 Hard-cut the old public `SelectionExcerptService.materializeExcerptSource()`, `createFromSelection()`, and `updateSourceBlockDom()` pass-through methods; retain only private/internal helpers if needed.
- [x] 2.6 Keep `sourceMarkingEnabled` caller-owned and keep `origin` diagnostic-only inside the service.
- [x] 2.7 Tighten touched `ProgressiveLineage` typing for `sourceLineage`, `payloadIdentity`, and `disclosureState` in the Progressive / Excerpt creation chain.

## 3. Caller Migration

- [x] 3.1 Migrate `ProgressiveExcerptHotkeyHandler` editor/menu excerpt flow to the shared action Interface and delete duplicated local helpers made obsolete.
- [x] 3.2 Migrate `BlockMenuHandler` progressive excerpt action to the shared action Interface and delete duplicated local helpers made obsolete.
- [x] 3.3 Migrate `reviewProgressiveExcerptCommands.ts` creation flow to the shared action Interface while keeping Review route/hyperspace insertion local to Review.
- [x] 3.4 Re-check source semantics returned from created excerpts and ensure Review still receives only identity/semantic facts needed for next-item routing, without full DOM/content.
- [x] 3.5 Map source-mark write failures separately from preservation degradation in editor, block-menu, and Review messages.
- [x] 3.6 Ensure duplicate handling callers build any UI navigation target themselves from returned identity facts.

## 4. Documentation And Validation

- [x] 4.1 Update `ARCHITECTURE.md` to describe `SelectionExcerptService` as the selection excerpt action runtime, not a light pass-through facade.
- [x] 4.2 Append a `docs/DDD_RESCAN_BACKLOG.md` task delta after production code changes.
- [x] 4.3 Run focused tests for Progressive/Excerpt entries and Review progressive excerpt commands.
- [x] 4.4 Run `node scripts/check-hidden-fallbacks.cjs`, `pnpm run check:boundaries`, `pnpm build`, and `openspec validate "deepen-selection-excerpt-action-runtime" --strict`.
- [x] 4.5 Grep/Select-String check that no production caller still uses the removed public `SelectionExcerptService` pass-through methods.
