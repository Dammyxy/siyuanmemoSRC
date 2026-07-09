## ADDED Requirements

### Requirement: SRS card render contract resolves quick-symbol cards
The system SHALL resolve a render contract for SRS cards that separates semantic kind from renderer family. A card with deterministic quick-symbol evidence SHALL resolve to the quick renderer unless an explicit unsupported render family takes precedence.

#### Scenario: Repaired symbol item resolves quick renderer
- **WHEN** a card has semantic kind `Item` and deterministic quick-symbol evidence such as `meta.source = "symbol"`, `meta.cardSource = "quick-symbol"`, `meta.symbolDetected = true`, `meta.symbolType`, or `meta.quickDetectReason = "symbol-rule"`
- **THEN** the render contract SHALL select the quick renderer
- **AND** the contract SHALL expose the quick-symbol evidence used for routing

#### Scenario: Force Protyle does not hide deterministic quick-symbol repair
- **WHEN** a legacy symbol card has deterministic quick-symbol evidence and stale Protyle routing metadata
- **THEN** the repair plan SHALL be able to clear the stale Protyle routing metadata
- **AND** Review SHALL use the quick renderer after repair

### Requirement: Semantic repair restores deterministic render evidence
The semantic repair action SHALL repair both semantic kind and deterministic render receipt evidence when a legacy symbol card can be proven to be a quick-symbol card.

#### Scenario: Legacy symbol topic repairs to renderable item
- **WHEN** the semantic repair action finds a `Topic` card with deterministic quick-symbol evidence
- **THEN** the repair plan SHALL set the card semantic kind to `Item`
- **AND** the repair plan SHALL restore minimal quick-symbol render evidence needed for Review routing
- **AND** the repair SHALL NOT overwrite unrelated custom render metadata that is not needed to make the card renderable

#### Scenario: Ambiguous evidence remains skipped
- **WHEN** deterministic semantic or render evidence conflicts
- **THEN** the repair action SHALL skip automatic repair
- **AND** diagnostics SHALL identify the conflicting evidence

### Requirement: Review prepares quick-symbol front and back consistently
The Custom Review Surface SHALL prepare quick-symbol card presentation through the render contract and SHALL pass the correct side to the quick renderer.

#### Scenario: Hidden answer prepares front
- **WHEN** Review displays a quick-symbol card before the answer is revealed
- **THEN** Review SHALL prepare the quick card front side

#### Scenario: Revealed answer prepares back
- **WHEN** Review displays a quick-symbol card after the answer is revealed
- **THEN** Review SHALL prepare the quick card back side

### Requirement: Render failures are explicit diagnostics
The system SHALL fail closed with render diagnostics when a render contract cannot produce a valid front/back presentation.

#### Scenario: Quick-symbol source cannot be parsed
- **WHEN** a quick-symbol card cannot load its source block or cannot parse source grammar into front/back
- **THEN** Review SHALL keep the card in the session
- **AND** the system SHALL expose a diagnostic reason instead of silently treating the card as a different card type
