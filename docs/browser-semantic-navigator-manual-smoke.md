# Browser Semantic Review Manual Smoke

Date: 2026-05-17

Scope: OpenSpec change `redesign-semantic-exploration-surfaces`, Browser session review and Review handoff.

## Preconditions

- Plugin built and reloaded in SiYuan.
- At least one Concept card exists in Browser.
- That Concept has an active or restorable Semantic session with at least one path edge when possible.
- A neural Review tab can be opened.
- Writer/follower smoke needs two plugin windows when available.

## Smoke Steps

1. Browser Semantic start/restore
   - Select a Concept card in Browser.
   - Start Semantic.
   - Expect Browser enters Semantic workspace and restores the active same-root session when present.
   - Expect no old NeuralRoam engine mode mutation.

2. Review-only Browser surface
   - Inspect the Browser Semantic panel.
   - Expect header, timeline/tree, selected-node detail, edge explanation rows, later, suggestions, and archived branch sections.
   - Expect no candidate lens follow columns, station create/archive controls, Review reveal controls, grade buttons, scheduling controls, or auto-create-card controls.

3. Local node selection
   - Click one timeline/path node.
   - Expect selected-node detail changes locally.
   - Double-click the same or another node.
   - Expect no path traversal, candidate follow, cursor move, or scheduling mutation.

4. Continue exploration handoff
   - Choose `继续探索`.
   - Expect an existing neural Review tab focuses when available.
   - Otherwise expect a Review surface opens with the same `sessionId` pinned in the Semantic sidebar.
   - Expect ordinary one-card subset review is not created for this handoff.

5. Review sidebar pin
   - In the Review surface, confirm the Semantic sidebar is pinned to the Browser session.
   - Expect `currentNodeId` or selected Browser node focus is preserved when available.
   - Unpin the session.
   - Expect sidebar returns to follow-current-node binding.

6. Writer unavailable
   - In follower mode, trigger `继续探索` while writer relay or Review handoff dependency is unavailable.
   - Expect explicit unavailable/error message.
   - Expect Browser selected node and review model stay visible; no follower-local Semantic mutation occurs.

## Pass Criteria

- Browser Semantic is a read/review surface, not an exploration mutation workbench.
- Browser node click/double-click is local selection only.
- `继续探索` routes to Review Semantic sidebar pin/focus, not old NeuralRoam or ordinary subset review.
- Browser read surface consumes `semantic.browser.read`; no UI SQL/block-id hydration is required to render primary labels.
