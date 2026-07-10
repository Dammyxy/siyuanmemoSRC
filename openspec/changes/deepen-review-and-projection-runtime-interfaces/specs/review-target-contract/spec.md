## ADDED Requirements

### Requirement: Review Entry Targets and Review Content Targets are distinct
The system SHALL represent session-launch targets and rendered-item targets as separate discriminated contracts.

#### Scenario: Projection queue entry target resolves
- **WHEN** a user launches Retrieval Practice or Incremental Learning
- **THEN** Review Entry Target contains queue identity, entry surface, and Review Admission requirements without render-content fields

#### Scenario: Static or special entry target resolves
- **WHEN** a user launches static subset, NeuralRoam, or managed queue Review
- **THEN** Review Entry Target contains only required launch/session identity for that kind and invalid field combinations are unrepresentable

### Requirement: Review Content Targets use a discriminated contract
The system SHALL represent current rendered Review items as standard card, Topic-derived item, progressive excerpt, or source-location targets.

#### Scenario: Standard card target resolves
- **WHEN** authoritative card and semantic evidence identify a standard schedulable card
- **THEN** the target contains canonical card identity, scheduling classification, render intent, supported actions, and diagnostics

#### Scenario: Imported native Riff card resolves
- **WHEN** a card has Native Riff import or adoption provenance but is owned by SiYuanMemo
- **THEN** Review resolves it as a standard card target
- **AND** Native Riff provenance does not create a Review Entry Target kind or scheduling authority

#### Scenario: Progressive target resolves
- **WHEN** authoritative source-lineage evidence identifies a progressive excerpt or source location
- **THEN** the target contains source identity, lineage, processing classification, render intent, supported actions, and formal-scheduler exclusion state

### Requirement: Target resolution is application-owned
The system SHALL resolve Review Entry Target before session launch and Review Content Target before Review UI or render callers build presentation state.

#### Scenario: Worker session returns current item
- **WHEN** the SRS Review Kernel returns authoritative current card/item identity and state
- **THEN** application target resolution combines that result with semantic and source evidence to produce Review Content Target
- **AND** worker code does not import application target or render contracts

#### Scenario: Review render context is built
- **WHEN** Review prepares a visible item
- **THEN** Review Renderable Context and SRS Card Render Contract consume resolved Review Content Target and MUST NOT rediscover target kind from scattered raw metadata

#### Scenario: Legacy metadata enters the runtime
- **WHEN** a legacy card requires metadata interpretation
- **THEN** one ingress Adapter maps that evidence into a typed target resolution result

### Requirement: Ambiguous targets fail explicitly
The system SHALL return typed unavailable or ambiguous target outcomes when authoritative evidence conflicts or is insufficient.

#### Scenario: Target evidence conflicts
- **WHEN** card semantics, source lineage, or render evidence identifies incompatible target kinds
- **THEN** target resolution returns an ambiguous outcome with diagnostics and MUST NOT choose a hidden renderer or content owner

#### Scenario: Source target is missing
- **WHEN** a progressive or source-location target references missing or detached source content
- **THEN** target resolution returns explicit source-unavailable state without substituting unrelated Browser or queue content

### Requirement: Review target contracts do not own content persistence
The system SHALL keep SiYuan blocks and Xiuyuan aggregates as content authority and SHALL keep Review Entry Target and Review Content Target read-only.

#### Scenario: Target render payload is requested
- **WHEN** Review prepares target presentation
- **THEN** render payload is derived from authoritative source identity and MUST NOT create a copied question/answer content owner

#### Scenario: User invokes target action
- **WHEN** the user answers, edits, advances, defers, converts, skips, or goes back
- **THEN** Review submits a typed command using target identity and the target object itself is not mutated as persistence state
