## MODIFIED Requirements

### Requirement: Runtime SQL profile includes optimization evidence
The system SHALL include enough profile evidence to decide whether the next SQL benefit work is an index, a read Interface change, a mutation ownership change, a Browser orchestration change, or no change.

#### Scenario: Query plans accompany indexed lookup surfaces
- **WHEN** Browser, Browser hierarchy count, Queue Projection, or Xiuyuan SQL lookup surfaces are profiled
- **THEN** the result SHALL include query plan summaries for the measured SQL shapes where SQLite exposes a plan

#### Scenario: Failed budget identifies the measured surface
- **WHEN** any profiled metric exceeds its configured budget
- **THEN** the result SHALL mark the scenario as failed and identify the specific metric and runtime family

#### Scenario: Hierarchy count profile distinguishes count-only and full-row paths
- **WHEN** Runtime SQL profile measures Browser hierarchy behavior
- **THEN** the result SHALL report count-only document/root count timing separately from full Browser row hydration timing

#### Scenario: Projection warmup profile reports readiness latency
- **WHEN** Runtime SQL profile or Browser runtime diagnostics measure projection-backed queue open behavior
- **THEN** the result SHALL report projection readiness status, materialization or warmup latency, retry count, and whether queue selection waited on readiness
