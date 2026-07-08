## ADDED Requirements

### Requirement: Browser maintenance entry for SRS Card Semantics repair
The system SHALL expose SRS Card Semantics diagnosis and repair from the SRS Browser toolbar through a maintenance or diagnostics menu.

#### Scenario: User opens repair from Browser toolbar
- **WHEN** the user opens the SRS Browser maintenance menu and selects the card-type repair action
- **THEN** the system shows the existing repair preview before any write is committed

#### Scenario: User commits previewed repair
- **WHEN** the user confirms the repair preview
- **THEN** the system commits only the deterministic safe repairs and reports the applied and skipped counts

### Requirement: Shared repair dialog flow
The system SHALL route all SRS Card Semantics repair UI entrypoints through one shared application-facing dialog flow.

#### Scenario: Browser invokes shared repair flow
- **WHEN** the Browser maintenance action is clicked
- **THEN** Browser calls the shared repair dialog Interface instead of duplicating preview, commit, or dialog rendering logic

#### Scenario: Repair service unavailable
- **WHEN** the shared repair flow cannot preview or commit because the repair service is unavailable
- **THEN** the system reports the unavailable reason and MUST NOT use hidden fallback behavior

### Requirement: Block menu no longer owns global repair
The system SHALL not present the global SRS Card Semantics repair action as a block-scoped primary menu item.

#### Scenario: User opens a block menu
- **WHEN** the user opens the SiYuanMemo block menu for selected blocks
- **THEN** the menu does not present the global card-type repair action among block-scoped card operations
