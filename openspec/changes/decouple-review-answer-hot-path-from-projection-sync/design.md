## Context

Current Review answer flow waits for `queue.onFeedback()` before the UI assigns the next card. That call may perform transaction capture, backend `review.feedback`, durable journal work, scheduler commit, SQL card update, queue projection delta/rebuild, domain sync pre-request merge, and storage canonicalization before the Review session can advance.

Reference implementations point at a simpler shape:

- SM-15 keeps an in-memory due queue and moves the answered item out/reinserted after updating it.
- Anki keeps `CardQueues` in memory for study; answer persistence runs through the backend, then the reviewer advances from queued cards.
- Incrementum updates the answered item, removes it from the current UI list, and lets broader queue reload happen separately.

SiYuanMemo should keep SQL/projection ownership, but assign direct review switching authority to one session frontier Module. Projection remains a read model for session start, Browser, counts, warmup, and reconciliation, not the per-answer next-card authority.

## Goals / Non-Goals

**Goals:**

- Make `currentCard + rating -> nextCard` a small, bounded, low-latency Interface.
- Let Review UI switch from a session frontier without waiting for full projection maintenance, domain sync merge, or canonical repair.
- Preserve durable/idempotent review commits and review event truth.
- Preserve queue projection as a SQL-backed read model with explicit stale/deferred/refresh-required states.
- Preserve fail-closed semantics for real current-card conflicts and commit failures.
- Split diagnostics into UI switch time, commit time, projection maintenance time, sync time, and repair time.
- Cover the full architecture change in one OpenSpec change so context is not lost between agents.

**Non-Goals:**

- No scheduler algorithm rewrite.
- No fallback to legacy snapshot storage, direct UI SQL, or follower-local writer bypass.
- No hidden best-effort path that silently swaps authorities.
- No broad storage rewrite beyond removing review answer hot-path repair/sync coupling.
- No guarantee that Browser/count projection is immediately current after every answer; explicit eventual consistency is acceptable.

## Decisions

1. Session frontier owns immediate Review advancement.

   `ReviewSessionRuntime` becomes the deep Module for answer switching. Its Interface returns `{ nextCard, counterSnapshot, commitStatus }` from an in-memory/frontier model and hides queue rotation details. `UnifiedQueueStrategy` becomes thinner: it adapts Review UI commands to the runtime and no longer requires projection mutation before returning next card.

   Alternatives considered:

   - Keep projection as next-card authority. Rejected because live logs show projection/sync/storage work can block switching by seconds.
   - Requery the queue after each answer. Rejected because it repeats the slowest path and makes Review dependent on global storage health.

2. Durable commit is asynchronous from UI switching but still explicit and idempotent.

   Answer submission enqueues a commit record with card id, rating, reviewedAt, queue type, session id, and idempotency key. The UI can advance immediately after the session frontier accepts the answer. The commit queue persists the scheduler result/review event through writer/backend authority and exposes pending/failed/applied state back to the session.

   Alternatives considered:

   - Fire-and-forget without status. Rejected because failed commits would become hidden data loss.
   - Keep blocking commit as the only safe path. Rejected because Review UI speed becomes coupled to all backend maintenance.

3. Projection maintenance is out-of-band.

   Backend review commit returns enough evidence to hot-patch or schedule projection maintenance, but Review switching does not wait for projection rows to be rebuilt. Projection can be `patched`, `deferred`, `refresh-required`, or `stale`; consumers must handle those states explicitly.

   Alternatives considered:

   - Transactionally rebuild projection rows for SRS queues on every answer. Rejected because `readRows(limit: 5000)`, source-card reads, build rows, and apply delta are too much work for every click.
   - Disable projection entirely. Rejected because Browser/count/session start still benefit from a read model.

4. Domain sync and canonical repair move off the per-answer path.

   Ordinary `review.feedback` must not trigger pre-request full merge, full canonicalization, Xiuyuan binding repair, or dirty snapshot save. Session start, idle background tasks, explicit repair commands, and sync diagnostics own that work. Only a proven current-card conflict may block commit.

   Alternatives considered:

   - Keep pre-request merge for all backend RPC calls. Rejected because divergent sync state made first feedback spend seconds in merge before answering.
   - Ignore divergence completely. Rejected because conflict evidence still matters for correctness.

5. Failure states are visible, not fallback.

   Review UI/session exposes `commit-pending`, `commit-failed`, `projection-stale`, `sync-divergent`, and `repair-required` as typed states/diagnostics. It does not silently switch to legacy reads, stale snapshot reads, or a second queue authority.

## Risks / Trade-offs

- [Risk] User sees next card before durable commit finishes -> Mitigation: commit queue keeps pending status, idempotency keys, retry/rollback policy, and visible diagnostics.
- [Risk] Projection counts lag during fast review -> Mitigation: session counters update locally; projection counters report stale/deferred until maintenance catches up.
- [Risk] Commit failure after UI advanced creates user trust issue -> Mitigation: session history records pending commit; failure marks affected card/session and offers explicit retry/repair instead of silent success.
- [Risk] Current card conflict is discovered late -> Mitigation: keep a narrow current-card conflict gate before durable commit, not a whole-database merge gate.
- [Risk] More asynchronous states add complexity -> Mitigation: concentrate them behind `ReviewSessionRuntime` and one commit queue Interface, not scattered across UI callers.

## Migration Plan

1. Add tests that reproduce slow worker/slow projection while asserting UI advancement does not wait.
2. Introduce session frontier state and make rate/skip/custom advancement consume it.
3. Add async durable commit queue and typed commit states.
4. Split worker review commit from projection maintenance and return deferred/hot-patch diagnostics.
5. Gate domain sync/canonical repair out of ordinary per-answer RPCs.
6. Update architecture/backlog docs and diagnostics.
7. Run targeted review/worker/projection/storage tests, `pnpm run check:boundaries`, and `pnpm build`.

Rollback strategy: keep old code reachable only through tests during implementation; do not ship a runtime fallback toggle. If the new path fails validation, revert the change before release rather than keeping dual authorities.

## Open Questions

- Should commit failure roll the UI back to the answered card, or keep session advanced and surface a retry badge? Recommended default: keep advanced, mark commit failed, offer retry/repair.
- What budget should fail CI for review UI switch? Recommended target: p95 under 150 ms with a deliberately delayed worker commit.
- Which projection consumers require immediate counters? Recommended default: Review session local counters immediately, Browser/projection counters explicitly stale/deferred.
