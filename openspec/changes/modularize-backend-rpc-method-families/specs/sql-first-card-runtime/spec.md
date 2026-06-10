## ADDED Requirements

### Requirement: Backend RPC modularization preserves SQL worker authority
The system SHALL treat backend RPC method-family modularization as a seam-deepening refactor only and SHALL NOT change SQL-first ownership, worker authority, projection truth ownership, or active-path unavailable behavior.

#### Scenario: SQL-first path keeps worker owner
- **WHEN** a SQL-first Browser, Queue Projection, Review, NeuralRoam, or Xiuyuan backend RPC method is migrated into a method-family Module
- **THEN** SQL reads and writes SHALL remain owned by the existing worker-side services and repositories rather than moving into UI, application, kernel sidecar, or client code

#### Scenario: No hidden fallback during migration
- **WHEN** a migrated method-family adapter cannot satisfy a required dependency
- **THEN** it SHALL return the existing explicit unavailable or fail-closed error behavior and SHALL NOT call stale local queue, legacy snapshot, UI SQL, kernel DB, or compatibility mutation paths

#### Scenario: Wire contract stays compatible
- **WHEN** an existing SQL-first backend RPC method is called after migration
- **THEN** callers SHALL receive the same method name, request shape, result shape, and domain diagnostics as before the method-family refactor
