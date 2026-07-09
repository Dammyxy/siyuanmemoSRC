## ADDED Requirements

### Requirement: Review does not interrupt on CDF abnormal diagnostics
The system SHALL continue showing the current Review card even when CDF live relation metadata contains abnormal or blocking diagnostic evidence.

#### Scenario: CDF card has blocking relation issue
- **WHEN** Review opens a CDF card whose live relation metadata contains a blocking issue
- **THEN** Review shows the normal card content and answer controls instead of a CDF interruption panel

#### Scenario: User advances CDF card
- **WHEN** the user answers or skips the CDF card
- **THEN** Review uses the normal Review path and MUST NOT emit a `blocked-cdf` no-score removal diagnostic

### Requirement: Browser no longer exposes CDF abnormal diagnostic surface
The system SHALL not expose CDF abnormal diagnosis as a Browser preset or diagnostic result surface.

#### Scenario: Browser filters are listed
- **WHEN** the Browser preset/filter list is shown
- **THEN** it does not include the CDF abnormal diagnostic preset

#### Scenario: Browser action menu opens
- **WHEN** Browser action menus are opened
- **THEN** they do not present CDF abnormal diagnostic actions or CDF diagnostic result dialogs
