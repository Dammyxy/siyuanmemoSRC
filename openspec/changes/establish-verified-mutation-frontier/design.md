## Context

SQLite delta allocates one monotonic journal sequence per device-local manifest. Truth Promotion instead persists coverage below `truth/promotion/device-<deviceId>/epoch-<identityEpoch>/state.v1.json` and filters pending mutations to the active epoch. When verified authority migration keeps the device ID but creates a new epoch, the first formal mutation can receive sequence 404 while the new epoch state has no coverage. Promotion then expects sequence 1, records `journal-sequence-gap:1:404`, and `WorkerSqliteDatabaseService` retries the deterministic failure every second.

The existing legacy-delta recovery change can rebind only deterministic, uncovered `LEGACY_DELTA_ADOPTED` receipts. It correctly refuses to rewrite formal mutations and therefore cannot own the long-term relationship between verified identity, the device journal, coverage, and retry classification.

Constraints:

- The Worker remains the only SQL, delta, promotion-state, and Canonical Truth writer.
- Journal sequences and existing mutation envelopes are immutable durability evidence.
- Prior epoch namespaces remain read-only reconciliation inputs.
- Formal Review may return at `journaled`, but no accepted mutation may become permanently unpromotable without an explicit recovery state.
- The rating hot path must consume cached frontier admission rather than perform new host file scans per answer.

## Goals / Non-Goals

**Goals:**

- Give one Worker-owned module responsibility for the verified device mutation frontier.
- Prove or reject epoch continuation before formal writes and promotion run.
- Migrate compatible per-epoch promotion coverage into one device-level frontier without resetting or skipping sequences.
- Classify deterministic frontier failures as recovery-required and stop automatic retry loops.
- Preserve ordered promotion, idempotency, durability receipts, and legacy adoption behavior.
- Expose stable, content-safe frontier diagnostics for startup and maintenance.

**Non-Goals:**

- Rebinding formal mutations to another epoch.
- Resetting journal sequence allocation at an epoch boundary.
- Rewriting historical truth records or deleting prior epoch state.
- Compacting Review Transaction Undo Journal payloads in this change.
- Changing Browser projection warmup or logging in this change.
- Moving persistence authority to the renderer or kernel companion.

## Decisions

### Add one device-level Verified Mutation Frontier state

The Worker will persist one verified frontier record per device beside the existing epoch directories. It records the active identity epoch, covered journal sequence and mutation evidence, truth generation, last verified journal allocation frontier, transition evidence when coverage was inherited from a prior epoch, status, and stable blocking code.

The device-level record is the runtime authority for promotion coverage. Existing per-epoch promotion states remain immutable migration evidence and compatibility diagnostics during this change; they are not independently consulted by the hot path after frontier initialization.

Alternative rejected: keep coverage epoch-local and special-case `journal-sequence-gap`. That leaves the same invariant split across identity, delta, promotion, and retry code. Alternative rejected: reset sequence to 1 for each epoch. The delta manifest and existing receipts already define a device-wide monotonic sequence, so reset would create ambiguous ordering and compaction coverage.

### Prove epoch continuation from verified evidence

Frontier initialization reads the verified authority identity, the delta manifest allocation frontier and journaled mutations, the device frontier if present, and legacy per-epoch promotion states. It produces one of three outcomes:

- `ready`: the active epoch already owns the device frontier, this is an empty genesis journal, or a unique predecessor state proves coverage immediately before the first active-epoch mutation / next allocation.
- `recovery-required`: sequence continuity, predecessor coverage, mutation identity, or active epoch ownership conflicts.
- `unsupported`: required versions or file capabilities cannot be verified.

A transition may inherit coverage only when the predecessor belongs to the same device, its verified covered mutation matches the predecessor sequence evidence when that entry is present, no uncovered foreign-epoch mutation occupies the continuation range, and the active epoch begins exactly at the next sequence. The module writes transition proof before allowing further formal writes.

Alternative rejected: choose the largest coverage state by timestamp or file size. Neither proves journal continuity. Alternative rejected: silently treat the current first sequence minus one as covered. That would discard unverified mutations.

### Keep admission hot and updates monotonic

Startup initializes and verifies the frontier once, then the Worker keeps the ready frontier in memory. Formal mutation entry checks the cached status. Delta append returns the assigned sequence and the frontier observes only the next expected journal position. Promotion advances coverage only after the existing publisher verifies every required truth output.

Any runtime observation that goes backward, skips a sequence, changes device, or changes epoch without a verified transition invalidates the cache and closes the formal write gate. This avoids adding identity/state file reads to each Review answer while keeping every update monotonic.

### Separate retryable publication failure from terminal frontier failure

Promotion results will carry a failure classification. Host I/O and publication verification failures remain retryable with capped backoff and coalesced diagnostics. Identity mismatch, unsupported state version, unproven epoch transition, and journal sequence discontinuity are terminal for automatic scheduling: the Worker records one recovery-required transition, cancels the retry timer, and exposes the stable code through maintenance diagnostics.

Alternative rejected: only lower the log level or deduplicate identical warnings. That hides the symptom while Canonical Truth remains stalled.

### Keep promotion implementation behind a narrow Worker runtime

`WorkerSqliteDatabaseService` composes the frontier, existing promotion Module, publisher, promotion-state migration reader, and scheduler coordination, but does not interpret coverage arithmetic itself. The frontier Module owns initialization, admission, journal observation, monotonic promotion state, and diagnostics; `WorkerTruthPromotionModule` owns ordered publication and failure classification. The facade consumes that classification while retaining timer coordination with storage-pressure maintenance and shutdown. A separate scheduler adapter was rejected because only one implementation exists and its deletion would not spread domain complexity; it would be a hypothetical seam with lower locality. SQL and file-effect dependencies remain supplied by the Worker DB layer.

## Risks / Trade-offs

- [A prior epoch state claims coverage that cannot be tied to the device journal] -> Enter recovery-required and preserve all delta/truth evidence; do not infer a baseline.
- [The device-level frontier write succeeds but compatibility epoch-state update fails] -> Treat the frontier publication as failed until both required records verify, or keep the compatibility write strictly diagnostic and non-authoritative; never expose two writable coverage authorities.
- [Listing old promotion states adds startup I/O] -> Perform it only during frontier bootstrap or explicit recovery, cache the verified result, and keep the Review hot path file-free.
- [Existing installations already contain current-epoch entries after a gap] -> Allow initialization to prove and persist a transition before promoting them; do not rewrite their envelopes.
- [Retryable host failures persist] -> Use capped backoff and state-transition diagnostics while preserving the journaled mutation and write gate policy.
- [Legacy adoption depends on epoch-specific state] -> Preserve the old state reader as migration evidence and add compatibility regressions before changing any cleanup behavior.

## Migration Plan

1. Add characterization tests for the observed old-epoch coverage 403 / current-epoch sequence 404 case, conflicting predecessor states, uncovered foreign-epoch entries, and genesis sequence 1.
2. Add the device-level frontier record and pure initialization/classification module. Run it read-only against existing fixtures before enabling writes.
3. Persist verified transition evidence and make Truth Promotion consume device frontier coverage.
4. Gate formal mutations on cached frontier readiness and observe assigned journal sequences monotonically.
5. Replace the one-second unconditional scheduler with classified capped retry and transition-only warning diagnostics.
6. Integrate frontier status with startup recovery and storage maintenance diagnostics, then run restart and legacy-adoption compatibility suites.

Rollback keeps the new frontier file as inert evidence and restores the prior promotion reader only in a build that refuses writes when it encounters a newer verified frontier version. Rollback must not delete the frontier, reset coverage, or rewrite mutation envelopes.

## Open Questions

No product decision is required. Implementation must choose the smallest compatibility strategy for existing per-epoch state writes after the device frontier becomes authoritative, and prove that only one record can advance coverage.
