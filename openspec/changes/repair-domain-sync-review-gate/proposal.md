> Superseded on 2026-07-16 by `review-domain-sync-independence`: domain-sync diagnostics are passive and cannot block Review or open a conflict dialog. This completed change is retained only as historical context and must not be reapplied.

## Why

Domain sync diagnostics can report `repairable` from stale review-history/card-state drift even when no external sync is active, which currently hard-blocks Review entry. The repair dialog then fails on preview because the worker SQLite repair path calls a missing `fnv1a32` instance method.

## What Changes

- Restore domain sync repair preview/apply hashing by using an owned worker SQLite hash helper.
- Keep the domain sync safety feature for real mobile/desktop divergence, but stop blocking Review for repairable drift that is unrelated to the current card or only reflects card reps trailing already-applied review history.
- Preserve hard blocks for source errors, direction conflicts, divergent ledger state, and repairable review-history drift that can affect the current Review card.
- Add focused regression coverage for worker repair preview and Review safety decisions.

## Capabilities

### New Capabilities
- `domain-sync-review-safety`: Review entry safety decisions for domain sync diagnostics and repair preview stability.

### Modified Capabilities
- `manual-sync-direction-resolution`: Clarifies that manual sync conflict UI remains available, but repairable drift must not crash preview or unnecessarily block Review.

## Impact

- Affected code: `worker/db/SqliteDatabaseService.ts`, `src/application/services/ReviewDomainSyncSafetyService.ts`, and focused tests.
- Affected systems: backend worker SQLite domain sync diagnostics, manual sync repair preview, Review entry preflight.
- No dependency, database schema, or external API change.
