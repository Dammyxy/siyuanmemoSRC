## Why

Live storage recovery incidents can leave the backend in `read-only-recovery-required` while the Review surface still admits a local queue state and lets users attempt rating. That experience is misleading: Review feedback is inherently a write, so recovery-required storage must block Review instead of presenting a pseudo-review mode that fails after the user answers.

## What Changes

- Remove the Review admission path that turns non-writable startup readiness into a `read-only-recovery-queue-state` ticket.
- Keep Browser/count read surfaces content-safe during recovery, but label them as recovery inspection instead of normal review readiness.
- Make Review entry fail early with a clear recovery-required error when startup writes are disabled.
- Update tests that currently expect read-only recovery Review sessions to instead expect Review admission rejection.
- Preserve the worker fail-closed write gate; this change removes misleading Review UX, not storage integrity protection.

## Capabilities

### New Capabilities
- `review-recovery-write-blocking`: Review surfaces must block feedback-capable sessions while storage recovery disables formal writes.

### Modified Capabilities
None.

## Impact

- Affected application path: `ReviewAdmissionModule`, `UnifiedQueueStrategy`, Review session entry tests, and Browser recovery read-model tests where they imply Review admission.
- Affected worker path: no storage write-gate removal; only expectations around recovery capability exposure may be tightened.
- No dependency changes, no scheduler algorithm change, no local/renderer fallback, and no attempt to make read-only ratings durable.
