## ADDED Requirements

### Requirement: Managed background work must not block plugin unload
Long-running maintenance work MUST expose shutdown-safe behavior: once unload or dispose begins, it MUST stop scheduling new work, MUST clear retry timers, and MUST not wait on in-flight heavy work before frontend disposal can continue.

#### Scenario: Unload starts during stuck maintenance
- **WHEN** unload starts while maintenance work is in flight
- **THEN** frontend disposal MUST continue within its bounded unload timeout
- **AND** the maintenance owner MUST not re-arm retry timers after disposal

### Requirement: Review truth maintenance separates quick flush from backfill
Review truth maintenance MUST treat quick flush and SQL backfill as different work classes. Quick flush MAY be attempted before unload; SQL backfill MUST be deferred during unload and retried through startup or explicit maintenance.

#### Scenario: Startup backfill is pending during unload
- **WHEN** Review truth has pending SQL backfill rows and unload begins
- **THEN** unload quick flush MUST NOT execute `review.truth.backfill`
- **AND** startup compensation MUST remain responsible for later backfill retry

### Requirement: Backend unavailable fails closed for maintenance work
When backend worker or host effects are unavailable, maintenance work MUST report unavailable/deferred diagnostics and MUST NOT use hidden local fallback or compatibility paths.

#### Scenario: Truth host effect times out
- **WHEN** a Review truth host effect times out during backfill
- **THEN** the backfill MUST stop the current maintenance batch
- **AND** the caller MUST receive explicit unavailable/deferred diagnostics
- **AND** no local fallback writer MUST be used
