## ADDED Requirements

### Requirement: Storage bootstrap runtime owns worker startup storage decisions
The system SHALL provide an internal Storage Bootstrap Runtime module that owns worker startup storage decisions for truth discovery, temp projection readiness, projection rebuild requests, receipt reconciliation, runtime reinitialization, and storage diagnostics behind a focused interface.

#### Scenario: Worker delegates bootstrap ordering to focused module
- **WHEN** the backend worker initializes SQLite storage
- **THEN** it SHALL delegate storage bootstrap ordering to the Storage Bootstrap Runtime instead of spreading truth discovery, projection probing, rebuild decisions, and diagnostics across unrelated worker DB methods

#### Scenario: Module interface preserves worker SQL authority
- **WHEN** bootstrap needs to rebuild SQL projections or persist the temp projection
- **THEN** it SHALL call worker-supplied dependencies and SHALL NOT become a second SQL writer, JSON-RPC owner, kernel owner, or storage contract owner

### Requirement: Bootstrap preserves fail-closed truth and projection semantics
The Storage Bootstrap Runtime SHALL preserve existing fail-closed storage behavior while keeping `siyuanmemo.db` as a rebuildable temp projection over durable truth.

#### Scenario: Truth exists and temp projection is unavailable
- **WHEN** durable MessagePack truth exists and the temp SQL projection is missing, corrupt, stale, or schema-incompatible
- **THEN** bootstrap SHALL request a projection rebuild from truth before DB-backed Review or Browser reads are accepted

#### Scenario: Projection rebuild cannot be performed
- **WHEN** required truth input or projection rebuild dependencies are unavailable during startup
- **THEN** bootstrap SHALL surface an explicit storage error and SHALL NOT silently continue with stale SQL state, legacy snapshot storage, or local fallback data

#### Scenario: Legacy petal database remains non-authoritative
- **WHEN** a petal `siyuanmemo.db` exists under plugin storage
- **THEN** bootstrap SHALL report or preserve the existing ignored-legacy diagnostic and SHALL NOT read, migrate, delete, or write that file as active runtime authority

### Requirement: Bootstrap module is directly testable
The Storage Bootstrap Runtime SHALL expose enough observable result and dependency seams for focused tests to verify startup storage decisions without constructing unrelated Review, Queue, Semantic, or Xiuyuan runtime behavior.

#### Scenario: Focused test exercises rebuild decision
- **WHEN** a test supplies truth input and an unavailable temp projection through bootstrap dependencies
- **THEN** the test SHALL be able to verify that bootstrap requests projection rebuild and reports success or failure through the module interface

#### Scenario: Focused test exercises fail-closed path
- **WHEN** a test supplies invalid projection state and no usable truth input
- **THEN** the test SHALL be able to verify explicit fail-closed storage behavior without depending on Review feedback or Browser query execution
