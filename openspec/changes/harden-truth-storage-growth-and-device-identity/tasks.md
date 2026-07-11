## 1. Baseline Contracts And Guards

- [x] 1.1 Capture current delta, truth, manifest, temporary DB, and device-identity inventory as deterministic test fixtures and diagnostic expectations
- [x] 1.2 Define versioned mutation envelope, durability receipt, truth generation, coverage watermark, storage-pressure, recovery-state, and identity-record contracts
- [x] 1.3 Add boundary checks that reject renderer SQL writers, renderer truth/manifest writers, kernel-companion database ownership, and new whole-database save callers
- [x] 1.4 Add format-version compatibility tests proving unsupported future truth, delta, snapshot, and identity versions fail closed

## 2. Stable Truth Device Identity

- [x] 2.1 Add an application identity port for reading and writing the versioned installation identity without depending directly on browser globals
- [x] 2.2 Implement the IndexedDB identity adapter with one versioned identity record and deterministic transaction failure results
- [x] 2.3 Replace `truthDeviceIdentity.ts` resolution with matching IndexedDB and localStorage authority copies plus a disposable temp mirror
- [x] 2.4 Implement missing-copy repair, conflicting-copy recovery-required behavior, and invalid-record diagnostics
- [x] 2.5 Migrate valid legacy localStorage and temp identity values without changing the existing writable device directory
- [x] 2.6 Read SiYuan `System.ID` as host fingerprint evidence and record host changes without rotating plugin identity
- [x] 2.7 Introduce identity epochs and route newly lost identities to a new writable device namespace while preserving prior namespaces as read-only inputs
- [x] 2.8 Add focused identity tests for restart stability, temp deletion, one-copy loss, copy conflict, mobile fingerprint change, legacy migration, and complete identity loss

## 3. Atomic Mutation Receipts

- [x] 3.1 Introduce the stable Worker mutation envelope and require one `mutationId` per business command and SQL transaction
- [x] 3.2 Extend SQLite delta records so one replayable mutation captures every required table, tombstone, metadata, Review, Undo, and Queue effect for the command
- [x] 3.3 Emit `journaled` only after SQL commit and complete delta verification, and expose failure before that boundary
- [x] 3.4 Add persistent mutation receipt state containing journal sequence, stage, affected aggregates, required truth outputs, retry state, and diagnostics
- [x] 3.5 Route Review answer and undo through the new receipt contract without increasing interactive acknowledgement beyond the journaled boundary
- [x] 3.6 Add idempotency tests for duplicate commands, partial delta append, SQL success with delta failure, and replay of one multi-table mutation

## 4. Truth Promotion And Coverage

- [x] 4.1 Implement a Worker-owned Truth Promotion Module that consumes journaled mutations in journal-sequence order
- [x] 4.2 Make the promotion Module the only production writer of truth manifests and generation publications
- [x] 4.3 Support bounded batching of consecutive mutations without reordering or splitting one durability unit
- [x] 4.4 Persist mutation-level canonical coverage and advance receipts to `truth-committed` only after every required output verifies
- [x] 4.5 Implement idempotent promotion retry using stable mutation IDs and verified generation evidence
- [x] 4.6 Register promotion through the background-work registry with explicit pressure, retry, oldest-pending, and frontier diagnostics
- [x] 4.7 Coordinate shutdown and restart so active batches finish or remain replayable and uncovered mutations resume before ordinary maintenance
- [x] 4.8 Add focused tests for ordered batching, partial truth failure, manifest interruption, duplicate retry, shutdown, restart, and coverage advancement

## 5. Compactable Canonical Truth Families

- [x] 5.1 Define the Card Aggregate truth schema containing Card and Schedule current state, causal revision, and deletion tombstone metadata
- [x] 5.2 Implement Card/Schedule changeset encoding and replay behind the canonical truth port
- [x] 5.3 Implement Queue-family snapshot and changeset truth without mixing Queue state into Card snapshot segments
- [x] 5.4 Add dual-threshold segment partitioning by aggregate count and encoded byte size
- [x] 5.5 Implement immutable snapshot generation writing, segment checksums, and fenced manifest publication
- [x] 5.6 Retain current and previous verified generations and classify incomplete generation files as non-authoritative orphans
- [x] 5.7 Add reconstruction tests proving canonical truth plus uncovered delta rebuilds Card, Schedule, Queue, Review, Undo, and tombstone state without legacy snapshots

## 6. Worker Storage Authority Cutover

- [x] 6.1 Inventory every active renderer, application, Worker, import, repair, and shutdown write path and assign each to one mutation family
- [x] 6.2 Complete Review-family cutover so accepted answers, undo, Review Ledger, and required queue impact use the Worker storage command and receipt
- [x] 6.3 Cut Card/Schedule formal writes to Worker authority and remove the corresponding renderer repository or manager mutation path
- [x] 6.4 Cut Queue membership and priority writes to Worker authority and remove renderer-side queue persistence
- [x] 6.5 Cut Card CRUD writes to Worker authority and preserve typed unavailable behavior when the writer cannot accept the command
- [x] 6.6 Convert import, migration, bulk repair, and whole-store maintenance into explicit idempotent Worker commands with progress diagnostics
- [x] 6.7 Remove renderer write-capable `SqliteDatabaseService`, `UnifiedStorageManager.save()`, `saveStore()`, and shutdown whole-database persistence from production composition
- [x] 6.8 Add regression tests proving each migrated family has one writer and no renderer or kernel-companion fallback mutation path

## 7. Compaction And Storage Budget

- [x] 7.1 Implement storage inventory metrics for counts, bytes, oldest age, generations, uncovered mutations, and pressure by family and device
- [x] 7.2 Implement configurable normal, soft, high, and hard budget classification with the accepted initial delta, truth, snapshot, and generation targets
- [x] 7.3 Implement production truth compaction that writes a new immutable generation, verifies it, fences manifest publication, and classifies orphans
- [x] 7.4 Implement coverage-aware delta compaction and relocation of uncovered mutations before deleting a sealed segment
- [x] 7.5 Implement finite checkpoint and generation retention using latest verified state plus subsequent replayable delta
- [x] 7.6 Run one-time migration promotion and compaction for installations already above budget before enforcing hard thresholds
- [x] 7.7 Return explicit `STORAGE_PRESSURE` when high-pressure maintenance cannot prevent unsafe hard-limit growth
- [x] 7.8 Add tests for soft scheduling, high synchronous maintenance, hard fail-closed behavior, interrupted compaction, uncovered relocation, and safe deletion

## 8. Startup Recovery State Machine

- [x] 8.1 Add startup evidence classification for identity, manifests, generations, truth segments, delta coverage, checkpoints, and temporary SQLite
- [x] 8.2 Rebuild missing or corrupt temporary SQLite from verified canonical truth plus uncovered delta
- [x] 8.3 Recover from previous verified generation and replay intact later mutations when the current candidate generation is incomplete
- [x] 8.4 Enter `STORAGE_RECOVERY_REQUIRED` when uncovered delta or canonical evidence cannot be verified
- [x] 8.5 Gate Review, edits, sync upload, and other formal writes while preserving last-verified read-only inspection, diagnostics, and backup export
- [x] 8.6 Preserve and quarantine damaged or unreferenced evidence instead of skipping it or silently creating a new truth frontier
- [x] 8.7 Add restart tests for missing projection, corrupt projection, incomplete current generation, corrupt uncovered mutation, corrupt canonical segment, and read-only recovery behavior

## 9. Multi-Device Truth Reconciliation

- [x] 9.1 Replace SQLite conflict-copy scanning as domain authority with a canonical truth reconciliation entrypoint
- [x] 9.2 Load immutable device and identity-epoch manifests as read-only reconciliation inputs without claiming foreign namespaces
- [x] 9.3 Deduplicate equivalent mutation IDs and merge independent aggregate mutations deterministically
- [x] 9.4 Union valid append-only Review facts while preserving mutation identity and audit evidence
- [x] 9.5 Apply tombstones and recreation rules using causal revisions so stale synchronized state cannot revive deleted aggregates
- [x] 9.6 Implement explicit aggregate conflict records and write gates for non-commutative concurrent mutations against one base revision
- [x] 9.7 Implement deterministic merge handlers only for domain operations proven commutative
- [x] 9.8 Publish verified reconciliation output as a canonical checkpoint or generation before rebuilding temporary SQLite and queue projections
- [x] 9.9 Add two-device and identity-loss tests for duplicate mutations, independent aggregates, concurrent same-card changes, tombstones, old epochs, failed publication, and projection rebuild

## 10. Diagnostics, Documentation, And Validation

- [x] 10.1 Expose combined storage diagnostics for identity, receipt stages, promotion lag, coverage, budget, recovery, reconciliation, and disabled capabilities
- [x] 10.2 Update ADR-002 with finite recovery history, startup recovery states, and domain-level reconciliation decisions
- [x] 10.3 Update `ARCHITECTURE.md`, `CONTEXT.md`, and `docs/DDD_RESCAN_BACKLOG.md` with final ownership, call chains, invariants, fixed debt, and deferred policy tuning
- [x] 10.4 Add focused integration suites covering identity through Worker command, delta receipt, truth promotion, compaction, restart rebuild, and synchronization reconciliation
- [x] 10.5 Run hidden-fallback checks, boundary checks, focused Vitest suites, full production build, strict OpenSpec validation, and `git diff --check`
- [x] 10.6 Perform writer/follower and two-device smoke checks proving no duplicate Review fact, no follower-local write, bounded segment growth, stable identity, restart recovery, and explicit conflict behavior
