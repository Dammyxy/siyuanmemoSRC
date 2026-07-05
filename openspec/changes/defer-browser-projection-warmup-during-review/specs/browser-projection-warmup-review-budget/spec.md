## ADDED Requirements

### Requirement: Browser projection warmup respects active Review pressure
The system SHALL prevent non-critical Browser queue projection warmup from competing with active Review feedback.

#### Scenario: Broad Browser warmup is deferred during Review
- **WHEN** a Review session is active and Browser schedules broad queue projection warmup
- **THEN** the system SHALL defer non-visible queue warmup work into a bounded delayed batch
- **AND** SHALL NOT synchronously warm every sidebar projection-backed queue before Review feedback can complete

#### Scenario: Visible Browser queue may still prepare
- **WHEN** a Review session is active and the Browser currently displays a projection-backed queue
- **THEN** the system MAY prepare the visible queue read model immediately
- **AND** SHALL continue to report explicit readiness states for that visible queue

#### Scenario: NeuralRoam remains outside projection warmup
- **WHEN** Browser warmup considers NeuralRoam
- **THEN** the system SHALL keep NeuralRoam outside projection-backed warmup because NeuralRoam progression is backend-advance owned

### Requirement: Targeted projection rewarm is coalesced during Review
The system SHALL coalesce repeated targeted Browser projection warmups while Review is active.

#### Scenario: Repeated live identity events coalesce by queue
- **WHEN** multiple live identity events target the same Browser queue while Review is active
- **THEN** the system SHALL keep at most one pending deferred warmup for that queue
- **AND** SHALL use the latest relevant reason and timing diagnostics

#### Scenario: Non-active queue repair is deferred
- **WHEN** a non-active Browser queue reports repairable projection state such as `projection_stale` while Review is active
- **THEN** the system SHALL defer repair/warmup rather than repeatedly invoking queue read-model repair on the Review answer hot path

### Requirement: Browser readiness stays explicit
The system SHALL preserve explicit Browser Read Model readiness and fail-closed behavior.

#### Scenario: Deferred warmup does not use stale fallback
- **WHEN** a Browser queue read model is not ready because warmup was deferred
- **THEN** Browser SHALL report preparing, refreshing, stale, unavailable, or retry diagnostics
- **AND** SHALL NOT use stale local queue rows as a hidden fallback

#### Scenario: Unavailable owner data remains unavailable
- **WHEN** queue projection row hydration misses requested rows or the projection reader is unavailable
- **THEN** Browser SHALL surface `QUEUE_PROJECTION_UNAVAILABLE` or an equivalent readiness diagnostic
- **AND** SHALL NOT silently replace the owner data with a legacy snapshot

### Requirement: Warmup deferral is observable
The system SHALL record diagnostics when Browser warmup is deferred because Review is active.

#### Scenario: Deferral diagnostics include queue and reason
- **WHEN** Browser warmup defers work during active Review
- **THEN** logs or runtime spans SHALL include queue id, queue type when known, original warmup reason, deferral cause, and retry delay

#### Scenario: Live-log target is reduced warmup noise
- **WHEN** a user reviews several cards while Browser is open
- **THEN** logs SHOULD show bounded/coalesced Browser warmup entries instead of repeated full sidebar warmup entries after each answer
