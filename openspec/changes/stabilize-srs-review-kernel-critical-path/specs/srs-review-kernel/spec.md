## ADDED Requirements

### Requirement: Active Review sessions use one SRS Review Kernel authority
The system SHALL govern active Review session current card, answer advancement, skip/session removal, undo/go-back, lookahead, counters, and diagnostics through one SRS Review Kernel Interface.

#### Scenario: Rating advances from kernel state
- **WHEN** a user rates the current card in an active Review session
- **THEN** the next visible Review card or session-complete state SHALL come from SRS Review Kernel session state
- **AND** renderer cursor state SHALL NOT compute a separate next card

#### Scenario: Skip advances from kernel state
- **WHEN** a user skips the current card in an active Review session
- **THEN** the next visible Review card or session-complete state SHALL come from SRS Review Kernel session state
- **AND** queue projection rows SHALL NOT be synchronously requeried to decide the next card

#### Scenario: Undo uses kernel evidence
- **WHEN** a user goes back after an accepted Review answer
- **THEN** the restored visible state SHALL be derived from kernel-owned session/journal evidence
- **AND** it SHALL NOT depend on stale renderer-local queue snapshots

### Requirement: Review adapters do not own post-feedback advancement
The system SHALL keep Review UI and application adapters thin around the SRS Review Kernel Interface for worker-owned sessions.

#### Scenario: Adapter receives answer result
- **WHEN** the kernel returns an answer result with next card, counters, and diagnostics
- **THEN** the Review adapter SHALL map that result to UI state
- **AND** it SHALL NOT patch projection rows, requery local queues, or compensate a separate cursor to decide advancement

#### Scenario: Kernel unavailable
- **WHEN** the selected SRS Review Kernel is unavailable
- **THEN** the adapter SHALL surface a typed unavailable state
- **AND** it SHALL NOT silently fall back to renderer cursor, legacy snapshot storage, or local queue requery

### Requirement: Kernel diagnostics separate authority from auxiliary state
The system SHALL expose SRS Review Kernel diagnostics that distinguish session authority from journal, queue projection, Browser projection, CDF preparation, domain sync, and storage checkpoint state.

#### Scenario: Projection stale after answer
- **WHEN** queue or Browser projection is stale after an accepted answer
- **THEN** kernel diagnostics SHALL report the projection state separately
- **AND** the visible current card SHALL remain governed by kernel session state

#### Scenario: CDF preparation unavailable
- **WHEN** next-card CDF preparation is unavailable, pending, or invalidated
- **THEN** kernel diagnostics SHALL report CDF preparation state separately
- **AND** it SHALL NOT invalidate the accepted Review answer or replace kernel advancement authority
