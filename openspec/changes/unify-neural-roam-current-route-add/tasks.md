## 1. Regression Tests First

- [x] 1.1 Update/add Browser datasource tests proving `add-to-neural-roam-queue` submits Concept block ids to the shared current-route add path and does not call local `queue.addCard`/`queue.addCards`.
- [x] 1.2 Update/add `NeuralRoamEntryActionService` tests proving existing Concept add and make-Concept-add call backend command authority instead of local queue add.
- [x] 1.3 Update/add BlockMenu and Review menu tests proving labels/actions use current-route wording and call the shared service.
- [x] 1.4 Add worker command policy tests for backend `set-sources` add/remove, duplicate normalization, and route mismatch failure.
- [x] 1.5 Add unavailable/failure tests proving no runtime local queue fallback occurs when backend command authority is unavailable or returns mismatch/failure.

## 2. Backend Command Contract

- [x] 2.1 Extend `BackendNeuralRoamCommand` with `set-sources` carrying `nodeIds`, optional `enabled`, and optional `routeId`.
- [x] 2.2 Extend route mismatch policy so `set-sources.routeId` is validated like single source/anchor commands.
- [x] 2.3 Implement `set-sources` in `worker/bootstrap/neuralRoamCommandPolicy.ts` by normalizing unique node ids and applying source entry updates through queue domain methods.
- [x] 2.4 Ensure successful `set-sources` command returns updated backend view state and queue state through the existing command result path.

## 3. Shared Application Operation

- [x] 3.1 Add or rename an application service method for adding Concept block ids to the current NeuralRoam route through backend `neuralRoamCommand`.
- [x] 3.2 Preserve existing Concept creation/ensure behavior for make-Concept-and-add actions, then route the resulting Concept block id through the shared method.
- [x] 3.3 Preserve existing start-roam behavior by composing make/ensure Concept, current-route add, and the existing open/start flow without duplicate source entries.
- [x] 3.4 Return typed success, skipped, unavailable, mismatch, and failure results with current-route wording.
- [x] 3.5 Remove runtime use of local `NeuralRoamQueue.addCard`/`addCards` from entry-action add flows.

## 4. UI Entry Unification And Wording

- [x] 4.1 Route Browser Deck and Query datasource NeuralRoam add actions to the shared application operation instead of generic local queue add behavior.
- [x] 4.2 Keep Browser Concept-only filtering/validation and adapt success/error messages to current-route wording.
- [x] 4.3 Route Review neural entry menu actions through the shared service and update visible labels/fallbacks.
- [x] 4.4 Route BlockMenu make-Concept add/start actions through the shared service and update visible labels/toasts.
- [x] 4.5 Update `zh_CN` and `en_US` i18n strings plus Browser feedback labels from queue wording to current-route wording.

## 5. Ownership Cleanup And Docs

- [x] 5.1 Search for remaining runtime `NeuralRoamQueue.addCard`/`addCards` callers and classify each as converted, internal worker/domain behavior, or test-only.
- [x] 5.2 Update `ARCHITECTURE.md` to document current-route add as backend `neural-roam.command` authority, not local queue mutation.
- [x] 5.3 Append a `docs/DDD_RESCAN_BACKLOG.md` task delta after production changes, recording fixed entry-action ownership drift and any deferred local adapter cleanup.

## 6. Validation

- [x] 6.1 Run targeted Browser datasource tests for NeuralRoam add actions.
- [x] 6.2 Run targeted `NeuralRoamEntryActionService`, Review menu, and BlockMenu tests.
- [x] 6.3 Run targeted worker/backend NeuralRoam command tests.
- [x] 6.4 Run `openspec validate unify-neural-roam-current-route-add --strict`.
- [x] 6.5 Run `node scripts/check-hidden-fallbacks.cjs`.
- [x] 6.6 Run `pnpm run check:boundaries`.
- [x] 6.7 Run `pnpm build`.
