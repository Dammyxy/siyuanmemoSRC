## Context

Current delete behavior crosses several Modules:

- Browser, Review, and Card CRUD entrypoints eventually call `DeleteCardUseCase` or `DeleteCardsUseCase`.
- Those use cases remove local Xiuyuan/cards, clear block attrs, mark `IDeletionTracker`, and publish `CardDeletedEvent` or `CardsDeletedEvent`.
- `RiffSyncEventHandler` listens to those events and calls `XiuyuanSyncService.deleteSync` or `deleteSyncBatch`.
- `XiuyuanSyncService.deleteSyncSingle` calls `siyuanApi.removeRiffCards`.
- Native Riff transaction handling routes native removes through `handleNativeRiffRemove`, which plans local deletes for managed Riff Xiuyuans.
- Worker sync already has persistent `tombstones` for card and xiuyuan deletes, but `IDeletionTracker` is only a short-lived recently-deleted guard.

That means one user-visible word, "delete", can mean at least two different operations: local removal from SiYuanMemo, or hard-delete from native Riff. Those intents need separate interfaces before implementation work proceeds.

## Goals / Non-Goals

**Goals:**

- Define local delete as the default intent for native Riff-backed cards: local tombstone/hide without `removeRiffCards`.
- Define native hard-delete as a separate dangerous intent requiring explicit confirmation or proof that SiYuanMemo owns the card.
- Reuse persistent tombstones as the local-delete memory so later sync does not re-import locally hidden cards.
- Make Browser, Review, Card CRUD, native Riff remove handling, and worker sync converge on the same delete-intent contract.
- Keep future MCP/Agent callers behind the same intent contract.

**Non-Goals:**

- No default deletion of native Riff cards.
- No plugin AI runtime revival.
- No scheduler algorithm, queue scoring, Browser row helper, or review grading change.
- No automatic data migration that hard-deletes existing native Riff cards.

## Decisions

### Decision: Introduce explicit delete intents

Delete entrypoints must choose between:

- `local-tombstone`: remove or hide the card from SiYuanMemo and persist a tombstone.
- `native-hard-delete`: call native Riff deletion only after explicit dangerous confirmation or ownership proof.

Rationale: a single boolean such as `deleteSync.enabled` is not enough to represent ownership, user intent, and sync side effects. Delete intent is the interface callers must know.

Alternatives considered:

- Keep current event-driven hard-delete path. Rejected because local delete can erase native Riff state.
- Disable all delete sync globally. Rejected because SiYuanMemo-owned cards still need an intentional hard-delete path.

### Decision: Persistent tombstone is the default local-delete memory

Default local delete must write a persistent card/xiuyuan tombstone keyed by the local identifiers and enough block/Riff metadata to suppress re-import during full and incremental native Riff sync.

Rationale: `IDeletionTracker` only covers short windows after deletion. Persistent tombstones already exist in the worker runtime and ledger, so the deeper Module is the persistent delete memory, not a new transient guard.

Alternatives considered:

- Extend `IDeletionTracker` duration. Rejected because time-based memory does not survive restart or multi-device sync.
- Use only Riff blacklist fallback. Rejected because blacklist is an error fallback for failed hard-delete, not local product intent.

### Decision: Native hard-delete requires ownership proof or explicit danger

The runtime may call `removeRiffCards` only when one of these is true:

- The card/xiuyuan is proven SiYuanMemo-owned.
- The caller provides an explicit native-hard-delete intent and the UI/MCP contract marks it dangerous.

Rationale: user-owned/native Riff cards belong to SiYuan. SiYuanMemo can hide them locally by default, but must not destroy external state silently.

Alternatives considered:

- Treat `riff-managed` as enough for all hard-deletes. Rejected until ownership and source semantics are audited; `riff-managed` can mean imported from native Riff, not owned by SiYuanMemo.

### Decision: Native Riff remove remains inbound reconciliation

When SiYuan native Riff removes a card, SiYuanMemo must reconcile local managed state and write local tombstones so the removed card does not reappear from stale local state.

Rationale: inbound native Riff remove is source-of-truth reconciliation. It is different from a local user choosing "remove from SiYuanMemo".

Alternatives considered:

- Ignore native Riff remove operations. Rejected because local state would show cards no longer present in native Riff.

## Risks / Trade-offs

- [Risk] Existing UI delete affordances currently imply hard-delete through events -> Mitigation: route entrypoints through delete intent and make local tombstone the default.
- [Risk] Tombstone key mismatch allows re-import -> Mitigation: include tests for block id, card id, xiuyuan id, and native Riff id matching.
- [Risk] Proven-owned semantics are fuzzy -> Mitigation: hard-delete remains explicit-danger unless ownership proof is reliable and tested.
- [Risk] Event handler still observes legacy `CardDeletedEvent` without intent -> Mitigation: update events or handler routing so missing intent resolves to local tombstone, not `removeRiffCards`.
- [Risk] Multi-device conflicts if one device hides locally while another syncs native Riff -> Mitigation: persistent tombstones must participate in full and incremental sync planning.

## Migration Plan

1. Add characterization tests around current delete entrypoints and native Riff transaction handling.
2. Introduce delete-intent types and route existing default deletes to `local-tombstone`.
3. Persist tombstones for local default deletes and make sync planning honor them before create/update.
4. Add explicit native-hard-delete entrypoint and keep it unavailable without ownership proof or dangerous confirmation.
5. Remove legacy default `removeRiffCards` calls from local delete events.

Rollback: keep old storage untouched; if the change is reverted, tombstones remain conservative local delete memory and do not trigger native hard-deletes.

## Open Questions

- What exact metadata proves "SiYuanMemo-owned" rather than "imported from native Riff"?
- Should local tombstones be visible as a recoverable trash/hidden list, or only as sync memory?
- Should MCP expose native-hard-delete at all, or leave it UI-only until ownership proof is stronger?
