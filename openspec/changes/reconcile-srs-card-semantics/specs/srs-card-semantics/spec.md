## ADDED Requirements

### Requirement: Resolve Effective SRS Card Semantics
The system SHALL resolve an SRS card's effective semantic kind through one SRS Card Semantics Module Interface instead of requiring Browser, Review, Queue, migration, or repair callers to inspect scattered card fields directly.

#### Scenario: List template card resolves as item
- **WHEN** a managed SRS card has Xiuyuan template evidence `builtin-list-item` and persisted `type = topic`
- **THEN** the SRS Card Semantics Module SHALL resolve the effective semantic kind as `item` with deterministic template evidence

#### Scenario: Progressive root resolves as topic
- **WHEN** a managed SRS card has progressive lineage evidence with `kind = piece` or `kind = excerpt`
- **THEN** the SRS Card Semantics Module SHALL resolve the effective semantic kind as `topic` when no stronger conflicting evidence exists

#### Scenario: Progressive derived item resolves as item
- **WHEN** a managed SRS card has progressive lineage evidence with `kind = derived-item`
- **THEN** the SRS Card Semantics Module SHALL resolve the effective semantic kind as `item` with deterministic progressive evidence

#### Scenario: Ambiguous evidence fails closed
- **WHEN** a managed SRS card has conflicting deterministic evidence from creation/template metadata and card markers
- **THEN** the SRS Card Semantics Module SHALL return an ambiguous diagnostic and SHALL NOT produce an automatic repair patch

### Requirement: Resolve CDF SRS Card Semantics
The system SHALL resolve CDF definition and descriptor cards from durable Xiuyuan/template evidence before using raw `FSRSCard.type`.

#### Scenario: Concept definition card keeps descriptor-review contract
- **WHEN** a managed SRS card has Xiuyuan template evidence matching `builtin-concept-definition`, `builtin-concept-definition-forward`, or `builtin-concept-definition-reverse`
- **THEN** the SRS Card Semantics Module SHALL resolve the effective semantic kind according to the existing CDF runtime contract and include template evidence in the result

#### Scenario: Concept descriptor card resolves as descriptor
- **WHEN** a managed SRS card has Xiuyuan template evidence matching `builtin-concept-descriptor`, `builtin-concept-descriptor-reverse`, or `builtin-concept-descriptor-both`
- **THEN** the SRS Card Semantics Module SHALL resolve the effective semantic kind as `descriptor` with deterministic template evidence

#### Scenario: CDF marker mismatch is diagnosable
- **WHEN** a CDF card has template evidence that disagrees with `cardTypeMarker`, `meta.typeMarker`, or raw `type`
- **THEN** the SRS Card Semantics Module SHALL report every conflicting evidence source in the semantic diagnostic

### Requirement: Audit And Repair SRS Card Semantics
The system SHALL provide SRS card semantic reconciliation that audits cards, produces dry-run repair plans, and commits only deterministic repairs with durable receipts.

#### Scenario: Dry-run reports safe repairs
- **WHEN** semantic reconciliation audits cards whose effective semantic kind differs from persisted `type`
- **THEN** the system SHALL return counts, example rows, before/after semantic kinds, and evidence for every safe repair without mutating card data

#### Scenario: Commit applies deterministic repairs
- **WHEN** the user explicitly commits a dry-run repair plan containing deterministic repairs
- **THEN** the system SHALL update card semantic fields and projection evidence through the card persistence owner and write a repair receipt

#### Scenario: Commit skips ambiguous repairs
- **WHEN** a dry-run repair plan contains ambiguous, insufficient, or conflicting evidence
- **THEN** the system SHALL skip those cards during commit and include their diagnostics in the repair receipt

### Requirement: User-Facing Semantic Repair Entry
The system SHALL expose card semantic diagnosis and repair through a dedicated action separate from the SRS scheduling data editor.

#### Scenario: Existing SRS editor remains scheduling-focused
- **WHEN** the user opens "编辑SRS数据"
- **THEN** the system SHALL keep that editor focused on scheduling and review data rather than semantic card type repair

#### Scenario: Repair action previews before commit
- **WHEN** the user launches the semantic repair action
- **THEN** the system SHALL show a dry-run summary before offering any commit operation

