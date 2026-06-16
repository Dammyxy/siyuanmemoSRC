## 1. Characterization

- [x] 1.1 Add Progressive test proving foreground excerpt creation does not wait for Topic card completion.
- [x] 1.2 Add ExcerptRecord tests for `pending`, `completed`, `failed`, old-record default, and error clearing.

## 2. Completion Service

- [x] 2.1 Add `ProgressiveExcerptCompletionService` with in-flight dedupe by `excerptEntityId`.
- [x] 2.2 Implement idempotent completion: existing card backfills `topicCardId` and marks completed.
- [x] 2.3 Implement failed completion state when excerpt entity is unavailable or card creation fails.
- [x] 2.4 Implement capped repair ordering: newest `pending` first, then newest `failed`.

## 3. Foreground Integration

- [x] 3.1 Move excerpt Topic card creation out of `ProgressiveReadingService` foreground materialization.
- [x] 3.2 Make created excerpt results tolerate optional `topicCardId`.
- [x] 3.3 Enqueue background completion after record creation and show the agreed immediate/failure notifications.
- [x] 3.4 Wire delayed capped startup repair without blocking plugin ready.

## 4. Documentation And Verification

- [x] 4.1 Update `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md`.
- [x] 4.2 Run focused Progressive/Excerpt tests.
- [x] 4.3 Run `openspec validate async-progressive-excerpt-completion --strict`.
- [x] 4.4 Run `pnpm run check:boundaries`, hidden fallback check where relevant, `git diff --check`, and `pnpm build`.
