# review-inline-editable-targets Specification

## Purpose
TBD - created by archiving change inline-review-editable-targets. Update Purpose after archive.
## Requirements
### Requirement: Review content exposes editable targets
The system SHALL expose editable review-card source material as an ordered list of `EditableTarget` records. Each target SHALL identify one source block, its renderer kind, display label, and `block-markdown` source kind.

#### Scenario: Editable custom renderer has a source target
- **WHEN** Review displays an editable custom renderer such as quick, multi-cloze, concept, descriptor, concept-definition, or list-template
- **THEN** the review content surface SHALL expose at least one `EditableTarget` for the renderer's safe source block

#### Scenario: Concept definition exposes precise source blocks
- **WHEN** Review displays a concept-definition card with resolved concept and definition source blocks
- **THEN** the editable targets SHALL include separate concept and definition block targets
- **AND** the system SHALL NOT infer the definition target from broad dependency IDs

#### Scenario: Dependency-only blocks are not editable targets
- **WHEN** a prepared review view model includes dependency blocks for refresh, breadcrumbs, sibling descriptors, or contextual rendering
- **THEN** those dependency-only blocks SHALL NOT be exposed as editable targets unless they also appear as named source block identities

#### Scenario: Unsupported renderer has no target
- **WHEN** Review displays image occlusion, HTML-only, empty, or otherwise unsupported content
- **THEN** the review content surface SHALL expose no editable targets for inline source editing

### Requirement: Review opens inline editor from visible affordances
The system SHALL provide a visible review edit button and an `e` keyboard shortcut that open the inline multi-target editor for the current card when editable targets exist.

#### Scenario: Edit button opens inline editor
- **WHEN** editable targets exist for the current review card and the user activates the visible edit button
- **THEN** Review SHALL open an inline editor panel in the review surface instead of opening the large text editor modal
- **AND** the panel SHALL show all editable targets expanded by default

#### Scenario: Edit button is compact in the review header
- **WHEN** editable targets exist for the current review card and the inline editor is closed
- **THEN** Review SHALL expose the visible edit affordance as an icon-only action in the review header toolbar
- **AND** the action SHALL retain accessible label and tooltip text

#### Scenario: Edit button indicates inline editing state
- **WHEN** editable targets exist for the current review card and the inline editor is open
- **THEN** Review SHALL keep the header edit action visible
- **AND** the action SHALL expose an active or pressed state for visual and accessible editing status
- **AND** activating the action SHALL NOT reload or discard in-panel edits

#### Scenario: Shortcut opens inline editor
- **WHEN** editable targets exist and the user presses `e` outside text input while the inline editor is closed
- **THEN** Review SHALL open the same inline editor panel as the visible edit button

#### Scenario: No editable targets
- **WHEN** no editable targets exist and the user activates the edit affordance
- **THEN** Review SHALL surface a non-destructive unavailable message
- **AND** SHALL NOT open the editor panel

### Requirement: Inline editor edits whole block Markdown
The inline editor SHALL load and edit whole Markdown source for each target through the review application service block Markdown boundary.

#### Scenario: Editor loads target Markdown
- **WHEN** the inline editor opens with one or more editable targets
- **THEN** the system SHALL load each target's Markdown using the review service block Markdown read operation
- **AND** each target editor SHALL track its current value and original loaded value independently

#### Scenario: Editor does not expose Kramdown block attributes
- **WHEN** the editable source block has Kramdown IAL or block attributes such as block IDs
- **THEN** the inline editor SHALL load editor-friendly block Markdown that does not include those Kramdown-only attributes
- **AND** the save path SHALL still submit the edited Markdown through the review service block Markdown update operation

#### Scenario: Semantic fields are not rewritten
- **WHEN** a target represents a semantic renderer source such as concept, definition, descriptor, or list item
- **THEN** the editor SHALL present whole block Markdown
- **AND** SHALL NOT parse, save, or rewrite individual semantic fields in MVP

### Requirement: Save writes dirty targets only
The inline editor SHALL use explicit Save and Cancel actions. Save SHALL write only targets whose current Markdown differs from their loaded original Markdown.

#### Scenario: Save dirty targets
- **WHEN** the user changes one or more target editors and activates Save
- **THEN** the system SHALL call the review service block Markdown update operation only for dirty targets
- **AND** SHALL suppress source refresh for each saved block ID
- **AND** SHALL refresh the visible review content once after save handling completes

#### Scenario: Save with no changes
- **WHEN** the inline editor has no dirty targets
- **THEN** Save SHALL be disabled or treated as a no-op
- **AND** no block Markdown update SHALL be submitted

#### Scenario: Save failure keeps editor open
- **WHEN** saving any dirty target fails
- **THEN** the inline editor SHALL remain open
- **AND** the system SHALL surface the save failure without advancing the review card

#### Scenario: Cancel discards edits
- **WHEN** the inline editor is open and the user activates Cancel
- **THEN** the system SHALL close the editor and discard unsaved in-panel changes
- **AND** no block Markdown update SHALL be submitted

### Requirement: Review actions pause while editing
The system SHALL prevent review advancement actions from firing while the inline editor is open.

#### Scenario: Review hotkeys are ignored during inline editing
- **WHEN** the inline editor is open
- **THEN** reveal, grade, skip, back, and unmodified review hotkeys SHALL NOT advance or mutate the current review session

#### Scenario: Review action buttons are protected during inline editing
- **WHEN** the inline editor is open
- **THEN** reveal, grade, skip, and back controls SHALL be disabled or ignored
- **AND** Save and Cancel controls SHALL remain usable

#### Scenario: Review actions resume after editing closes
- **WHEN** the inline editor closes after Save or Cancel
- **THEN** reveal, grade, skip, back, and review hotkeys SHALL resume normal behavior for the current card

