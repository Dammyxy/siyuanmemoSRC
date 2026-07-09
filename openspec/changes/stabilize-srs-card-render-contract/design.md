## Context

SiYuanMemo already has a deep `SrsCardSemanticsResolver` Module that resolves the semantic kind of a card from deterministic evidence such as creation receipt, template, marker, progressive lineage, block attributes, and quick-symbol metadata. That Module intentionally answers "what kind of SRS card is this?"

The current Review rendering path answers a different question through scattered checks: `buildReviewRenderableRenderPolicy()` reads metadata to choose a special renderer, `reviewPresentationPreparer` chooses a side and prepares a view model, and `QuickCardRenderService` reloads source block content to parse front/back from symbol grammar. A repair can therefore fix `Topic -> Item` while leaving the card without enough render evidence to route through the Custom Review Surface.

## Goals / Non-Goals

**Goals:**
- Introduce one deep Module for the SRS card render contract.
- Keep semantic kind and render contract as separate concepts.
- Make repaired quick-symbol cards route to quick rendering and derive the correct Review side.
- Make missing render evidence diagnosable instead of silently falling back to empty or wrong content.
- Lock the behavior with focused regression tests.

**Non-Goals:**
- Replace all renderers in one pass.
- Change scheduling, queue membership, Review answer authority, or Browser projection authority.
- Add hidden fallback or dual truth for cards that cannot be parsed.
- Guess historical metadata when the source evidence is not deterministic.

## Decisions

1. **Add `SrsCardRenderContractResolver` as a separate Module.**
   - Rationale: semantic kind and render family are different Interfaces. Keeping them separate preserves locality and avoids turning `CardType.Item` into a renderer bucket.
   - Alternative considered: expand `SrsCardSemanticsResolver` to own render routing. Rejected because deleting that Module would spread both semantic and rendering rules across callers.

2. **Start the render contract with quick-symbol coverage.**
   - Rationale: the reported failure is legacy symbol cards repaired to `Item`. Quick-symbol is the smallest vertical slice that proves the seam.
   - Alternative considered: migrate CDF, multi-cloze, image occlusion, and Protyle routing immediately. Rejected to keep this change bounded.

3. **Semantic repair composes semantic repair plus deterministic render repair.**
   - Rationale: the existing repair action is the user-facing maintenance path. It should produce renderable cards when evidence is known, but should not own renderer internals.
   - Alternative considered: fix only Review routing. Rejected because Browser repair would still leave stale card metadata for future Review sessions.

4. **Review side selection uses front before answer and back after answer.**
   - Rationale: Custom Review Surface semantics require the hidden answer state to show the prompt first, then answer content after reveal.
   - Alternative considered: preserve current quick side mapping. Rejected because it reverses the ordinary review presentation contract.

## Risks / Trade-offs

- [Risk] Quick-symbol metadata may exist on malformed source blocks → Mitigation: contract diagnostics report missing grammar/source instead of inventing front/back.
- [Risk] Existing custom render preferences could be overwritten → Mitigation: repair only fills missing deterministic quick-symbol evidence and clears conflicting force-Protyle only when quick-symbol evidence proves the card family.
- [Risk] A new Module duplicates policy logic at first → Mitigation: move only quick-symbol decisions behind the new Interface, then incrementally migrate other render families later.
