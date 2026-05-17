# Semantic Exploration Manual Smoke

Date: 2026-05-17

Run this after `pnpm build` and plugin reload, with two SiYuan windows using the same workspace when follower behavior is in scope.

## Setup

1. Open window A and confirm it owns the writer lease.
2. Open window B and confirm it is a follower.
3. Pick a Concept review card that has at least one linked candidate and one normal review-card neighbor.
4. Record current Orbit seed/anchor pools and Hyperspace source/anchor pools from Neural Roam diagnostics or state export.

## Smoke Steps

1. Start Semantic Activation from the Review Concept entry.
   - Expected: Review side-area shows AI and Semantic tabs.
   - Expected: Semantic tab starts on `assimilation`; root focus and current node are the Concept.
   - Expected: no Orbit/Hyperspace pool entry is added.

2. Restore and bind sidebar state.
   - Expected: recent active Semantic session opens automatically for the current review node.
   - Expected: ended session shows `查看回顾` / `从这里继续`.
   - Expected: new root shows `开始探索` and does not auto-create a session.

3. Navigate candidates and path.
   - Follow a candidate in each lens column when available.
   - Expected: selected non-active lens records lens switch before traversal.
   - Click a path node once.
   - Expected: cursor moves through writer-owned command.
   - Double-click a path/candidate node once.
   - Expected: temporary view opens once; duplicate follow/view does not occur.

4. Temporary ordinary-node view.
   - Open an ordinary block/card Semantic node in temporary view.
   - Expected: Review main content shows `查看中: {title}` and `返回当前复习`.
   - Expected: original Review queue item does not advance and Semantic session state does not change just because content is viewed.

5. Temporary flashcard one-card review.
   - Open a real review-card Semantic node in temporary view.
   - Expected: answer is hidden by default.
   - Reveal the answer.
   - Expected: reveal does not score.
   - Score the temporary card.
   - Expected: formal scheduling path commits the score, then UI returns to original Review item.
   - Expected: the scored temporary card is suppressed if it would later appear in the current original Review session.

6. Branch and feedback actions.
   - Use `撤回上一步`, `归档分支`, and `新开路径` when available.
   - Mark one candidate `稍后` and one candidate `不相关`.
   - Expected: all mutations go through `semantic.command.execute`; follower window routes to writer relay.
   - Expected: irrelevant feedback affects only session/root-scoped candidate reads, not global memory.

7. AI path analysis.
   - Run `分析路径`.
   - Expected: AI input contains active path, edge explanations, current node, and later summary.
   - Expected: UI creates a `建议补充` entry through writer-owned `create-suggestion` before sending bounded context to Review AI.
   - Ignore one suggestion, bind one to an existing node, and materialize one to a real block/card when available.
   - Expected: ignore/bind/materialize persist through writer-owned Semantic commands.
   - Expected: bound/materialized suggestions can become real candidates but do not auto-follow into the path.

8. Browser continue-exploration handoff.
   - From Browser Semantic review surface, choose `继续探索`.
   - Expected: existing neural Review tab focuses if available; otherwise Review opens with the selected Semantic session pinned.
   - Expected: handoff does not open ordinary subset review or mutate Orbit/Hyperspace state.

9. Writer unavailable.
   - In window B, temporarily make writer unavailable, then try a Semantic mutation.
   - Expected: UI reports explicit writer unavailable; no follower-local session, branch, later, feedback, or suggestion mutation is written.

10. Compare Orbit/Hyperspace pools with the baseline from setup.
    - Expected: pools are unchanged except for pre-existing unrelated user actions.

## Pass Criteria

- Semantic session/event/branch/later/feedback/suggestion state changes only through backend writer ownership.
- Browser is review/read-only for Semantic sessions; Review sidebar owns active exploration.
- Temporary one-card scoring uses formal scheduling and returns to the original Review item.
- AI suggestions cannot create path nodes until bound or materialized to a real object.
- Orbit/Hyperspace pools are not mutated by Semantic Exploration.
