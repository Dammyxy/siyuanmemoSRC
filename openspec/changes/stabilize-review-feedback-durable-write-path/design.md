## Context

Current SiYuanMemo Review feedback runs inside the backend worker with `sql.js` in-memory SQLite. Mutating transactions commit in memory first, then persist through `sqlite-delta/v2` MessagePack delta segments or a full `siyuanmemo.db` checkpoint. This simulates part of native SQLite WAL behavior, but it does not have native SQLite page ownership, WAL files, or file locks because the plugin writes through SiYuan storage host effects.

The live failure is an open delta segment checksum mismatch. The dangerous path is not the initial detection; it is the follow-up recovery loop: transaction persist fails, restore reads the last full database, pending deltas replay, and the same corrupt open segment can be replayed again. That turns one corrupt segment into repeated slow `review.feedback` failures.

Anki's durable Review path is smaller: answer card runs in one native SQLite transaction, writes the current card state and append-only revlog evidence, then updates derived queues/read models from that transaction. Incrementum also uses native SQLite WAL/sqlx rather than exporting an in-memory database plus custom delta segments. SiYuanMemo cannot get native WAL inside the current pure plugin worker, but it can make the custom delta layer fail fast and reduce what ordinary Review commits must synchronously persist.

## Goals / Non-Goals

**Goals:**

- Stop corrupt open delta segments from causing repeated slow restore/replay loops.
- Make corrupt-delta outcomes explicit: repaired by full checkpoint, or failed fast as repair-required/unavailable.
- Keep ordinary formal `review.feedback` durability focused on minimum authoritative data: card scheduler/current state, append-only review fact/event, and idempotency identity.
- Move derived projection maintenance and truth flush work out of the ordinary answer-to-next critical path while preserving explicit pending/failed diagnostics.
- Preserve backend worker / writer relay ownership of SQLite mutation.

**Non-Goals:**

- No native SQLite/WAL migration in this change.
- No new external database service, cloud sync service, or kernel-side database writer.
- No hidden fallback to stale snapshots or local UI writes.
- No broad redesign of all Card CRUD, Xiuyuan, Progressive, Browser, or sync-ledger mutation paths.

## Decisions

### Decision 1: Treat open segment checksum mismatch as a repair boundary

When the delta layer detects checksum mismatch for `sqlite-delta/v2/sqlite-delta-log.v2.open.msgpack`, it must mark that segment corrupt and prevent later restore/replay from reading it again in the same recovery attempt. If a full checkpoint can be written from a proven current in-memory database, the checkpoint clears pending delta metadata and quarantines/deletes the corrupt open segment. If the current in-memory database cannot be trusted or the checkpoint write fails, the system returns an explicit repair-required/unavailable error.

Alternative considered: keep replaying pending deltas and rely on the existing restore path. Rejected because the live log shows this creates 30-40s `review.feedback` stalls and still fails.

### Decision 2: Full checkpoint is the P0 repair, not a new fallback success path

The repair checkpoint is allowed only after the SQL transaction has committed in memory and the database instance represents the intended durable state. It must be recorded in diagnostics as a checkpoint repair caused by corrupt delta, not silently counted as a normal delta append. If checkpoint repair is not proven, the commit remains failed.

Alternative considered: discard the corrupt segment and continue with the previous full database. Rejected because that can lose the just-committed Review answer without making the loss explicit.

### Decision 3: Ordinary Review feedback synchronously persists only minimum authoritative facts

The P1 hot path must block on exactly the data needed to prove the formal Review commit: scheduler/card state, append-only review fact/event, and commit idempotency identity. Queue projection patch/rebuild, Browser projection refresh, truth flush, and full checkpoint maintenance return explicit impact states and run after the minimum commit or on restart reconciliation.

Alternative considered: keep projection and truth work in the same synchronous feedback operation. Rejected because these are derived or secondary durability surfaces and make one answer depend on work that Anki keeps outside the minimal transaction.

### Decision 4: Idempotency remains the retry boundary

Retrying a failed or pending Review feedback uses the existing idempotency key. If the minimum durable commit already exists, retry returns the existing committed evidence without inserting a duplicate review event or reapplying scheduler mutation.

Alternative considered: generate a new event on retry. Rejected because duplicate formal review facts break stats, scheduling evidence, and cross-device merge semantics.

### Decision 5: Native WAL remains a future storage-topology change

This change documents native SQLite/WAL as a future P2 option, but it does not introduce a native DB owner. The current implementation remains compatible with the SiYuan plugin environment by hardening the custom delta/checkpoint layer and slimming the Review hot path.

Alternative considered: jump directly to native SQLite. Rejected for this change because it requires desktop/mobile distribution, ownership, migration, sync conflict, and repair semantics beyond the current Review failure.

## Risks / Trade-offs

- [Risk] Checkpoint repair after a corrupt delta may hide data loss if the in-memory DB is not proven current. -> Mitigation: only repair from the post-commit in-memory DB for the current transaction; otherwise return repair-required.
- [Risk] Derived projection deferral could show stale queue counts briefly. -> Mitigation: report stale/deferred/refresh-required impact and rely on journal projection reconciliation after durable evidence exists.
- [Risk] Corrupt-segment quarantine can leave extra files. -> Mitigation: keep bounded cleanup diagnostics and clear quarantined files after a successful durable checkpoint.
- [Risk] P1 narrowing may miss a currently implicit write side effect. -> Mitigation: add focused tests proving review event, scheduler state, idempotency, projection impact, and truth flush diagnostics separately.
- [Risk] Existing dirty worktree changes overlap. -> Mitigation: implement in the active worktree only, preserve unrelated diffs, and keep patches scoped to persistence/review feedback files.

## Migration Plan

1. Add focused failing tests for corrupt open segment handling during `review.feedback` and startup/reload replay.
2. Implement corrupt open-segment classification, quarantine/delete, checkpoint repair, and fast repair-required failure.
3. Add Review feedback minimum durable commit diagnostics and tests.
4. Move or confirm queue projection/truth/full checkpoint work returns deferred or post-commit diagnostics rather than blocking ordinary Review answer advancement.
5. Update architecture/backlog docs for remaining native WAL and broader storage-topology debt.

Rollback: disable or revert the corrupt-delta repair branch and return to explicit repair-required on checksum mismatch. Do not reintroduce hidden stale snapshot fallback or UI-local Review writes.

## Open Questions

- Should the corrupt open segment be deleted immediately after successful checkpoint, or renamed/quarantined for diagnostics first?
- What exact latency budget should fail the corrupt-delta regression test: 1s, 2s, or a deterministic "no restore replay of corrupt path" assertion?
- Should the first P1 slice include truth flush scheduling changes, or only prove truth flush no longer blocks ordinary feedback once the minimum durable commit is proven?
