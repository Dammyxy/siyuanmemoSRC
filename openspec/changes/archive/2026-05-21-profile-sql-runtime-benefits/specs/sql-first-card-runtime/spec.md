## ADDED Requirements

### Requirement: SQL-first optimization is backed by runtime profile evidence
The system SHALL require real-database Runtime SQL profile evidence before adding indexes, replacing active read Interfaces, or retiring old compatibility paths for SQL-first card runtime surfaces.

#### Scenario: Optimization follows measured bottleneck
- **WHEN** a SQL-first Browser, Queue Projection, Review feedback, or Xiuyuan path is proposed for optimization
- **THEN** the change SHALL reference Runtime SQL profile evidence showing the measured bottleneck, query plan, or budget failure that justifies the optimization

#### Scenario: No profile bottleneck means no speculative index
- **WHEN** the Runtime SQL profile shows a SQL-first path is within budget and its query plan is acceptable
- **THEN** the system SHALL NOT add a new index or read Interface solely as speculative cleanup
