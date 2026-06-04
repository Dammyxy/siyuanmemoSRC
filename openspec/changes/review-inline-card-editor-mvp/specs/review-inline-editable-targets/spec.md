## ADDED Requirements

### Requirement: Review opens full inline card editor mode
The system SHALL provide an inline card editor mode in Review that combines editable source targets with card-level editing controls for the current card.

#### Scenario: Edit mode hides the review preview
- **WHEN** editable targets or card editor data exist for the current review card and the user opens edit mode
- **THEN** Review SHALL hide the rendered card preview content
- **AND** SHALL show the inline card editor in the review content area

#### Scenario: Inline card editor includes source targets
- **WHEN** the inline card editor opens for a card with editable source targets
- **THEN** the editor SHALL show those source targets for editing through the existing Review source read boundary
- **AND** source text changes SHALL remain draft-based until explicit Save

#### Scenario: Inline card editor includes card-level controls
- **WHEN** the inline card editor opens for a card with editable card metadata
- **THEN** the editor SHALL expose card-level controls backed by existing card editor service contracts
- **AND** SHALL NOT introduce a second metadata persistence path

#### Scenario: Card type change syncs compatible render
- **WHEN** the user changes the card type in the inline card editor
- **THEN** the system SHALL apply a render family compatible with the selected card type
- **AND** SHALL keep the render family and direction control synchronized with the applied card type result

#### Scenario: Compatible render direction is preserved
- **WHEN** the user changes card type within a render family that supports direction and the current direction remains compatible
- **THEN** the system SHALL preserve that direction
- **AND** SHALL NOT leave stale render metadata from an incompatible card type

#### Scenario: Direction change syncs render metadata and face identity
- **WHEN** the user changes direction for a supported semantic render family such as concept-definition or descriptor
- **THEN** the system SHALL update the applied render target metadata including render profile, type marker, and template identity
- **AND** SHALL update or clear stale face identity fields such as `faceKey.ruleId` or `meta.faceKey.ruleId` when they would otherwise override the selected direction
- **AND** subsequent Review rendering and render cache identity SHALL reflect the selected direction

#### Scenario: Existing SRS editor confirmation behavior is preserved
- **WHEN** a card-level edit would trigger protected semantic overwrite confirmation in the existing SRS editor
- **THEN** the inline card editor SHALL require equivalent confirmation before applying that mutation

#### Scenario: Repeat edit action preserves in-panel edits
- **WHEN** inline card editor mode is open with dirty source edits
- **THEN** activating the header edit action again SHALL NOT reload source Markdown
- **AND** SHALL NOT discard dirty source values

### Requirement: Review exits full inline card editor mode safely
The system SHALL close inline card editor mode only through explicit Save/Cancel or existing editor-close controls, without accidentally advancing the review session.

#### Scenario: Save refreshes preview after closing editor
- **WHEN** the user saves source edits in the inline card editor
- **THEN** Review SHALL save dirty source targets through the existing block Markdown update operation
- **AND** SHALL refresh the visible card content once after the editor closes

#### Scenario: Cancel restores preview without source writes
- **WHEN** the user cancels inline card editor mode with dirty source edits
- **THEN** Review SHALL discard the in-panel source draft
- **AND** SHALL show the rendered card preview again without submitting source writes

#### Scenario: Review actions remain protected while editing
- **WHEN** inline card editor mode is open
- **THEN** reveal, grade, skip, back, and unmodified review hotkeys SHALL NOT advance or mutate the review session
- **AND** editor Save/Cancel and card-level controls SHALL remain usable

## MODIFIED Requirements

### Requirement: Review opens inline editor from visible affordances
The system SHALL provide a visible review edit button and an `e` keyboard shortcut that open the inline card editor for the current card when editable targets or card editor data exist.

#### Scenario: Edit button opens inline editor
- **WHEN** editable targets or card editor data exist for the current review card and the user activates the visible edit button
- **THEN** Review SHALL open an inline card editor in the review surface instead of opening the large text editor modal
- **AND** the rendered review preview SHALL be hidden while the editor is open

#### Scenario: Edit button is compact in the review header
- **WHEN** editable targets or card editor data exist for the current review card and the inline editor is closed
- **THEN** Review SHALL expose the visible edit affordance as an icon-only action in the review header toolbar
- **AND** the action SHALL retain accessible label and tooltip text

#### Scenario: Edit button indicates inline editing state
- **WHEN** editable targets or card editor data exist for the current review card and the inline editor is open
- **THEN** Review SHALL keep the header edit action visible
- **AND** the action SHALL expose an active or pressed state for visual and accessible editing status
- **AND** activating the action SHALL NOT reload or discard in-panel edits

#### Scenario: Shortcut opens inline editor
- **WHEN** editable targets or card editor data exist and the user presses `e` outside text input while the inline editor is closed
- **THEN** Review SHALL open the same inline card editor as the visible edit button

#### Scenario: No editable card data
- **WHEN** no editable source targets and no card editor data exist and the user activates the edit affordance
- **THEN** Review SHALL surface a non-destructive unavailable message
- **AND** SHALL NOT open the editor panel
