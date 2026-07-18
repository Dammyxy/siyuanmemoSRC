## Context

SiYuanMemo startup currently treats several storage-maintenance activities as part of the same startup-ready path. `ApplicationContext.create()` waits for backend Worker creation, legacy storage maintenance, unified projection load, startup schedule/orphan-card maintenance, settings/queue setup, and websocket setup before returning. Inside backend Worker startup, `WorkerSqliteDatabaseService.init()` still performs correctness-critical storage validation, but it also runs Review journal replay/reconciliation, truth promotion diagnostics, and one-time storage-growth baseline work before reporting the projection as loaded.

The active storage architecture is settled: MessagePack truth plus SQLite delta are durable authority, while `siyuanmemo.db` is a disposable SQL projection. This change must not weaken that model. The aim is to make startup readiness a deeper Module interface: callers learn “storage is safe and the projection is readable” without also waiting for every maintenance activity that can safely run after the plugin shell is usable.

## Goals / Non-Goals

**Goals:**

- Surface slow startup spans directly so maintainers can identify the startup Module responsible for latency without broad log forensics.
- Add a receipt/dirty-signal fast path to startup storage maintenance so unchanged stores do not repeatedly run full card scans.
- Split backend Worker startup readiness from deferred-safe maintenance while preserving synchronous fail-closed recovery gates.
- Route deferred startup work through existing background-work lifecycle/status rather than ad hoc timers.
- Keep tests focused on observable startup readiness, maintenance deferral, and explicit fail-closed behavior.

**Non-Goals:**

- Do not skip storage recovery validation, truth/delta validation, or read-only recovery gates.
- Do not change JSON-RPC method strings, storage paths, SQLite projection schemas, MessagePack truth schemas, or writer-relay authority.
- Do not introduce a second SQLite owner in the renderer, kernel companion, or background-work registry.
- Do not make startup silently degrade when maintenance fails; deferred jobs must expose explicit status/error.
- Do not solve broad storage pressure policy tuning or large-dataset compaction defaults in this change.

## Decisions

1. Add slow-startup reporting before major behavior movement.

   Startup spans already flow through `measureRuntimePerformance`. This change should add a narrow startup profile reporter that emits top slow spans when startup crosses a threshold. This creates a feedback loop for the optimization and keeps future startup regressions local.

   Alternative considered: add temporary debug logs. Rejected because temporary logs are hard to keep clean and do not become a reusable test/diagnostic surface.

2. Make startup storage maintenance receipt-driven.

   `runStartupWorkerStorageMaintenance()` currently compares serialized card snapshots and scans orphan cards on every startup. The maintenance Module should first check stable receipts or dirty signals for schedule normalization and orphan repair. If no relevant input changed after a completed receipt, it should return a skipped/completed diagnostic without full scans.

   Alternative considered: remove startup maintenance entirely. Rejected because old malformed schedule and orphan-card states still need a safe migration path.

3. Split backend `db.load` into readiness and maintenance phases.

   Synchronous `db.load` must continue to validate storage evidence, initialize the SQL runtime/repositories, rebuild missing/corrupt projections when required and provable, and enter read-only recovery when evidence cannot be trusted. Work that is not required for initial readable projection readiness should move to a deferred startup maintenance job: Review journal projection reconciliation, bounded truth promotion/backfill continuation, and one-time storage-growth baseline when pressure is not hard.

   Alternative considered: keep everything in `db.load` and only extend timeouts. Rejected because it preserves a shallow interface and still makes startup latency scale with maintenance backlog.

4. Use existing Kernel Companion Background Work registry for deferred startup work.

   Deferred startup jobs should become visible via the normalized background-work status read model. This keeps lifecycle, cancellation, diagnostics, and unload behavior in one Module rather than spreading detached promises through startup.

   Alternative considered: use `setTimeout` fire-and-forget in `ApplicationContext`. Rejected because it hides failures and creates poor locality.

5. Preserve hard-pressure and recovery gates synchronously.

   If startup detects read-only recovery, corrupt authoritative evidence, or hard storage pressure that must be resolved before accepting mutations, startup readiness must fail closed or remain blocked per existing storage rules. Only normal/soft/high maintenance that can safely defer should leave the critical path.

   Alternative considered: always defer storage-growth baseline. Rejected because hard-pressure states are write-safety gates, not convenience maintenance.

## Risks / Trade-offs

- [Risk] Moving maintenance out of `db.load` could expose a stale queue projection briefly. -> Mitigation: only defer work whose current callers can tolerate explicit `refresh-required/deferred` status; keep SRS-critical projection repair synchronous until tests prove safe.
- [Risk] Receipt-driven startup maintenance could miss a changed card set. -> Mitigation: derive dirty signals from stable store metadata or operation receipts, and fall back to full scan when evidence is missing or ambiguous.
- [Risk] Background work may run after plugin unload. -> Mitigation: route through the existing registry shutdown/defer semantics and cover unload/dispose behavior with focused tests.
- [Risk] Startup profile output may leak content. -> Mitigation: reuse existing runtime performance metadata sanitization and record only operation names, durations, counts, and safe scalar diagnostics.
- [Risk] The first pass may reveal `db.load` still dominates because recovery work is legitimately synchronous. -> Mitigation: keep the startup profile as a durable outcome and defer only safety-neutral work.

## Migration Plan

1. Add startup profile reporter and focused tests for threshold/top-span behavior.
2. Add startup maintenance receipts/dirty signals and fast-path tests proving no full scans when maintenance is already complete.
3. Split backend Worker maintenance from readiness in the smallest safe slice, initially moving only proven deferred-safe work behind background-work status.
4. Update architecture/debt docs with the new startup readiness vs maintenance ownership.
5. Validate with focused startup/Worker/background-work tests, `pnpm run check:boundaries`, `pnpm build`, `openspec validate optimize-plugin-startup-critical-path --strict`, and `git diff --check`.

Rollback path: disable the new startup-maintenance fast path and route `db.load` through the previous synchronous maintenance sequence. No persistent data migration or storage format change is introduced.

## Open Questions

- Which measured startup threshold should trigger profile reporting by default: 2s, 5s, or 10s?
- Should startup profile reporting be always-on for slow starts, or gated behind the existing runtime performance diagnostics flag?
