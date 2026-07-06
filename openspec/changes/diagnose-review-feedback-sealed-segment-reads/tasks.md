## 1. Feedback Loop

- [x] 1.1 Trace active `review.session.feedback` path through session commit, `database:reviewFeedback.total`, SQLite delta append/replay/projection, and worker timing propagation.
- [x] 1.2 Reproduce or lock the sealed-segment read pattern in a focused SQLite/Review test or harness.
- [x] 1.3 Identify candidate owners for sealed reads: replay, diagnostics, projection rebuild, checkpoint recovery, transaction preflight, queue impact, or ordinary append.

## 2. Attribution Implementation

- [x] 2.1 Add compact sealed-read purpose/substep attribution at the SQLite storage owner seam.
- [x] 2.2 Propagate sealed-read attribution into `ReviewFeedbackTimingScope` and copyable `slow review.session.feedback worker-handle summary`.
- [x] 2.3 Keep open-segment `writeBinary`, manifest `writeJSON`, SQL projection effects, and sealed-segment `readBinary` separately grouped.
- [x] 2.4 Preserve fail-closed durable Review commit semantics and do not add fallback/async success behavior.

## 3. Focused Tests

- [x] 3.1 Add or extend SQLite tests proving sealed segment reads include a purpose/substep label.
- [x] 3.2 Add or extend worker transport/timing tests proving the copyable summary surfaces sealed-read attribution.
- [x] 3.3 Add regression coverage that ordinary required append writes remain classified separately from sealed reads.

## 4. Docs And Decision Capture

- [x] 4.1 Update `ARCHITECTURE.md` only if tracing changes Review/SQLite ownership understanding.
- [x] 4.2 Update `docs/DDD_RESCAN_BACKLOG.md` with the classified root cause and any deferred optimization.
- [x] 4.3 If tracing proves an immediate tiny safe optimization, document why it preserves durability; otherwise defer optimization to a follow-up change.

## 5. Validation

- [x] 5.1 Run focused SQLite/Review feedback attribution tests.
- [x] 5.2 Run affected worker timing/transport tests.
- [x] 5.3 Run `pnpm run check:boundaries`.
- [x] 5.4 Run `pnpm build`.
- [x] 5.5 Run `openspec validate diagnose-review-feedback-sealed-segment-reads --strict`.
