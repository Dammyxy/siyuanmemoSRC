## ADDED Requirements

### Requirement: Record SRS Card Creation Receipts
The system SHALL record immutable creation receipt evidence for newly created managed SRS cards after semantic reconciliation is available.

#### Scenario: List card creation records receipt
- **WHEN** the system creates cards through the list-template creation path
- **THEN** it SHALL record a creation receipt containing semantic kind, template ID, source block IDs, card IDs, creation family, and creation timestamp

#### Scenario: CDF card creation records receipt
- **WHEN** the system creates cards through concept-definition or concept-descriptor paths
- **THEN** it SHALL record a creation receipt containing CDF family, template ID, field mapping evidence, source block IDs, generated card IDs, and semantic kind

#### Scenario: Progressive Topic and Item creation records receipt
- **WHEN** the system creates progressive Topic or Topic-derived Item cards
- **THEN** it SHALL record a creation receipt containing progressive kind, parent/source lineage, template ID when present, generated card IDs, and semantic kind

### Requirement: Prefer Creation Receipts During Semantic Resolution
The SRS Card Semantics Module SHALL prefer valid creation receipt evidence over legacy scattered fields when resolving semantic kind.

#### Scenario: Receipt overrides stale raw type
- **WHEN** a managed SRS card has a valid creation receipt proving semantic kind `item` and the persisted raw `type` says `topic`
- **THEN** the SRS Card Semantics Module SHALL resolve the effective semantic kind as `item` and include receipt evidence in the result

#### Scenario: Invalid receipt is diagnostic evidence only
- **WHEN** a creation receipt is missing required identifiers, references a different card, or conflicts with stronger repository ownership evidence
- **THEN** the SRS Card Semantics Module SHALL treat the receipt as diagnostic evidence only and SHALL NOT use it as deterministic repair proof

### Requirement: Creation Receipts Are Append-Safe Evidence
Creation receipts SHALL be append-safe diagnostic evidence and SHALL NOT become a second scheduler, queue, or card content authority.

#### Scenario: Receipt does not replace card storage
- **WHEN** Browser, Review, or Queue needs current scheduling state, content, or membership
- **THEN** the system SHALL continue to read those facts from their declared owners and SHALL NOT use creation receipts as replacement card rows

#### Scenario: Receipt supports future migration
- **WHEN** a future migration needs to reconcile semantic kind after field drift
- **THEN** the migration SHALL be able to use creation receipts as first-class evidence before falling back to template or marker evidence

