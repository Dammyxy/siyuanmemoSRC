## ADDED Requirements

### Requirement: Default native Riff-backed delete uses local tombstone
The system SHALL treat delete of a native Riff-backed card as a local tombstone/hide operation by default.

#### Scenario: Browser delete of native Riff-backed card
- **WHEN** the user deletes a native Riff-backed card from Browser without choosing native hard-delete
- **THEN** the system MUST remove or hide the card from SiYuanMemo local state, persist a tombstone, and MUST NOT call native Riff card removal

#### Scenario: Review delete of native Riff-backed card
- **WHEN** the user deletes a native Riff-backed card from Review without choosing native hard-delete
- **THEN** the system MUST remove or hide the card from SiYuanMemo local state, persist a tombstone, and MUST NOT call native Riff card removal

### Requirement: Persistent tombstones suppress re-import
The system SHALL use persistent tombstones to prevent locally hidden native Riff-backed cards from being re-imported by later sync.

#### Scenario: Full sync sees tombstoned native Riff card
- **WHEN** full sync reads a native Riff card whose block, card, xiuyuan, or native Riff identity matches a local tombstone
- **THEN** the system MUST skip recreating the local SiYuanMemo card for that native Riff card

#### Scenario: Incremental sync sees tombstoned native Riff card
- **WHEN** incremental sync reads a native Riff add/update whose identity matches a local tombstone
- **THEN** the system MUST skip recreating the local SiYuanMemo card for that native Riff card

### Requirement: Native hard-delete requires explicit intent
The system SHALL call native Riff card removal only for an explicit native-hard-delete intent or for a card proven to be owned by SiYuanMemo.

#### Scenario: Explicit native hard-delete
- **WHEN** a caller requests native-hard-delete for a native Riff-backed card and the dangerous action requirements are satisfied
- **THEN** the system MUST call native Riff card removal and MUST record the delete as a native hard-delete

#### Scenario: Missing explicit intent
- **WHEN** a local delete event or use case has no delete intent
- **THEN** the system MUST resolve the delete as local-tombstone and MUST NOT call native Riff card removal

#### Scenario: Ownership proof unavailable
- **WHEN** a caller requests native hard-delete but the card is not proven SiYuanMemo-owned and no explicit dangerous confirmation exists
- **THEN** the system MUST reject the hard-delete request without deleting native Riff state

### Requirement: Native Riff remove reconciles inbound source-of-truth deletion
The system SHALL treat native Riff remove transactions as inbound reconciliation from SiYuan's native Riff source of truth.

#### Scenario: Native Riff remove for managed local Xiuyuan
- **WHEN** SiYuan native Riff removes a card that maps to a managed local Xiuyuan
- **THEN** the system MUST delete or hide the matching local SiYuanMemo state and persist tombstones for the affected card and xiuyuan identities

#### Scenario: Native Riff remove for unknown or unmanaged card
- **WHEN** SiYuan native Riff removes a card that has no managed local Xiuyuan mapping
- **THEN** the system MUST skip local mutation and MUST NOT create a new tombstone for unrelated local cards

### Requirement: MCP and future Agent callers use the same delete intent
The system SHALL expose delete behavior to MCP or future Agent callers through the same local-tombstone and native-hard-delete intent contract.

#### Scenario: MCP caller omits delete intent
- **WHEN** an MCP caller deletes a native Riff-backed card without specifying delete intent
- **THEN** the system MUST use local-tombstone semantics and MUST NOT call native Riff card removal

#### Scenario: MCP caller requests hard-delete
- **WHEN** an MCP caller requests native-hard-delete
- **THEN** the system MUST apply the same ownership proof or dangerous confirmation requirements as UI callers
