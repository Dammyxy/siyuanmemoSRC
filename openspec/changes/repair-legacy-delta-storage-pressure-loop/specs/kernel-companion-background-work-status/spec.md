## ADDED Requirements

### Requirement: Storage-pressure recovery is visible deduplicated background work
The background-work lifecycle SHALL represent legacy delta adoption, truth promotion, compaction, orphan cleanup, and pressure reclassification as one deduplicated recovery job keyed by verified truth identity and active manifest generation.

#### Scenario: Repeated startup submits the same recovery descriptor
- **WHEN** a storage-pressure recovery job with the same identity and manifest generation is pending or running
- **THEN** the coordinator joins or reports the existing job and does not start concurrent adoption or cleanup

#### Scenario: Recovery phase advances
- **WHEN** the job moves through planning, adoption, truth promotion, compaction, cleanup, and reclassification
- **THEN** read-only status exposes the current phase, bounded progress counts and bytes, and the latest content-safe diagnostic code

#### Scenario: Recovery reaches terminal failure
- **WHEN** bounded retries cannot resolve unsupported evidence, missing host capability, failed verification, or insufficient recovery headroom
- **THEN** status records terminal failure, keeps the storage write gate closed, and preserves the evidence required for explicit repair

### Requirement: Storage-pressure recovery yields between bounded batches
The background worker SHALL enforce configured entry, file, byte, and duration budgets for each recovery batch and SHALL publish progress before scheduling additional work.

#### Scenario: Orphan inventory exceeds one batch
- **WHEN** manifest-proven unreachable files exceed the cleanup budget
- **THEN** the job deletes at most the configured files and bytes, reports remaining work, and continues in a later batch without blocking startup readiness
