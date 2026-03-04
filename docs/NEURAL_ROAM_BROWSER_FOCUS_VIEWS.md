# Neural Roam Browser Views (Focus Model)

## What Changed

Neural Roam now works inside the existing browser screen with three subviews:
- `Concept Cards`
- `Focus Blocks`
- `Roam History`

No standalone page was added.

## View Behavior

### 1. Concept Cards
- Uses AG Grid.
- Shows only concept cards in neural roam queue (`concept-only`).
- Supports pin/unpin to maintain the persistent focus pool.

### 2. Focus Blocks
- Lightweight list UI (not AG Grid).
- Two sections:
- `Session Focus Stack`: includes virtual nodes, newest first.
- `Pinned Focus Pool`: persistent concept-only focus pool.
- Virtual focus blocks are not persisted.

### 3. Roam History
- Lightweight list UI (not AG Grid).
- Scope switch: `Current Session` / `All History`.
- `All History` groups entries by collapsible `sessionId`.
- Rows show compressed node preview, association type, and time.
- Click: preview only.
- Double-click / Enter: jump into review flow (follow-path navigation with bookmark return semantics).

## Naming and API

Active-path naming moved from `seed` to `focus`:
- `startRoamingFromFocus(...)`
- `getConceptBlocks()`
- `lock-focus`
- `neural-focuses`
- Block attribute key: `custom-fsrs-neural-focus`

Queue literal remains unchanged:
- `neural-roam`

## Persistence

- Neural roam persistence schema is v3 only.
- Legacy/v2 state is silently reset.
- History keeps session boundaries using `sessionId`.
