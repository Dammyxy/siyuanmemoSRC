## ADDED Requirements

### Requirement: Progressive excerpt materialization uses one application Interface
The system SHALL materialize Progressive excerpts through one application-owned Interface that returns the created or duplicate excerpt result.

#### Scenario: Source-child excerpt materializes through the Interface
- **WHEN** excerpt storage policy chooses source-child storage for a valid selection
- **THEN** the materialization Interface returns the excerpt entity, topic card id, source block ids, and lineage metadata

#### Scenario: Daily-note excerpt materializes through the Interface
- **WHEN** excerpt storage policy chooses daily-note storage for a valid selection
- **THEN** the materialization Interface returns a block excerpt result with the same source lineage and topic-card linkage contract

### Requirement: Duplicate excerpt behavior remains explicit
The system SHALL preserve duplicate excerpt detection and return an explicit duplicate result without creating an extra excerpt entity.

#### Scenario: Existing excerpt record is detected
- **WHEN** an excerpt record already exists for the normalized source block ids and selected text
- **THEN** the materialization Interface returns a duplicate result containing the existing record

### Requirement: Progressive source lineage is attached during materialization
The system SHALL attach source lineage, source availability, and Progressive attrs during materialization before the result is returned to callers.

#### Scenario: Excerpt attrs include source and parent lineage
- **WHEN** a valid excerpt is materialized from a source with parent topic or parent excerpt context
- **THEN** the created entity receives attrs that include source block ids and parent lineage identifiers

#### Scenario: Invalid source returns explicit failure
- **WHEN** the source block cannot provide required root or notebook identity
- **THEN** the materialization Interface reports explicit failure and MUST NOT create partial excerpt artifacts
