## Context

`SrsCardSemanticsResolver` owns semantic identity. `SrsCardRenderContractResolver` now owns quick-symbol routing, but the Review path still keeps render decisions in `reviewRenderableRenderPolicy`, `reviewPresentationPreparer`, and `ReviewContent.vue`. The quick renderer also returns `null` for several failure modes, and Review currently treats "not a quick card" as a reason to suppress quick routing and render the source block with Protyle.

That leaves three weak spots:
- renderer kind is still partly inferred outside the contract;
- quick front/back side is not represented as a contract value;
- quick-symbol failures can be hidden by a Protyle fallback.

## Goals / Non-Goals

**Goals:**
- Make `resolveSrsCardRenderContract()` the small Interface Review consumes for renderer kind, render family, side contract, required receipts, repair patch, and diagnostics.
- Keep semantic kind separate from render family.
- Cover quick, Protyle, descriptor, concept, concept-definition, image occlusion, and multi-cloze renderer routing.
- Keep quick-symbol repair deterministic and avoid guessing missing historical metadata.
- Fail closed when quick-symbol source block, grammar, card identity, or route metadata makes rendering unavailable.

**Non-Goals:**
- Change scheduler, queue membership, feedback, or card admission authority.
- Rewrite all renderer implementations.
- Add compatibility fallback to hide malformed cards.
- Infer unproven symbol fields from unrelated metadata.

## Decisions

1. **Deepen `SrsCardRenderContractResolver` instead of adding another Review helper.**
   - Rationale: Review needs one Module that answers "how should this card render?" while semantics answers "what kind of card is this?"
   - Alternative considered: keep adding checks to `ReviewContent.vue`. Rejected because it keeps Browser, Review, and repair rules drifting.

2. **Model front/back side as a contract, not a Review local rule.**
   - Rationale: quick-symbol cards require `front` before reveal and `back` after reveal. Putting that rule in the contract keeps the Custom Review Surface and preparer aligned.
   - Alternative considered: keep `resolveQuickSide()` local. Rejected because it hides a load-bearing renderer invariant outside the render contract.

3. **Represent required receipts explicitly.**
   - Rationale: missing source block, quick-symbol evidence, symbol type, or card identity should be diagnosable by users and tests.
   - Alternative considered: diagnostics-only strings. Rejected because receipts are easier to validate and keep stable across callers.

4. **Quick renderer fails closed.**
   - Rationale: a card selected for quick rendering must not silently fall back to Protyle, because that makes type/render drift appear as a broken Review renderer.
   - Alternative considered: suppress invalid forced quick routing and render Protyle. Rejected because the contract must expose the data defect.

## Risks / Trade-offs

- [Risk] More render families in one resolver increases resolver size. Mitigation: keep the Interface small and keep renderer implementation details in existing renderers.
- [Risk] Existing cards with stale quick metadata may show explicit diagnostics instead of fallback content. Mitigation: semantic repair restores deterministic render evidence and diagnostics name the missing receipt.
- [Risk] Quick renderer diagnostics may surface old data defects. Mitigation: fail closed only after the contract selects quick rendering.

## Migration Plan

- Add contract fields as additive TypeScript properties.
- Keep existing renderers and view models intact.
- Update Review policy and preparation to consume contract fields.
- Update quick renderer to throw typed diagnostic errors when selected data cannot render.
- Validate with targeted tests, boundary checks, build, and OpenSpec strict validation.

## Open Questions

- None for this slice.
