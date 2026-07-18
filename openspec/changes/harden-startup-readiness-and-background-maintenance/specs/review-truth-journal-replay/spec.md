## ADDED Requirements

### Requirement: Review truth startup work requires verified Truth Device Identity
Review truth journal replay, backfill, promotion, and flush SHALL require verified `deviceId` and `identityEpoch` before mutating Canonical Truth or advancing identity-bound success state.

#### Scenario: Identity conflict exists during startup replay
- **WHEN** Review truth work is pending and startup identity disposition is recovery-required because the installation authority is invalid or continuity evidence is ambiguous
- **THEN** the work SHALL remain pending with a safe recovery reason
- **AND** it SHALL not mutate truth, delete the journal entry, or mark truth completion

#### Scenario: Identity authority is transiently unavailable
- **WHEN** Review truth work is pending and identity authority cannot currently be read
- **THEN** the work SHALL remain pending with an authority-unavailable reason
- **AND** it SHALL not use a generated device id, a previous epoch, or an alternate fallback path

#### Scenario: Verified identity later resumes pending work
- **WHEN** the installation authority later verifies the active device id and epoch and durable Review evidence still matches
- **THEN** the Worker-owned writer path MAY replay or promote the pending work exactly once
- **AND** existing idempotency evidence SHALL prevent duplicate Review events or truth facts

#### Scenario: Follower runtime observes pending truth work
- **WHEN** a follower runtime encounters pending Review truth work
- **THEN** it SHALL observe or relay through the existing writer-authority seam
- **AND** it SHALL not perform a local truth mutation or create a second replay owner
