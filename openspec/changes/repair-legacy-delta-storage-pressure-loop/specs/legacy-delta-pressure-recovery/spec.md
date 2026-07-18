## ADDED Requirements

### Requirement: Coverage compaction must not amplify storage without progress
The SQLite delta checkpoint SHALL compute and expose a compaction plan before writing replacement segments. When no candidate entry is covered by verified truth or the projected active delta does not shrink, it MUST return an explicit no-progress result and MUST NOT write segments, publish a replacement manifest, or request deletion.

#### Scenario: All candidate entries are unjournaled legacy evidence
- **WHEN** coverage compaction inspects candidate segments whose entries have no journal sequence and none has verified adoption coverage
- **THEN** it returns `no-progress-uncovered` with candidate and retained counts and performs zero persistent writes and deletions

#### Scenario: Some candidate entries are truth-covered
- **WHEN** verified coverage makes at least one candidate entry reclaimable and the planned active delta shrinks
- **THEN** compaction may relocate only retained entries and reports the reclaimed entry and byte counts

### Requirement: Legacy adoption must be deterministic and fail closed
The recovery planner SHALL derive mutation identity, journal order, affected aggregates, and required truth outputs solely from checksum-verified manifest-referenced legacy delta evidence and verified local truth identity. It MUST reject unsupported or ambiguous evidence without publishing coverage or deleting the source segment.

#### Scenario: Supported legacy entry is adopted
- **WHEN** an unjournaled entry has a supported table, label, schema, primary key, and row shape
- **THEN** repeated planning derives the same mutation ID and canonical output requirements and persists a journaled replacement whose operations exactly match the legacy changes

#### Scenario: Legacy entry cannot be mapped unambiguously
- **WHEN** an entry contains an unknown table, schema mismatch, incomplete aggregate identity, or unsupported operation shape
- **THEN** recovery reports `unsupported-evidence`, keeps storage read-only, and retains every source segment

#### Scenario: Provisional adoption used an earlier identity epoch
- **WHEN** a journaled `LEGACY_DELTA_ADOPTED` entry belongs to the same device under another identity epoch, exactly matches deterministic adoption evidence, and that epoch's promotion state does not cover its sequence
- **THEN** recovery preserves its mutation ID and journal sequence, corrects only its identity epoch to the verified current identity, and resumes contiguous promotion

#### Scenario: Foreign identity evidence cannot be proven provisional and uncovered
- **WHEN** a foreign-epoch entry is a formal mutation, belongs to another device, differs from deterministic adoption evidence, or is covered by its epoch's promotion state
- **THEN** recovery reports unsupported evidence, does not skip the journal position, and retains all source segments

### Requirement: Adoption coverage requires verified canonical truth
Adopted entries SHALL pass through the ordered Truth Promotion pipeline. Coverage MUST advance only after all required Review, Card/Schedule, Queue, tombstone, Undo, and metadata outputs declared by the adopted mutation are replay-verified in canonical truth.

#### Scenario: All required outputs verify
- **WHEN** the truth publisher verifies every output for a contiguous adopted journal batch
- **THEN** coverage advances to the last journal sequence and those entries become eligible for ordinary coverage compaction

#### Scenario: Publication is incomplete
- **WHEN** any required output is unsupported, missing, or fails replay verification
- **THEN** coverage does not advance past the failing mutation and no source evidence for that mutation is deleted

### Requirement: Manifest transitions must be crash-resumable
Legacy adoption and compaction SHALL write immutable replacement files before publishing a verified manifest switch, and SHALL retain an explicit cleanup checkpoint until every superseded file deletion is verified.

#### Scenario: Process stops before manifest switch
- **WHEN** replacement files were written but the replacement manifest was not verified and published
- **THEN** the prior manifest remains authoritative and a later recovery can identify the replacement files as unreachable without losing active evidence

#### Scenario: Process stops after manifest switch
- **WHEN** the replacement manifest is authoritative but superseded files remain
- **THEN** the next recovery resumes deletion from the cleanup checkpoint without relocating the entries again

#### Scenario: Process stops after deletion before cleanup checkpoint clear
- **WHEN** the replacement manifest is authoritative, superseded files were deleted, and the cleanup checkpoint still lists their absent paths
- **THEN** startup treats those paths as cleanup metadata rather than replayable delta, preserves the replacement manifest as authority, and allows recovery to clear the completed cleanup checkpoint

### Requirement: Orphan cleanup must be bounded and manifest proven
The recovery service SHALL delete only normalized SQLite delta segment paths proven unreachable from the latest verified manifest, active checkpoint, and in-progress recovery generation. Each run MUST enforce file and byte budgets and report deleted, skipped, failed, and remaining inventory.

#### Scenario: Unreachable segment is within the cleanup budget
- **WHEN** a listed segment is absent from every protected manifest set and remains unprotected immediately before deletion
- **THEN** recovery deletes it, verifies absence, and includes its path and byte size in the cleanup result

#### Scenario: Listed path is protected or unverifiable
- **WHEN** a path is active, checkpoint-protected, outside the delta directory, malformed, or cannot be revalidated
- **THEN** recovery skips or fails the path without deleting it and records a content-safe reason

### Requirement: Hard-pressure write gating must survive recovery
The backend SHALL remain readable but MUST reject ordinary mutations while legacy adoption, truth promotion, active compaction, or required cleanup is incomplete under hard storage pressure. It SHALL restore writable status only after fresh verified inventory is below the accepted pressure threshold and recovery has no blocking evidence.

#### Scenario: Recovery is pending after readable load
- **WHEN** startup reconstructs readable state but reports hard storage pressure with legacy evidence
- **THEN** reads remain available, ordinary Review and Queue mutations remain blocked, and recovery status identifies the pending work

#### Scenario: Recovery completes below the threshold
- **WHEN** adoption, truth verification, compaction, cleanup, and pressure reclassification all succeed
- **THEN** the backend removes the storage-pressure write gate without requiring blind deletion or a timeout increase

### Requirement: Recovery diagnostics must expose phase and progress without content
The system SHALL report compaction planning, adoption, truth promotion, compaction, orphan cleanup, and pressure reclassification outcomes using stable codes, counts, byte totals, manifest identity, and timing. Diagnostics MUST NOT include note content or serialized SQLite row bodies.

#### Scenario: No-progress startup is diagnosed
- **WHEN** compaction is skipped because all candidate evidence remains uncovered
- **THEN** diagnostics report `no-progress-uncovered`, candidate counts and bytes, and zero written or deleted files

#### Scenario: Recovery fails on one entry
- **WHEN** adoption or cleanup reaches a deterministic failure
- **THEN** diagnostics identify the phase, stable error code, evidence path or entry ID, retry state, and aggregate remaining counts without exposing row content
