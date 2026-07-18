## ADDED Requirements

### Requirement: Writable startup establishes exact pressure evidence
The Worker SHALL establish an exact storage inventory and pressure classification before publishing writable startup readiness. It MUST NOT use a missing or uninitialized pressure cache as permission for ordinary formal mutations.

#### Scenario: Normal startup becomes writable
- **WHEN** startup storage recovery succeeds and exact inventory is below pressure thresholds
- **THEN** the Worker records that inventory as the admission baseline before reporting writable readiness

#### Scenario: Exact baseline cannot be established
- **WHEN** startup evidence requires recovery or exact pressure classification fails
- **THEN** the Worker keeps formal mutations unavailable under the existing recovery or startup failure contract

### Requirement: Normal formal mutation admission has no inventory host reads
The Worker SHALL admit an ordinary formal mutation from cached normal-pressure evidence without reading the persisted SQLite projection, listing truth files, reading truth manifests, or collecting an exact delta inventory before the transaction. Successful mutation durability MUST still produce a verified `journaled` receipt.

#### Scenario: Review feedback under normal pressure
- **WHEN** a loaded Worker with a normal exact baseline commits `review.session.feedback`
- **THEN** the feedback produces its verified `journaled` durability receipt without reading `siyuanmemo.db` or scanning truth inventory during admission

#### Scenario: Recovery gate is active
- **WHEN** verified mutation frontier or startup recovery evidence blocks formal writes
- **THEN** cached normal pressure does not bypass `STORAGE_RECOVERY_REQUIRED`

### Requirement: Journaled delta evidence updates pressure in memory
After a successful formal delta append, the Worker SHALL update cached delta files, entries, encoded bytes, oldest-entry evidence, and conservative projection growth from the append result, then SHALL reclassify storage pressure without a host read.

#### Scenario: Append remains below soft pressure
- **WHEN** observed post-append evidence remains below every soft threshold
- **THEN** the next formal mutation remains eligible for in-memory normal admission

#### Scenario: Append crosses a threshold
- **WHEN** observed post-append evidence reaches soft, high, or hard pressure
- **THEN** the next admission decision reflects that level before another formal mutation result is returned

### Requirement: Pressure transitions use bounded exact refresh and maintenance
The Worker SHALL admit soft-pressure writes while coalescing an exact background refresh. It SHALL synchronously verify cached high or hard evidence before running existing bounded maintenance, and MUST reject growth only when exact post-maintenance evidence remains hard.

#### Scenario: Multiple writes observe soft pressure
- **WHEN** several formal mutations arrive while cached evidence is soft and a refresh is already pending
- **THEN** the Worker allows those writes and runs at most one concurrent exact refresh

#### Scenario: Conservative estimate reaches high but exact evidence is lower
- **WHEN** cached evidence is high and a synchronous exact refresh classifies pressure below high
- **THEN** the Worker admits the mutation without unnecessary synchronous maintenance

#### Scenario: Hard pressure remains after maintenance
- **WHEN** exact hard pressure remains after the existing bounded maintenance or legacy recovery attempt
- **THEN** the Worker rejects the mutation with `STORAGE_PRESSURE` and retains blocking evidence

### Requirement: Exact storage operations refresh admission evidence
Explicit storage inventory diagnostics and completed promotion, compaction, recovery, or startup maintenance transitions SHALL replace cached estimates with exact inventory before subsequent admission decisions.

#### Scenario: Explicit diagnostics are requested
- **WHEN** a caller requests storage inventory or combined storage diagnostics
- **THEN** the returned record is exact and becomes the current admission baseline

#### Scenario: Maintenance reduces pressure
- **WHEN** promotion or compaction completes and exact inventory falls below a prior blocking threshold
- **THEN** the Worker clears stale blocking evidence and subsequent admissions use the refreshed level
