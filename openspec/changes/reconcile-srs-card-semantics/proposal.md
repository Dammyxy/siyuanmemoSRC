## Why

Several existing cards can lose their concrete SRS semantics after migration or sync, causing list cards, CDF definition cards, descriptors, and derived items to appear as generic Topic cards. This matters now because Review, Browser, Queue counters, and repair tools currently infer card semantics from scattered fields instead of one evidence-backed module.

## What Changes

- Add a SRS card semantics capability that resolves a card's effective semantic kind from durable evidence such as Xiuyuan template metadata, card meta, card type markers, progressive lineage, block attributes, and structure evidence.
- Add a reconciliation capability that audits corrupted or ambiguous SRS card semantics, produces dry-run evidence, and commits safe repairs only when evidence is deterministic.
- Add a user-facing repair entry separate from "编辑SRS数据"; the existing SRS editor remains focused on scheduling/review data instead of semantic repair.
- Persist repair receipts so future migrations and diagnostics can prove what was repaired, skipped, or left ambiguous.
- After current data can be audited and repaired, add creation receipts for new cards so future migrations have a stable semantic source of truth.
- No breaking change to existing card creation or review entry commands; ambiguous cards fail closed into diagnostics instead of silent rewrites.

## Capabilities

### New Capabilities
- `srs-card-semantics`: Resolves effective SRS card semantic kind with evidence and exposes audit/repair decisions to Browser, Review, Queue, migration, and diagnostics.
- `srs-card-creation-receipts`: Records immutable creation evidence for newly created SRS cards so future reconciliation does not depend on scattered legacy fields.

### Modified Capabilities
- `sql-first-card-runtime`: Adds repair-safe semantics reconciliation against SQL-backed card rows and projection data without changing the SQL-first ownership model.

## Impact

- Affected code: `src/types/card.ts`, Xiuyuan creation use cases, `src/infrastructure/persistence/mappers/CardMapper.ts`, `src/infrastructure/persistence/sqlite/SqlUnifiedStorageRepository.ts`, Browser/Review read paths, repair UI/action entry, and worker/backend repair surfaces if needed for SQL-owned data.
- Affected data: card `type`, `cardTypeMarker`, selected `meta` fields, projection card type evidence, repair receipts, and later creation receipts.
- Affected validation: focused semantics resolver tests, reconciliation dry-run/commit tests, Browser/Review render policy regression tests, SQL repository repair tests, and `pnpm build`.
