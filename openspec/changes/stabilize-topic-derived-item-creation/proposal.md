## Why

Topic reading material and Topic-derived Item creation currently share the right product intent but have brittle runtime edges: Topic cards are hard to use as sources, selection/right-click Item creation can fail behind forbidden attr writes, and source highlighting is coupled too tightly to child Item creation. This change stabilizes the SuperMemo-like flow in SiYuan's split world of normal blocks and flashcard blocks: keep the source Topic card, derive child document-block Item cards through one command-owned path.

## What Changes

- Allow reading/source/Topic material to derive child document-block Item cards while preserving the original Topic card.
- Default-reject derivation from existing Item, Descriptor, Concept, cloze, or otherwise non-Topic card roles, even when nested under a Topic container.
- Route selection-derived Items, excerpt-derived Items, right-click "create item", and current-block highlighted backfill through one Topic-derived Item creation chain.
- Treat native source marks as source evidence, not the authority for Item creation.
- Make mark failure non-blocking: create the Item when the source is eligible, then report "Item created, source mark failed" if marking fails.
- Roll back a source mark when Item creation fails after the mark was applied.
- Move creation rule and answer fingerprint persistence into card metadata / progressive lineage instead of high-churn block attrs.
- Simplify the backend owner path so Topic-derived creation does not fail because it re-enters unavailable command facades.
- Add focused regression coverage for eligibility, rollback, attr policy, and shared creation entrypoints.

## Capabilities

### New Capabilities
- `topic-derived-item-creation`: Topic/reading/source material can derive child document-block Item cards through one role-aware, command-owned creation chain.

### Modified Capabilities

None.

## Impact

- Affected code: `src/application/services/TopicDerivedItemService.ts`, `src/application/services/SelectionTopicContinuationService.ts`, `src/application/services/ProgressiveReadingService.ts`, `src/application/services/ProgressiveSourceContextResolver.ts`, `src/application/handlers/ProgressiveExcerptHotkeyHandler.ts`, `src/application/handlers/AutoCardHandler.ts`, focused tests, `ARCHITECTURE.md`, and `docs/DDD_RESCAN_BACKLOG.md`.
- Runtime behavior: Topic/source cards remain reviewable source material; derived Items become child document-block cards without duplicating or replacing the source card.
- Boundaries: Progressive / Excerpt + Topic-derived Item owns derivation; Card CRUD owns card metadata; block attrs remain for stable Siyuan-facing state only.
