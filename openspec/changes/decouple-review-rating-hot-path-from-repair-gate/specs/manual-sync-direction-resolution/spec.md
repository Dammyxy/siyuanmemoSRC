## ADDED Requirements

### Requirement: Manual repair lifecycle remains outside Review rating
The system SHALL keep manual sync direction resolution and repair preview/apply as explicit recovery workflows outside ordinary Review rating feedback.

#### Scenario: Repairable drift surfaces outside hot path
- **WHEN** domain-sync diagnostics classify drift as repairable during or before Review
- **THEN** the system SHALL expose the repairable state through diagnostics or repair UI without forcing ordinary rating feedback to run full merge

#### Scenario: Manual smart merge remains explicit
- **WHEN** the user selects smart merge in manual sync direction resolution
- **THEN** the system SHALL run the backend-owned sync conflict merge path explicitly and SHALL NOT rely on a later Review rating click to perform that repair

#### Scenario: Full replacement still reloads backend state
- **WHEN** the active `siyuanmemo.db` is replaced by manual direction resolution
- **THEN** the backend worker SHALL reload or recreate SQLite state before a new Review repair gate can allow rating
