## ADDED Requirements

### Requirement: Browser parsed-query matching has one typed implementation
The system SHALL keep Browser parsed-query numeric condition checks and card matching behavior behind the typed Browser helper implementation, while existing UI helper imports remain behavior-compatible facades.

#### Scenario: UI helper matching matches typed Browser matching
- **WHEN** Browser UI code matches cards against a parsed Browser query through `cardFilters`
- **THEN** the result SHALL match the typed Browser helper result for text, tag, deck, state, doc, and numeric conditions

#### Scenario: Numeric condition helper matches typed Browser helper
- **WHEN** Browser UI code checks numeric query conditions through `cardFilters`
- **THEN** the result SHALL match the typed Browser numeric condition helper for supported operators

### Requirement: Browser helper cleanup preserves UI filtering behavior
The system SHALL preserve existing Browser UI helper behavior for SQL detection, preset filters, and card-type filters while removing duplicated parsed-query matcher ownership.

#### Scenario: SQL detection stays compatible
- **WHEN** Browser UI search input begins with a supported read-only SQL statement
- **THEN** the UI helper SHALL still identify the SQL statement and bypass local parsed-query filtering

#### Scenario: Card-type filters stay compatible
- **WHEN** Browser UI applies topic, item, concept, descriptor, or missing-block card-type filters
- **THEN** the UI helper SHALL keep the same filtered card set as before this cleanup
