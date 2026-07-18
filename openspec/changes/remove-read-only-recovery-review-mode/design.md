## Context

Startup storage recovery can mark the backend as non-writable while projections and local queue caches remain readable. The current Review path treats that as an alternate `read-only-recovery-queue-state`, which lets the user enter a Review session even though feedback cannot be persisted. Worker-side `assertFormalWritesAvailable()` is the correct data-integrity gate and must stay in place; the problem is the application layer presenting a feedback-capable Review experience in a state where Review writes are disabled.

## Goals / Non-Goals

**Goals:**
- Block Review admission before a feedback-capable session is created when startup writes are not capable.
- Preserve Browser and queue-count inspection during storage recovery where it is explicitly read-only and non-feedback.
- Keep the worker fail-closed write gate unchanged.
- Make tests assert clear recovery-required blocking instead of local read-only Review success.

**Non-Goals:**
- No queued/offline Review feedback journal for recovery-required storage.
- No checksum bypass, sealed segment replay relaxation, or storage recovery redesign.
- No removal of Browser recovery inspection paths that do not accept Review feedback.
- No UI styling overhaul beyond the existing error propagation surface.

## Decisions

1. Review admission rejects non-writable startup readiness.
   - Rationale: Review feedback is a write, so a Review session that can show rating buttons must not be admitted while `isStartupWriteCapable()` is false.
   - The client records the latest complete `db.load` / `db.reload` readiness disposition; verified truth identity alone cannot make `isStartupWriteCapable()` true when storage recovery disables writes.
   - Alternative considered: keep read-only Review and disable buttons later. Rejected because it still creates a misleading session state and leaves multiple entrypoints to police.

2. Browser recovery reads remain explicit inspection paths.
   - Rationale: The user still benefits from seeing cards/counts while deciding how to repair storage. These reads must not be represented as Review readiness.
   - Alternative considered: remove all read-only recovery reads. Rejected because it would hide useful recovery evidence and regress Browser diagnostics.

3. `UnifiedQueueStrategy` no longer advances Review from `getReadOnlyRecoveryCards()`.
   - Rationale: The strategy is a feedback-capable Review adapter. Its recovery path should fail if a caller tries to use it without a valid Review admission ticket.
   - Alternative considered: keep counters only. Rejected for Review because Browser already owns non-feedback counters.

4. Tests move from "read-only Review works" to "Review is blocked, Browser inspection works".
   - Rationale: The executable contract should match the product semantics users expect.

## Risks / Trade-offs

- [Risk] Blocking Review may feel harsher during recovery. -> Mitigation: Browser/count inspection remains available and the error reason points at storage recovery.
- [Risk] Existing tests may encode read-only Review in several layers. -> Mitigation: update the application tests closest to admission/strategy and keep worker storage tests focused on write gates.
- [Risk] Removing local Review fallback could expose missing recovery messaging in UI. -> Mitigation: propagate a specific `REVIEW_ADMISSION_UNAVAILABLE` / recovery-required message for existing dialog error handling.
