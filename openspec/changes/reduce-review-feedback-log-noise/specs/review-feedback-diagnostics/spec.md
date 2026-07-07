## ADDED Requirements

### Requirement: Review feedback emits bounded normal diagnostics
The system SHALL avoid emitting per-step normal-path Review feedback diagnostics at `info` level. Ordinary successful Review scoring MUST expose bounded copyable slow summaries at `info` level for a slow answer, while inner renderer/client/worker/kernel/transaction/queue-impact timing steps remain available at trace level.

#### Scenario: Slow answer keeps bounded copyable summaries
- **WHEN** a Review answer is slow enough to require copyable diagnostics
- **THEN** the worker-handle summary MAY be emitted at `info` level with dominant step, pre-merge, main DB, host-effect, and top inner-step evidence
- **AND** the frontend feedback summary MAY be emitted at `info` level with dominant renderer-side feedback step evidence
- **AND** individual inner steps MUST NOT each emit separate `info` logs

#### Scenario: Inner steps remain traceable
- **WHEN** Review feedback step timing is captured in renderer, client, worker, kernel, transaction, or queue-impact code
- **THEN** those inner step diagnostics SHALL remain available through trace-level logging or structured timing records

### Requirement: Normal derived work stays below info level
The system SHALL treat expected derived work during active Review pressure as trace-level diagnostics unless it fails or blocks the visible Review answer.

#### Scenario: Browser warmup defers under Review pressure
- **WHEN** Browser queue projection warmup is deferred because Review is active
- **THEN** the deferral SHALL be trace-level diagnostic output, not an `info` log

#### Scenario: Scheduler and SQLite normal success
- **WHEN** scheduler answer calculation or SQLite transaction commit succeeds normally
- **THEN** the success diagnostic SHALL be trace-level output, not normal console noise
