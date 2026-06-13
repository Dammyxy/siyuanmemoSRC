## Why

`src/types/unified-data-source.ts` carries QueueType literals, queue review results, projection rollout diagnostics, manager facade shape, NeuralRoam session contracts, Browser filters, data router contracts, queue UI config, errors, and helper functions in one broad module. The Interface is shallow because callers often import a large mixed contract surface even when they need only queue core, projection read, Browser filter, or NeuralRoam session types.

## What Changes

- Split the unified data-source contract module into smaller caller-oriented contract modules.
- Keep a compatibility barrel so existing imports can migrate incrementally without runtime behavior changes.
- Separate at least these contract families: queue core/review, queue projection/readiness, data-source manager facade, NeuralRoam session queue, Browser filter/session transfer, data router, and shared errors/helpers.
- Update focused imports in one or two low-risk slices to prove the split works.
- Add tests or type-level checks that public exports remain available through the compatibility barrel during the migration.
- Do not change queue membership rules, projection materialization, Review feedback, scheduler behavior, SQL worker ownership, writer relay, kernel sidecar coordination, or AI workbench behavior.

## Capabilities

### New Capabilities

- `unified-data-source-contract-split`: Unified data-source contracts are split by caller intent while preserving compatibility exports and runtime behavior.

### Modified Capabilities

- None.

## Impact

- Affected code: `src/types/unified-data-source.ts`, new contract modules under `src/types` or `src/types/unified-data-source/*`, selected Browser/Review/Queue import sites, contract/type tests, `ARCHITECTURE.md`, and `docs/DDD_RESCAN_BACKLOG.md`.
- Runtime behavior: no intended runtime behavior change; this is contract Locality and type-debt cleanup.
- Boundaries: the split must not introduce new concrete dependencies across UI, application, core, or infrastructure layers.
