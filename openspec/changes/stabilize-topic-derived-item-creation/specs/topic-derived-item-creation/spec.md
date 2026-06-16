## ADDED Requirements

### Requirement: Topic sources can derive child Item cards without replacing the source card
The system SHALL keep the original Topic/source card reviewable and create each derived Item as a child document-block card linked to the source.

#### Scenario: Derive Item from Topic reading material
- **WHEN** the user creates an Item from eligible Topic reading material
- **THEN** the source Topic card remains unchanged as a Topic card
- **AND** a child document block is created for the derived Item
- **AND** the child document block is registered as an Item card
- **AND** the derived Item lineage references the source doc, source block, parent Topic card, and optional parent excerpt

#### Scenario: Derived Item duplicate is skipped
- **WHEN** the requested answer fingerprint already exists for the same source and parent Topic card
- **THEN** no duplicate Item card is created
- **AND** the result reports the candidate as skipped

### Requirement: Topic-derived creation uses role-aware source eligibility
The system SHALL allow Topic-derived Item creation only from eligible source roles and SHALL default-reject non-Topic flashcard roles.

#### Scenario: Topic card source is eligible
- **WHEN** the selected source block is a Topic card or belongs to a Topic document source context
- **THEN** Topic-derived Item creation is available

#### Scenario: Plain block under Topic context is eligible
- **WHEN** the selected source block is not an existing flashcard and resolves to an eligible parent Topic context
- **THEN** Topic-derived Item creation is available

#### Scenario: Item source is rejected
- **WHEN** the selected source block is already an Item card
- **THEN** Topic-derived Item creation is rejected
- **AND** no child Item document is created

#### Scenario: Descriptor or Concept source is rejected
- **WHEN** the selected source block is already a Descriptor or Concept card
- **THEN** Topic-derived Item creation is rejected
- **AND** no child Item document is created

#### Scenario: Cloze or unknown flashcard source is rejected
- **WHEN** the selected source block is an existing cloze card or unknown non-Topic flashcard role
- **THEN** Topic-derived Item creation is rejected by default
- **AND** no child Item document is created

### Requirement: All manual Item derivation entrypoints share one creation chain
The system SHALL route selection-derived Items, excerpt-derived Items, right-click Item creation, and current-block mark backfill through the same Topic-derived Item creation chain.

#### Scenario: Selection command creates Item through shared chain
- **WHEN** the user selects text in eligible Topic material and runs the create Item command
- **THEN** the selection preparation calls the Topic-derived Item creation chain
- **AND** lineage, dedupe, rollback, child document creation, card creation, and Riff registration follow the same service path as other Topic-derived Items

#### Scenario: Right-click menu creates Item through shared chain
- **WHEN** the user invokes the right-click create Item action on eligible selected text
- **THEN** the action uses the same Topic-derived Item creation chain as the hotkey command

#### Scenario: Current-block marks create Items through shared chain
- **WHEN** the user backfills Items from marks already present in the current source block
- **THEN** all mark candidates are submitted through the Topic-derived Item creation chain
- **AND** the result reports aggregate created and skipped counts

### Requirement: Source marks do not own Item creation
The system SHALL treat native source marks as visual source evidence and SHALL NOT require mark persistence for Item creation when the source and selection are otherwise eligible.

#### Scenario: Item succeeds when source mark fails
- **WHEN** source mark persistence fails before Item creation
- **THEN** the system still attempts Topic-derived Item creation from the prepared selection content
- **AND** if Item creation succeeds, the user is told that the Item was created and source marking failed

#### Scenario: Newly applied mark is rolled back when Item creation fails
- **WHEN** a source mark is newly applied for manual Item creation
- **AND** Topic-derived Item creation fails afterward
- **THEN** the system attempts to restore the source block DOM to its pre-mark state
- **AND** the user is told that Item creation failed

#### Scenario: Existing mark is not rolled back
- **WHEN** the selected source mark was already present before the command
- **AND** Topic-derived Item creation fails
- **THEN** the system MUST NOT remove the pre-existing mark

### Requirement: Derivation identity is stored in card lineage, not block attrs
The system SHALL persist derivation identity in card metadata or progressive lineage and SHALL NOT write high-churn derivation identity to Siyuan block attrs.

#### Scenario: Child doc attrs omit high-churn derivation identity
- **WHEN** a derived Item child document is created
- **THEN** child document attrs include stable source metadata only
- **AND** child document attrs do not include `custom-fsrs-reading-creation-rule-id`
- **AND** child document attrs do not include `custom-fsrs-reading-answer-fingerprint`

#### Scenario: Card lineage stores derivation identity
- **WHEN** a derived Item card is created
- **THEN** its card lineage or metadata includes the creation rule id
- **AND** its card lineage or metadata includes the answer fingerprint

#### Scenario: Forbidden attr policy does not block Item creation
- **WHEN** block attr policy rejects high-churn attrs such as creation rule id or answer fingerprint
- **THEN** Topic-derived Item creation does not fail because those attrs are not written

### Requirement: Backend Topic-derived execution does not re-enter unavailable command facades
The system SHALL execute child document creation locally within the Topic-derived backend owner and SHALL NOT nest a Progressive backend command facade during backend-owned Topic-derived execution.

#### Scenario: Backend Topic-derived command creates child doc locally
- **WHEN** `topic-derived.command.execute` runs in the backend owner
- **THEN** derived child document creation uses local Progressive child-doc behavior or an equivalent local port
- **AND** it does not call an unavailable Progressive command facade

#### Scenario: Unavailable command owner remains explicit
- **WHEN** no valid Topic-derived command owner is available
- **THEN** the system reports an explicit unavailable error
- **AND** it does not silently fall back to a weaker path

### Requirement: Current-block mark backfill is batched per source block
The system SHALL process all eligible current-block mark candidates for one source block as one Topic-derived creation request.

#### Scenario: Multiple marks create multiple candidates in one request
- **WHEN** the current source block contains multiple eligible marks
- **THEN** the system builds multiple derived Item candidates
- **AND** submits them as one Topic-derived creation request
- **AND** dedupe is evaluated across the whole candidate set
