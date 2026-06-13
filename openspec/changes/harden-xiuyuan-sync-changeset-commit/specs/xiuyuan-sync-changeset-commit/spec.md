## ADDED Requirements

### Requirement: Xiuyuan sync plans before mutation
The system SHALL build a complete Xiuyuan sync change set before applying local Xiuyuan storage mutations.

#### Scenario: Full sync plan succeeds before commit
- **WHEN** full Xiuyuan sync reads native Riff facts and local Xiuyuan facts successfully
- **THEN** the system produces a change set containing creates, metadata updates, and deletes before calling the repository commit seam

#### Scenario: Planning failure preserves local storage
- **WHEN** Xiuyuan sync cannot build a valid change set from native Riff facts or local facts
- **THEN** the system MUST NOT apply partial Xiuyuan storage mutations

### Requirement: Canonical Xiuyuan ownership is explicit
The system SHALL choose the canonical Xiuyuan for a Riff-managed block using explicit ownership ordering: `local-owned`, then `riff-managed`, then `updatedAt`, then `createdAt`, then stable id.

#### Scenario: Local-owned Xiuyuan wins over newer Riff-managed Xiuyuan
- **WHEN** multiple Xiuyuans reference the same block and one has `local-owned` ownership
- **THEN** the local-owned Xiuyuan is selected as canonical even when a Riff-managed candidate has a newer timestamp

#### Scenario: Stable id resolves equal ownership and timestamps
- **WHEN** multiple Xiuyuans have the same ownership rank, `updatedAt`, and `createdAt`
- **THEN** the canonical Xiuyuan is selected by stable id ordering

### Requirement: Xiuyuan sync commit reports explicit mutation results
The system SHALL report sync commit results from the single change-set commit seam, including counts for created, updated, and deleted Xiuyuans.

#### Scenario: Commit reports changed counts
- **WHEN** a valid Xiuyuan sync change set is applied
- **THEN** the sync result includes created, updated, and deleted counts derived from the committed change set

#### Scenario: Commit failure reports unavailable without hidden fallback
- **WHEN** the repository commit seam fails
- **THEN** the sync result reports explicit unavailable or failed status and MUST NOT silently retry through a separate local mutation path
