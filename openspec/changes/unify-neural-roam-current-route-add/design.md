## Context

NeuralRoam has already moved its read/advance/command authority toward backend `neural-roam.viewState`, `neural-roam.advance`, and `neural-roam.command`. Route switch, mode switch, source rail toggles, anchors, temporary route lifecycle, and history commands are documented as backend-owned.

The remaining gap is the old "add to NeuralRoam queue" entry family. Browser datasource actions still route through generic `batchAddToQueue()` and then local `NeuralRoamQueue.addCards()`. Review and block-menu entry actions call `NeuralRoamEntryActionService`, but the service still adds through local `queue.addCard()`. That means the route-aware product model exists, but card addition still looks like a single queue mutation and is implemented in multiple places.

The domain term for this change is **current route source**: a Concept block enabled as a source/seed for the backend active NeuralRoam route. User-facing wording may say "add to NeuralRoam current route"; implementation should keep source/seed semantics explicit.

## Goals / Non-Goals

**Goals:**

- Make Browser, Review, and block-menu "add to NeuralRoam" actions use one application-level route-aware entry.
- Add existing Concept cards to the backend active NeuralRoam route as source entries.
- Preserve the "make Concept card then add" flow by creating or ensuring the Concept card before the shared route-add command.
- Support bulk Browser selection with one backend command instead of one command per row.
- Return explicit unavailable/mismatch/error results when backend command authority cannot apply the change.
- Remove runtime use of local `NeuralRoamQueue.addCard()` / `addCards()` from these entry actions.
- Rename labels/messages so the user sees "current route" rather than "queue".

**Non-Goals:**

- Do not add UI for choosing an inactive route.
- Do not model each NeuralRoam route as a normal queue type or queue id.
- Do not remove the renderer `NeuralRoamQueue` adapter/cache/test helper in this change.
- Do not redesign route persistence storage.
- Do not change NeuralRoam advance, rating, or engine traversal behavior except where tests need updated setup for route source membership.

## Decisions

1. Use a shared application entry, not shared UI helper code.

   Browser, Review, and block-menu entries have different UI shapes, but they share the same product operation: add Concept blocks to the current route. The shared code belongs in application layer, likely `NeuralRoamEntryActionService`, because that service already owns Concept creation/start-roam orchestration and already has `neuralRoamCommand` access. UI code should only collect selected block ids/cards, call the service, and render the returned result.

   Alternative considered: put the shared logic in `MenuActions.ts` or `UnifiedDataSourceManager.batchAddToQueue()`. That keeps Browser local but does not unify Review/block-menu and would keep queue wording in the wrong abstraction.

2. Add a backend batch command named `set-sources`.

   Existing backend command `set-source` handles one node. Bulk Browser selection would otherwise issue many backend commands, each with command result/view-state sync overhead. A `set-sources` command with `{ nodeIds, enabled?, routeId? }` preserves the existing source semantics, supports add/remove, and lets worker command policy update the active route once per user action.

   Alternative considered: loop `set-source` in the app service. This is smaller but weaker for large selections and harder to prove as one atomic route update.

3. Current route means backend active route at command time, guarded by route id when available.

   If the UI has a current route id from backend view state, the app service should pass it as `routeId` to catch stale route actions. If no route id is available, the command targets the backend active route and returns the updated read model. A route mismatch returns explicit mismatch/unavailable behavior; no frontend local mutation should compensate.

4. Keep Concept validation and creation at application boundary.

   Browser selections must add only cards with `cardType === 'concept'` or equivalent trusted Concept payload. Non-Concept rows are skipped or rejected using existing concept-only semantics. Review/block-menu "make Concept" actions should ensure a Concept card first, then call the same route-add method. The backend command assumes node ids are already eligible Concept sources; it does not create Concept cards.

5. "Start roam" remains a composed action.

   "Make Concept and start roam" should ensure/add the Concept to the current route and then continue the existing start/open flow. If backend `startFromFocus` also seeds the same node, the operation must be idempotent and not create duplicate source entries.

6. Update wording without changing action ids unless required by tests.

   Existing action ids such as `add-to-neural-roam-queue` may remain to avoid broad event/selection churn. User-visible i18n keys/fallbacks should say "NeuralRoam current route" / "current route" while implementation tests verify the semantic path changed.

## Risks / Trade-offs

- [Risk] Existing completed backend ownership change claims entry actions are already routed, but code still has local add paths. -> Mitigation: add direct regression tests for every known entry path and a grep/boundary check for runtime `queue.addCard/addCards` callers.
- [Risk] Batch command can partially apply if one node id is invalid. -> Mitigation: app layer filters/normalizes before command; worker command policy should apply normalized unique ids and return explicit failed/skipped diagnostics if it rejects any id.
- [Risk] Route can change between menu open and click. -> Mitigation: include `routeId` when caller has it; otherwise target command-time active route and report the returned route in message/view state.
- [Risk] Existing Browser generic queue add code may still route NeuralRoam through `batchAddToQueue()`. -> Mitigation: special-case NeuralRoam action before generic queue add, or make `batchAddToQueue(NeuralRoam)` delegate to the shared app command and block local queue mutation.
- [Risk] Renaming labels can miss i18n/test fixtures. -> Mitigation: update `zh_CN`, `en_US`, fallback labels, Browser feedback labels, Review menu tests, and BlockMenu tests together.

## Migration Plan

1. Add failing tests for Browser, Review, block-menu, and backend command policy:
   - Browser add-current-route calls shared app command/backend `set-sources`, not local queue add.
   - Review existing Concept add and make-Concept-add use backend command.
   - Backend `set-sources` applies all node ids to the active route and returns updated view/queue state.
   - Backend unavailable/mismatch returns explicit failure with no local fallback.
2. Extend `BackendNeuralRoamCommand` with `set-sources`.
3. Implement worker command policy support and route mismatch handling for `set-sources`.
4. Add/extend application service method for adding Concepts to current route, including normalization, Concept creation handoff, command execution, and result shaping.
5. Route Browser datasource, Review menu, and BlockMenu actions through the shared service.
6. Update labels/messages from queue wording to current-route wording.
7. Update architecture/backlog docs after production code changes.
8. Run targeted tests, boundary checks, hidden fallback check, build, and OpenSpec validation.

Rollback strategy: revert the new entry action routing and `set-sources` command in one change. Do not leave UI paths falling back to local `NeuralRoamQueue.addCard/addCards`; if backend command is unavailable, show explicit unavailable.

## Open Questions

- Exact Chinese success wording: "已加入当前航线起点" vs "已加入神经漫游当前航线". The implementation can use "当前航线" for action labels and "当前航线起点" for result messages unless product wording is revised.
