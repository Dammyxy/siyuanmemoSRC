## MODIFIED Requirements

### Requirement: SQL-first review card mutation persistence
The system SHALL provide a SQL-first mutation persistence path for review-facing card updates that commits card state, sync metadata, and queue projection invalidation, patch, deferral, or no-op decisions as one observable result. Ordinary metadata-only CDF repair SHALL be able to declare narrow queue impact so unrelated queue Modules are not invalidated or created during Review scoring.

#### Scenario: Review mutation updates SQL card state
- **WHEN** a review-facing mutation updates scheduling state for a card in a SQL-first slice
- **THEN** the system SHALL persist the updated card state to SQL before reporting mutation success

#### Scenario: Mutation invalidates or patches queue projection
- **WHEN** a SQL-first review mutation changes card membership, due state, source existence, or priority fields used by queue projection
- **THEN** the system SHALL return projection impact that invalidates or patches affected queue projection reads

#### Scenario: Metadata-only CDF repair avoids broad queue invalidation
- **WHEN** a SQL-first mutation only updates CDF live-relation metadata and does not change scheduling, queue membership, due state, source existence, or priority fields
- **THEN** the system SHALL avoid broad dynamic queue invalidation and SHALL NOT create unrelated queue Modules as part of ordinary Review scoring

#### Scenario: Unknown mutation impact remains fail-closed
- **WHEN** a card mutation cannot prove that its queue impact is metadata-only or projection-local
- **THEN** the system SHALL use safe broad invalidation rather than silently leaving queue read models stale

#### Scenario: Mutation failure does not leave hidden partial success
- **WHEN** SQL-first mutation persistence fails after local Review transaction state was prepared
- **THEN** the system SHALL surface failure to the Review Transaction Safety Envelope so compensation can restore visible session state
