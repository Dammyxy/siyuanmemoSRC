## 1. Feedback Loop

- [x] 1.1 Locate Review scoring logs from renderer, client, worker, kernel, scheduler, SQLite, queue-impact, and Browser warmup.
- [x] 1.2 Add or update focused tests proving diagnostics remain available at trace level.

## 2. Log Policy Cleanup

- [x] 2.1 Move per-step Review feedback timings to trace while preserving timing capture.
- [x] 2.2 Keep one copyable worker-handle summary at info for slow Review answers, plus one conditional frontend summary while investigating next-card preparation latency.
- [x] 2.3 Move normal scheduler decisions, SQLite commits, and Browser warmup deferrals to trace.

## 3. Validation And Debt Ledger

- [x] 3.1 Run focused Review feedback / Browser warmup tests.
- [ ] 3.2 Run `node scripts/check-hidden-fallbacks.cjs`.
- [ ] 3.3 Run `pnpm run check:boundaries`.
- [ ] 3.4 Run `pnpm build`.
- [ ] 3.5 Run `openspec validate reduce-review-feedback-log-noise --strict`.
- [x] 3.6 Update `docs/DDD_RESCAN_BACKLOG.md`.
