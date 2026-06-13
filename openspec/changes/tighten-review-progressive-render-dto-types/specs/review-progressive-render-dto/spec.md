## ADDED Requirements

### Requirement: Progressive render metadata uses typed DTO normalization
Review render context assembly SHALL normalize progressive card metadata through a typed DTO contract before exposing progressive source lineage, disclosure state, payload identity, or source availability to Review UI state.

#### Scenario: Valid progressive render DTO is preserved
- **WHEN** a Review card contains a valid progressive render metadata DTO with source lineage, disclosure state, payload identity, and source availability
- **THEN** the Review UI render context exposes the normalized progressive values without changing the card's Review queue behavior

#### Scenario: Malformed progressive render DTO fragments are rejected
- **WHEN** a Review card contains malformed progressive render metadata fragments for disclosure state, payload identity, or source availability
- **THEN** those malformed fragments are not exposed as typed Review render context values

### Requirement: Legacy progressive source lineage fallback is preserved
Review render context assembly SHALL keep synthesizing source lineage for legacy progressive excerpt or piece metadata that has source identifiers but no typed `sourceLineage` DTO.

#### Scenario: Legacy excerpt metadata still builds a progressive render target
- **WHEN** a Review card contains legacy progressive excerpt metadata with source block or source document identifiers and no typed `sourceLineage`
- **THEN** the Review UI render context still identifies the card as a progressive excerpt with source lineage

### Requirement: Review adapter does not own progressive DTO casts
`UnifiedReviewAdapter` SHALL delegate progressive render metadata normalization to the Review render context module and MUST NOT cast broad records directly into progressive render DTO types.

#### Scenario: Adapter delegates progressive DTO normalization
- **WHEN** `UnifiedReviewAdapter` builds Review UI state for a progressive card
- **THEN** progressive DTO validation happens through the shared Review render context normalizer rather than adapter-local `unknown as` casts
