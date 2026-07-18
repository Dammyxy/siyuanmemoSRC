## ADDED Requirements

### Requirement: Installation-local record is the sole Truth Device Identity authority
The system SHALL store the complete authoritative `deviceId + identityEpoch` identity in a versioned plugin-owned record below the active SiYuan workspace `conf/` tree, outside synchronized `data/` and disposable `temp/` storage.

#### Scenario: Different frontend origins use the same authority
- **WHEN** Electron, browser, or another frontend origin connects to the same local SiYuan workspace installation
- **THEN** every frontend SHALL resolve the same authority record independent of its origin-specific storage

#### Scenario: Authority location is not synchronized or temporary
- **WHEN** the authority adapter resolves its persistence path
- **THEN** it SHALL use `/conf/siyuan-plugin-siyuanmemo/truth-device-identity.v1.json` and SHALL NOT use `data/storage/petal`, `Plugin.saveData()`, or workspace `temp/`

### Requirement: Identity policy is owned by one deep module
The system SHALL expose Truth Device Identity resolution through one application-owned module that owns validation, creation, migration, cache repair, conflict classification, epoch lifecycle, and recovery disposition; consumers SHALL NOT choose among persistence adapters.

#### Scenario: Worker startup requests identity
- **WHEN** backend Worker composition needs a Truth Device Identity before `db.load`
- **THEN** it SHALL consume the module's typed resolution rather than reading IndexedDB, localStorage, or temp-local state directly

#### Scenario: Module returns a non-writable disposition
- **WHEN** the module cannot prove a verified full identity
- **THEN** startup SHALL return explicit retryable authority-unavailable or non-retryable identity-recovery-required evidence and SHALL NOT enable formal writes

### Requirement: Browser and temp records are caches only
The system SHALL treat IndexedDB, localStorage, and temp-local identity records as cache or migration evidence and SHALL NOT treat their presence, absence, agreement, or conflict as authority after an installation authority exists.

#### Scenario: Browser caches disappear
- **WHEN** a valid installation authority exists and IndexedDB and localStorage are both missing after an origin or profile change
- **THEN** the system SHALL keep the same `deviceId + identityEpoch`, rehydrate caches best-effort, and SHALL NOT create an identity or rotate an epoch

#### Scenario: Browser caches disagree with authority
- **WHEN** a valid installation authority exists and a browser cache contains a different or invalid record
- **THEN** the system SHALL retain the installation authority, repair or invalidate the cache best-effort, and report cache diagnostics without disabling writes solely because of the cache

#### Scenario: Browser cache access fails
- **WHEN** a valid installation authority exists and an origin denies IndexedDB or localStorage access
- **THEN** identity verification SHALL remain writable and SHALL report the cache as unavailable rather than authority-unavailable

### Requirement: Authority creation is fenced across origins
The system SHALL serialize first-install creation, legacy migration, and explicit authority revision through an origin-independent initialization fence and SHALL verify the published record before exposing it as writable.

#### Scenario: Concurrent first-install frontends
- **WHEN** two frontend origins attempt to initialize a missing authority concurrently
- **THEN** exactly one fenced authoritative identity SHALL be published and both frontends SHALL resolve that same verified record

#### Scenario: Initialization fence is unavailable
- **WHEN** authority mutation is required but the origin-independent fence cannot be acquired
- **THEN** the system SHALL return retryable authority-unavailable and SHALL NOT perform an unfenced authority write

#### Scenario: Authority write verification fails
- **WHEN** a newly published authority cannot be read back with the expected schema, revision, `deviceId`, and `identityEpoch`
- **THEN** the system SHALL enter identity-recovery-required and SHALL NOT populate writable startup identity

### Requirement: First-install generation requires an empty installation
The system SHALL generate a new `deviceId + identityEpoch` only after an evidence probe proves there is no prior identity, canonical truth, SQLite delta, Verified Mutation Frontier, or recovery evidence in the local installation.

#### Scenario: Truly empty installation
- **WHEN** the authority is missing, no valid migration pair exists, and the evidence probe proves the installation empty
- **THEN** the system SHALL create one new full authority under the initialization fence and overwrite stale browser caches from it

#### Scenario: Authority and browser caches are missing in a non-empty installation
- **WHEN** the authority, IndexedDB, and localStorage records are missing but truth, delta, Frontier, or prior identity evidence exists
- **THEN** the system SHALL return identity-recovery-required and SHALL NOT infer an identity or generate an epoch

#### Scenario: Temp mirror contains only a device ID
- **WHEN** the authority is missing in a non-empty installation and temp-local evidence contains a device ID without the authoritative epoch
- **THEN** the system SHALL return identity-recovery-required and SHALL NOT pair that device ID with a newly generated epoch

### Requirement: Legacy browser authority migrates only from unambiguous full evidence
The system SHALL migrate a pre-change browser identity into installation authority only when IndexedDB and localStorage contain matching valid full versioned records that remain matching after the initialization fence is acquired.

#### Scenario: Matching legacy authority pair
- **WHEN** installation authority is absent and both legacy browser authority copies contain the same valid `deviceId + identityEpoch`
- **THEN** the system SHALL publish that unchanged identity into installation authority, verify it, and demote both browser records to caches

#### Scenario: Legacy authority copies conflict
- **WHEN** installation authority is absent in a non-empty installation and the two valid legacy records disagree on device or epoch
- **THEN** the system SHALL return identity-recovery-required and SHALL NOT choose either record by priority

#### Scenario: Only one legacy full record survives
- **WHEN** installation authority is absent in a non-empty installation and only one browser store contains a valid full identity
- **THEN** the system SHALL return identity-recovery-required unless an explicit recovery workflow supplies additional verified continuity evidence

### Requirement: Identity epoch changes are explicit and evidence-preserving
The system SHALL NOT rotate `identityEpoch` because a browser origin, profile, cache, host fingerprint, or SiYuan `System.ID` changed; any explicit epoch transition MUST preserve prior namespace and mutation evidence and satisfy Verified Mutation Frontier continuity.

#### Scenario: Host fingerprint changes
- **WHEN** a verified authority is observed with a different `System.ID` or host fingerprint
- **THEN** the system SHALL record diagnostic host-change evidence without changing `deviceId` or `identityEpoch`

#### Scenario: Existing foreign-epoch mutation is encountered
- **WHEN** startup finds a journal envelope whose original epoch differs from the active authority and Frontier cannot prove coverage
- **THEN** the system SHALL preserve the original envelope and remain in storage recovery rather than rebind its epoch, skip or renumber its journal sequence, or forge coverage

### Requirement: Authority writes are rare and verified
The system SHALL avoid routine authority writes during normal startup and SHALL require schema/revision validation plus exact read-after-write verification for creation, migration, or explicit epoch transition.

#### Scenario: Normal warm startup
- **WHEN** an existing authority validates and no explicit identity transition is requested
- **THEN** the system SHALL resolve it without rewriting the authority for `lastSeenAt` or cache observation updates

#### Scenario: Authority is malformed or unsupported
- **WHEN** the installation authority contains invalid JSON, an unsupported version, an invalid identity, or an invalid revision
- **THEN** the system SHALL return identity-recovery-required and SHALL NOT fall back to browser caches or generate a replacement

### Requirement: Production composition cannot restore browser authority
The system SHALL enforce a static and testable boundary that prevents production composition from constructing IndexedDB, localStorage, or temp-local adapters as Truth Device Identity authority.

#### Scenario: Boundary guard scans production code
- **WHEN** repository architecture guards run
- **THEN** they SHALL fail if production identity composition labels or injects a browser-origin or temp-local adapter as the authority port

#### Scenario: Browser adapters remain available as caches
- **WHEN** production composition constructs IndexedDB or localStorage identity adapters after cutover
- **THEN** those adapters SHALL be wired only through cache/migration ports and SHALL NOT satisfy the authority interface
