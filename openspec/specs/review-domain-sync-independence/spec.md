# review-domain-sync-independence Specification

## Purpose
Keep Review entry and feedback independent from domain-sync divergence diagnostics while retaining backend-owned ledger and truth reconstruction as non-blocking storage infrastructure.

## Requirements

### Requirement: Review does not expose sync-conflict recovery UI
The system SHALL NOT register, display, or open a user-facing sync-conflict resolution command, menu item, or dialog from any Review or Browser surface.

#### Scenario: Domain-sync diagnostics report divergence
- **WHEN** domain-sync diagnostics report `repairable`, `needs-direction`, `divergent`, or `source-error`
- **THEN** Review and Browser continue without displaying a sync-conflict recovery surface

#### Scenario: Domain-sync diagnostics are unavailable
- **WHEN** domain-sync diagnostics cannot be read
- **THEN** the plugin does not display a sync-conflict recovery surface

### Requirement: Review entry is independent from domain-sync status
The system SHALL admit Review from storage readiness, queue readiness, and projection identity without consulting domain-sync sanity status.

#### Scenario: Review opens while domain-sync state is repairable
- **WHEN** the user opens a Review queue and backend storage plus the selected queue are ready
- **THEN** Review opens even if passive domain-sync diagnostics would report repairable divergence

#### Scenario: Review opens while domain-sync diagnostics are unavailable
- **WHEN** the user opens a Review queue and domain-sync diagnostics are unavailable
- **THEN** Review opening does not wait for or fail because of those diagnostics

### Requirement: Review feedback has no repair gate
The system SHALL submit Review grade, skip, and custom feedback without a domain-sync action guard or Review-session repair-gate evidence.

#### Scenario: User grades the current card
- **WHEN** the current Review session, card identity, writer authority, and durable mutation path are valid
- **THEN** the system commits the grade without reading domain-sync diagnostics and without a `repairGate` field

#### Scenario: Passive diagnostics report current-card divergence
- **WHEN** passive domain-sync diagnostics report divergence involving the current card
- **THEN** the diagnostic status alone does not block or alter Review feedback

### Requirement: Internal convergence remains non-blocking
The system MAY retain backend-owned append-only domain-sync evidence, truth reconstruction, and passive diagnostics, but those facilities SHALL NOT define Review admission or rating success.

#### Scenario: Internal convergence evidence exists
- **WHEN** backend storage records domain-sync operations or reconstructs canonical Review truth
- **THEN** that work remains internal and does not create a user-facing conflict workflow

#### Scenario: Actual Review persistence fails
- **WHEN** writer authority, session/card identity, or durable storage mutation fails
- **THEN** Review surfaces the persistence failure through its normal error path rather than a sync-conflict repair dialog
