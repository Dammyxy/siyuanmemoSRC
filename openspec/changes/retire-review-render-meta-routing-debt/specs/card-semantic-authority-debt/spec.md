## ADDED Requirements

### Requirement: Review render-policy legacy reads are compatibility projections
Review render-policy code SHALL treat legacy `meta.templateID`, `meta.typeMarker`, and `meta.faceIndex` reads as compatibility projection inputs, not long-term semantic authority, whenever an adapter-provided render context policy is available.

#### Scenario: Render policy beats stale legacy type marker
- **WHEN** a Review state contains `renderContext.renderPolicy.specialRendererKind = descriptor`
- **AND** the card's legacy `meta.typeMarker` suggests `concept-definition`
- **THEN** active Review routing SHALL select the descriptor renderer

#### Scenario: Face key remains review instance authority
- **WHEN** render-policy cache or identity tokens need a review-instance discriminator
- **THEN** they SHALL use `faceKey`/semantic locator tokens before legacy `meta.faceIndex`

#### Scenario: Legacy projection remains readable
- **WHEN** an old Review state has no render context policy
- **THEN** Review MAY still read legacy metadata to keep the card renderable
- **AND** that path SHALL remain a compatibility fallback until the old state is rebuilt with render context policy
