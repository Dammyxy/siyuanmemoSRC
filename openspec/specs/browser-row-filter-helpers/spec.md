# browser-row-filter-helpers Specification

## Purpose

Define the application-owned Browser row helper contract for generic Browser row filtering, query matching, and sorting. This keeps datasource and query paths aligned while preserving SQL pushdown as storage-adapter implementation detail.

## Requirements

### Requirement: Application-owned Browser row helper Module
The system SHALL keep generic Browser row filtering, query matching, and sorting behavior in an application-owned Browser row helper Module.

#### Scenario: Datasource path uses shared row semantics
- **WHEN** a Browser datasource filters or sorts rows by document scope, legacy preset, query text, card type, queue filter options, or sort model
- **THEN** the datasource path MUST use the application-owned Browser row helper behavior rather than its own duplicate generic implementation

#### Scenario: Query path uses shared row semantics
- **WHEN** an application Browser query snapshot filters or sorts BrowserCard rows or QueueSnapshotRow rows
- **THEN** the query path MUST use the same application-owned Browser row helper behavior as the datasource path

### Requirement: Behavior-preserving helper consolidation
The system SHALL preserve existing Browser-visible row filter, query, and sort results while consolidating helper ownership.

#### Scenario: Same input produces same filtered ids
- **WHEN** Browser datasource rows and Browser query rows are evaluated with equivalent document scope, preset, query text, card type, and secondary query field inputs
- **THEN** the resulting row id order MUST remain equivalent to the pre-consolidation behavior

#### Scenario: Sorting keeps existing tie-breakers
- **WHEN** Browser rows are sorted with a sort model and rows contain equal or missing comparable values
- **THEN** null placement, value comparison, block id tie-breaks, and row id tie-breaks MUST remain equivalent to the pre-consolidation behavior

### Requirement: SQL pushdown preserves shared row semantics
The system SHALL keep backend Browser Read Model SQL pushdown behavior equivalent to the shared Browser row helper contract for overlapping filter, query, and sort semantics.

#### Scenario: SQL query path matches shared helper behavior
- **WHEN** backend Browser Read Model SQL pushdown evaluates document scope, query text, preset, card type, or sort model behavior that overlaps the shared row helper contract
- **THEN** the SQL query path MUST return row ids in an order equivalent to the shared helper behavior for the same input data

#### Scenario: SQL-only behavior remains adapter-specific
- **WHEN** backend Browser Read Model SQL pushdown uses storage-specific implementation details for performance or projection ownership
- **THEN** those details MUST remain inside the storage adapter and MUST NOT create a second UI or application helper contract

### Requirement: UI datasource helper remains action-focused
The system SHALL keep UI datasource-specific mutations and queue actions separate from generic Browser row filter/query/sort semantics.

#### Scenario: Datasource action helper stays outside row semantics
- **WHEN** datasource code deletes, suspends, prioritizes, removes from queue, inserts into queue, or adjusts due dates for selected Browser rows
- **THEN** those action helpers MUST remain in the datasource action Module and MUST NOT be moved into the generic Browser row helper Module

#### Scenario: Thin facade has no independent semantics
- **WHEN** UI datasource code exposes row helper exports for existing callers
- **THEN** those exports MUST delegate to the application-owned Browser row helper Module and MUST NOT contain separate row filter/query/sort branches
