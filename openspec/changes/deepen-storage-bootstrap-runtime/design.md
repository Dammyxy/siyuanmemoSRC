## Context

The active storage design is already settled: MessagePack truth and SQLite delta segments are durable sync state, while `siyuanmemo.db` is a rebuildable temp SQL projection. Recent storage fixes confirmed this scheme is live and working, but also exposed an architectural problem: startup bootstrap behavior is concentrated inside `WorkerSqliteDatabaseService`, a broad module that also owns Browser reads, Review feedback, queue projection, domain sync repair, semantic state, Xiuyuan sync, and diagnostics.

The expensive part is not line count by itself. The problem is locality. To understand or test startup behavior, maintainers currently need to reason through truth discovery, projection DB probing, ignored legacy petal DB diagnostics, migration receipt reconciliation, projection rebuild, runtime reinitialization, and downstream worker DB state inside one module.

This change narrows that surface by extracting storage bootstrap decisions into a focused internal module. It is an architecture deepening pass, not a storage migration.

## Goals / Non-Goals

**Goals:**

- Create a focused Storage Bootstrap Runtime module for worker startup storage decisions.
- Preserve current storage semantics: durable truth stays in petal truth/delta storage; SQL DB stays a temp projection.
- Keep startup fail-closed: no legacy snapshot fallback, stale projection continuation, or hidden compatibility path.
- Make projection rebuild and reinitialization behavior testable through a small interface.
- Reduce `WorkerSqliteDatabaseService` ownership to orchestration and runtime delegation for this slice.

**Non-Goals:**

- Do not change storage paths, truth schemas, SQL projection schemas, JSON-RPC method strings, or backend contracts.
- Do not move Review feedback journal ownership in this change.
- Do not add native SQLite/WAL ownership.
- Do not make kernel companion write or read `siyuanmemo.db`.
- Do not implement a repair UI or broad storage compaction.
- Do not clean unrelated worker DB responsibilities.

## Decisions

1. Extract a runtime, not a generic utility.

   The new module should expose a small interface around bootstrap behavior, not a bag of exported helper functions. It owns ordering and invariants: read existing projection evidence, discover truth, reconcile receipt if needed, trigger required projection rebuild, reinitialize temp runtime when persisted projection bytes are invalid, and emit storage diagnostics.

   Alternative considered: move individual private functions to a helper file. Rejected because that would preserve a shallow interface and keep ordering knowledge in `WorkerSqliteDatabaseService`.

2. Keep database mutation and SQL runtime authority in the worker DB owner.

   The bootstrap runtime may request operations through injected callbacks, but it should not become a second SQL owner. Rebuild still runs through the existing worker DB projection rebuild implementation and runtime persist path supplied by the worker.

   Alternative considered: move projection rebuild implementation fully into the new module. Rejected for this slice because rebuild touches repositories, queue projection state, truth records, and SQL writes already owned by the worker DB runtime.

3. Preserve existing diagnostics, not invent a new user-visible contract.

   Diagnostics produced today, such as ignored legacy petal DB and projection rebuild failures, should remain the same shape. The module may centralize emission, but it must not change external status payloads or JSON-RPC results.

   Alternative considered: introduce a new backend storage diagnostic schema. Rejected because this is a locality refactor, not a contract change.

4. Test through the new interface plus focused worker integration.

   Unit tests should exercise bootstrap decisions with small fakes where possible. Existing `WorkerSqliteDatabaseService` tests should continue proving active startup behavior. The test surface is the module interface, not private helper internals.

   Alternative considered: rely only on the existing broad worker tests. Rejected because that would not prove the extraction created a deeper, independently understandable module.

## Risks / Trade-offs

- [Risk] Extraction may accidentally change startup ordering. -> Mitigation: move behavior in small steps, keep focused worker startup tests, and avoid changing storage contracts.
- [Risk] New module could become a pass-through. -> Mitigation: keep ordering and decision logic inside the module; the worker should delegate one bootstrap action rather than call many moved helpers manually.
- [Risk] Tests may overfit private implementation. -> Mitigation: test observable bootstrap outcomes: diagnostics, rebuild requested, fail-closed errors, and projection reinit behavior.
- [Risk] Existing dirty storage fix diff can obscure review. -> Mitigation: keep this change scoped to new OpenSpec files and bootstrap extraction files; do not rewrite the SQLite delta retry.

## Migration Plan

1. Add the OpenSpec artifacts and validate them strictly.
2. Add the Storage Bootstrap Runtime module with the current bootstrap decision interface.
3. Move current private startup helpers from `WorkerSqliteDatabaseService` behind the module while preserving behavior.
4. Add focused tests for projection bootstrap/rebuild/fail-closed decisions.
5. Run focused worker SQLite tests, hidden-fallback/boundary checks, build, and diff whitespace checks.

Rollback path: revert the extraction and restore the private methods in `WorkerSqliteDatabaseService`. No data migration is introduced.

## Open Questions

None for this slice. Review feedback storage envelope and storage policy catalog extraction remain follow-up candidates.
