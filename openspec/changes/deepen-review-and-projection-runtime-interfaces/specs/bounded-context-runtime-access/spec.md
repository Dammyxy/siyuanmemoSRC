## ADDED Requirements

### Requirement: ApplicationContext exposes bounded-context runtime access
The system SHALL keep `ApplicationContext` as lifecycle owner while exposing narrow typed runtime-access Modules for Review, Browser/Queue, Progressive, and integration callers.

#### Scenario: Review caller requests dependencies
- **WHEN** a Review factory, manager, or UI Adapter needs Review runtime capabilities
- **THEN** it receives `ReviewRuntimeAccess` or an equivalent typed bounded-context Interface instead of the full `ApplicationContext`

#### Scenario: Browser caller requests dependencies
- **WHEN** a Browser lifecycle or datasource caller needs Browser and Queue capabilities
- **THEN** it receives `BrowserQueueRuntimeAccess` or an equivalent typed bounded-context Interface

### Requirement: Runtime access Modules are not service locators
The system SHALL define explicit typed members for each bounded-context runtime access Module and SHALL NOT expose generic string lookup.

#### Scenario: Runtime access is constructed
- **WHEN** `ApplicationContext` creates a bounded-context access Module
- **THEN** the Module contains only declared dependencies required by that bounded context

#### Scenario: Unknown dependency is requested
- **WHEN** a caller needs a dependency not declared by its runtime access Interface
- **THEN** the caller or composition design must be changed explicitly instead of using generic service lookup

### Requirement: Late composition callbacks bind exactly once
The system SHALL replace repeated mutable `contextRef` callback knowledge with typed bind-once callback ports where bootstrap ordering requires late binding.

#### Scenario: Callback port binds after context construction
- **WHEN** `ApplicationContext` and its bounded-context access Modules are ready
- **THEN** bootstrap binds each late callback Adapter exactly once

#### Scenario: Callback is used before binding
- **WHEN** backend or integration work invokes an unbound callback port
- **THEN** the system returns explicit unavailable and MUST NOT use an alternate local mutation path

#### Scenario: Callback binds twice
- **WHEN** bootstrap attempts to bind an already-bound callback port
- **THEN** composition fails explicitly instead of replacing the active owner

### Requirement: Lifecycle and disposal remain centralized
The system SHALL retain startup ordering, runtime policy, and disposal ownership in `ApplicationContext`.

#### Scenario: Bounded-context bundle creates disposable resources
- **WHEN** a factory or runtime access Module creates transports, listeners, or timers
- **THEN** `ApplicationContext` registers and disposes them in the established lifecycle order

#### Scenario: Runtime policy disables a capability
- **WHEN** backend, writer, or private mutation capability is disabled
- **THEN** runtime access returns existing explicit unavailable behavior and MUST NOT construct hidden local fallback ownership

### Requirement: Legacy accessors are removed per completed slice
The system SHALL migrate all active callers of a legacy `ApplicationContext` getter before removing that getter and SHALL NOT retain long-lived dual access paths.

#### Scenario: Final caller migrates
- **WHEN** all active callers of a getter use bounded-context runtime access
- **THEN** the getter and superseded wiring are removed in the same migration slice

#### Scenario: Caller migration is incomplete
- **WHEN** active callers still depend on a legacy getter
- **THEN** the slice remains incomplete and MUST NOT claim the getter debt is closed
