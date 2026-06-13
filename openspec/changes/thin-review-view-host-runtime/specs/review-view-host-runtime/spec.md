## ADDED Requirements

### Requirement: Review View host runtime concerns are extracted
The system SHALL move selected non-rendering Review View host/runtime concerns behind focused UI-owned runtime Modules consumed by `ReviewView.vue`.

#### Scenario: Plugin context and truth flush use runtime Interface
- **WHEN** Review View needs to request a Review truth flush
- **THEN** it calls a host runtime Interface instead of resolving plugin context and backend client inline in the view body

#### Scenario: Source refresh uses runtime Interface
- **WHEN** Review View needs source dependency ids and source refresh commands
- **THEN** source refresh wiring is provided by a focused runtime Module with the same user-visible behavior

### Requirement: Extracted Review View runtimes preserve existing behavior
The system SHALL preserve current Review action, inline editor, source refresh, viewport, and CDF interruption behavior while moving ownership out of the view body.

#### Scenario: Inline editor state survives extraction
- **WHEN** a user opens and confirms the Review inline editor
- **THEN** the same edit state, validation state, and save command behavior remain available through the extracted runtime

#### Scenario: CDF interruption projection survives extraction
- **WHEN** the current Review card has blocking CDF live relation metadata
- **THEN** the Review View displays the same interruption state after extraction

### Requirement: AI and agent surfaces are excluded
The system SHALL NOT include AI sidecar, AI workbench, Semantic activation, NeuralRoam route semantics, or agent-specific behavior in this Review View host runtime extraction.

#### Scenario: Scope check excludes AI and agent paths
- **WHEN** implementation completes
- **THEN** changed Review View host runtime files exclude AI/agent ownership and preserve existing AI/Semantic/NeuralRoam behavior
