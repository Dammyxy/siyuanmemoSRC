## ADDED Requirements

### Requirement: Application startup exposes readiness before deferred-safe maintenance
The ApplicationContext composition Interface SHALL distinguish plugin startup readiness from deferred-safe maintenance completion.

#### Scenario: Startup-ready dependencies are initialized
- **WHEN** storage safety gates pass, the backend Worker projection is readable, settings are loaded, and required runtime access modules are bound
- **THEN** ApplicationContext creation SHALL be allowed to complete without waiting for deferred-safe maintenance jobs

#### Scenario: Required startup dependency fails
- **WHEN** a required startup dependency fails closed, including backend Worker unavailability, recovery-required storage, or settings load failure
- **THEN** ApplicationContext creation SHALL fail explicitly rather than returning a partially usable context

### Requirement: Startup profile is owned by composition root diagnostics
The ApplicationContext composition Interface SHALL expose startup profile diagnostics through a narrow diagnostics Module rather than through broad callers.

#### Scenario: Maintainer reads startup diagnostics
- **WHEN** a maintainer inspects startup diagnostics after a slow startup
- **THEN** the diagnostics SHALL identify composition-root startup spans by operation name and duration without requiring callers to inspect individual Modules directly
