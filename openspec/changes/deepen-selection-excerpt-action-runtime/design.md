## Context

The active Progressive / Excerpt path has three visible selection entry surfaces:

- editor command or content menu through `ProgressiveExcerptHotkeyHandler`
- block menu full-block selection through `BlockMenuHandler`
- Review surface selection through `reviewProgressiveExcerptCommands.ts`

All three currently perform similar orchestration: resolve a selection snapshot, ask `SelectionExcerptService` to materialize/create via `ProgressiveReadingService`, prepare and apply source marks, branch on duplicate records, hand duplicate identities back to the surface for opening, and show surface-specific messages. The code already has a deep artifact Materializer (`ProgressiveExcerptMaterializer`) and a backend command facade (`ProgressiveReadingService`), but the selection action Module itself is shallow.

Constraints:

- Keep dependency direction `ui -> application -> core -> infrastructure`.
- No UI SQL and no new application SQL.
- Do not add fallback or follower-local mutation when backend/writer relay is unavailable.
- Keep current `progressive.command.execute` authority and writer relay behavior.
- Keep `ProgressiveExcerptMaterializer` as artifact materialization owner.

## Goals / Non-Goals

**Goals:**

- Provide one application-owned `executeSelectionExcerptAction(...)` Interface for selection excerpt action execution across editor, block-menu, and Review surfaces.
- Centralize source materialization, source mark prepare/apply, duplicate handling, preservation diagnostics, and typed result mapping.
- Let entry surfaces retain only user interaction facts and injected surface adapters: messages, duplicate target opening, Review insertion/hyperspace route, and current card identity.
- Preserve current user-facing behavior while making error and diagnostic handling consistent.
- Make identity and source semantics available from the action result when a caller needs to route or present the newly created excerpt.
- Treat selection materialization output as the authoritative source semantics for next-item routing.
- Tighten the touched `ProgressiveLineage` typing so `sourceLineage`, `payloadIdentity`, and `disclosureState` are not passed as `unknown` in this creation chain.
- Hard-cut the old public `SelectionExcerptService` pass-through Interface rather than keeping compatibility aliases.

**Non-Goals:**

- Do not migrate progressive split/session behavior.
- Do not move Progressive / Topic-derived command ownership deeper into backend worker.
- Do not migrate historical excerpt records or historical card metadata.
- Do not redesign source mark visuals, settings, or i18n copy.
- Do not merge Topic-derived item continuation into this action runtime.
- Do not return full selected DOM or excerpt content to UI callers as part of the new action outcome.

## Decisions

1. Put the external Seam at `SelectionExcerptService`.

   `SelectionExcerptService` becomes the selection excerpt action Module instead of a pass-through wrapper. Its Interface should be named `executeSelectionExcerptAction(...)`, accept a validated `ProgressiveExcerptSelectionSnapshot` plus action options (`origin`, `currentCardId`, `sourceMarkingEnabled`), and return a typed action result.

   The new Interface is a hard cut: callers migrate to the action method, and the old public `materializeExcerptSource()`, `createFromSelection()`, and `updateSourceBlockDom()` pass-through methods are not retained as public compatibility aliases. Internal/private helpers may remain if they reduce noise inside the service.

   Alternative: move everything into `ProgressiveReadingService`. Rejected because that service already owns split/session/backend facade concerns; adding renderer-only selection and highlight policy would make it broader, not deeper.

2. Keep surface effects as injected Adapters.

   The action runtime should not import Review queue, tab, or toast implementations. It should expose typed outcomes for duplicate-open and after-created routing, leaving those surface actions in the caller.

   Alternative: hard-code duplicate tab opening and Review insertion inside the service. Rejected because it would pull UI/Review surface details into the application service and widen the Interface.

3. Treat source mark persistence as part of the selection action, not artifact materialization.

   Source mark preparation depends on live DOM Range facts and must happen before the excerpt write can invalidate the selection. Persistence uses `updateSourceBlockDom()` through the existing progressive port path and remains an explicit best-effort visual mark result, not duplicate prevention or content authority.

   Alternative: move source marking into `ProgressiveExcerptMaterializer`. Rejected because materializer runs on normalized input and should not depend on live DOM Range or Review/editor roots.

4. Return typed action outcomes instead of letting callers inspect low-level creation results.

   Proposed outcomes:

   - `created`: `kind: 'created'`, `excerptEntityId`, `topicCardId`, `sourceBlockIds`, `sourceLineage`, `payloadIdentity`, `disclosureState`, color application status, preservation diagnostics, and source-mark diagnostics
   - `duplicate`: `kind: 'duplicate'`, existing excerpt identity/record reference, source block ids when available, color application status, and source-mark diagnostics
   - thrown explicit error for hard failures

   Alternative: preserve caller-side `ProgressiveExcerptCreationResult` branching. Rejected because that keeps duplicate/result interpretation duplicated across surfaces.

   The outcome should not carry full source DOM, full excerpt content, or caller-ready rendered content. Callers receive identity and semantics only; materialized DOM remains an internal write input.

   Hard failures use `throw`; valid business branches use the discriminated union. Source-mark persistence failure and preservation degradation remain diagnostics on a successful `created` or `duplicate` outcome, not a third `failed` outcome. This prevents callers from receiving a "failed" value and attempting local mutation fallback.

   The source semantics returned by the action are authoritative from the materialized selection snapshot (`sourceLineage`, `payloadIdentity`, `disclosureState`, `sourceBlockIds`). Review's next-item routing should consume those facts directly and should not reconstruct source semantics from DOM or content.

5. Keep Review-specific queue/hyperspace routing outside the shared action runtime.

   Review still decides whether to insert the created excerpt into the current Progressive review or hyperspace session, because that depends on current Review queue/neural state. The shared action runtime returns enough identity for Review routing.

   Alternative: let `SelectionExcerptService` know about Review queues. Rejected because it would cross from Progressive / Excerpt into Review queue ownership.

6. Keep duplicate-open as a caller-owned surface action.

   When duplicate detection returns an existing record, `SelectionExcerptService` should return the duplicate outcome and let the caller decide how to open the existing excerpt in its own surface. That keeps the shared action runtime free of tab/dialog ownership and avoids coupling it to editor, block-menu, or Review presentation details.

   The duplicate outcome should carry only application-layer identity facts such as the duplicate record or normalized existing excerpt/topic identity. It should not carry a UI navigation target.

   Alternative: inject duplicate-open behavior or a UI navigation target into the shared runtime. Rejected because it would widen the Interface with surface-specific tab/navigation concerns.

7. Split source-mark failure modes.

   If source marking is enabled and the selection snapshot cannot prepare a source-mark mutation from the live DOM Range, the shared action should fail explicitly instead of pretending excerpt creation succeeded. If preparation succeeds but applying or persisting the source mark fails, the action should still return the created or duplicate outcome with `colorApplied=false` and a separate mark diagnostic.

   User-facing mapping must keep mark diagnostics separate from content preservation diagnostics. Created + mark persistence failure maps to "已创建 Topic，但原文标记未写入"; duplicate + mark persistence failure maps to "已找到已有摘录，但原文标记未写入". Those messages must not be collapsed into preservation warnings such as link/reference retention degradation.

   Alternative: treat all source-mark failures as action failures. Rejected because that would make transient visual-mark persistence problems break otherwise valid excerpt creation.

8. Hard-cut the old public pass-through Interface.

   The migration should delete public callers of `materializeExcerptSource()`, `createFromSelection()`, and `updateSourceBlockDom()` on `SelectionExcerptService` in the same change. Keeping aliases would preserve the exact shallow seam this change is meant to remove and would invite new caller-side orchestration.

   Alternative: retain the old public methods for one release as deprecation shims. Rejected because all known callers are in this bounded context and can migrate together.

9. Let caller surfaces read source-mark policy.

   Editor, block-menu, and Review callers read the relevant source-mark setting and pass the resulting `sourceMarkingEnabled` policy into `executeSelectionExcerptAction(...)`. `SelectionExcerptService` does not import settings services or infer the policy itself.

   Alternative: make `SelectionExcerptService` read settings. Rejected because setting-read failure messages and defaults are surface concerns, and importing settings would widen the action runtime beyond explicit action execution.

10. Keep `origin` diagnostic-only.

   `origin` is useful for logs, diagnostics, and message context, but it must not alter creation rules or become persisted source semantics. Editor, block-menu, and Review are entry differences, not source-lineage differences.

   Alternative: encode `origin` into excerpt semantics. Rejected because actual source identity belongs to the materialized selection facts.

11. Tighten touched progressive lineage types.

   This change should replace the touched `unknown` lineage boundary with typed progressive source facts for this creation path: `sourceLineage`, `payloadIdentity`, and `disclosureState`. Keep the change local to Progressive / Excerpt creation; do not attempt a repository-wide lineage type migration.

   Alternative: leave `ProgressiveLineage` as `unknown`. Rejected because the requested next-item behavior depends on complete source semantics crossing the Review boundary without lossy typing.

## Risks / Trade-offs

- Action result Interface too broad -> Keep only domain/action facts in the result; keep surface text, queue insertion, and tab opening in adapters.
- Action result too leaky -> Do not return full DOM or content to UI; return identity and semantic facts only.
- Hard cut breaks missed caller -> Use tests and grep checks to prove every `SelectionExcerptService` caller migrated.
- Source mark behavior changes accidentally -> Characterize existing editor, block-menu, and Review cases before refactor, including duplicate and mark failure cases.
- Settings ownership drifts into the service -> Keep `sourceMarkingEnabled` as an explicit input and keep setting reads in caller surfaces.
- `origin` becomes accidental business state -> Use it only in diagnostics/logging; source semantics come from materialization.
- Lineage type tightening grows too wide -> Restrict type work to the touched Progressive / Excerpt creation chain.
- Hidden fallback reintroduced by "best effort" wording -> Source marks may fail closed as a visual mark result, but excerpt creation must not report success when the underlying progressive command fails.
- Review helper loses useful locality -> Keep Review queue/hyperspace route helpers in `reviewProgressiveExcerptCommands.ts`; only remove common excerpt action mechanics.

## Migration Plan

1. Add focused characterization coverage for current shared behavior in `SelectionExcerptService` or a new service test file.
2. Implement the deepened `SelectionExcerptService` action Interface using existing `ProgressiveReadingService`, `prepareProgressiveExcerptHighlight()`, and `applyProgressiveExcerptHighlight()`.
3. Migrate `ProgressiveExcerptHotkeyHandler`, `BlockMenuHandler`, and `reviewProgressiveExcerptCommands.ts` to call the new action Interface.
4. Delete duplicated local helper branches and the old public `SelectionExcerptService` pass-through methods made obsolete.
5. Update `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md` after production code changes.
6. Validate focused tests, hidden fallback/boundary checks, and build.

## Open Questions

None.
