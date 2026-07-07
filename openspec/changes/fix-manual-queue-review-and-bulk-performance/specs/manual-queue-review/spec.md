## ADDED Requirements

### Requirement: Manual queue reviews reschedule and clear persisted membership
The system SHALL treat a card explicitly added from Browser into Retrieval Practice as a formal review when the user rates it from a review session. After a successful review commit, the system SHALL remove that card from the persisted manual queue membership so restarting SiYuan does not reintroduce already-reviewed manual cards.

#### Scenario: Worker session reviews a manually queued Retrieval card
- **WHEN** a Browser-added Retrieval Practice card is rated through a worker-owned review session
- **THEN** the review feedback MUST write the formal SRS schedule and remove the card from persisted Retrieval Practice manual membership

#### Scenario: Local session reviews a manually queued Retrieval card
- **WHEN** a Browser-added Retrieval Practice card is rated through a local review session
- **THEN** the review feedback MUST write the formal SRS schedule and remove the card from persisted Retrieval Practice manual membership

#### Scenario: Restart after manual queue review
- **WHEN** a manually queued Retrieval Practice card has been successfully rated and SiYuan restarts
- **THEN** the card MUST NOT be loaded back solely from the persisted manual queue membership

### Requirement: Manual queue cleanup is commit-gated
The system SHALL clear persisted manual queue membership only after the corresponding review feedback commit has succeeded. Failed, rejected, unavailable, or conflicting review feedback MUST leave persisted manual membership unchanged.

#### Scenario: Review feedback fails
- **WHEN** worker or local review feedback fails before a successful commit
- **THEN** persisted manual queue membership MUST remain unchanged for the reviewed card

#### Scenario: Review feedback is duplicate but compatible
- **WHEN** an idempotent duplicate review feedback request resolves to an already committed result
- **THEN** manual queue membership cleanup MUST be safe to repeat and leave the persisted set without the reviewed card

### Requirement: Browser add menu exposes one action per queue
The system SHALL show only one Browser right-click add action for Retrieval Practice and only one add action for Incremental Learning. Hidden legacy action IDs MAY remain routeable internally, but they MUST NOT appear as duplicate visible submenu items.

#### Scenario: Browser add menu for Retrieval Practice
- **WHEN** Browser row actions are built with Retrieval Practice available
- **THEN** the add submenu MUST contain one visible Retrieval Practice action

#### Scenario: Browser add menu for Incremental Learning
- **WHEN** Browser row actions are built with Incremental Learning available
- **THEN** the add submenu MUST contain one visible Incremental Learning action

#### Scenario: Legacy add-all action id
- **WHEN** a legacy `add-to-retrieval-queue-all` or `add-to-incremental-queue-all` command is dispatched internally
- **THEN** the system MUST route it to the same active add behavior as the visible queue action or fail explicitly if that queue add authority is unavailable
