## ADDED Requirements

### Requirement: SQLite delta append preflight reuses same-runtime verified sealed evidence
The system SHALL reuse same-runtime verified sealed SQLite delta segment evidence during ordinary append-preflight snapshot reconstruction when the cached evidence exactly matches the manifest segment identity.

#### Scenario: Same-runtime sealed evidence matches manifest identity
- **WHEN** a SQLite delta append seals an open segment and a later ordinary append preflight reconstructs the snapshot in the same runtime
- **THEN** the system SHALL reuse the verified sealed segment evidence instead of reading the sealed msgpack bytes from persisted storage

#### Scenario: Sealed evidence identity no longer matches
- **WHEN** cached sealed segment evidence differs from the manifest entry by path, sequence, sealed flag, checksum, entry count, or byte size
- **THEN** the system MUST discard that cached evidence and read persisted segment bytes or fail closed

### Requirement: Recovery paths still read persisted sealed bytes
The system SHALL preserve persisted sealed segment reads when same-runtime verified evidence is unavailable or when an explicit recovery, inspection, or repair path requires durable storage evidence.

#### Scenario: Reloaded runtime appends after sealed segment exists
- **WHEN** a runtime starts without in-memory verified sealed segment evidence and appends to a manifest containing sealed segments
- **THEN** the system SHALL read and verify persisted sealed msgpack bytes during append preflight

#### Scenario: Diagnostics inspect persisted state
- **WHEN** diagnostics, replay, repair, checkpoint recovery, discard, checksum mismatch, failure handling, or legacy recovery inspects SQLite delta state
- **THEN** the system SHALL read persisted sealed bytes when required and MUST NOT suppress those reads for hot-path timing

### Requirement: Review feedback durability remains fail-closed
The system SHALL keep Review feedback commit success coupled to durable SQLite delta write or checkpoint evidence while optimizing append-preflight reads.

#### Scenario: Storage evidence is missing or corrupt
- **WHEN** append preflight cannot validate required segment evidence because persisted bytes are missing, corrupt, or checksum mismatched
- **THEN** the system MUST fail closed or use the existing explicit checkpoint repair path, and MUST NOT acknowledge Review feedback success by using stale evidence

#### Scenario: Host timing remains attributable
- **WHEN** append preflight still performs sealed segment reads
- **THEN** the system SHALL keep `purpose` and `substep` attribution in host timing diagnostics so the read can be classified as hot-path preflight or recovery work
