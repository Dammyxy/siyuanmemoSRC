## ADDED Requirements

### Requirement: Consecutive append operations reuse verified open-segment evidence

The SQLite delta append module SHALL reuse verified open-segment evidence for consecutive append operations in the same runtime when the current manifest open segment matches the cached segment identity.

#### Scenario: Consecutive review feedback appends avoid repeated open-segment reads

- **WHEN** two ordinary `review.feedback` transactions append to the same SQLite delta open segment in one `SqliteDeltaCheckpointLayer` instance
- **THEN** the second append MUST NOT issue another persisted `readBinary` for that same open segment before writing the updated open segment

#### Scenario: Manifest mismatch disables reuse

- **WHEN** the current manifest open segment path, sequence, checksum, byte size, entry count, or sealed flag does not match the cached verified open segment
- **THEN** the append module MUST discard the cached open-segment evidence and read persisted segment evidence before appending

### Requirement: Verified evidence remains inside the SQLite delta module

The SQLite delta append module SHALL keep checksum validation, msgpack envelope normalization, segment entry-count validation, and open-segment evidence reuse inside `SqliteDeltaCheckpointLayer`.

#### Scenario: Worker host bridge stays a persistence adapter

- **WHEN** worker `review.feedback` needs SQLite delta persistence
- **THEN** worker transport and renderer persistence bridge MUST continue forwarding storage effects without duplicating segment checksum or envelope-cache rules

### Requirement: Corrupt or missing segment evidence still fails closed

The SQLite delta append module SHALL preserve existing fail-closed behavior for corrupt open segments, corrupt sealed segments, missing segments, failed checkpoint repair, and explicit diagnostics.

#### Scenario: Corrupt open segment after cold read still repairs or fails closed

- **WHEN** persisted open-segment bytes fail checksum validation on a cold append, replay, repair, or diagnostics path
- **THEN** the module MUST clear append hot-path evidence and follow the existing corrupt-open-segment repair or fail-closed path

#### Scenario: Corrupt sealed segment is not masked by open-segment reuse

- **WHEN** a sealed segment checksum mismatches during snapshot reconstruction
- **THEN** the module MUST surface the checksum mismatch and MUST NOT checkpoint, delete, or overwrite the corrupt sealed segment as a side effect of the append cache

### Requirement: Append evidence invalidates on non-append storage evidence paths

The SQLite delta append module SHALL invalidate verified open-segment evidence before or after operations that need persisted storage evidence or mutate delta evidence outside ordinary append sequencing.

#### Scenario: Diagnostics and replay read durable state

- **WHEN** callers run replay, explicit SQLite delta diagnostics, checkpoint repair, discard, or pending-delta recovery
- **THEN** the module MUST NOT rely on stale append evidence and MUST read the required persisted manifest or segment evidence
