# ADR-005 Browser Read Model Contract

- Series: Runtime Architecture
- Status: Accepted
- Date: 2026-06-02
- Registry: [Architecture Decision Registry](./ADR-INDEX.md)

## Context

Browser reads were becoming too dependent on datasource-specific paths: deck page, queue
snapshot, advanced Siyuan SQL, full-universe matched ids, source-existence patching, and
queue projection readiness each had their own UI-facing shape. Compared with Anki's
browser flow, where search resolves ids and table rows are hydrated by id, this made the
SiYuanMemo Browser harder to reason about and easier to slow down.

Current storage slimming ownership is:

- MessagePack truth segments own canonical card/review/source facts.
- `siyuanmemo.db` owns SQL projection/index/read-model rows derived from truth.
- SQL `payload_json` / `dto_json` are compatibility/import/read inputs, not long-term
  canonical truth.

The Browser needs a shorter UI-facing contract without moving truth ownership back into
SQL or letting UI datasources repair projections locally.

## Decision

Browser UI reads through one application-owned read model contract. Deck, queue, and
advanced SQL are query sources, not separate UI data flows.

Target UI-facing operations:

1. `page(query, range)` returns visible skinny rows, total, `queryFingerprint`,
   `generation`, and `readOwner`.
2. `matchedIds(query)` returns all matching ids only for explicit full-universe actions
   such as all-select, export, diagnostics, or bulk operations.
3. `rowsByIds(ids)` returns skinny/hydrated browser rows for the requested ids.
4. `actionTargetsByIds(ids)` returns command targets at action time.
5. `documentCounts(scope)` and source-existence updates are asynchronous supplements, not
   first-page blockers.

The hot path is:

```text
Browser UI
-> BrowserReadModel.page(query, range)
-> SQL skinny browser rows or queue projection snapshot
-> visible rows
```

The hot path must not inline-read MessagePack truth to repair a missing or stale row. If
the SQL skinny row or queue projection is missing, stale, or invalid, the read model
returns explicit `preparing`, `repair-required`, or `unavailable` state and schedules
bounded background rebuild/repair through the owning application/backend path.

Advanced Siyuan SQL remains an advanced query source only:

```text
advanced SQL
-> blockIds/cardIds
-> same BrowserReadModel rowsByIds/page-from-ids path
```

UI datasources must not directly run Siyuan SQL and then hydrate Browser rows.

FilterGroup is projection-backed only after the filter policy is submitted. The submitted
projection identity includes at least `filterHash`, manual cards, temporary blacklist,
custom order, transfer/session identity, and commit policy. Editing or previewing filter
forms is an ephemeral query and must not write queue projection identity, change an active
review session, or rebuild the submitted FilterGroup projection.

Bulk actions re-resolve targets at action time:

```text
bulk action
-> current queryFingerprint/generation
-> matchedIds(query)
-> actionTargetsByIds(ids)
-> command
```

Responses carrying stale `queryFingerprint`, `generation`, or `readOwner` are discarded by
the UI. Counts, source-existence patches, and document counts may arrive later, but cannot
overwrite newer Browser state.

## Consequences

Positive:

- Browser open can render the active view's first page without all-queue preload, full
  matched-id scans, blocking counts, or full card payload parsing.
- Queue views have explicit `ready`, `preparing`, `repair-required`, and `unavailable`
  states instead of hidden fallback to local `queue.getCards()`.
- Deck, queue, and advanced SQL paths converge before row rendering, matching the Anki
  shape more closely.
- MessagePack truth remains canonical while SQL stays a derived read model.

Costs:

- The SQL browser projection must contain enough skinny row fields for first-page table
  rendering.
- Missing or stale projections may show `preparing` instead of silently repairing inline.
- Bulk actions need an extra action-time target resolution step.
- Existing UI datasource fallbacks and direct SQL reads need phased removal.

## Follow-up Implementation Order

1. Define the application `BrowserReadModel` contract and response metadata.
2. Move deck page reads to skinny SQL browser rows instead of parsing full
   `payload_json` / `dto_json`.
3. Convert advanced SQL into an application query source that returns ids.
4. Switch submitted FilterGroup queues to projection-backed reads with full policy
   identity.
5. Remove hidden UI fallback paths to local queue scans, direct SQL hydrate, or full
   payload parsing on the Browser page hot path.
6. Add tests for `queryFingerprint`, `generation`, `readOwner`, action-time
   `matchedIds`, projection cold states, and stale async result rejection.

## Related Documents

- `ARCHITECTURE.md`
- `docs/ADR-004-no-ui-sql.md`
