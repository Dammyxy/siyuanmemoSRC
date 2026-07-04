## MODIFIED Requirements

### Requirement: Queue projection read Module
The system SHALL expose Queue Projection Readiness, projection rows, projection card hydration, and projection counters through one read Module Interface consumed by Browser Queue View Lifecycle, Review session start, and projection-backed queue warmup. The system SHALL NOT require queue projection rows or counters to be synchronously rebuilt before an already-started Review session advances to the next card from its session frontier.

#### Scenario: Queue rows read from projection storage
- **WHEN** a projection-backed queue is readable
- **THEN** Browser and Review session start SHALL read queue rows and counters from backend projection storage using the same projection identity

#### Scenario: Projection hydration detects missing cards
- **WHEN** projection rows reference cards that cannot be hydrated from the SQL card universe
- **THEN** the system SHALL return an explicit projection-unavailable or refresh-required result and SHALL NOT silently continue with incomplete rows

#### Scenario: Local queue path remains explicit
- **WHEN** a queue is not yet declared projection-backed by rollout policy
- **THEN** the system MAY use the existing local queue strategy, but diagnostics SHALL mark the read path as local queue rather than backend projection

#### Scenario: Active Review session advances while projection is stale
- **WHEN** an already-started Review session has an eligible next card in its session frontier and queue projection becomes stale, deferred, or refresh-required after an answer
- **THEN** the Review session SHALL advance from the session frontier and SHALL report projection state separately instead of blocking on projection rebuild

### Requirement: SQL-first review card mutation persistence
The system SHALL provide a SQL-first mutation persistence path for review-facing card updates that commits card state, sync metadata, durable review event evidence, and queue projection impact as observable results. Ordinary Review UI switching SHALL NOT wait for projection rebuild, full domain sync merge, or canonical storage repair after the session frontier has accepted the answer.

#### Scenario: Review mutation updates SQL card state
- **WHEN** a review-facing mutation updates scheduling state for a card in a SQL-first slice
- **THEN** the system SHALL persist the updated card state to SQL before reporting the durable commit as applied

#### Scenario: Mutation invalidates, patches, or defers queue projection
- **WHEN** a SQL-first review mutation changes card membership, due state, source existence, or priority fields used by queue projection
- **THEN** the system SHALL return projection impact that patches, invalidates, refreshes, or defers affected queue projection reads without blocking the Review UI switch

#### Scenario: Mutation failure does not leave hidden partial success
- **WHEN** SQL-first mutation persistence fails after local Review session state advanced
- **THEN** the system SHALL surface a failed commit state to the Review session so retry, repair, or explicit unavailable handling can occur without silently treating the answer as durable

#### Scenario: Ordinary Review answer does not run full sync merge
- **WHEN** domain sync has divergent sources but the current card has no proven blocking conflict
- **THEN** the SQL-first review mutation path SHALL avoid a full pre-answer domain sync merge and SHALL expose sync divergence diagnostics separately
