## ADDED Requirements

### Requirement: Composition root owns one terminal startup transition
`src/index.ts`'s outer `plugin.onload` flow SHALL own one explicit transition from starting to the selected ready/recovery mode and SHALL keep deferred maintenance handoff and final startup reporting at that root boundary.

#### Scenario: Required runtime composition is complete
- **WHEN** storage/identity disposition is known, the permitted projection read model is available, settings are loaded, runtime access modules are bound, and required plugin handlers are registered
- **THEN** `plugin.onload` SHALL set `isInitialized` and resolve `contextReady` exactly once after those prerequisites
- **AND** it SHALL hand initial deferred descriptors to the coordinator only after publishing that transition

#### Scenario: Startup dependency fails
- **WHEN** a required dependency fails before the terminal transition
- **THEN** composition SHALL fail explicitly or enter the typed read-only recovery mode
- **AND** it SHALL not return a partially normal context or submit normal deferred maintenance

#### Scenario: Required handler registration fails
- **WHEN** ApplicationContext creation succeeds but required handler registration throws
- **THEN** `isInitialized` SHALL remain false and `contextReady` SHALL remain unresolved or reject according to the existing failure contract
- **AND** partial composition SHALL be disposed and no deferred descriptor SHALL be submitted

### Requirement: Post-ready maintenance dependencies remain narrow
The startup maintenance coordinator SHALL consume explicit readiness, deferred-work, background-registry, and shutdown Interfaces rather than a broad `ApplicationContext` or core storage implementation.

#### Scenario: Coordinator is constructed
- **WHEN** ApplicationContext wires post-ready startup maintenance
- **THEN** its input Interface SHALL list only the readiness result, deferred descriptors, registry submit/status seam, runtime scope, and shutdown signal it consumes
- **AND** it SHALL not receive direct SQLite/truth mutation dependencies

#### Scenario: Startup-specific receipt identity is requested
- **WHEN** composition needs receipt/frontier evidence
- **THEN** it SHALL request a narrow application/backend read model
- **AND** it SHALL not add a startup-maintenance-named member to `UnifiedStorageManager`

### Requirement: Final startup diagnostics belong to the outer plugin owner
ApplicationContext SHALL provide child timing evidence to the startup diagnostics Module while the outer plugin startup owner controls terminal success/failure reporting.

#### Scenario: ApplicationContext creation succeeds
- **WHEN** `ApplicationContext.create()` returns
- **THEN** its child span SHALL be closed
- **AND** it SHALL not emit the final slow-start report before remaining `plugin.onload` work completes

#### Scenario: Later plugin handler registration fails
- **WHEN** ApplicationContext succeeds but a later required `plugin.onload` step fails
- **THEN** the final startup report SHALL represent the complete failed attempt rather than an earlier successful ApplicationContext interval
