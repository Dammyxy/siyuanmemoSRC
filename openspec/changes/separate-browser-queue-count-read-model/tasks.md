## 1. Feedback Loop

- [x] 1.1 Add a focused regression test proving Retrieval `review.session.feedback` plus Browser count refresh does not instantiate Incremental Learning or FilterGroup queues.
- [x] 1.2 Add a focused Browser count test showing broad `refreshQueueCounts` under active Retrieval Review scopes immediate work to Retrieval.
- [x] 1.3 Add a focused test proving non-active queue counts are marked deferred/dirty and refreshed when Review pressure clears.

## 2. Review Impact Contract

- [x] 2.1 Ensure Review feedback result exposes affected queue types and active queue count/count delta evidence.
- [x] 2.2 Wire Retrieval Review feedback so Browser count patching can update Retrieval without broad count refresh.
- [x] 2.3 Keep fail-closed behavior for missing count evidence; do not add stale fallback rows.

## 3. Browser Queue Count Read Model

- [x] 3.1 Introduce a Browser Queue Count Read Model Interface for count reads that do not require full Queue Module creation.
- [x] 3.2 Back supported counts with projection/session count evidence.
- [x] 3.3 Replace `BrowserApplicationService.readSingleQueueCount -> manager.getQueue(queueType)` for supported queue types.
- [x] 3.4 Keep FilterGroup explicit: use count evidence when available; otherwise defer under active Review pressure instead of lazy-creating the queue.

## 4. Active Review Pressure Scoping

- [x] 4.1 Make active Review pressure available to Browser count refresh, not only projection warmup.
- [x] 4.2 Scope immediate count/readiness refresh to active Review queue while Review is active.
- [x] 4.3 Flush deferred non-active count/readiness work after Review pressure clears.

## 5. Docs And Validation

- [x] 5.1 Update `CONTEXT.md` if Browser Queue Count Read Model becomes a canonical domain term.
- [x] 5.2 Update `ARCHITECTURE.md` Review/Browser derived-read diagram if ownership changes.
- [x] 5.3 Update `docs/DDD_RESCAN_BACKLOG.md` with fixed/deferred debt.
- [x] 5.4 Run focused Review feedback and Browser count tests.
- [x] 5.5 Run `node scripts/check-hidden-fallbacks.cjs`.
- [x] 5.6 Run `pnpm run check:boundaries`.
- [x] 5.7 Run `pnpm build`.
- [x] 5.8 Run `openspec validate separate-browser-queue-count-read-model --strict`.
