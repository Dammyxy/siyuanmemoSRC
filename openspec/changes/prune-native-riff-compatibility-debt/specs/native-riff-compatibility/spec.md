## ADDED Requirements

### Requirement: Native Riff compatibility is explicit

The system SHALL treat Native Riff interoperability as an explicit compatibility capability, not as part of ordinary SiYuanMemo-owned SRS card creation, review, scheduling, or Browser membership.

#### Scenario: Ordinary card creation skips Native Riff writes

- **WHEN** an ordinary SiYuanMemo-owned SRS action creates Progressive, Topic-derived, or AutoCard cards without an explicit Native Riff compatibility action
- **THEN** the system MUST create the SiYuanMemo-owned card data without requiring or invoking Native Riff add-card writes

#### Scenario: Explicit compatibility action uses Native Riff

- **WHEN** a caller requests an explicit Native Riff compatibility action
- **THEN** the system MUST route Native Riff writes through the Native Riff compatibility capability and report success or explicit unavailability

### Requirement: Native Riff compatibility has one write interface

The system SHALL expose one application-level interface for Native Riff compatibility writes used by Progressive, Topic-derived item, and AutoCard paths.

#### Scenario: Shared compatibility interface replaces duplicate ports

- **WHEN** Progressive, Topic-derived item, or AutoCard code needs to register a card with Native Riff
- **THEN** the code MUST use the shared Native Riff compatibility interface instead of separate same-shaped Progressive or AutoCard Riff ports

#### Scenario: Missing compatibility runtime fails closed

- **WHEN** explicit Native Riff compatibility is requested but the compatibility runtime is unavailable
- **THEN** the system MUST return an explicit unavailable error and MUST NOT silently continue through a fallback or alternate Riff write path

### Requirement: Native Riff sync has one active runtime owner

The system SHALL select one active runtime owner for Native Riff transaction sync when compatibility sync settings are enabled.

#### Scenario: Kernel transaction ingest owns sync when enabled

- **WHEN** Native Riff compatibility sync is enabled and kernel transaction ingest is enabled
- **THEN** Native Riff remove/upsert actions MUST be routed through the kernel transaction action pump without registering the older transaction trigger handler

#### Scenario: Legacy trigger is unavailable unless explicitly selected

- **WHEN** Native Riff compatibility sync is enabled but the selected sync owner is unavailable
- **THEN** the system MUST surface explicit unavailability rather than registering multiple sync handlers as a hidden fallback

### Requirement: Follow-up razor candidates remain separate

The system SHALL keep Review render legacy projection cleanup and storage legacy migration loader cleanup outside this Native Riff compatibility change.

#### Scenario: Native Riff change does not alter Review or storage semantics

- **WHEN** this change is implemented
- **THEN** Review render policy behavior and storage legacy migration behavior MUST remain unchanged except for documented follow-up debt entries
