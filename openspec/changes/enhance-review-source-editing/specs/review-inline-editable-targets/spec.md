## MODIFIED Requirements

### Requirement: Review content exposes editable targets
The system SHALL expose editable review-card source material as an ordered list of `EditableTarget` records. Each target SHALL identify one source block, its renderer kind, display label, target role, and `block-markdown` source kind. Targets SHALL represent safe source content for review-time repair, not every dependency used by custom rendering.

#### Scenario: Editable custom renderer has a source target
- **WHEN** Review displays an editable custom renderer such as quick, multi-cloze, concept, descriptor, concept-definition, or list-template
- **THEN** the review content surface SHALL expose at least one `EditableTarget` for the renderer's safe source block or safe source action

#### Scenario: Concept definition exposes definition source and concept reference
- **WHEN** Review displays a concept-definition card with resolved concept and definition source data
- **THEN** the editable targets SHALL expose the definition text source for text editing
- **AND** the concept SHALL be exposed as a concept-card reference selector rather than a Markdown target for editing the concept document block body
- **AND** the system SHALL NOT infer the definition target from broad dependency IDs

#### Scenario: Descriptor exposes descriptor source and concept reference
- **WHEN** Review displays a descriptor card with resolved concept and descriptor source data
- **THEN** the editable targets SHALL expose the descriptor text source for text editing
- **AND** the concept SHALL be exposed as a concept-card reference selector rather than a Markdown target for editing the concept document block body
- **AND** dependency-only concept context SHALL NOT be exposed as a document-body Markdown edit target

#### Scenario: Dependency-only blocks are not editable targets
- **WHEN** a prepared review view model includes dependency blocks for refresh, breadcrumbs, sibling descriptors, or contextual rendering
- **THEN** those dependency-only blocks SHALL NOT be exposed as editable Markdown targets unless they also appear as named source block identities

#### Scenario: Unsupported renderer has no target but reports a reason
- **WHEN** Review displays image occlusion, HTML-only, empty, or otherwise unsupported content
- **THEN** the review content surface SHALL expose no editable Markdown targets for inline source editing
- **AND** activating the review source edit affordance SHALL show a renderer-specific unavailable reason when one is known

### Requirement: Review opens inline editor from visible affordances
The system SHALL provide a visible review source edit button and an `e` keyboard shortcut that open the inline source editor for the current card. The affordance SHALL remain discoverable even when the current renderer is not editable, and SHALL explain why editing is unavailable instead of silently disappearing.

#### Scenario: Edit button opens inline source editor
- **WHEN** editable targets exist for the current review card and the user activates the visible source edit button
- **THEN** Review SHALL open an inline editor panel in the review surface instead of opening the large text editor modal
- **AND** the panel SHALL show the current card's smallest necessary source targets by default

#### Scenario: Edit button is compact in the review header
- **WHEN** the inline editor is closed
- **THEN** Review SHALL expose the visible edit affordance as an icon-only action in the review header toolbar
- **AND** the action SHALL retain accessible label and tooltip text that identify the action as editing source content

#### Scenario: Edit button indicates inline editing state
- **WHEN** the inline editor is open
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

### Requirement: Inline editor edits source content safely
The inline editor SHALL load and edit source content through the review application service block Markdown boundary. For stable custom-renderer families, the editor SHALL prefer structured fields that rewrite safe source grammar; when grammar is invalid, unsupported, or ambiguous, the editor SHALL fall back to raw Markdown without pretending field-level editing is safe.

#### Scenario: Editor loads target Markdown
- **WHEN** the inline editor opens with one or more editable Markdown targets
- **THEN** the system SHALL load each target's Markdown using the review service block Markdown read operation
- **AND** each target editor SHALL track its current value and original loaded value independently

#### Scenario: Editor does not expose Kramdown block attributes
- **WHEN** the editable source block has Kramdown IAL or block attributes such as block IDs
- **THEN** the inline editor SHALL load editor-friendly block Markdown that does not include those Kramdown-only attributes
- **AND** the save path SHALL still submit the edited Markdown through the review service block Markdown update operation

#### Scenario: Stable semantic fields are rewritten
- **WHEN** a target represents a stable semantic renderer source such as quick question/answer, list-template current item cue/answer, concept-definition definition, or descriptor cue/answer
- **THEN** the editor SHALL present field-level inputs when the source grammar can be parsed safely
- **AND** saving a changed field SHALL rewrite only the relevant source grammar while preserving unrelated source content

#### Scenario: Unsafe grammar falls back to raw Markdown
- **WHEN** the current source grammar cannot be parsed or safely rewritten for field-level editing
- **THEN** the editor SHALL present raw Markdown for the affected source
- **AND** the editor SHALL warn that field-level conflict merging is unavailable for that source
- **AND** the user SHALL still be able to save raw Markdown if the source remains writable

#### Scenario: Concept reference is selected, not text-edited
- **WHEN** a concept-definition or descriptor card exposes a concept field
- **THEN** the editor SHALL display the current concept card reference as a selectable relation target
- **AND** changing the concept SHALL use a concept-card selection flow
- **AND** the editor SHALL NOT edit the referenced concept document block body as the meaning of changing the concept field

#### Scenario: Renderer-specific first-pass behavior
- **WHEN** Review opens source editing for a custom renderer
- **THEN** list-template SHALL expose only the current item's cue and answer fields by default
- **AND** quick SHALL expose question and answer fields only when source grammar is safely recognized
- **AND** multi-cloze SHALL expose raw Markdown only
- **AND** concept-definition SHALL expose definition text and concept reference selection while keeping relation direction read-only
- **AND** descriptor SHALL expose descriptor cue/answer and concept reference selection while keeping relation direction read-only
- **AND** image-occlusion SHALL remain unavailable for review-time source editing

### Requirement: Answer-side editing respects reveal state
The inline editor SHALL protect review integrity by not exposing answer-side content for an unrevealed card unless the user explicitly confirms that editing the answer will reveal the current card.

#### Scenario: Unrevealed card hides answer-side fields
- **WHEN** the current review card has not been revealed
- **THEN** the inline editor SHALL hide answer-side fields by default
- **AND** visible source fields such as question, cue, or concept reference MAY remain editable when they do not reveal the answer

#### Scenario: User confirms answer-side editing
- **WHEN** the current review card is unrevealed and the user chooses to edit an answer-side field or raw source that contains answer-side content
- **THEN** Review SHALL ask for explicit confirmation
- **AND** confirming SHALL reveal the current card before opening or expanding the answer-side editor
- **AND** cancelling SHALL leave the card unrevealed and SHALL NOT expose the answer-side content

### Requirement: Save writes dirty targets only
The inline editor SHALL use explicit Save and Cancel actions. Save SHALL write only targets whose current source differs from their loaded original source, SHALL leave the current card in place for refresh, and SHALL NOT advance, score, or reset SRS progress.

#### Scenario: Save dirty targets
- **WHEN** the user changes one or more target editors and activates Save
- **THEN** the system SHALL call the review service block Markdown update operation only for dirty Markdown targets
- **AND** SHALL suppress source refresh for each saved block ID
- **AND** SHALL refresh the visible review content once after save handling completes
- **AND** SHALL keep the current card in the review surface unless post-save validation determines it is no longer reviewable

#### Scenario: Save with no changes
- **WHEN** the inline editor has no dirty targets and no changed concept reference
- **THEN** Save SHALL be disabled or treated as a no-op
- **AND** no block Markdown update SHALL be submitted

#### Scenario: Save failure keeps editor open
- **WHEN** saving any dirty target fails
- **THEN** the inline editor SHALL remain open
- **AND** the system SHALL surface the save failure without advancing the review card

#### Scenario: Partial save reports exact outcome
- **WHEN** multiple dirty targets are saved and some block writes succeed while others fail
- **THEN** successful block writes SHALL remain saved
- **AND** failed targets SHALL stay open with per-target errors
- **AND** the user SHALL be told that saving partially succeeded

#### Scenario: Cancel discards edits
- **WHEN** the inline editor is open and the user activates Cancel with no dirty changes
- **THEN** the system SHALL close the editor and discard in-panel state
- **AND** no block Markdown update SHALL be submitted

#### Scenario: Dirty exit requires a decision
- **WHEN** the inline editor has unsaved changes and the user tries to close the editor, close the review surface, or navigate away from the current card
- **THEN** Review SHALL require the user to choose Save, Discard, or Cancel
- **AND** choosing Save SHALL complete a successful save before continuing the original action
- **AND** choosing Discard SHALL drop the draft before continuing the original action
- **AND** choosing Cancel SHALL keep the editor open and cancel the original action

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
- **WHEN** the inline editor closes after Save, Discard, or Cancel
- **THEN** reveal, grade, skip, back, and review hotkeys SHALL resume normal behavior for the current card

## ADDED Requirements

### Requirement: Review source edits update session-visible card content safely
The system SHALL refresh the visible card and same-session same-source card snapshots after source edits without changing scheduling. CDF/live relation cards SHALL continue to use relation repair flows when source edits affect relation validity.

#### Scenario: Ordinary source edit refreshes current and same-session snapshots
- **WHEN** a non-CDF custom-rendered card source edit saves successfully
- **THEN** Review SHALL refresh the current visible renderer
- **AND** SHALL refresh same-session same-source card snapshots when those cards depend on the edited source
- **AND** SHALL NOT reset SRS progress, change scheduling, grade, skip, or reorder cards because of the source edit

#### Scenario: Same-session snapshot refresh failure does not roll back source writes
- **WHEN** a source edit saves successfully but same-session snapshot refresh fails
- **THEN** the source write SHALL remain saved
- **AND** Review SHALL warn that some session cards may refresh on next load
- **AND** SHALL NOT report the source save itself as failed

#### Scenario: CDF relation edit uses relation preview and repair
- **WHEN** a concept-definition or descriptor edit may affect live CDF relations
- **THEN** Review SHALL preview relation changes before persisting when previewable changes exist
- **AND** SHALL apply the existing CDF write-repair flow after confirmed saves
- **AND** SHALL keep relation direction and relation kind read-only in the source editing panel

#### Scenario: Concept reference change defaults to current relation only
- **WHEN** the user changes the selected concept card reference for a concept-definition or descriptor card
- **THEN** Review SHALL default the change to the current relation/card only
- **AND** SHALL require a secondary explicit confirmation before applying the concept change to same-source related relations

### Requirement: Invalid post-save cards leave the current review session safely
The system SHALL re-evaluate the current card after saving source edits. If the card no longer qualifies for review, Review SHALL remove it from the current session without scoring and route diagnostics according to card family.

#### Scenario: Saved card remains reviewable
- **WHEN** a source edit saves and the current card still qualifies for the current review renderer
- **THEN** Review SHALL keep the current card visible
- **AND** SHALL refresh it in place

#### Scenario: Saved card becomes invalid
- **WHEN** a source edit saves and the current card no longer qualifies for review
- **THEN** Review SHALL remove the current card from the active session without scoring it
- **AND** SHALL advance to the next eligible card when one exists
- **AND** SHALL tell the user that the saved card is no longer reviewable in this session

#### Scenario: CDF invalid card routes to CDF abnormal browser
- **WHEN** the invalid post-save card has CDF live relation metadata or blocking CDF relation issues
- **THEN** the system SHALL make it visible through the existing `cdf-abnormal` diagnostic path
- **AND** SHALL NOT create a separate duplicate abnormal category for that CDF case

#### Scenario: Non-CDF invalid card records session diagnostic only
- **WHEN** the invalid post-save card is not a CDF live relation card
- **THEN** Review SHALL record a review-session diagnostic for the removal
- **AND** SHALL NOT add the card to `cdf-abnormal`
