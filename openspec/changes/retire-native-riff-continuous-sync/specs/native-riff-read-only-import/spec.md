## ADDED Requirements

### Requirement: Native Riff is a read-only explicit import source
The system SHALL read Native Riff card facts only after a user explicitly starts Native Riff import preview or apply.

#### Scenario: Plugin starts normally
- **WHEN** SiYuanMemo starts
- **THEN** it MUST NOT scan Native Riff cards
- **AND** it MUST NOT submit Native Riff import or reconciliation background work

#### Scenario: Browser or Review opens
- **WHEN** the user opens Browser or Review
- **THEN** the system MUST NOT scan, import, reconcile, or checkpoint Native Riff state

#### Scenario: User starts import preview
- **WHEN** the user explicitly starts Native Riff import preview
- **THEN** the system MAY read Native Riff facts through the read-only import source
- **AND** preview MUST NOT mutate Native Riff or SiYuanMemo card state

### Requirement: SiYuanMemo never writes Native Riff
The system SHALL NOT add, remove, rate, or otherwise mutate Native Riff cards.

#### Scenario: SiYuanMemo creates a card
- **WHEN** AutoCard, Progressive, Topic-derived item, block menu, or another SiYuanMemo path creates a card
- **THEN** it MUST NOT call Native Riff add-card behavior

#### Scenario: SiYuanMemo deletes a card
- **WHEN** a user deletes a SiYuanMemo card
- **THEN** the system MUST NOT call Native Riff remove-card behavior

#### Scenario: SiYuanMemo reviews an imported card
- **WHEN** the user rates an imported card in SiYuanMemo Review
- **THEN** the system MUST commit only SiYuanMemo scheduling state
- **AND** it MUST NOT submit Native Riff feedback

### Requirement: Explicit import previews deterministic classifications
The system SHALL preview each Native Riff import candidate before apply using deterministic import classifications.

#### Scenario: Candidate has no matching local face
- **WHEN** preview resolves a valid semantic face that has no matching SiYuanMemo logical identity
- **THEN** it MUST classify the face as importable

#### Scenario: Candidate matches an existing local-owned face
- **WHEN** preview finds an existing `local-owned` face with the same logical identity
- **THEN** it MUST classify the face as already owned
- **AND** apply MUST NOT mutate that existing face

#### Scenario: Candidate has semantic conflict
- **WHEN** live source grammar cannot map deterministically to existing face identity
- **THEN** preview MUST classify the candidate as a semantic conflict
- **AND** apply MUST NOT delete or replace existing faces

### Requirement: Explicit import completes only missing faces
The system SHALL compare semantic `block + face/rule` identity and create only missing faces.

#### Scenario: Source block has some existing faces
- **WHEN** a source block resolves faces zero, one, and two
- **AND** matching local-owned faces zero and one already exist
- **THEN** apply MUST create only face two
- **AND** faces zero and one MUST retain their identities, scheduling state, and review history

### Requirement: New imports use one-time schedule seeds
The system SHALL use a valid Native Riff current-schedule snapshot only to initialize a newly created imported card.

#### Scenario: New candidate has valid schedule evidence
- **WHEN** an importable face has valid Native Riff current schedule evidence
- **THEN** the new SiYuanMemo card MAY initialize current due and scheduler state from that evidence
- **AND** subsequent scheduling MUST be owned only by SiYuanMemo

#### Scenario: Existing card has Native Riff schedule evidence
- **WHEN** a candidate matches an existing SiYuanMemo card
- **THEN** import MUST NOT overwrite due, stability, difficulty, reps, lapses, last review, or review history

#### Scenario: Schedule evidence is invalid
- **WHEN** a new import candidate lacks valid schedule evidence
- **THEN** the new SiYuanMemo card MUST use normal new-card scheduling state

### Requirement: Import receipts are immutable provenance
The system SHALL retain immutable Native Riff import receipts for idempotency and diagnostics without granting Native Riff ownership.

#### Scenario: New card is imported
- **WHEN** explicit import creates a new SiYuanMemo card
- **THEN** the card or Xiuyuan MUST record native card identity, deck identity, and initial import time as an import receipt

#### Scenario: Ownership is inferred
- **WHEN** a card has a Native Riff import receipt or legacy `riffCardId`
- **THEN** receipt presence alone MUST NOT classify the card as `riff-managed`

#### Scenario: Native Riff changes after import
- **WHEN** the native card is modified, rated, or deleted after import
- **THEN** the imported SiYuanMemo card MUST remain unchanged

### Requirement: Import respects tombstones and legacy exclusions
The system SHALL suppress ordinary import for matching deletion tombstones and legacy import exclusions.

#### Scenario: Candidate matches a local deletion tombstone
- **WHEN** explicit import encounters a matching Native Riff import tombstone
- **THEN** preview MUST classify the candidate as tombstoned
- **AND** ordinary apply MUST NOT recreate it

#### Scenario: Candidate matches a legacy import exclusion
- **WHEN** explicit import encounters a matching migrated legacy blacklist exclusion
- **THEN** preview MUST classify it as legacy-blacklisted
- **AND** ordinary apply MUST NOT recreate it

#### Scenario: User explicitly restores
- **WHEN** the user confirms restore-and-import for a tombstoned or legacy-excluded candidate
- **THEN** the system MUST remove only the matching suppression evidence
- **AND** it MAY import the selected candidate

### Requirement: Existing riff-managed cards are adopted in place
The system SHALL adopt existing `riff-managed` cards only through explicit preview/apply migration.

#### Scenario: Startup sees adoption candidates
- **WHEN** startup detects existing `riff-managed` records
- **THEN** it MAY report a candidate count
- **AND** it MUST NOT mutate ownership, templates, faces, render contracts, scheduling state, or review history

#### Scenario: User applies adoption
- **WHEN** the user confirms adoption for an adoptable `riff-managed` card
- **THEN** the system MUST preserve the existing card ID and Xiuyuan ID
- **AND** it MUST preserve scheduling state, review history, tags, and priority
- **AND** it MUST convert ownership to `local-owned`
- **AND** it MUST retain an immutable import receipt

### Requirement: Adoption rebuilds semantics from live source
The system SHALL rebuild adopted card semantics and render contracts from current SiYuan block Markdown.

#### Scenario: Live source contains supported quick-symbol grammar
- **WHEN** adoption reads valid supported quick-symbol grammar from the source block
- **THEN** it MUST rebuild faces, semantic metadata, symbol evidence, template routing, and SRS Card Render Contract from that grammar
- **AND** it MUST NOT preserve `builtin-riff-sync` as renderer identity

#### Scenario: Live source is missing or invalid
- **WHEN** adoption cannot read valid source Markdown or cannot resolve deterministic grammar
- **THEN** apply MUST fail closed for that card
- **AND** the existing card MUST remain unchanged
- **AND** preview or result MUST expose an explicit repair classification

### Requirement: Import and repair remain separate
The system SHALL NOT use ordinary import apply as a general repair path for existing `local-owned` cards.

#### Scenario: Existing local card needs semantic repair
- **WHEN** import preview detects a matching `local-owned` card with stale or invalid render metadata
- **THEN** preview MUST classify it as existing-needs-repair
- **AND** import apply MUST NOT mutate it
- **AND** the existing semantic repair action remains responsible for repair

