## Why

Review dialogs can open successfully while the backend queue projection is still refreshing after storage repair or restart. Initial Review counter reads currently fall through to the stale projection path and surface `QUEUE_COUNT_UNAVAILABLE`, even though the SRS v2 session queue already has an authoritative live-card source.

## What Changes

- Route initial Review counter/stat reads for SRS v2 queues through the session runtime before touching projection counters.
- Cover both SRS v2 Review queues: `incremental-learning` and `retrieval-practice`.
- Keep projection counter failures fail-closed for non-session-backed queues and actual projection-owned reads.
- Record the live storage cleanup follow-up separately from the counter fix so storage normalization persistence remains visible.

## Capabilities

### New Capabilities
- `review-session-counter-readiness`: Review session counters remain available during backend projection refresh.

### Modified Capabilities

## Impact

- `src/application/adapters/UnifiedQueueStrategy.ts`
- `src/application/adapters/review-session/*`
- Focused Review queue strategy/runtime tests
