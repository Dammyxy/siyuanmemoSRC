## ADDED Requirements

### Requirement: Desktop writer eligibility is bound to primary app role
The system SHALL treat the desktop Electron `primary-app/canonical` runtime as the only ordinary desktop writer-eligible role for backend mutations.

#### Scenario: Primary app is writer-eligible
- **WHEN** a desktop Electron primary app runtime starts with a canonical writer profile
- **THEN** the runtime SHALL be eligible to acquire and renew the writer lease

#### Scenario: Document window is follower-only
- **WHEN** a desktop Electron document-window runtime attempts to acquire an empty writer lease
- **THEN** the system SHALL reject the acquisition with explicit writer-unavailable diagnostics

#### Scenario: Desktop browser frontend is not ordinary desktop writer
- **WHEN** a `std` desktop kernel browser frontend attempts to acquire writer ownership for backend mutations
- **THEN** the system SHALL reject the acquisition unless a separate browser-only writer policy explicitly enables that surface

### Requirement: Hidden desktop primary app can recover empty writer lease
The system SHALL allow a hidden desktop `primary-app/canonical` runtime to reacquire an empty writer lease when backend Worker health is good.

#### Scenario: Hidden primary app recovers empty lease
- **WHEN** a desktop primary-app runtime is hidden and its heartbeat observes no active writer lease
- **THEN** the runtime SHALL reacquire the writer lease and remain in writer mode

#### Scenario: Hidden primary app does not steal active primary writer
- **WHEN** a hidden desktop primary-app runtime observes another active primary-app writer lease
- **THEN** the runtime SHALL NOT acquire the lease and SHALL remain or become follower

#### Scenario: Unhealthy backend prevents hidden recovery
- **WHEN** backend Worker health is unhealthy during hidden primary-app recovery
- **THEN** the runtime SHALL release or avoid writer ownership and return explicit backend-unavailable diagnostics

### Requirement: Non-primary desktop surfaces fail closed
The system SHALL keep desktop document windows, QuickNote/enhance auxiliary windows, unavailable writer profiles, and ordinary desktop browser frontends from writing through hidden local fallback paths.

#### Scenario: Auxiliary window cannot recover empty lease
- **WHEN** an auxiliary desktop window observes an empty writer lease
- **THEN** the system SHALL reject writer acquisition and SHALL NOT execute backend mutations locally

#### Scenario: Follower relay unavailable does not create local fallback
- **WHEN** a non-primary desktop runtime receives `BACKEND_UNAVAILABLE: writer command unavailable: no active writer lease`
- **THEN** the runtime SHALL return explicit unavailable diagnostics and SHALL NOT call backend mutation APIs locally

### Requirement: Stale follower state can recover through desktop primary writer
The system SHALL attempt desktop primary-app writer recovery before surfacing no-active-writer relay failures from Review feedback and kernel transaction action polling.

#### Scenario: Review feedback recovers stale follower primary app
- **WHEN** Review feedback starts while the local desktop primary-app runtime is in follower mode and kernel relay reports no active writer
- **THEN** the system SHALL attempt writer recovery and SHALL execute feedback through the local writer path if recovery succeeds

#### Scenario: Action polling recovers stale follower primary app
- **WHEN** kernel transaction action polling starts while the local desktop primary-app runtime is in follower mode and kernel relay reports no active writer
- **THEN** the system SHALL attempt writer recovery and SHALL dequeue through the local writer path if recovery succeeds

#### Scenario: Recovery failure remains explicit
- **WHEN** Review feedback or action polling attempts recovery but the runtime is not an eligible desktop primary app
- **THEN** the system SHALL return explicit writer-unavailable diagnostics without local backend mutation fallback

### Requirement: Repeated no-writer polling warnings are bounded
The system SHALL avoid unbounded repeated warning logs when kernel transaction action polling repeatedly encounters no active writer lease.

#### Scenario: Repeated no-writer polling is backed off
- **WHEN** consecutive action polling attempts fail because no active writer lease exists
- **THEN** the system SHALL bound repeated warnings and delay repeated polling attempts while preserving explicit writer-unavailable diagnostics
