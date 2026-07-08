## ADDED Requirements

### Requirement: Browser projection open diagnostics identify non-ready owner
The system SHALL emit bounded diagnostics when Browser queue reads or passive queue counts cannot read projection snapshots, including queue identity, read state, reason, projection owner metadata, and available freshness/cache evidence.

#### Scenario: Browser queue page is unavailable
- **WHEN** Browser queue page read returns an unavailable or repair-required read-model page because projection snapshot cannot be read
- **THEN** the diagnostic log includes queue id, queue type, Browser read state, diagnostic kind, reason, row id evidence when present, and projection read owner fields.

#### Scenario: Passive queue count is unavailable
- **WHEN** passive queue count refresh catches transient projection unavailability
- **THEN** the diagnostic log includes queue id, queue type, force refresh flag, error, and queue projection rollout diagnostics if available.

### Requirement: Queue projection snapshot diagnostics expose cache and freshness cause
The system SHALL log a bounded QueueProjection Runtime diagnostic when backend projection snapshot results are not ready or invalid for Browser reads.

#### Scenario: Backend snapshot is missing derived cache
- **WHEN** backend `queue.projection.snapshot` returns a non-ready result with `cacheState` equal to `missing-derived-cache`
- **THEN** the diagnostic log reports `unavailableReason` as `missing_derived_cache`, policy/generation validity, row/counter counts, force refresh flag, and freshness summary.

#### Scenario: Backend snapshot has stale or missing rows
- **WHEN** backend `queue.projection.snapshot` returns freshness evidence with stale or missing rows
- **THEN** the diagnostic log reports `unavailableReason` as `projection_stale` and includes capped stale/missing card id samples.

### Requirement: Unload diagnostics expose pending backend work
The system SHALL expose pending backend request summaries before unload cleanup clears backend worker state.

#### Scenario: Worker transport is disposed with pending requests
- **WHEN** backend worker transport disposal starts while requests or probes are pending
- **THEN** the diagnostic log includes pending counts and capped request summaries with request id, method, card id, generation, queued age, and posted age.

#### Scenario: ApplicationContext begins unload cleanup
- **WHEN** ApplicationContext disposal begins Review truth flush or backend transport disposal
- **THEN** the diagnostic log includes backend worker diagnostics if the transport exposes them, without changing disposal order or timeout behavior.
