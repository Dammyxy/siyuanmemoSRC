## ADDED Requirements

### Requirement: Review render routing uses render context policy
The system SHALL route Review content to special renderers using `ReviewRenderableContext.renderPolicy` when it is present, instead of recomputing semantic renderer choice from raw legacy `FSRSCard.meta` in the UI.

#### Scenario: Context policy selects semantic renderer
- **WHEN** Review UI receives a protyle content state with `meta.renderContext.renderPolicy.specialRendererKind = concept-definition`
- **THEN** the Review content surface SHALL use the concept-definition renderer
- **AND** it SHALL NOT require `meta.templateID` or `meta.typeMarker` on the card to independently identify the renderer

#### Scenario: Stale legacy metadata does not override context policy
- **WHEN** Review UI receives a card whose legacy `meta.templateID` or `meta.typeMarker` suggests a different renderer than `renderPolicy.specialRendererKind`
- **THEN** the Review content surface SHALL prefer `renderPolicy.specialRendererKind`

### Requirement: Render context names legacy projection fallback
The system SHALL keep compatibility for old cards by allowing the render context builder to read legacy projection metadata, but SHALL expose that read as named fallback diagnostics rather than UI semantic authority.

#### Scenario: Old card without new semantic context still renders
- **WHEN** a Review card lacks newer semantic routing data but has legacy projection metadata sufficient to route rendering
- **THEN** the render context builder MAY derive a compatible render policy from that metadata
- **AND** the resulting policy SHALL include diagnostics indicating legacy projection fallback was used

#### Scenario: UI fallback remains compatibility-only
- **WHEN** Review UI receives a state without `meta.renderContext.renderPolicy`
- **THEN** it MAY use existing local detection as compatibility fallback
- **AND** that fallback SHALL NOT override a present render context policy

### Requirement: Prepared Review presentation follows render context policy
The system SHALL prepare renderer-owned view models using render context policy before using UI-local metadata heuristics.

#### Scenario: Prepared renderer follows policy
- **WHEN** `prepareReviewPresentation()` receives a Review state whose render context policy selects `multi-cloze`, `concept-definition`, `concept`, `descriptor`, or `quick`
- **THEN** it SHALL call the matching render service
- **AND** it SHALL reuse the policy-derived identity tokens when deciding whether a prepared view model is still current

#### Scenario: Image occlusion remains UI-only prepared exception
- **WHEN** the render context policy selects image occlusion
- **THEN** `prepareReviewPresentation()` SHALL NOT prebuild a prepared renderer view model
- **AND** the component-level image occlusion renderer SHALL continue to own rendering
