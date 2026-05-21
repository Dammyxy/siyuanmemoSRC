## Why

Review users can enter NeuralRoam from CDF and other review cards, but the current entry path can open the NeuralRoam surface without making the selected block or concept the active path seed. The next card may then come from stale NeuralRoam focus, stations, or hyperspace activation instead of the user's chosen starting point.

The review surface also lacks a compact way to choose between temporary block roam, concept roam, persistent station creation, and existing concept-card creation actions. Same-block multi-card relationships are currently implicit even though NeuralRoam travels through block networks while SRS feedback targets specific cards.

## What Changes

- Add one review-card toolbar entry for NeuralRoam, shown as a route-style icon with tooltip `神经漫游`.
- The entry opens a two-level menu with these groups:
  - `临时漫游`: `从当前块临时漫游`, `从概念临时漫游`
  - `建立并漫游`: `建立为空间站并立即漫游`, `制作为概念卡并立即漫游`
  - `建立`: `建立为空间站`, `制作为概念卡`, `制作为概念卡并加入队列`, `加入神经漫游队列`
- Hide unavailable menu items and empty groups; hide or disable the NeuralRoam entry when no current block ID exists.
- Treat NeuralRoam navigation identity as block-based. Cards are review/display identities; graph traversal, stations, concept nodes, and path seeds use block IDs.
- Add shared application orchestration for NeuralRoam entry actions so block menus and review menus reuse behavior instead of duplicating private `BlockMenuHandler` flows.
- Fix concept-card "start roam" actions so they open NeuralRoam with an explicit `focusBlockId`, `includeFocusAsFirst: true`, and `startNewSession: true`.
- Force `orbit` for temporary roam, station-and-roam, and concept-card-and-roam entries. Temporary entries use tab-local metadata to restore the previous engine mode on close unless the user manually changes engine mode.
- Add same-block multi-card NeuralRoam relationship support. When a block has multiple review cards, NeuralRoam may surface one same-block sibling card per expansion, excluding the current entry card, with `same-block-card` history/trace labeling and `同块` badge text.
- Do not implement true per-tab NeuralRoam path isolation in this change; tab-local metadata only handles temporary engine-mode restoration.

## Capabilities

### New Capabilities
- `neural-roam-entry-actions`: Review and block-menu entry actions for starting temporary NeuralRoam paths, creating stations, making concept cards, and opening NeuralRoam from an explicit block seed.
- `neural-roam-same-block-links`: Same-block multi-card relationships in NeuralRoam candidate selection, history, trace, and UI labeling.

### Modified Capabilities
- None.

## Impact

- Affected UI: `src/ui/review/v2/*`, review toolbar/menu components, i18n strings, and existing block menu action wiring.
- Affected application layer: new shared NeuralRoam entry action service, `DialogManager.openNeuralRoamDialog`, tab/runtime metadata, and review dialog close/switch lifecycle hooks.
- Affected queue/domain layer: `NeuralRoamQueue`, NeuralRoam advance/session state, history entries, activation trace metadata, and same-block card candidate selection.
- Affected contracts/types: NeuralRoam dialog/start-focus request metadata, `NeuralRoamHistoryEntry` optional `cardId`/source card identity, and same-block association type labels.
- Verification requires targeted review-menu, block-menu, DialogManager/TabManager, UnifiedQueueStrategy/NeuralRoamQueue, and same-block history tests plus boundary checks and build.
