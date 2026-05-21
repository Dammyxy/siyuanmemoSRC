## 1. Baseline Characterization

- [x] 1.1 Add or update Browser deck tests proving SQL page, matched IDs, row hydration order, stats, and source-existence semantics.
- [x] 1.2 Add or update queue projection tests proving readiness, snapshot rows, row hydration, counters, and incomplete hydration fail-closed behavior.
- [x] 1.3 Add or update NeuralRoam tests proving concept-card identity and priority can be resolved without SiYuan `fsrs_cards`.
- [ ] 1.4 Add or update review mutation tests around projection invalidation or patch results for the first selected SQL-first mutation slice.
- [ ] 1.5 Add or update Xiuyuan repository tests for read parity by ID, block ID, and aggregate invariants.

## 2. Browser Card Universe

- [x] 2.1 Introduce a deep Browser card-universe read Module that owns SQL expressibility, page reads, matched IDs, row hydration, stats, source-existence filtering, and unavailable diagnostics.
- [x] 2.2 Wire `BrowserApplicationService` deck paths through the new Module while preserving existing application Interface methods.
- [x] 2.3 Move Browser datasource/query-session callers to consume the SQL-first behavior without encoding fallback or full-snapshot rules.
- [x] 2.4 Update Browser tests to assert active SQL-first paths do not scan all cards for normal page and hydrate requests.

## 3. Queue Projection Runtime

- [x] 3.1 Introduce a queue projection read Module that owns Queue Projection Readiness, projection identity, rows, cards, counters, and refresh-required/unavailable results.
- [x] 3.2 Wire `UnifiedDataSourceManager` and `BaseReviewQueue` projection reads through the new Module.
- [x] 3.3 Update Browser Queue View Lifecycle to consume readiness and attach datasource decisions without duplicating projection state logic.
- [x] 3.4 Update Review queue tests to prove projection-backed queues fail closed on missing rows/cards and local queue reads remain explicit diagnostics.

## 4. NeuralRoam SQL Card Facts

- [x] 4.1 Introduce a NeuralRoam card-facts Module backed by the SQL card universe for concept identity, card type, priority, active-source state, and card ID lookup.
- [x] 4.2 Wire `QueryEngine` and `NeuralGraphProvider` so SiYuan block/ref APIs provide graph structure while SQL provides SiYuanMemo card facts.
- [x] 4.3 Remove normal-runtime `fsrs_cards` card-fact dependency from NeuralRoam and keep any legacy behavior only behind explicit migration/test fixtures.
- [x] 4.4 Update NeuralRoam tests to prove missing SQL card facts are not replaced by legacy table facts.

## 5. Review Mutation Persistence

- [ ] 5.1 Select the first SQL-first review mutation slice and document why it is safe to migrate first.
- [ ] 5.2 Introduce a review card-mutation persistence Module that commits SQL card state and returns sync/projection impact.
- [ ] 5.3 Wire the selected mutation slice through the SQL-first Module without bypassing Review Transaction Safety Envelope.
- [ ] 5.4 Update mutation and projection tests to prove persistence failure restores visible Review session state and does not leave hidden partial success.

## 6. Xiuyuan SQL Persistence

- [ ] 6.1 Introduce a Xiuyuan SQL persistence adapter for read paths that preserves ADR-004 aggregate semantics.
- [ ] 6.2 Wire `XiuyuanRepository` read methods by ID and block ID to SQL-first adapter where available without full store scans.
- [ ] 6.3 Add indexed lookup support needed for `findAll` or document why `findAll` remains out of scope for this phase.
- [ ] 6.4 Add parity tests proving loaded Xiuyuan aggregates preserve faces, card IDs, template ID, block IDs, ownership metadata, and scheduling links.

## 7. Fallback Discipline And Documentation

- [ ] 7.1 Replace hidden fallback behavior in migrated active paths with explicit unsupported, refresh-required, or unavailable diagnostics.
- [ ] 7.2 Update hidden-fallback checks if new diagnostics or allowed migration/recovery paths need allowlist changes.
- [x] 7.3 Update `ARCHITECTURE.md` with SQL-first card runtime ownership and active path diagrams.
- [x] 7.4 Update `docs/DDD_RESCAN_BACKLOG.md` with completed slices and any deliberately deferred debt.

## 8. Validation

- [ ] 8.1 Run targeted Browser, queue projection, NeuralRoam, review mutation, Xiuyuan, and SQL repository tests for changed slices.
- [x] 8.2 Run `node scripts/check-hidden-fallbacks.cjs`.
- [x] 8.3 Run `pnpm run check:boundaries`.
- [x] 8.4 Run `pnpm build`.
- [ ] 8.5 Record any non-blocking build warnings and remaining deferred SQL-first work in the final handoff.
