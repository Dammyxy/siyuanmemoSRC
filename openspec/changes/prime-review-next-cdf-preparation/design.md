## Context

`UnifiedQueueStrategy` owns Review Current Item preparation. It already refreshes CDF live relation state before exposing a Review card and caches the resulting evidence by card identity plus CDF-relevant metadata signature.

Live logs show that ordinary rating still blocks on preparing the next card. That means the Module is deep enough to own the fix, but the current implementation only caches evidence after the next card has already entered the visible rating path.

## Decision

Extend the worker Review session state interface with a bounded one-card `lookaheadCards` window, then extract Review CDF Preparation Evidence into `ReviewCdfPreparationEvidenceStore`.

When a runtime-backed Review card becomes current, the strategy inspects the session runtime's next card and asks the store to start CDF preparation evidence in the background. For worker-backed sessions, the next-card candidate comes from backend-owned Review Session Cursor state, not from UI projection rereads or frontend guessing. Later, when `review.session.feedback` returns that same next card, `prepareSelectedReviewCard()` consumes matching evidence from the store instead of starting a full `refresh-cdf-live-relation` on the visible consume-advance path.

The store owns completed evidence, pending evidence, pending promise settlement, cache invalidation diagnostics, `card-updated` slot-level invalidation, and the ordering rule that preserves the first self-issued pending update caused by CDF refresh metadata persistence. `UnifiedQueueStrategy` remains the adapter at the seam: it supplies the evidence key, identity matcher, current-card id, and preparation callback, but no longer owns the evidence lifecycle state directly.

## Alternatives Considered

- Frontend-only next-card inference: rejected because worker-backed Review sessions keep queue membership and next-card choice behind the backend Review Session Cursor seam.
- Session Read Model / prepared-card window: deferred because a one-card lookahead gives the needed interface depth without moving CDF refresh ownership into the backend.
- Moving CDF refresh into the backend worker: rejected for this change because the CDF source loader is still host/UI-side and changing that ownership would cross a larger Seam.
- Skipping CDF refresh after rating: rejected because CDF blocking and duplicate outcomes remain correctness gates.
- Adding another invalidation guard directly in `UnifiedQueueStrategy`: rejected because the bug is lifecycle ownership, not a missing conditional. Keeping pending/completed evidence, event ordering, and diagnostics in the queue strategy would leave a shallow Module with low locality.

## Safety

- Evidence is keyed by card id, block id, source metadata, live relation metadata, field mapping, face key, and updatedAt.
- Lookahead is bounded to one cloned card and does not advance session state.
- Queue reload, session restore, full refresh, card-created, and card-deleted events clear CDF preparation evidence. Ordinary delayed `queue-changed` events preserve CDF preparation evidence because they invalidate queue cursor state, not the already-keyed CDF preparation identity. Identity-matching `card-updated` events invalidate only the affected evidence slot: completed prepared evidence or pending prime evidence, not both unless both identities match.
- The first matching `card-updated` for pending evidence is preserved as the CDF refresh's own metadata write; a second matching pending update invalidates the pending evidence and falls back to the normal visible refresh.
- Pending evidence failures are logged and cleared; the visible path then runs the normal full refresh.
- Duplicate outcomes still call the existing noncanonical-current-card exit path.
