## ADDED Requirements

### Requirement: SQLite delta host-effect metadata identifies append writes
The system SHALL classify SQLite delta append writes with explicit purpose and substep metadata so Review feedback storage summaries can distinguish manifest, open-segment, and sealed-segment writes.

#### Scenario: Review feedback delta append writes have metadata
- **WHEN** Review feedback persistence writes SQLite delta segment or manifest files
- **THEN** those host effects SHALL carry purpose `sqlite-delta.append` and a substep identifying the file role being written
