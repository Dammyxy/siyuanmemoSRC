# application-context-composition-interface Specification

## Purpose
TBD - created by archiving change audit-application-context-composition-interface. Update Purpose after archive.
## Requirements
### Requirement: Composition dependencies are audited by slice
The ApplicationContext composition surface SHALL have an audit that maps high-traffic bounded-context slices to the dependencies they consume from the composition root.

#### Scenario: Browser and Review wiring dependencies are listed
- **WHEN** a maintainer inspects the composition audit
- **THEN** Browser and Review wiring dependencies are listed separately from storage, sync, UI manager, and backend runtime dependencies

#### Scenario: Remaining broad getters are documented
- **WHEN** a broad getter or ApplicationContext-shaped dependency remains after this change
- **THEN** the audit documents why it remains and the next safe migration slice

### Requirement: Internal factory seams use narrow composition Interfaces
Factory modules that only need a bounded subset of ApplicationContext SHALL accept narrow internal composition Interfaces instead of the full root shape when practical within the touched slice.

#### Scenario: Review/Browser service bundle consumes a narrow Interface
- **WHEN** the Review/Browser service bundle is constructed
- **THEN** its factory input describes only the dependencies needed by that bundle and does not require callers to satisfy the full `ApplicationContext` surface

#### Scenario: Backend runtime bundle dependencies remain explicit
- **WHEN** backend runtime wiring is constructed
- **THEN** cross-family dependencies are listed explicitly and runtime ownership remains unchanged

### Requirement: Public ApplicationContext compatibility is preserved
The public `ApplicationContext` facade SHALL remain compatible with existing callers during this change.

#### Scenario: Existing caller uses a broad getter
- **WHEN** an existing caller still invokes a public `ApplicationContext` getter that is outside the narrowed internal seam
- **THEN** the getter remains available unless a focused follow-up change migrates that caller

### Requirement: Runtime behavior is unchanged by interface audit
The composition-interface audit and factory seam narrowing SHALL NOT change service creation order, singleton behavior, backend worker ownership, writer relay routing, or SQL ownership.

#### Scenario: Startup wiring still creates the same service family
- **WHEN** the application context starts after the change
- **THEN** Browser, Review, storage, sync, and backend runtime services are created through the same owners and lifetimes as before

