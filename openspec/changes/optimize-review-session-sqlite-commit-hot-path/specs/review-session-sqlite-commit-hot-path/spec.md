## ADDED Requirements

### Requirement: Review session commit exposes SQLite host-path attribution
The system SHALL expose copyable Review session feedback timing evidence that distinguishes worker session commit time from SQLite delta host effects and other commit substeps.

#### Scenario: Slow commit identifies SQLite host work
- **WHEN** `review.session.feedback` is slow because SQLite delta read/write host effects dominate
- **THEN** the worker-handle summary SHALL include SQLite storage class, host effect totals, and commit substep attribution sufficient to classify the bottleneck as SQLite host path

#### Scenario: Slow commit identifies non-SQLite work
- **WHEN** `review.session.feedback` is slow because queue impact, projection, session advance, or handler overhead dominates
- **THEN** the worker-handle summary SHALL attribute the dominant non-SQLite step instead of hiding it under generic request-total

### Requirement: Review session commit reduces redundant SQLite hot-path IO
The system SHALL avoid redundant SQLite delta host reads or writes during ordinary consecutive Review session feedback commits when the same-runtime storage evidence is already verified and safe to reuse.

#### Scenario: Consecutive commits reuse verified evidence
- **WHEN** consecutive `review.session.feedback` commits append to SQLite delta evidence within the same runtime and the manifest/segment identity still matches
- **THEN** the system SHALL reuse verified same-runtime evidence instead of re-reading equivalent persisted bytes

#### Scenario: Evidence mismatch reads persisted storage
- **WHEN** manifest identity, segment identity, checksum, byte size, entry count, storage domain, or runtime evidence does not match
- **THEN** the system SHALL read persisted SQLite delta evidence and SHALL NOT use stale cached evidence

### Requirement: Durable Review commit remains fail-closed
The system SHALL keep Review session feedback durability semantics unchanged while optimizing commit latency.

#### Scenario: Storage evidence missing or failed
- **WHEN** SQLite delta/checkpoint storage evidence is missing, failed, or unavailable for a required Review commit
- **THEN** the system SHALL return an explicit unavailable/failure result and SHALL NOT report committed success

#### Scenario: Explicit recovery paths cold-read storage
- **WHEN** diagnostics, replay, repair, checkpoint recovery, startup, discard, or checksum mismatch paths need durable evidence
- **THEN** the system SHALL invalidate hot-path evidence and cold-read persisted storage before trusting it

### Requirement: Frontend advance remains outside the commit bottleneck
The system SHALL preserve the CDF preparation optimization and keep frontend Review advance diagnostics separate from backend commit diagnostics.

#### Scenario: Rating path remains frontend-light
- **WHEN** ordinary Review rating advances to a prepared next card
- **THEN** frontend timing SHALL continue to show `prepare-selected-review-card` and `refresh-cdf-live-relation` outside the dominant latency path unless evidence is stale or missing
