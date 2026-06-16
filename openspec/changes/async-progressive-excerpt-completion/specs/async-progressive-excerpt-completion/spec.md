## ADDED Requirements

### Requirement: Progressive excerpt foreground creation does not wait for Topic card completion
The system SHALL report a created Progressive excerpt after the excerpt entity and excerpt record are durable, without waiting for Topic card creation.

#### Scenario: Created excerpt returns before card completion
- **WHEN** a valid selection is materialized into an excerpt entity
- **THEN** the foreground result includes the excerpt entity and record identifiers
- **AND** `topicCardId` MAY be absent until background completion finishes

### Requirement: Excerpt completion state is recoverable from records
The system SHALL persist minimal completion state on each excerpt record.

#### Scenario: New excerpt starts pending completion
- **WHEN** a new excerpt record is created
- **THEN** its completion status is `pending`

#### Scenario: Historical record without completion state remains complete
- **WHEN** an old excerpt record without completion state is loaded
- **THEN** it is treated as `completed`

#### Scenario: Completion succeeds
- **WHEN** background completion creates or finds the Topic card
- **THEN** the record is marked `completed`
- **AND** the Topic card id is stored
- **AND** previous completion error is cleared

#### Scenario: Completion fails
- **WHEN** background completion cannot create the Topic card
- **THEN** the record is marked `failed`
- **AND** the latest error message and occurrence time are stored

### Requirement: Excerpt completion repair is bounded
The system SHALL repair incomplete excerpt completion through bounded explicit triggers only.

#### Scenario: Startup repair is capped and non-blocking
- **WHEN** the plugin starts
- **THEN** startup repair runs after readiness without blocking startup
- **AND** it repairs at most 20 incomplete records

#### Scenario: Scoped repair is capped
- **WHEN** a caller requests scoped repair for relevant records
- **THEN** at most 5 records are repaired by default

#### Scenario: Transactions do not trigger repair
- **WHEN** Siyuan transactions are received
- **THEN** excerpt completion repair is not triggered from the transaction fanout path
