## Why

Truth Promotion can become permanently stuck after an identity-epoch transition because SQLite delta journal sequences remain globally monotonic while the new epoch's promotion coverage starts at zero. The current runtime treats the resulting deterministic sequence gap as transient, retries every second forever, and leaves new journaled mutations outside Canonical Truth.

## What Changes

- Introduce a Worker-owned Verified Mutation Frontier that proves the relationship between writable truth identity, identity epoch, journal allocation, and promotion coverage before formal mutations or promotion continue.
- Define explicit epoch-transition outcomes: verified continuation, recovery-required discontinuity, and unsupported evidence. Never reset or skip journal sequences to manufacture continuity.
- Replace generic unbounded Truth Promotion retry with bounded retry classification so deterministic frontier failures become stable recovery diagnostics rather than a one-second warning loop.
- Keep old identity-epoch namespaces read-only reconciliation inputs and preserve all uncovered delta evidence until continuity is verified.
- Preserve existing Worker single-writer authority, ordered promotion, durability receipts, and public backend result shapes.

## Capabilities

### New Capabilities

- `verified-mutation-frontier`: Verified identity/epoch/journal/coverage continuity, epoch-transition classification, and bounded promotion retry behavior.

### Modified Capabilities

- `worker-sqlite-runtime-families`: Extract frontier state and retry classification from the broad Worker SQLite facade into a narrow Worker-owned runtime while preserving centralized SQL and truth writer authority.

## Impact

- Worker truth and storage composition: `WorkerTruthPromotionModule`, `WorkerSqliteDatabaseService`, promotion state stores, SQLite delta journal allocation, startup recovery evidence, and maintenance diagnostics.
- Identity composition: verified `deviceId + identityEpoch` evidence and legacy/temp identity migration inputs.
- Persistent data: no format downgrade or silent sequence rewrite; prior epoch state and uncovered journal entries remain intact unless an explicit verified transition proves continuity.
- Tests: cross-epoch frontier characterization, promotion retry classification, restart behavior, formal mutation gating, and existing legacy-adoption recovery compatibility.
