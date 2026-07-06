## ADDED Requirements

### Requirement: Review feedback sealed segment reads are attributed by purpose
The system SHALL expose Review feedback timing evidence that attributes SQLite sealed-segment reads to their exact commit substep or storage purpose.

#### Scenario: Slow feedback reads sealed segments
- **WHEN** `review.session.feedback` is slow and SQLite host effects include `sqlite.readBinary` on `sqlite-delta-log.v2.sealed-*.msgpack`
- **THEN** the copyable worker feedback summary SHALL identify the sealed-read purpose or substep in addition to path, storage class, count, total, max, and bytes where available

#### Scenario: Multiple sealed segments are read in one commit
- **WHEN** one Review feedback commit reads multiple sealed SQLite delta segments
- **THEN** the timing evidence SHALL group those reads so the user can distinguish replay/projection/checkpoint/diagnostic/queue-impact work from ordinary append work

### Requirement: Review feedback diagnostics distinguish sealed reads from required append writes
The system SHALL keep sealed read attribution separate from required open-segment writes and manifest writes.

#### Scenario: Commit performs required append write
- **WHEN** Review feedback appends durable SQLite delta evidence to the open segment
- **THEN** the timing evidence SHALL report the open-segment `writeBinary` separately from sealed-segment `readBinary` work

#### Scenario: Commit performs manifest write
- **WHEN** Review feedback updates the SQLite delta manifest
- **THEN** the timing evidence SHALL report manifest `writeJSON` separately from sealed-segment `readBinary` work

### Requirement: Durable Review commit remains fail-closed during attribution
The system SHALL preserve existing Review feedback durability semantics while adding sealed-read attribution.

#### Scenario: Storage evidence is unavailable
- **WHEN** required SQLite delta or projection storage evidence is missing, failed, or corrupt during Review feedback commit
- **THEN** the system SHALL return explicit failure or unavailable state and SHALL NOT report committed success

#### Scenario: Recovery path needs persisted sealed bytes
- **WHEN** diagnostics, replay, repair, checkpoint recovery, startup, discard, checksum mismatch, or explicit rebuild needs sealed-segment evidence
- **THEN** the system SHALL read persisted sealed bytes and SHALL NOT suppress the read only to improve hot-path timing

### Requirement: Attribution supports the next optimization decision
The system SHALL provide enough evidence to decide whether the next safe optimization belongs to replay/projection, checkpoint recovery, queue-impact, or host storage.

#### Scenario: Sealed reads are hot-path rebuild work
- **WHEN** sealed reads are caused by avoidable hot-path replay or projection rebuild during ordinary Review feedback
- **THEN** diagnostics SHALL identify that owner so a follow-up change can remove or cache that work behind the correct invariant

#### Scenario: Sealed reads are required recovery work
- **WHEN** sealed reads are required for recovery, repair, checkpoint, or explicit diagnostic correctness
- **THEN** diagnostics SHALL identify them as required non-hot-path work and SHALL NOT classify them as safe redundant IO
