## ADDED Requirements

### Requirement: Complete SRS render contract resolves renderer family
The system SHALL resolve SRS card Review rendering through one render contract that separates semantic kind from renderer family.

#### Scenario: Contract resolves all Review renderer families
- **WHEN** a Review card has deterministic render evidence for quick-symbol, Protyle, descriptor, concept, concept-definition, image occlusion, or multi-cloze rendering
- **THEN** the contract SHALL expose the selected renderer kind
- **AND** the contract SHALL expose the selected render family
- **AND** Review SHALL consume that contract instead of independently guessing the renderer family

#### Scenario: Protyle is represented as a render family
- **WHEN** no special renderer family is selected and the card renders from the source block
- **THEN** the contract SHALL expose Protyle as the render family
- **AND** Review SHALL route that card to the main Protyle surface

### Requirement: Contract exposes front and back side ownership
The system SHALL expose a front/back contract for renderer families that need Review-side side selection.

#### Scenario: Quick-symbol side contract
- **WHEN** a card resolves to the quick-symbol render family
- **THEN** the contract SHALL declare front as the before-reveal side
- **AND** the contract SHALL declare back as the after-reveal side
- **AND** Review preparation SHALL pass the contracted side to the quick renderer

#### Scenario: Non-quick renderers do not invent sides
- **WHEN** a card resolves to Protyle, descriptor, concept, concept-definition, image occlusion, or multi-cloze rendering
- **THEN** the contract SHALL mark side selection as renderer-owned or not required
- **AND** Review SHALL NOT invent quick front/back sides for that card

### Requirement: Contract exposes required render receipts
The system SHALL expose required receipts that explain whether a card has enough deterministic evidence to render.

#### Scenario: Quick-symbol receipts are present
- **WHEN** a quick-symbol card has source block identity and deterministic quick-symbol metadata
- **THEN** the contract SHALL mark the source block and quick-symbol evidence receipts as present
- **AND** diagnostics SHALL NOT claim those receipts are missing

#### Scenario: Quick-symbol receipts are missing
- **WHEN** a quick-symbol card lacks source block identity or quick-symbol grammar evidence
- **THEN** the contract SHALL mark the missing receipt
- **AND** diagnostics SHALL include the missing receipt reason

### Requirement: Quick renderer fails closed with diagnostics
The system SHALL fail closed when a card selected for quick rendering cannot produce a valid quick-card view model.

#### Scenario: Source block missing
- **WHEN** the quick renderer cannot load the source block for a quick-symbol card
- **THEN** Review SHALL keep the card on the quick renderer surface
- **AND** Review SHALL show an explicit render diagnostic instead of falling back to Protyle

#### Scenario: Symbol grammar cannot be parsed
- **WHEN** the source block does not contain parseable quick-symbol grammar
- **THEN** Review SHALL keep the card on the quick renderer surface
- **AND** Review SHALL show an explicit render diagnostic instead of silently showing blank content

#### Scenario: Card identity conflicts with source block
- **WHEN** a requested card id points at a different source block than the Review content block
- **THEN** the quick renderer SHALL fail closed
- **AND** diagnostics SHALL identify the card/source mismatch

#### Scenario: Route metadata conflicts are visible
- **WHEN** quick-symbol evidence conflicts with stale Protyle or answer-block route metadata
- **THEN** the contract SHALL keep quick rendering selected when evidence is deterministic
- **AND** diagnostics SHALL expose the conflicting route metadata
