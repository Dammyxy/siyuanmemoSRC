## Context

`WorkerSqliteDatabaseService.enforceFormalWriteBeforeMutation()` currently calls `collectStorageInventory()` before every formal write. `WorkerStorageInventory.collect()` performs four host-backed operations in parallel: truth file listing and manifest reads, SQLite delta inventory, a full persisted `siyuanmemo.db` read, and truth-promotion diagnostics. The Review trace shows those reads dominate a 4.1 second rating even though the domain-sync repair gate is already skipped.

Storage pressure is still a correctness boundary. Ordinary writes must not bypass it, and the existing hard-pressure recovery in `repair-legacy-delta-storage-pressure-loop` must remain authoritative. The design therefore changes how pressure evidence is maintained, not which storage states are writable.

## Goals / Non-Goals

**Goals:**

- Make normal-pressure formal mutation admission an in-memory operation with no storage host effects.
- Keep cached pressure conservative and update it from evidence already produced by successful delta persistence.
- Preserve exact startup classification, bounded maintenance, recovery, and hard-pressure fail-closed behavior.
- Put admission state, reclassification, and refresh coalescing behind a narrow Worker Module.
- Prove the Review feedback hot path still returns a verified journaled durability receipt.

**Non-Goals:**

- Change storage budget thresholds or persistent formats.
- Change legacy delta adoption, compaction, orphan cleanup, or truth authority.
- Reduce the Review undo-journal/delta payload size; the observed roughly 575 KiB entry is a separate optimization.
- Add a general background scheduler abstraction.

## Decisions

### 1. A Worker-owned admission Module owns pressure state

Add `WorkerStoragePressureAdmissionModule` under `worker/db/`. It owns the latest inventory, whether that inventory is exact or estimated, the blocking reason, and the single in-flight exact refresh. Its public surface is limited to startup/exact refresh, current diagnostics, append observation, admission classification, and block-state transitions.

`WorkerSqliteDatabaseService` remains the owner of SQLite transactions and storage maintenance. It asks the Module for an admission decision and executes the existing maintenance/recovery operations only when required.

Alternative: keep cache fields and branching inside the database facade. Rejected because the facade already combines too many storage families and would leave admission policy distributed across callbacks, startup, diagnostics, and mutation gating.

### 2. Startup creates an exact baseline; normal admission uses cached evidence

The existing startup storage-growth baseline becomes the point where the Module receives an exact inventory before writable readiness is published. A normal cached classification admits a formal mutation synchronously without calling the inventory collector.

If startup enters recovery-required/read-only state before a baseline can be established, the existing recovery gate remains authoritative and formal writes stay unavailable. There is no permissive fallback for missing pressure state.

Alternative: time-throttle full inventory scans. Rejected because it preserves periodic multi-second rating spikes and admits writes from age rather than storage evidence.

### 3. Delta persistence returns an in-memory append observation

Extend the internal SQLite delta persistence result so a successful append exposes the active delta file count, entry count, encoded active bytes, oldest entry time, and appended entry byte estimate already present in the post-write snapshot/manifest. Pass this observation alongside the verified durability receipt to the Worker facade.

The admission Module replaces the cached `sqlite-delta` metric with the exact post-append values and conservatively increments temporary projection bytes by the appended entry estimate. It then reruns the existing `classifyWorkerStoragePressure()` policy in memory. No backend RPC or persistent schema changes.

Alternative: query delta diagnostics after every receipt. Rejected because the richer snapshot is already available at the write boundary and a query would risk reintroducing host I/O.

### 4. Pressure transitions determine refresh and maintenance timing

- `normal`: admit immediately with no host I/O.
- `soft`: admit, coalesce one background exact refresh, and schedule existing bounded maintenance only if refreshed evidence remains non-normal.
- `high` or `hard`: synchronously refresh exact evidence before maintenance. If exact evidence remains high/hard, execute existing bounded maintenance or legacy-delta recovery. Refresh again afterward; only a remaining hard state blocks the mutation.

This retains the current distinction where high pressure causes synchronous maintenance but only unresolved hard pressure is fail-closed.

Alternative: bypass pressure checks only for `review.feedback`. Rejected because it weakens a shared durability boundary and lets one formal mutation family grow an already-hard store.

### 5. Exact maintenance and diagnostic reads refresh the same cache

Promotion, truth compaction, SQLite delta compaction, legacy recovery, startup maintenance, and explicit inventory/combined-diagnostic requests update the Module from a new exact inventory. Background refresh is coalesced so multiple soft-pressure writes cannot start parallel scans.

The existing full inventory collector remains the exact-evidence implementation. It moves off the normal mutation hot path rather than being weakened.

## Risks / Trade-offs

- **Conservative projection growth can overestimate pressure** -> Soft pressure triggers a background exact refresh; high/hard performs exact verification before maintenance or blocking.
- **A maintenance path can forget to invalidate cached evidence** -> Centralize all exact collection through the Module and cover startup, explicit diagnostics, compaction, promotion, and recovery transitions with focused tests.
- **Concurrent writes can observe a stale level before the prior receipt callback** -> Receipt observation runs synchronously after delta append verification and before the formal transaction result resolves.
- **The first exact inventory is expensive** -> It remains startup/background work where the cost already exists; this change removes it only from repeated mutation latency.
- **Large delta entries still cost hundreds of milliseconds to encode/write** -> Preserve that evidence and address payload reduction in a separate measured change.

## Migration Plan

1. Add the Module and unit tests for baseline, observation, transition, coalescing, and block evidence.
2. Add delta append observation plumbing without changing persistence formats.
3. Wire startup and explicit inventory reads to refresh Module state.
4. Replace mutation-time full inventory collection with Module admission decisions.
5. Add the end-to-end Review feedback host-effect regression and retain existing hard/soft/high pressure tests.

Rollback restores direct exact collection before mutations. No data migration or cleanup is required because this change adds no persistent state.

## Open Questions

- None for this phase. Delta/undo payload reduction remains a separately measured follow-up.

## Verification Evidence

- Focused suites: 130 tests passed across the admission Module, SQLite delta persistence, Worker storage pressure/recovery, and Review feedback.
- The Review regression clears host-effect spies after startup and card seeding, then proves rating returns a verified `journaled` receipt with zero `readBinary('siyuanmemo.db')`, truth `listFiles()`, or truth manifest `readJSON()` calls.
- Existing soft, high, hard, legacy recovery, restart, corrupt delta, and durability tests remain green.
- `pnpm run check:boundaries`, `pnpm build`, and strict OpenSpec validation pass.
- The remaining measured Review cost includes the roughly 575 KiB undo/delta payload and its sealed-segment/manifest writes. Payload reduction is intentionally deferred to a separate change so this admission fix does not weaken undo or durability evidence.
