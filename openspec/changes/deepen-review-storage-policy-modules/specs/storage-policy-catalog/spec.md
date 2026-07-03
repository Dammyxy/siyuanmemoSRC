## ADDED Requirements

### Requirement: Storage policy catalog owns truth and SQL projection policy declarations
The system SHALL provide an internal contracts storage policy catalog module that owns MessagePack truth family schemas, truth family storage policies, SQL projection schemas, and storage payload policy declarations.

#### Scenario: Policy declarations live in catalog module
- **WHEN** maintainers update MessagePack truth family policy or SQL projection policy
- **THEN** those declarations SHALL be maintained in the storage policy catalog module instead of inline in the broad backend RPC contract file

#### Scenario: Backend RPC exports remain compatible
- **WHEN** existing runtime or tests import storage policy constants and types from `packages/contracts/src/backend-rpc.ts`
- **THEN** those imports SHALL continue to work through compatibility re-exports
- **AND** no JSON-RPC request/response shape or method string SHALL change

### Requirement: Storage policy catalog remains contract-only
The storage policy catalog SHALL remain a contracts-layer declaration module and SHALL NOT introduce runtime storage behavior.

#### Scenario: Runtime reads existing policy exports
- **WHEN** worker truth stores, migration receipts, or contract tests read policy schemas
- **THEN** they SHALL observe the same values as before the extraction
- **AND** the catalog SHALL NOT import worker, renderer, SQL runtime, or filesystem code

#### Scenario: SQL-first runtime semantics are unchanged
- **WHEN** Review, Browser, Queue, or startup storage paths use SQL projection or MessagePack truth policy exports
- **THEN** durable truth, temp projection, and fail-closed semantics SHALL remain unchanged
