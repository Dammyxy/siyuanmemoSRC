## ADDED Requirements

### Requirement: Backend RPC methods are owned by method-family Modules
The system SHALL define backend RPC method names, request/result contracts, handler adapters, and client facets in method-family Modules rather than requiring unrelated backend RPC families to edit one monolithic contract and switch.

#### Scenario: Add method within one family
- **WHEN** a backend RPC method is added for an existing family
- **THEN** the implementation SHALL update that family's contract catalog, worker adapter, client facet or documented no-client entry, and focused tests without editing unrelated family modules

#### Scenario: Method names remain stable
- **WHEN** an existing backend RPC method is migrated into a method-family Module
- **THEN** the method string literal used on the JSON-RPC wire SHALL remain unchanged

### Requirement: Registry dispatcher owns common request lifecycle
The system SHALL route backend RPC requests through a registry dispatcher that owns request validation, method lookup, shared pre-request behavior, success/error envelope creation, diagnostics, and hidden-fallback policy.

#### Scenario: Registered method dispatch
- **WHEN** a request uses a registered backend RPC method
- **THEN** the dispatcher SHALL invoke exactly one handler adapter for that method and wrap the result in the existing backend RPC success envelope

#### Scenario: Unknown method remains explicit
- **WHEN** a request uses a method absent from the registry
- **THEN** the dispatcher SHALL return `METHOD_NOT_FOUND` without invoking any family adapter

#### Scenario: Handler failure preserves fail-closed behavior
- **WHEN** a family adapter reports dependency unavailability or throws an active-path error
- **THEN** the dispatcher SHALL return the same explicit backend RPC error behavior as the pre-modularization path and SHALL NOT invoke fallback handlers

### Requirement: Registry completeness is verifiable
The system SHALL provide automated coverage proving every exported `BackendRpcMethod` has exactly one registered handler and every client-exposed method maps to a registered backend RPC method.

#### Scenario: Missing handler fails verification
- **WHEN** a method appears in the composed `BackendRpcMethod` catalog without a registered handler
- **THEN** the registry verification SHALL fail before implementation is considered complete

#### Scenario: Duplicate handler fails verification
- **WHEN** two family adapters register the same backend RPC method
- **THEN** the registry verification SHALL fail and identify the duplicated method

#### Scenario: Client method points to missing RPC method
- **WHEN** a client facade or facet calls a method string absent from the composed backend RPC catalog
- **THEN** client verification SHALL fail before implementation is considered complete

### Requirement: Existing backend client facade remains source-compatible
The system SHALL keep `SrsBackendClient` source-compatible during migration while allowing bounded-context callers to depend on narrower backend client facets.

#### Scenario: Existing caller uses facade
- **WHEN** an existing application caller invokes a current `SrsBackendClient` method
- **THEN** the call SHALL use the same method name, params shape, result shape, and error propagation as before migration

#### Scenario: New bounded caller uses facet
- **WHEN** a new or migrated bounded-context caller only needs one backend RPC family
- **THEN** it SHALL be able to depend on that family's client Interface instead of the full backend client facade

### Requirement: Family tests replace global kernel behavior tests
The system SHALL migrate backend RPC behavior coverage from the global `BackendKernel` test file into family-focused test files while preserving a small dispatcher contract test.

#### Scenario: Family behavior test
- **WHEN** a backend RPC family is migrated to a family adapter
- **THEN** behavior tests for that family SHALL live in a focused family test file or suite and SHALL cover the adapter's dependency checks and result/error behavior

#### Scenario: Dispatcher contract test
- **WHEN** common request lifecycle behavior is tested
- **THEN** tests SHALL target the registry dispatcher once rather than duplicating validation and error-envelope checks in every family
