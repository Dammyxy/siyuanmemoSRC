## Context

The measured `sqlite-delta-log.v2.sealed-5148.msgpack` Review feedback segment is 575,046 bytes. Its 574,881-byte entry contains a 275,371-byte undo-journal row whose 274,839-byte `payload_json` stores complete before and after session frontiers. Those frontiers contain 223 serialized card objects (112 before and 111 after) totaling 266,606 bytes. SQLite delta then represents the undo row in both `changes` and `mutationEnvelope.operations`, so this redundant session evidence dominates the durable append.

Undo already stores complete `beforeCard` and `afterCard` evidence for the reviewed card. The remaining frontier is an ordered SessionQueueIndex identity list plus current/avoid/projection metadata; its card schedules are authoritative in SQLite, not in Browser projection or the journal copy. The design must preserve restart-safe undo and legacy v1 journal rows while reducing normal Review feedback below the 64 KiB open-segment threshold.

## Goals / Non-Goals

**Goals:**

- Write a schema-v2 undo journal with compact ordered identity frontiers.
- Restore exact current card, lookahead order, avoid-once state, counters, and projection metadata from SQLite-authoritative cards.
- Preserve complete reviewed-card before/after schedule evidence and existing audit/reversal semantics.
- Fail closed before session restoration when compact frontier evidence cannot be hydrated completely.
- Keep persisted schema-v1 journal entries undoable through a one-way normalizer.
- Keep a representative 113-card Review feedback delta entry below 64 KiB.

**Non-Goals:**

- Changing rating, scheduling, reversal, or Review Ledger semantics.
- Making Browser projection an undo source.
- Compressing or externalizing undo payloads.
- Changing the public worker RPC contract or removing durable undo.
- General SQLite delta format changes.

## Decisions

### Persist identity frontiers as schema v2

Each v2 frontier contains `cardIds`, `currentCardId`, `currentBlockId`, `avoidOnceCardId`, `avoidOnceBlockId`, `projectionGeneration`, and `projectionPolicyHash`. `cardIds` preserves the exact order of the session's remaining queue and excludes `currentCardId`, matching the in-memory session model. `currentBlockId` preserves invalidation evidence and lets hydration reject a card whose identity no longer matches the recorded frontier.

`beforeCard` and `afterCard` remain complete card objects because they are transaction evidence for the reviewed schedule mutation, not queue snapshots.

Alternative 1 was to keep full frontiers and gzip the JSON. The observed payload compresses to about 37,712 bytes, but this adds synchronous browser compression and retains duplicated, non-authoritative schedule evidence. Alternative 2 was to move frontiers to an external blob. That complicates atomic durability and adds host effects to undo. Alternative 3 was to remove or asynchronously persist undo evidence. That violates the established durable undo contract. Compact identities are the smallest representation that preserves ordered restoration without a second durability system.

### Normalize v1 at the journal boundary

The undo journal module owns persisted schema decoding. New writes are v2. Reads accept v1 full-card frontiers, extract ordered IDs/current identity metadata, and return the same normalized v2 shape used by current code. Invalid versions or malformed required fields fail explicitly. Compatibility does not flow into the scoring writer or session state model.

### Restore schedule before authoritative hydration

When the journal consumer has not already restored `beforeCard`, the session runtime restores that schedule first. It then resolves every `cardId` and `currentCardId` through the worker's SQLite card repository, preserving order. Missing cards, duplicate/invalid identities, or a `currentBlockId` mismatch fail closed before replacing the in-memory session. Browser projection is never consulted.

SQLite-backed journal consumption continues to restore the reviewed schedule and reversal evidence transactionally before returning the normalized entry. In-memory journal tests use the same runtime restore-before-hydrate order.

### Enforce the budget at the durability boundary

Tests use a representative 113-card fixture with realistic card payloads. They assert both that journal JSON contains identity arrays rather than frontier card objects and that the resulting serialized SQLite delta entry is below 65,536 bytes. This tests the duplicated delta representation rather than only the smaller source JSON.

## Risks / Trade-offs

- [A queued card is deleted between rating and undo] -> Hydration fails closed; no partial session frontier is installed.
- [A reviewed card's current SQLite state is the post-rating schedule] -> Restore complete `beforeCard` transactionally before hydrating the current frontier.
- [Legacy rows contain malformed cards] -> The normalizer validates all required identities and rejects the row explicitly.
- [One repository read per frontier ID adds undo latency] -> Undo is user-triggered and infrequent; correctness is preferred, while reads can run concurrently without affecting rating latency.
- [A real card fixture grows beyond the budget] -> The budget test exposes the regression; `beforeCard`/`afterCard` remain exempt from lossy compaction.

## Migration Plan

1. Add schema-v2 types, compact frontier builders, and a v1-to-v2 normalizer.
2. Switch new answer/skip journal writes to v2.
3. Normalize persisted entries during consume and adapt projection invalidation to identity metadata.
4. Hydrate normalized frontiers from SQLite during session restoration and fail closed on incomplete evidence.
5. Ship without rewriting existing rows; legacy v1 rows migrate only when read and are updated as v2 when consumed.

Rollback is code-only for new, still-open v2 entries only if the previous build is taught to ignore unknown schema versions. No destructive storage migration is introduced.

## Open Questions

None. The live segment evidence, current repository interface, and established undo contract determine the representation and authority boundary.
