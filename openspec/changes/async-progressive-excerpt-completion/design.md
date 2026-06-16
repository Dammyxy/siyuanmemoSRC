## Context

The foreground excerpt path has become too broad: it creates the excerpt entity, records lineage, creates a Topic card, persists Xiuyuan/card state, and registers the block in native Riff before returning. The user-facing operation only needs the excerpt entity and record to be durable.

## Goals / Non-Goals

**Goals:**
- Make excerpt creation return after excerpt entity and `ExcerptRecord` are durable.
- Add `ProgressiveExcerptCompletionService` for background Topic card completion.
- Store minimal completion state in `ExcerptRecord`.
- Recover incomplete completion through capped repair after startup and callable scoped repair APIs.
- Keep completion idempotent when the Topic card already exists.

**Non-Goals:**
- Do not redesign Riff semantics in this change.
- Do not add Browser/Review UI retry buttons.
- Do not trigger repair from transactions.
- Do not add a new persistent pending-job database.
- Do not change scheduler, review feedback, writer relay, kernel companion, or AI workbench behavior.

## Decisions

1. Foreground success means excerpt entity + record.
   - Rationale: users asked for faster excerpt success; card/Riff persistence is secondary completion work.

2. Store completion state on `ExcerptRecord`.
   - Fields: `completionStatus`, `topicCardId`, `completionError`.
   - Rationale: record is source of truth across reloads; in-memory task is only an execution dedupe.

3. Default old records to completed.
   - Rationale: historical records were only written after synchronous Topic card completion, so repair should not scan old history.

4. Use a dedicated completion service.
   - Rationale: keeps `ProgressiveReadingService` focused on excerpt materialization and prevents the slow card path from drifting back into foreground code.

5. Repair stays capped and scoped.
   - Startup repair is delayed and capped at 20 records.
   - Scoped repair API is capped at 5 records for future Browser/Review entries.
   - Rationale: repair is a recovery tool, not a general sync daemon.

## Risks / Trade-offs

- Risk: callers expecting immediate `topicCardId` may need to tolerate it being absent. Mitigation: make `topicCardId` optional and update tests around foreground result shape.
- Risk: background failure could become invisible. Mitigation: store latest error on the record and surface the agreed failure toast for immediate creation-time background failures.
- Risk: startup repair could slow plugin boot. Mitigation: do not await repair in plugin ready flow; run delayed capped repair only.
