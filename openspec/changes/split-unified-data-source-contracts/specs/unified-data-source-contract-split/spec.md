## ADDED Requirements

### Requirement: Unified data-source contracts are split by caller intent
The unified data-source contract surface SHALL be separated into smaller modules that group related Interfaces by caller intent.

#### Scenario: Queue core callers import queue contracts only
- **WHEN** a queue runtime caller needs queue type, queue stats, queue observer, or review result contracts
- **THEN** it can import those contracts from a queue-focused module without importing Browser filter or NeuralRoam session contracts

#### Scenario: Projection callers import projection contracts only
- **WHEN** a Browser or Queue Projection caller needs projection rollout diagnostics, readiness, read mode, or live identity contracts
- **THEN** it can import those contracts from a projection-focused module without importing queue UI config or Browser filter contracts

#### Scenario: Browser filter callers import Browser contracts only
- **WHEN** a Browser query or filter caller needs Browser card filter, filter session snapshot, or Review transfer state contracts
- **THEN** it can import those contracts from a Browser-focused module without importing queue implementation contracts

### Requirement: Compatibility barrel remains available
The existing `@/types/unified-data-source` import path SHALL remain available as a compatibility barrel during this migration.

#### Scenario: Existing import site is not migrated yet
- **WHEN** an existing caller still imports from `@/types/unified-data-source`
- **THEN** the same public contract remains exported unless a focused follow-up explicitly removes it

#### Scenario: Public export parity is checked
- **WHEN** the contract split is validated
- **THEN** tests or type-level checks prove that selected public contracts are still exported from the compatibility barrel

### Requirement: Contract split does not change runtime behavior
Splitting unified data-source contracts SHALL NOT change queue membership, projection materialization, Review feedback, scheduler behavior, manager singleton behavior, or queue UI behavior.

#### Scenario: Queue runtime behavior after import migration
- **WHEN** selected Browser, Review, or Queue files migrate imports to narrower modules
- **THEN** their focused runtime tests continue to pass with no behavior change

### Requirement: Layer direction stays stable
New contract modules MUST NOT introduce concrete dependencies from `types` into UI, application services, infrastructure adapters, or runtime implementations.

#### Scenario: Boundary checks run after split
- **WHEN** boundary validation runs
- **THEN** the new contract modules do not violate the existing `ui -> application -> core -> infrastructure` direction
