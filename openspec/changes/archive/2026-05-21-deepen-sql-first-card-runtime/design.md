## Context

SiYuanMemo already has a SQLite card table, SQL repositories, backend projection storage, and worker query handlers. Browser deck reads can use SQL pagination and matched IDs, queue projection reads can hydrate rows from backend storage, and `SqlCardReadModel` can back card application reads.

The runtime still contains several shallow seams:

- Browser callers need to know whether a query is SQL-expressible, snapshot-backed, or hydrated later.
- Queue and Review callers need to know projection readiness, trusted snapshots, force-refresh behavior, local queue fallback, and hydration failure modes.
- Review mutation paths still update card state through `UnifiedStorageManager` first in several flows and then rely on SQL upsert/projection invalidation as a derived effect.
- NeuralRoam graph code still reads card facts from SiYuan `fsrs_cards`, even though the local SQL card universe is now the relevant card source.
- Xiuyuan repository reads and sync changes remain coupled to `UnifiedStorageManager`, while SQLite schema already has Xiuyuan-related storage.

The relevant domain terms are **SRS Browser Card Universe**, **Queue Projection Readiness**, **Browser Queue View Lifecycle**, **Review Transaction Safety Envelope**, **NeuralRoam Advance**, and Xiuyuan as the accepted card source model from ADR-004.

## Goals / Non-Goals

**Goals:**

- Make the SQL card universe the primary hot-path authority for Browser card reads, queue projection reads, NeuralRoam card facts, and selected review card mutations.
- Deepen runtime Modules so callers use small Interfaces and no longer encode SQL-vs-snapshot routing rules.
- Keep projection readiness and unavailable states explicit; do not hide broken SQL/projection paths behind silent legacy fallback.
- Preserve existing domain behavior and user-facing review semantics while changing implementation ownership.
- Add tests at each new Interface so performance-sensitive behavior can be verified without testing through UI glue.

**Non-Goals:**

- No one-shot removal of `UnifiedStorageManager`; it remains available for migration, recovery, compatibility, and any not-yet-migrated storage path.
- No schema rewrite that loses current cards, Xiuyuans, queue state, review logs, arena data, domain sync ledger, or semantic data.
- No change to scheduler algorithms, FSRS parameters, or card type semantics unless a phase discovers an existing bug.
- No hidden best-effort fallback from SQL/projection failure to stale snapshot behavior in active hot paths.

## Decisions

### Decision 1: Create SQL-first read Modules before broad rewrites

Browser and Review will first consume deep read Modules rather than directly widening `SqlUnifiedStorageRepository`.

Rationale: the repository already has many low-level SQL operations. A deeper read Module can encode the domain Interface: page, matched IDs, hydrate rows, stats, source-existence semantics, readiness, and unavailable errors.

Alternative considered: add more repository methods and call them directly. Rejected because it keeps SQL expressibility rules distributed across Browser, queue, and application callers.

### Decision 2: Treat fallback as an explicit state, not a silent implementation choice

Where SQL or backend projection is required, failures MUST produce unavailable diagnostics or fail-closed errors. Legacy snapshot paths may remain only when the active rollout policy says a queue/path is not SQL/projection backed yet.

Rationale: silent fallback hides performance regressions and stale data. This project already has hidden fallback checks and queue projection readiness semantics; the change should strengthen that discipline.

Alternative considered: retain fallback during migration for safety. Rejected for active hot paths because it prevents verifying SQL dividend and can mask source-existence or projection bugs.

### Decision 3: Move NeuralRoam card facts behind a graph/card-universe Interface

NeuralRoam may continue querying SiYuan `blocks`, refs, document tree, and backlinks for graph structure, but concept-card identity, card type, priority, and active-source card facts should come from the SQL card universe when available.

Rationale: SiYuan `fsrs_cards` is a legacy external table assumption. SiYuanMemo's own card universe now lives in local SQLite and backend worker storage.

Alternative considered: keep `fsrs_cards` as a fallback for NeuralRoam. Rejected for active runtime because it creates two card universes with different semantics.

### Decision 4: Migrate mutation ownership by slices

Review-facing card mutations should move toward a SQL-first persistence Module in slices: first isolate the Interface, then move specific mutation callers, then invalidate/patch queue projection from the same commit result.

Rationale: mutation ownership affects Review Transaction Safety Envelope, rollback, queue projection, and sync metadata. A staged approach lowers risk while still improving locality.

Alternative considered: flip all writes to SQL in one task. Rejected because `UnifiedStorageManager` still owns important migration and Xiuyuan interactions.

### Decision 5: Keep Xiuyuan domain model, replace persistence adapter gradually

ADR-004 remains accepted: Xiuyuan is the card source abstraction. This change does not redesign Xiuyuan; it adds SQL-first adapters for repository reads and sync change application where SQL can preserve the same aggregate semantics.

Rationale: performance improves when `findById`, `findByBlockId`, `findAll`, and sync changes can use indexed rows, but the Xiuyuan domain model and metadata semantics must remain stable.

Alternative considered: replace Xiuyuan aggregate storage entirely in one phase. Rejected because Xiuyuan sync, Riff imports, tombstones, logical keys, and block attrs need narrower migration proof.

## Risks / Trade-offs

- SQL/projection behavior may initially duplicate logic from existing snapshot paths -> mitigate by extracting tests from current behavior before replacing callers.
- Fail-closed paths can surface unavailable errors users did not see before -> mitigate with precise diagnostics and only enforcing fail-closed where SQL/projection is declared required.
- `ApplicationContext` wiring may become a large merge-risk hotspot -> mitigate by introducing small factory Modules and changing one wiring slice per phase.
- Xiuyuan migration can corrupt card-source relationships if rushed -> mitigate by keeping ADR-004 invariants as tests and migrating read paths before write paths.
- Browser all-row snapshots may still be needed for some UI workflows such as hierarchy or bulk operations -> mitigate by making snapshots background/materialized consumers of SQL matched IDs rather than primary query authority.

## Migration Plan

1. Add characterization tests for existing Browser SQL deck behavior, queue projection hydration, NeuralRoam card facts, review mutation projection invalidation, and Xiuyuan repository reads.
2. Introduce deep read Modules and wire Browser deck reads through them behind existing application Interfaces.
3. Introduce projection read Module and move Browser Queue View Lifecycle plus Review queue reads to that Module.
4. Introduce NeuralRoam SQL card-universe adapter and remove normal-runtime `fsrs_cards` dependency for card facts.
5. Introduce SQL-first mutation persistence slices for selected review card mutations with projection invalidation tests.
6. Introduce Xiuyuan SQL persistence adapter for reads, then sync change application once read parity is proven.
7. Update architecture/backlog docs after each implemented slice.

Rollback strategy: each phase keeps the previous Module available behind composition only until the new Interface is validated. If a phase fails validation, revert that phase's wiring while keeping characterization tests and diagnostics.

## Open Questions

- Which review mutation slice should become SQL-first first: ordinary feedback commit, postpone/advance/spread, or Browser card editor changes?
- Should Xiuyuan SQL adapter initially read only from `xiuyuans.payload_json`, or should it also derive aggregate lookup indexes from `cards.xiuyuan_id`?
- Should Browser bulk operations consume SQL matched IDs directly, or keep using background all-row snapshots with stricter size limits?
