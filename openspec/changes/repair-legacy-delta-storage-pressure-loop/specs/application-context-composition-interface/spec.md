## ADDED Requirements

### Requirement: ApplicationContext schedules storage recovery after readiness
ApplicationContext SHALL accept an explicit storage-pressure recovery descriptor from backend startup and submit it through the existing post-ready background-work dependency after the application shell is ready. It MUST NOT perform legacy adoption, delta relocation, or orphan cleanup inline during `ApplicationContext.create`.

#### Scenario: Read-only backend returns a recovery descriptor
- **WHEN** backend startup is readable and read-only because verified storage recovery is required
- **THEN** ApplicationContext completes creation, publishes the read-only readiness state, and submits the descriptor to post-ready background work

#### Scenario: Backend returns no recovery descriptor
- **WHEN** backend startup reports no pending storage recovery
- **THEN** ApplicationContext does not create a storage recovery job and preserves existing startup composition behavior

### Requirement: Post-ready recovery cannot bypass backend mutation authority
The application recovery coordinator SHALL invoke only the narrow backend recovery capability and status surface. UI or application services MUST NOT directly mutate delta manifests, truth coverage, or filesystem cleanup state.

#### Scenario: Recovery job is requested by the application layer
- **WHEN** post-ready coordination starts or resumes storage-pressure recovery
- **THEN** all adoption, coverage, compaction, cleanup, and reclassification mutations execute behind Worker-owned backend interfaces
