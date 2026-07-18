> Superseded on 2026-07-16 by `review-domain-sync-independence`: Review no longer has a repair gate or user-facing sync-conflict workflow. This design is historical only.

## Context

Live Review grading evidence now splits slow rating into two serial costs. This change targets only the worker-side cost: `review.session.feedback` currently performs repairable domain-sync `pre-request-merge` on each ordinary rating, with logs showing `preMerge=kernel:pre-request-merge ... changed=true ... sanity=repairable` and host effects under `siyuanmemo.db / sql-projection-db`.

Reference systems keep the answer path smaller:

- Anki answers a card through `answer_card`, updates card state/revlog/deck stats, and updates in-memory study queues without rebuilding global queues for every click.
- Incrementum `submit_review` reads one item, computes schedule, writes item/result/stat/session records, and leaves broader repair/sync work outside the rating click.

SiYuanMemo should preserve SQL-first truth, writer authority, sync diagnostics, and fail-closed correctness, but the Review rating hot path should not perform full repairable merge on every rating when a Review-session repair gate has already classified the session.

## Goals / Non-Goals

**Goals:**

- Make ordinary `review.session.feedback` consume a Review-session repair gate decision instead of running full domain-sync repair/merge per rating.
- Preserve fail-closed behavior for current-card conflicts, blocking divergence, unavailable diagnostics, or missing writer authority.
- Move repairable domain-sync merge/repair to explicit lifecycle points: Review open/preflight, diagnostics, user-triggered repair, idle/background maintenance, or session restart.
- Keep copyable timing diagnostics proving whether repair merge was skipped, why it was skipped, and which gate decision was used.
- Keep the Module Interface small enough to test: `current card + rating + repair gate -> commit or typed unavailable/conflict`.

**Non-Goals:**

- No scheduler algorithm rewrite.
- No CDF live relation or `consume-advance` optimization; that remains next change.
- No Session Read Model / prepared-card window; that remains conditional follow-up.
- No Browser projection warmup redesign.
- No fallback to stale snapshot storage, follower-local write, or hidden dual authority.
- No weakening of manual sync conflict repair or conflict-source immutability.

## Decisions

### Decision 1: Review rating hot path owns only rating commit, not repair

`review.session.feedback` should treat rating as a narrow command: verify session/card/idempotency, apply scheduler/review event commit, advance the session, and return next-card state. It must not run full domain-sync merge as an ordinary pre-request side effect when the active repair gate allows rating.

Alternative considered: keep `pre-request-merge` on every worker RPC. Rejected because live logs prove repairable merge dominates each rating and repeats work unrelated to the current click.

### Decision 2: Domain-sync repair gate is explicit session state

Review open or an explicit diagnostics path should classify domain-sync state into a gate decision such as `clean`, `accepted-repairable`, `blocking`, or `unavailable`. Rating RPCs consume that decision with a generation/token and fail closed if the decision is missing, stale, blocking, or unavailable.

Alternative considered: skip merge unconditionally for Review feedback. Rejected because real current-card conflicts and unavailable sync diagnostics still need typed fail-closed behavior.

### Decision 3: Repairable drift is not automatically repaired per rating

Repairable drift remains observable and actionable, but repair work belongs to manual repair, idle/background maintenance, or a Review-session preflight that happens before repeated rating clicks. The rating click should not become the repair scheduler.

Alternative considered: repair once on first rating, then skip later ratings. Rejected as too implicit; it still turns one grading click into a repair click and makes latency unpredictable.

### Decision 4: Current-card conflict remains a narrow blocking gate

If diagnostics prove the current Review card has unresolved conflicting card state or review-history divergence, rating must fail closed with a typed conflict/unavailable result. That check must be narrow: current card/session evidence only, not whole-database merge.

Alternative considered: treat all repairable drift as safe during Review. Rejected because sync correctness must still protect the exact card being rated.

### Decision 5: Diagnostics become acceptance criteria

Slow summaries should expose `preMerge=skipped reason=<repair-gate-reason>` or equivalent gate evidence for ordinary rating. If merge runs, logs must show it was caused by a blocking gate, missing gate, explicit repair command, or non-rating method.

Alternative considered: rely on tests only. Rejected because this issue was diagnosed from live latency; operators need copyable proof after rebuild/reload.

## Risks / Trade-offs

- [Risk] Repairable drift grows during long Review sessions -> Mitigation: gate decision carries generation/token and Review can surface `repair-required` outside the rating click.
- [Risk] A stale gate lets rating proceed while sync state changed -> Mitigation: gate decisions expire or fail closed when diagnostics generation changes.
- [Risk] Narrow current-card conflict detection misses a true conflict -> Mitigation: start with conservative blocking rules for current-card evidence; only skip full merge when evidence is absent and gate is valid.
- [Risk] Users see repair diagnostics while Review still rates quickly -> Mitigation: expose explicit repair state; do not hide repairability behind silent success.
- [Risk] Existing domain-sync pre-request hook is shared by many RPCs -> Mitigation: scope skip only to ordinary Review rating/session feedback with valid gate evidence; other methods keep existing behavior until separately changed.

## Migration Plan

1. Add tests that reproduce repairable domain-sync state and assert ordinary `review.session.feedback` does not call full pre-request merge when a valid repair gate allows the session.
2. Add tests for fail-closed cases: missing gate, stale gate, blocking divergence, unavailable diagnostics, and current-card conflict evidence.
3. Introduce or deepen a Review repair gate Module that owns gate decision creation/validation and exposes a small Interface to worker Review feedback.
4. Change worker pre-request handling so ordinary Review rating consumes the repair gate and records skip diagnostics instead of running full merge.
5. Preserve explicit repair/diagnostics commands that still run merge/repair outside the rating click.
6. Update docs/backlog and live diagnostics.
7. Validate with focused tests, boundary check, build, and strict OpenSpec validation.

Rollback strategy: revert this change before release if fail-closed tests or live diagnostics show uncertain repair safety. Do not ship a runtime fallback toggle or dual rating authority.

## Open Questions

- Should a Review session with `repairable` but no current-card conflict be allowed immediately after user acknowledgement, or only after a preflight repair attempt? Recommended default: allow after explicit gate acceptance, not per-rating repair.
- What is the gate expiry rule? Recommended default: expire on domain-sync diagnostics generation/source-set change or Review session restart.
- Should skipped merge diagnostics live in `BackendKernel` pre-request timing or `WorkerReviewSessionRuntime` result timing? Recommended default: `BackendKernel` owns pre-request skip evidence; Review runtime owns commit/advance timing.
