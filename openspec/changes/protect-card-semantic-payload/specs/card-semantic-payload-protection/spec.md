## ADDED Requirements

### Requirement: Anki-shaped card semantic ownership
The system SHALL model card semantics with a single notetype-like `CardTypeDefinition`, Xiuyuan-owned semantic instance data, and FSRSCard-owned schedulable review instances.

#### Scenario: Card type definition is global rule authority
- **WHEN** a card type/template is registered
- **THEN** the definition SHALL include stable rule identity, field schema, generation rules, and render defaults without duplicating the full definition into each Xiuyuan

#### Scenario: Xiuyuan owns faces and semantic content
- **WHEN** a review card is rendered
- **THEN** front/back content SHALL be derived from Xiuyuan semantic data plus CardTypeDefinition rules rather than treated as FSRSCard scheduling state

#### Scenario: FSRSCard uses faceKey as review-instance locator
- **WHEN** a Xiuyuan produces multiple schedulable cards
- **THEN** each FSRSCard SHALL carry a stable `faceKey` that identifies `ruleId` and optional `faceIndex`
- **AND** `typeMarker` SHALL be treated as legacy/display metadata, not stable identity

### Requirement: Protected card semantic payload
The system SHALL treat card type, render/template markers, Xiuyuan mapping data, card face/source links, and unknown custom metadata as protected card semantic payload that must not be silently dropped, normalized away, or overwritten by scheduling-only operations.

#### Scenario: Scheduling-only update preserves semantic payload
- **WHEN** a priority, dismissed, review feedback, reschedule, reset-progress, or scheduler-owned update changes scheduling fields
- **THEN** the persisted card SHALL preserve protected semantic payload from the previous card record unless the command explicitly declares a semantic edit

#### Scenario: Mapper round-trip preserves custom metadata
- **WHEN** a card with unknown custom metadata and Xiuyuan mapping fields is converted through persistence DTO and back to domain form
- **THEN** the restored card SHALL preserve the unknown custom metadata and the Xiuyuan mapping fields without moving them into scheduling-only state

### Requirement: SRS editor semantic overwrite guard
The system SHALL block or require explicit confirmation before an SRS editor type or render transition overwrites protected semantic payload that is not already recognized as built-in SiYuanMemo metadata.

#### Scenario: Built-in transition remains direct
- **WHEN** a card contains only built-in type/render markers and the user changes type or render in the SRS editor
- **THEN** the system SHALL apply the transition and persist the intended built-in metadata change

#### Scenario: Custom render metadata is not silently overwritten
- **WHEN** a card contains custom `templateID`, `typeMarker`, `renderProfile`, `cardTypeMarker`, `clozeRenderMode`, face mapping, or unknown semantic metadata and the user chooses a built-in render/type target
- **THEN** the system SHALL leave the card unchanged and return a blocked or confirmation-required result unless explicit semantic overwrite intent is provided

#### Scenario: Explicit semantic overwrite is auditable
- **WHEN** a user confirms a semantic overwrite from custom metadata to built-in metadata
- **THEN** the system SHALL persist the chosen transition and expose diagnostics or result metadata that identifies the overwritten protected fields
