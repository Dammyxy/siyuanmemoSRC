## ADDED Requirements

### Requirement: Review queue snapshots are restored through explicit DTO narrowing
The system SHALL normalize Review tab queue snapshot card and counter DTOs into the active queue snapshot contract before passing them to Review queue restoration.

#### Scenario: Valid Review queue snapshot is preserved
- **WHEN** a Review tab opens from serialized runtime state containing valid cached cards, current item, forward buffer, and counter snapshot data
- **THEN** the restored Review queue snapshot SHALL preserve those valid DTOs for the active queue restore path

#### Scenario: Malformed Review queue snapshot entries are rejected
- **WHEN** a Review tab opens from serialized runtime state containing malformed card or counter snapshot entries
- **THEN** the restored Review queue snapshot SHALL exclude malformed card entries and SHALL NOT pass a malformed counter snapshot to the active queue restore path

### Requirement: Review queue snapshot typing has no broad record leakage
The system SHALL keep `TabManager` Review queue snapshot normalization free of broad `Record<string, unknown>` values where the active `ReviewQueueSessionSnapshot` contract requires `FSRSCard` or `QueueCounterSnapshot`.

#### Scenario: TabManager typecheck does not report Review queue snapshot DTO errors
- **WHEN** TypeScript checks `TabManager.ts`
- **THEN** it SHALL NOT report Review queue snapshot DTO assignment errors for cached cards, current item, forward buffer, or counter snapshot
