## ADDED Requirements

### Requirement: Review concept-roam focus uses semantic contract
The system SHALL resolve Review concept-roam focus from semantic card data and render context policy before using legacy projection metadata.

#### Scenario: Field mapping selects concept focus
- **WHEN** a concept-definition or descriptor Review card has `fieldMapping.concept`
- **THEN** concept-roam focus SHALL use that mapped concept block id
- **AND** it SHALL NOT depend on `meta.templateID` or `meta.typeMarker`

#### Scenario: Legacy projection is fallback only
- **WHEN** a Review card lacks semantic field mapping and render context policy but has legacy projection metadata
- **THEN** concept-roam MAY use the existing legacy candidate logic
- **AND** that path SHALL be classified as compatibility fallback

#### Scenario: Ambiguous focus is not guessed
- **WHEN** semantic and block candidates do not identify one unambiguous concept focus
- **THEN** concept-roam SHALL return no focus target instead of guessing from stale legacy markers

### Requirement: Special renderer component identity uses review-instance tokens
The system SHALL build special renderer component identity keys from `faceKey`, render policy cache tokens, card id, block id, and update epoch before falling back to legacy `meta.faceIndex/templateID/typeMarker`.

#### Scenario: Face key beats stale face index in component cache
- **WHEN** a Review card has `faceKey.faceIndex = 2` and legacy `meta.faceIndex = 0`
- **THEN** concept-definition and multi-cloze renderer identity SHALL include the face-key token
- **AND** stale legacy face index SHALL NOT cause reuse of the wrong prepared view model

#### Scenario: Old card can still render
- **WHEN** an old card lacks `faceKey` and render policy cache tokens
- **THEN** renderer identity MAY use legacy projection fields as compatibility fallback
- **AND** the fallback SHALL NOT override present review-instance tokens

### Requirement: Review adapter raw meta reads are purpose-scoped
The system SHALL keep raw `card.meta` reads inside `UnifiedReviewAdapter` only behind named helper purposes: render policy, answer block selection, native Riff behavior, list-template display, dependency block collection, and diagnostics.

#### Scenario: Answer block selection is isolated
- **WHEN** the Review adapter selects an answer block id
- **THEN** the logic SHALL use a named answer-block helper
- **AND** raw legacy meta reads in that helper SHALL NOT determine special renderer kind when render policy is present

#### Scenario: Native Riff behavior is isolated
- **WHEN** the Review adapter handles `builtin-riff-sync` behavior
- **THEN** the logic SHALL live behind a named native-Riff/list-template helper
- **AND** it SHALL NOT be mixed with semantic renderer routing authority

#### Scenario: Diagnostics can include legacy projection
- **WHEN** the Review adapter emits debug metadata
- **THEN** it MAY include `templateID`, `typeMarker`, `faceIndex`, `frontBlockIDs`, and `backBlockIDs`
- **AND** those values SHALL be classified as diagnostic projection rather than authority

### Requirement: Browser display uses explicit display projection
The system SHALL derive Browser preview/display structural choices from an explicit display projection helper instead of inline comparisons against `meta.templateID`.

#### Scenario: List-template breadcrumb trimming uses display projection
- **WHEN** Browser preview needs to decide breadcrumb trim count for a list-template card
- **THEN** it SHALL query the display projection helper
- **AND** it SHALL NOT inline `meta.templateID === 'builtin-list-item'` in the preview helper

#### Scenario: Display projection preserves old-card compatibility
- **WHEN** an old card has no new display projection but has legacy template metadata
- **THEN** the helper MAY derive the display decision from legacy metadata
- **AND** callers SHALL remain unaware of the legacy field shape

### Requirement: Historical Riff shadow cards are audit-first
The system SHALL detect same-block native Riff shadow cards that coexist with plugin-owned Xiuyuan cards before applying any destructive cleanup.

#### Scenario: Shadow audit reports ownership evidence
- **WHEN** a block has a plugin-owned Xiuyuan card and a same-block `builtin-riff-sync` shadow card
- **THEN** the audit SHALL report block id, plugin card ids, shadow card ids, template/source/ownership evidence, and proposed action

#### Scenario: Startup does not auto-delete shadows
- **WHEN** startup detects historical Riff shadow cards
- **THEN** it SHALL NOT automatically delete or tombstone them without an explicit repair command or user/admin action
- **AND** the runtime MAY hide or exclude them only through a named, tested policy

### Requirement: Review render fallback retirement is proof-gated
The system SHALL remove Review UI render compatibility fallback only after active Review state construction is proven to always include `renderContext.renderPolicy`.

#### Scenario: Active Review state carries policy
- **WHEN** Review state is produced by the active Review adapter/factory path
- **THEN** the state SHALL include `meta.renderContext.renderPolicy`
- **AND** Review UI SHALL not need to recompute renderer routing from raw legacy meta

#### Scenario: Fallback removal does not break classified legacy states
- **WHEN** a test fixture, restored session, or compatibility state lacks render context policy
- **THEN** the implementation SHALL either rebuild it with render context policy or classify it as an explicit unsupported/compatibility state
- **AND** hidden UI-local semantic routing SHALL NOT remain as an untracked fallback
