## ADDED Requirements

### Requirement: Runtime SQL profile covers active SQL-first surfaces
The system SHALL provide a diagnostic Runtime SQL profile that measures Browser deck reads, Queue Projection reads, Review feedback transaction cost, and Xiuyuan SQL lookup cost from a supplied SQLite database.

#### Scenario: Profile reports all runtime families
- **WHEN** the Runtime SQL profile runs against a valid `siyuanmemo.db`
- **THEN** the result SHALL include Browser, Queue Projection, Review feedback, and Xiuyuan sections with row counts, timing summaries, budgets, and pass/fail status

#### Scenario: Missing database path is explicit
- **WHEN** the Runtime SQL profile is invoked without a database path
- **THEN** the diagnostic command SHALL fail with an explicit missing `--db` message

### Requirement: Runtime SQL profile preserves production data
The system SHALL keep profile runs read-only for the supplied database file and SHALL perform mutation-cost simulations only inside rollback-only or in-memory copied database state.

#### Scenario: Review feedback profile rolls back simulated mutation
- **WHEN** the Runtime SQL profile measures Review feedback transaction cost
- **THEN** it SHALL roll back the simulated review mutation and SHALL NOT persist changes to the supplied database file

#### Scenario: Row expansion does not alter the source file
- **WHEN** the Runtime SQL profile expands rows to measure larger scenarios
- **THEN** expansion SHALL occur only in an in-memory database copy and SHALL NOT alter the supplied database file

### Requirement: Runtime SQL profile includes optimization evidence
The system SHALL include enough profile evidence to decide whether the next SQL benefit work is an index, a read Interface change, a mutation ownership change, or no change.

#### Scenario: Query plans accompany indexed lookup surfaces
- **WHEN** Browser, Queue Projection, or Xiuyuan SQL lookup surfaces are profiled
- **THEN** the result SHALL include query plan summaries for the measured SQL shapes where SQLite exposes a plan

#### Scenario: Failed budget identifies the measured surface
- **WHEN** any profiled metric exceeds its configured budget
- **THEN** the result SHALL mark the scenario as failed and identify the specific metric and runtime family
