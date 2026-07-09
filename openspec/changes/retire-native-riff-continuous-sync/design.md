## Context

SiYuanMemo already owns card identity, scheduling truth, review history, and Browser membership. Native Riff continuous integration remains spread across `ApplicationContext`, `XiuyuanSyncService` and helper runtimes, transaction fanout, Browser sync actions, settings, worker `xiuyuan.sync.execute`, SQLite checkpoint/blacklist persistence, and Native Riff write/feedback adapters.

The current implementation has two incompatible meanings for Native Riff:

- domain documentation says Native Riff is optional compatibility rather than scheduling truth;
- runtime code still models Native Riff as a continuously reconciled external owner.

This change follows ADR-005 and makes Native Riff a read-only import source. Existing dirty work for `repair-riff-symbol-render-contract` remains authoritative and must be preserved; adoption consumes that live-Markdown render-contract path instead of recreating symbol parsing.

## Goals / Non-Goals

**Goals:**

- Replace continuous Native Riff synchronization with explicit preview/apply import.
- Adopt existing `riff-managed` cards in place as `local-owned`.
- Preserve existing local card/Xiuyuan identity, scheduling, review history, tags, and priority.
- Rebuild adopted semantics and render contracts from live SiYuan block Markdown.
- Keep imports idempotent through immutable import receipts and semantic face identity.
- Seed a newly imported card once from valid Native Riff current schedule state.
- Respect deletion tombstones and migrate legacy blacklist entries into explicit import exclusions.
- Remove all passive scans, reconciliation, checkpointing, Native Riff writes, and feedback bridges.
- Delete the retired sync Interface/Implementation rather than adding a compatibility fallback.

**Non-Goals:**

- Do not delete or mutate the user's native Riff cards.
- Do not import full native Riff review history.
- Do not make ordinary import a general semantic-repair command for existing `local-owned` cards.
- Do not change SiYuanMemo scheduler, Review answer authority, Browser membership rules, or queue semantics.
- Do not preserve legacy continuous-sync settings as a hidden or deprecated runtime path.

## Decisions

### Decision 1: Use two deep application Modules

Create:

- `NativeRiffImportModule`: owns explicit source read, preview classification, face-level completion, new-card schedule seed, receipt creation, tombstone/exclusion checks, and selected apply.
- `NativeRiffAdoptionModule`: owns preview and in-place conversion of existing `riff-managed` records, including live-source semantic rebuild.

Their Interfaces expose preview/apply outcomes rather than sync phases. Callers do not learn checkpoint, retry, full/incremental, blacklist-cleanup, or transaction-listener concepts.

Alternative: shrink `XiuyuanSyncService` into import mode. Rejected because its Interface and vocabulary preserve the retired continuous-sync model.

### Decision 2: Native Riff source access is read-only

Replace write-capable compatibility ports with one `NativeRiffImportSourcePort` that can enumerate/read native Riff facts needed by explicit import. Its SiYuan Adapter contains no add, remove, or rating method.

No plugin lifecycle path receives this port. Only explicit import preview/apply may invoke it.

Alternative: retain write methods but stop calling them. Rejected because dormant write capability keeps the wrong Interface and invites regression.

### Decision 3: Existing local ownership always wins

Import identity resolution uses:

1. immutable Native Riff import receipt identity when present;
2. semantic logical identity based on source block plus face/rule identity;
3. legacy deterministic IDs only for migration matching.

An existing `local-owned` face is never overwritten by import. Missing faces may be created. Ambiguous face changes are reported as conflicts.

Alternative: deduplicate by block only. Rejected because multi-face and multi-cloze cards require face-level identity.

### Decision 4: Adoption is explicit, in place, and transactionally safe

Startup may calculate or display an adoption candidate count but performs no adoption writes. User-triggered adoption preview classifies:

- adoptable;
- already local;
- tombstoned;
- legacy excluded;
- source missing;
- semantic conflict.

Apply updates existing records in place. It preserves local IDs and learning state, changes ownership to `local-owned`, removes live sync metadata, retains an immutable import receipt, and rebuilds semantic/render metadata from current block Markdown. Invalid or unavailable source grammar fails closed and leaves the card unchanged.

Alternative: delete and recreate adopted cards. Rejected because it breaks queue identity and learning history.

### Decision 5: Import receipts are provenance, not ownership

Store immutable provenance under explicit import-receipt metadata containing native card identity, deck identity, and initial import time. Ownership inference must ignore receipt presence and raw `riffCardId` alone.

Alternative: erase Native Riff identity after adoption. Rejected because repeat import needs deterministic duplicate detection and diagnostics.

### Decision 6: Schedule seed is one-time and local-first

A newly created imported card may initialize its current scheduling fields from a valid Native Riff schedule snapshot. Existing SiYuanMemo cards never consume that snapshot. Full native review history is not imported.

After creation, only SiYuanMemo Review commits may mutate scheduling state.

### Decision 7: Legacy blacklist becomes a distinct exclusion kind

Use the existing durable `tombstones(kind, id, payload_json)` ledger with a distinct `kind='native-riff-import-exclusion'`. This reuses durable storage without claiming card/xiuyuan deletion semantics.

A one-time migration writes exclusion rows for legacy `riffBlacklist` block IDs, then clears the legacy blacklist field only after durable success. Explicit restore-and-import removes the matching exclusion.

Alternative: convert blacklist directly into card tombstones. Rejected because blacklist records do not reliably prove deletion intent.

### Decision 8: Import and repair stay separate

Ordinary explicit import may report `existing-needs-repair` but does not repair existing `local-owned` cards. The existing semantic repair Module owns that mutation.

Adoption is the only exception because its migration contract explicitly includes live-source semantic rebuild.

### Decision 9: Retire continuous-sync runtime in dependency order

Implementation order:

1. Add import/adoption domain contracts and focused tests.
2. Add durable receipt/exclusion migration support.
3. Add explicit Browser/manager preview/apply entrypoints.
4. Switch old `riff-managed` repair entry to adoption.
5. Remove passive startup/browser/transaction synchronization.
6. Remove Native Riff add/delete/rating writes.
7. Remove `XiuyuanSyncService`, blacklist helpers, worker planner/runtime, `xiuyuan.sync.execute`, checkpoint persistence, sync settings, and obsolete tests.
8. Run boundary, hidden-fallback, OpenSpec, build, and focused behavior validation.

No old sync fallback remains after cutover.

## Risks / Trade-offs

- [Risk] Existing users expect newly created native Riff cards to appear automatically → Mitigation: provide explicit import preview with clear counts and repeatable idempotent apply.
- [Risk] Adoption damages scheduling or identity → Mitigation: characterize preservation through public Module tests and apply in one storage transaction per batch.
- [Risk] Live source grammar is missing or invalid → Mitigation: fail closed, leave record unchanged, and expose repair classification.
- [Risk] Legacy blacklist migration changes suppression behavior → Mitigation: preserve suppression as a distinct restorable exclusion before deleting old storage.
- [Risk] Removing worker RPC breaks stale callers → Mitigation: remove all catalog/client/handler callers in the same change and validate boundaries; do not keep a compatibility RPC.
- [Risk] Current symbol-render work overlaps `XiuyuanSyncService` → Mitigation: preserve the active dirty diff and move reusable render repair behind the adoption Module before deleting sync code.

## Migration Plan

1. Ship explicit adoption/import preview while old data remains readable.
2. Migrate legacy blacklist to `native-riff-import-exclusion`.
3. Let the user explicitly adopt existing `riff-managed` cards; operation is idempotent and resumable.
4. Remove continuous-sync settings and runtime wiring in the same release.
5. Existing native Riff data remains untouched.

Rollback restores the previous plugin runtime but does not convert adopted cards back to `riff-managed`. Adopted `local-owned` cards remain valid SiYuanMemo cards; import receipt metadata is ignored by older code unless it explicitly reads it.

## Open Questions

No architecture-blocking questions remain. UI placement and wording may follow existing Browser action patterns during implementation.

