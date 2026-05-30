## ADDED Requirements

### Requirement: Authoritative card semantic locator reads
The system SHALL resolve review-instance identity from `FSRSCard.faceKey` before using legacy projection metadata such as `meta.faceIndex`, `meta.ruleIndex`, `meta.ruleId`, or `meta.typeMarker`.

#### Scenario: Face key wins over stale legacy face index
- **WHEN** a card contains `faceKey.faceIndex` and a different legacy `meta.faceIndex`
- **THEN** active Review and render-instance selection SHALL use `faceKey.faceIndex`

#### Scenario: Rule id wins over legacy type marker
- **WHEN** a card contains `faceKey.ruleId` and legacy `meta.typeMarker`
- **THEN** active Review and render-instance selection SHALL use `faceKey.ruleId` for stable rule identity

#### Scenario: Legacy metadata remains compatibility fallback
- **WHEN** a card does not contain `faceKey`
- **THEN** active callers MAY derive a locator from legacy `meta.faceIndex`, `meta.ruleIndex`, `meta.ruleId`, or `meta.typeMarker`
- **AND** that fallback SHALL be treated as compatibility-read behavior, not long-term semantic authority

### Requirement: Review session exclusion uses stable semantic locator
The system SHALL build Review session sibling/completion exclusion keys from stable card semantic locator data so stale projection metadata cannot exclude the wrong derived card.

#### Scenario: Reviewed sibling is excluded by face key
- **WHEN** a reviewed card and another queued card share the same block or Xiuyuan identity and the same `faceKey`
- **THEN** the other queued card SHALL be excluded from the current completed Review session

#### Scenario: Different face key remains reviewable
- **WHEN** a reviewed card and another queued card share the same block or Xiuyuan identity but have different `faceKey` values
- **THEN** the other queued card SHALL remain reviewable in the current session

#### Scenario: Stale meta does not drive exclusion
- **WHEN** a reviewed card has `faceKey.faceIndex = 1` and stale `meta.faceIndex = 0`
- **THEN** the session exclusion key SHALL match face index `1` and SHALL NOT exclude a queued card whose authoritative `faceKey.faceIndex` is `0`

### Requirement: Special renderers use face key for card instance selection
The system SHALL use authoritative `faceKey` data when special card renderers choose a cloze face, concept-definition face, or rule direction from an `FSRSCard`.

#### Scenario: Multi-cloze renderer uses face key index
- **WHEN** a multi-cloze card has `faceKey.faceIndex = 2` and stale `meta.faceIndex = 0`
- **THEN** the multi-cloze renderer SHALL render face index `2`

#### Scenario: Concept-definition renderer uses face key index and rule direction
- **WHEN** a concept-definition card has `faceKey` that identifies a reverse rule and a stale forward `meta.typeMarker`
- **THEN** the concept-definition renderer SHALL render the reverse direction selected by the authoritative rule identity

#### Scenario: Legacy cards still render
- **WHEN** a special-rendered card lacks `faceKey` but has legacy face or direction metadata
- **THEN** the renderer SHALL continue to render using legacy fallback metadata

### Requirement: SRS editor semantic overwrite confirmation completes explicit retry
The system SHALL provide an explicit confirmation path after an SRS editor type or render transition returns `confirmation-required`, and SHALL mutate protected semantic payload only after confirmed intent is supplied to the application service.

#### Scenario: Confirmation-required result leaves card unchanged
- **WHEN** a user requests a type or render transition that would overwrite protected semantic payload
- **THEN** the dialog SHALL show the protected fields and SHALL NOT call the persistence update with confirmed overwrite intent

#### Scenario: User confirms semantic overwrite
- **WHEN** the dialog has a pending semantic overwrite command and the user confirms it
- **THEN** the dialog SHALL retry the same command with `semanticOverwriteIntent.confirmed = true`
- **AND** the card SHALL update only after the confirmed service result is applied

#### Scenario: Pending confirmation does not apply to a different card
- **WHEN** the dialog receives a snapshot for a different card or the user starts a different edit command before confirming
- **THEN** the pending semantic overwrite command SHALL be cleared
- **AND** confirming the old command SHALL NOT update the new card
