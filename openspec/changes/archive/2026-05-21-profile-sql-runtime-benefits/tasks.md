## 1. Baseline And CLI

- [x] 1.1 Add a failing diagnostics test proving missing `--db` reports an explicit message instead of `{}`.
- [x] 1.2 Rename or extend the Browser SQL profile command into a Runtime SQL profile command while keeping Browser profile compatibility.
- [x] 1.3 Add package script coverage for the Runtime SQL profile command.

## 2. Runtime SQL Profile Module

- [x] 2.1 Deepen the profile result model to group Browser, Queue Projection, Review feedback, and Xiuyuan sections behind one diagnostic Interface.
- [x] 2.2 Add Queue Projection snapshot, rowsByIds, counter, and query-plan measurements.
- [x] 2.3 Add Review feedback rollback-only transaction cost measurement.
- [x] 2.4 Add Xiuyuan `findById` and `findByBlockId` lookup measurements plus query-plan summaries.
- [x] 2.5 Preserve in-memory row expansion and prove the supplied DB file is not modified.

## 3. Evidence And Decisions

- [x] 3.1 Run Runtime SQL profile against `phone-siyuanmemo-after-cloud-sync.db` and record measured results.
- [x] 3.2 Decide whether the profile justifies any immediate index/read Interface change.
- [x] 3.3 Record Xiuyuan `findAll()` decision as management/sync full enumeration or create follow-up task if profile/callers prove a hot path.

## 4. Validation

- [x] 4.1 Run targeted diagnostics tests for Runtime SQL profile.
- [x] 4.2 Run `node scripts/check-hidden-fallbacks.cjs`.
- [x] 4.3 Run `pnpm run check:boundaries`.
- [x] 4.4 Run `pnpm build`.
- [x] 4.5 Update `docs/DDD_RESCAN_BACKLOG.md` with completed SQL profile evidence and deferred next steps.
