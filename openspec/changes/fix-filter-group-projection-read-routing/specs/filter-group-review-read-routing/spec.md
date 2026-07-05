## ADDED Requirements

### Requirement: Filter Group Review Uses Live Session Scope
The system SHALL serve `filter-group` Review navigation from the live queue scope instead of global backend projection rows.

#### Scenario: Dynamic filter group review reload
- **WHEN** a `filter-group` Review session has an active filter and backend projection is enabled for that queue type
- **THEN** the Review strategy SHALL reload cards through the live queue's filtered `getCards()` path
- **AND** it SHALL NOT hydrate global projection snapshot rows for Review navigation

#### Scenario: Static subset filter group review reload
- **WHEN** a static subset Review session reports queue type `filter-group`
- **THEN** the Review strategy SHALL keep navigation inside the subset's exact local card scope
- **AND** it SHALL NOT hydrate global projection snapshot rows
