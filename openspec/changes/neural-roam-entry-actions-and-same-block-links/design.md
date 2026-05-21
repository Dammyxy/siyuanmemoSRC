## Context

NeuralRoam currently supports explicit focus starts through `openNeuralRoamDialog({ focusBlockId, includeFocusAsFirst, startNewSession })` and backend advance start intent. Some entry actions still open NeuralRoam without binding the selected block or newly created concept to the active path, so the next card can come from stale queue state. Review users also need one compact entry point that can expose temporary block roam, concept roam, station creation, and concept-card creation without crowding the review surface.

The product model is block-first for roam. SiYuan refs, backlinks, tree relations, concept cards, and stations are block identities. SRS cards are display and feedback identities that may share one block ID. This change must preserve that split: path seeds and graph traversal use block IDs; feedback writes to the shown card ID when a real card is displayed.

## Goals / Non-Goals

**Goals:**
- Add one route-style NeuralRoam review button with tooltip `神经漫游` and a two-level menu for temporary roam, establish-and-roam, and establish-only actions.
- Reuse shared application actions for review menus and block menus, including the existing concept creation labels and behavior.
- Make every immediate roam entry open NeuralRoam with an explicit block seed and force orbit mode.
- Keep temporary roam engine-mode restoration tab-local and best-effort.
- Add same-block multi-card relationships as a first-class NeuralRoam association with history, trace, and UI labeling.

**Non-Goals:**
- Do not build true per-tab NeuralRoam path isolation. NeuralRoam queue path state remains shared by the queue instance.
- Do not make concept sources and stations the same pool. Concept-card queue/source entries remain concept identities; stations remain anchor/block identities.
- Do not add unlimited same-block expansion. One sibling card per expansion is enough for the first implementation.
- Do not rework hyperspace propagation semantics beyond forcing explicit immediate-entry paths through orbit.

## Decisions

### Shared application action service

Create `NeuralRoamEntryActionService` in `src/application/services`. It owns orchestration for:
- temporary roam from current block
- temporary roam from concept block
- establish station
- establish station and start roam
- make concept card
- make concept card and add to NeuralRoam queue
- make concept card and start roam
- add existing concept card to NeuralRoam queue

The service returns structured results and does not show toasts. Review UI and block menus map results to their own messages. This avoids coupling `ReviewView` to `BlockMenuHandler` and prevents duplicate divergent implementations.

Alternatives considered: call `BlockMenuHandler` from review UI, or duplicate logic in `ReviewView`. Both keep the current private-menu coupling and risk reintroducing no-focus dialog opens.

### Explicit entry seed and orbit mode

Every immediate roam entry MUST call NeuralRoam with an explicit focus block:
- temporary current-block roam: `focusBlockId = currentBlockId`, with `sourceReviewCardId` when launched from review
- temporary concept roam: `focusBlockId = selectedConceptBlockId`
- station-and-roam: save station, then `focusBlockId = currentBlockId`
- concept-card-and-roam: create/confirm concept, add to queue, then `focusBlockId = conceptBlockId`

All of these entries force `orbit` before starting. Temporary entries record previous mode in tab runtime metadata and restore it on close unless the user manually changed mode in that tab. Establish-and-roam entries do not restore because they are persistent entry actions.

### Tab-local temporary metadata

Temporary session metadata belongs to review dialog/tab runtime data, not `NeuralRoamQueue`. It records `previousEngineMode`, `restoreOnClose`, and `engineModeTouched`. Engine-mode UI handlers mark `engineModeTouched` for the active tab. Closing or converting that runtime restores the previous mode only if the flag is false.

The actual path/focus/history state remains queue-global. If two NeuralRoam tabs manipulate the same queue, they can still affect each other's path. This is an explicit non-goal for this change.

### Block identity and card identity

The review menu is available only when a current block ID exists. The wording uses `当前块` because roam starts from block relationships, not from card IDs. When launched from review, the first card can still be the current review card so feedback writes to that card ID. The path seed remains the block ID.

### Same-block multi-card association

NeuralRoam shall query the local SQL card universe through the existing manager/card read path for cards sharing the active block ID. It adds at most one same-block sibling per expansion, excluding the currently displayed source card ID and recently seen card IDs. Same-block candidates rank above normal graph neighbors but never replace an explicit entry first screen.

History entries gain optional card identity so repeated `nodeId = blockId` entries can still distinguish sibling cards. Association type `same-block-card` maps to Chinese label `同块卡片` and badge `同块`.

## Risks / Trade-offs

- Shared queue state across tabs can still cause path interference. Mitigation: document non-goal and keep temporary restore metadata tab-local only.
- Adding same-block relationships can over-focus a block with many cards. Mitigation: cap to one sibling per expansion and keep history/seen filtering.
- Creating one orchestration service touches existing block menu code. Mitigation: migrate behavior behind tests that prove old labels still call the shared actions.
- Forcing orbit may surprise users who prefer hyperspace. Mitigation: immediate entry semantics are local path starts; users can switch mode manually, and temporary entries preserve manual changes.

## Migration Plan

1. Add the shared service and wire it into `ApplicationContext`.
2. Move block-menu concept creation/start logic behind the service while preserving old labels and toasts.
3. Add review NeuralRoam menu generation and action calls.
4. Extend dialog/tab runtime metadata for temporary sessions and manual mode touch tracking.
5. Add same-block candidate selection, history card identity, labels, and badge.
6. Validate with targeted tests, boundary checks, and build.
