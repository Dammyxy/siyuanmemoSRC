## Why

SiYuanMemo currently has multiple delete paths that can cross from local card removal into native Riff removal. For user-owned/native Riff cards, default hard-delete is too destructive: a local "remove from SiYuanMemo" action can erase native Riff state or create multi-device conflicts.

## What Changes

- Define native Riff delete semantics as local tombstone/hide by default.
- Keep hard-delete of native Riff cards behind an explicit dangerous action or an ownership proof that SiYuanMemo owns the card.
- Align Browser delete, Review delete, card delete use cases, Xiuyuan sync remove handling, and worker tombstones around that delete intent.
- Require persistent tombstones to prevent default local deletes from being re-imported during later native Riff sync.
- Do not reintroduce plugin AI behavior; SiYuan core Agent may later call MCP/adapters, but delete ownership remains in SiYuanMemo runtime.

## Capabilities

### New Capabilities

- `native-riff-delete-semantics`: Product and runtime contract for local tombstone/hide, native Riff remove reconciliation, and explicit or ownership-gated hard-delete.

### Modified Capabilities

- None.

## Impact

- Affected code: card delete use cases, Browser/Review delete entrypoints, Xiuyuan sync delete paths, native Riff remove planning, worker tombstone persistence, and focused sync/delete tests.
- No public MCP API change required by this proposal.
- No scheduler algorithm, queue scoring, Browser row helper, or plugin AI runtime change.
- No default migration that deletes native Riff cards.
