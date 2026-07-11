## ADDED Requirements

### Requirement: Plugin installation identity owns the local truth directory
The system SHALL derive the writable device-owned truth directory from a stable SiYuanMemo plugin installation identity rather than from temporary files, synchronized manifests, or SiYuan runtime `System.ID` alone.

#### Scenario: Plugin restarts on the same installation
- **WHEN** the plugin restarts and valid local identity copies remain
- **THEN** it SHALL resolve the same device ID and continue writing the same device-owned truth directory

#### Scenario: Synchronized truth contains another device directory
- **WHEN** remote or synchronized manifests include unknown device IDs
- **THEN** the local installation SHALL treat them as reconciliation inputs and SHALL NOT adopt one as its writable identity

### Requirement: Identity is redundantly persisted in IndexedDB and localStorage
The system SHALL persist matching versioned identity records in IndexedDB and localStorage and SHALL treat the workspace temporary JSON file only as a disposable mirror.

#### Scenario: One authoritative copy is missing
- **WHEN** exactly one valid authoritative copy exists
- **THEN** the system SHALL use it and repair the missing copy before enabling truth writes

#### Scenario: Temporary mirror is missing or unreadable
- **WHEN** the temporary JSON identity mirror is deleted, malformed, or unavailable
- **THEN** identity resolution SHALL continue from IndexedDB and localStorage and MAY rewrite the mirror after authority is established

#### Scenario: Both authoritative copies disagree
- **WHEN** IndexedDB and localStorage contain different valid device identities or epochs
- **THEN** the system SHALL enter explicit identity recovery and SHALL NOT silently choose either copy or create truth writes

### Requirement: Identity records contain stable ownership metadata
The system SHALL store a versioned identity record containing device ID, identity epoch, host fingerprint, creation time, and last-seen time.

#### Scenario: Host fingerprint changes
- **WHEN** SiYuan runtime `System.ID` differs from the stored host fingerprint while device identity copies agree
- **THEN** the system SHALL record and diagnose the host change without automatically changing the writable device ID

#### Scenario: Identity record is upgraded
- **WHEN** a future identity schema version adds fields
- **THEN** migration SHALL preserve device ID and epoch unless an explicit identity-loss or identity-recovery decision creates a new epoch

### Requirement: SiYuan System ID is a fingerprint only
The system SHALL use SiYuan runtime `System.ID` only as host fingerprint evidence and SHALL NOT require it to remain stable across all supported platforms.

#### Scenario: Mobile runtime supplies a new System ID
- **WHEN** a non-standard or mobile container changes SiYuan runtime `System.ID` across launches
- **THEN** the plugin SHALL retain its installation identity when authoritative local copies remain valid

### Requirement: Legacy identity migrates without changing device ownership
The system SHALL migrate a valid existing truth device ID from legacy localStorage or temporary identity state into matching versioned IndexedDB and localStorage records before normal truth writes.

#### Scenario: Legacy localStorage identity exists
- **WHEN** upgrade finds one valid legacy truth device ID and no conflicting versioned identity
- **THEN** migration SHALL preserve that device ID, create the versioned identity record, and populate both authoritative stores

#### Scenario: Legacy sources conflict
- **WHEN** legacy localStorage, temporary state, or versioned records disagree about the device ID
- **THEN** migration SHALL enter identity recovery and SHALL NOT overwrite an existing device truth directory

### Requirement: Complete local identity loss creates a new epoch
The system SHALL create a new device ID and identity epoch only when no valid authoritative local identity copy can be recovered.

#### Scenario: Both authoritative stores are empty
- **WHEN** IndexedDB and localStorage contain no recoverable identity record
- **THEN** the system SHALL create a new identity, persist matching copies, and use a new writable device truth directory

#### Scenario: Prior device directories remain synchronized
- **WHEN** old truth directories from the same physical device are later discovered
- **THEN** they SHALL remain read-only reconciliation inputs and SHALL NOT be renamed, overwritten, or silently claimed by the new identity

### Requirement: Identity diagnostics explain ownership decisions
The system SHALL expose identity source, schema version, device ID, epoch, host-fingerprint match state, repaired stores, legacy migration state, and explicit recovery reason without exposing unrelated secrets.

#### Scenario: Synchronization reports a device ownership problem
- **WHEN** diagnostics are requested after an identity or truth-directory conflict
- **THEN** the result SHALL explain which local copies agreed, disagreed, were missing, or were migrated
