## ADDED Requirements

### Requirement: Browser row helpers preserve datasource and query parity
Browser datasource row filtering and sorting MUST use one typed helper contract that preserves behavior for both Browser application query rows and Browser UI datasource rows.

#### Scenario: Queue snapshot row filters match query helper behavior
- **WHEN** Browser UI datasource code filters queue snapshot rows by document scope, missing-block status, preset, free-text query, and card type
- **THEN** the result MUST match the shared Browser query row helper for the same rows and options

#### Scenario: Deck rows keep secondary-field simple-query behavior
- **WHEN** a parsed free-text query has no direct content match but matches the configured secondary field
- **THEN** Browser deck/query row filtering MUST still include rows matching `headline` or `fullContent` according to the caller-selected secondary field

#### Scenario: Sort behavior remains stable across helper surfaces
- **WHEN** Browser UI datasource code sorts Browser rows or queue snapshot rows
- **THEN** row ordering MUST remain stable with invalid values last, caller sort direction applied to comparable values, and deterministic fallback ordering

### Requirement: Browser datasource helper remains a stable facade
`DataSourceUtils` MUST keep its existing public helper exports for Browser datasource callers while delegating row filtering and sorting implementation to the shared Browser row helper.

#### Scenario: Datasource callers retain existing imports
- **WHEN** Browser datasource modules import row filtering or sorting helpers from `DataSourceUtils`
- **THEN** those imports MUST continue to work without caller-side migration

#### Scenario: Duplicate row helper implementation is removed from UI datasource
- **WHEN** Browser UI datasource helpers provide row filtering and sorting
- **THEN** `DataSourceUtils` MUST NOT keep a second local implementation of card-type filtering, simple-query fallback, missing-block detection, preset filtering, or row sorting
