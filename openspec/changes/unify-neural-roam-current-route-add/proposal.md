## Why

NeuralRoam now has multiple routes, but several UI entries still expose and execute the old single "add to NeuralRoam queue" behavior. Users can create routes but cannot reliably add Concept cards through one route-aware action, and the current callers duplicate local queue mutation instead of using the backend-owned NeuralRoam command boundary.

This change closes that ownership gap by making "add to NeuralRoam current route" a single application-level command used by Browser, Review, and block-menu entries.

## What Changes

- Rename user-facing "add to NeuralRoam queue" actions to "add to NeuralRoam current route" and update success/error wording to match route semantics.
- Introduce one shared application entry for adding existing Concept blocks, or newly-created Concept cards, to the active NeuralRoam route.
- Add a backend-mediated batch command for adding/removing current-route source entries so bulk Browser selection does not loop through frontend `NeuralRoamQueue` mutations.
- Route Browser datasource actions, Review menu actions, and block-menu Concept actions through the shared application entry.
- Preserve Concept-only validation for Browser selections and Concept creation behavior for "make Concept then add" actions.
- Return explicit unavailable/error results when backend NeuralRoam command authority is unavailable; do not fall back to local queue mutation.
- Add regression tests proving all known entrypoints use the shared backend command path and no longer call local `queue.addCard`/`queue.addCards` for runtime additions.

## Capabilities

### New Capabilities

- `neural-roam-current-route-add`: Route-aware addition of Concept cards to the active NeuralRoam route through one backend-mediated application entry.

### Modified Capabilities

## Impact

- Backend RPC contract: `packages/contracts/src/backend-rpc.ts`
- Backend worker command policy and view-state return path: `worker/bootstrap/neuralRoamCommandPolicy.ts`, related NeuralRoam worker tests
- Application layer: `src/application/services/NeuralRoamEntryActionService.ts`, `src/application/services/UnifiedDataSourceManager.ts`, `src/application/ApplicationContext.ts` if service exposure changes
- Browser entries: `src/ui/browser/datasource/MenuActions.ts`, `DeckDataSource.ts`, `QueryDataSource.ts`, `browserActionFeedback.ts`
- Review/block-menu entries: `src/ui/review/v2/reviewNeuralEntryMenuItems.ts`, `src/application/managers/BlockMenuHandler.ts`
- Tests for Browser datasource actions, Review entry actions, backend command handling, and boundary grep checks
- Docs: `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md` if production implementation changes runtime ownership/debt
