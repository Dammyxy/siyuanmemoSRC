# Semantic Activation Manual Smoke

Date: 2026-05-16

Run this after `pnpm build` and plugin reload, with two SiYuan windows using the same workspace.

## Setup

1. Open window A and confirm it owns the writer lease.
2. Open window B and confirm it is a follower.
3. Pick a Concept review card that has at least one linked candidate and one normal review-card neighbor.
4. Record the current Orbit seed/anchor pools and Hyperspace source/anchor pools from Neural Roam diagnostics or state export.

## Smoke Steps

1. Start Semantic Activation from the Concept entry.
   - Expected: session starts on `assimilation`; root focus and current node are the Concept.
   - Expected: no Orbit/Hyperspace pool entry is added.
2. Open the Review Neural engine picker.
   - Expected: Orbit, Hyperspace, and Semantic Activation are visible.
   - Expected: selecting Semantic Activation starts the Semantic surface; selecting Orbit/Hyperspace uses the old engine path.
3. Follow an implicit knowledge candidate in each lens column.
   - Expected: candidate selection records lens switch before traversal when the selected column differs from the active lens.
   - Expected: implicit node shows read-only surface actions only; no reveal, grade, schedule, or auto-create card action appears.
4. Follow a real review-card node.
   - Expected: normal Review presentation/commit path remains available for the real card.
   - Expected: Semantic evidence records traversal without bypassing Review feedback commit.
5. Create a node station on the current node.
   - Expected: Semantic station is persisted through `semantic.command.execute`; Orbit/Hyperspace anchors remain unchanged.
6. Create a path station.
   - Expected: station stores root-to-current narrative path and lens history.
7. Run manual AI current-path analysis.
   - Expected: prompt input contains root focus, active lens, narrative path, visible candidates, and selected existing memory nodes only.
   - Expected: relation candidates with endpoints outside that allowlist are rejected before persistence.
8. Accept one AI relation, reject one, and ignore one.
   - Expected: accepted/rejected decisions persist through writer-owned Semantic commands.
   - Expected: ignored relation produces no memory/projection change.
9. In window B, repeat an implicit-node action and station creation.
   - Expected: follower routes through writer relay; no follower-local mutation occurs.
10. Temporarily make writer unavailable, then try a Semantic mutation from window B.
   - Expected: UI reports explicit writer unavailable; no local session/station/relation mutation is written.
11. Compare Orbit/Hyperspace pools with the baseline from setup.
    - Expected: pools are unchanged except for pre-existing unrelated user actions.

## Pass Criteria

- Semantic session/event/station/relation state changes only through backend writer ownership.
- Implicit nodes stay read-only for review scheduling.
- AI relation endpoints are bounded to current path/candidates/memory selection.
- Orbit/Hyperspace pools are not mutated by Semantic Activation.
