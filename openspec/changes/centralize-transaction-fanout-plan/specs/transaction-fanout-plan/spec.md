## ADDED Requirements

### Requirement: Shared Transaction Fan-out Plan
The system SHALL derive renderer and backend worker transaction routing from a shared fan-out plan that is based on raw transaction operations and optional short-lived provenance.

#### Scenario: Renderer and worker produce equivalent plans
- **WHEN** the renderer and backend worker evaluate the same transaction batch and provenance snapshot
- **THEN** both sides SHALL derive the same AutoCard, Native Riff, and document-tree routing decisions.

#### Scenario: Plan does not execute side effects
- **WHEN** the fan-out plan is generated
- **THEN** the coordinator SHALL NOT create cards, sync Xiuyuan, mutate SiYuan blocks, rebuild document scope, or enqueue backend actions by itself.

### Requirement: Plugin-authored Excerpt Provenance
The system SHALL support short-lived provenance records for plugin-authored progressive excerpt writes and use them only for explicit block IDs until expiration.

#### Scenario: Provenance expires
- **WHEN** a provenance record is older than its expiration time
- **THEN** the fan-out plan SHALL ignore that provenance record and treat matching block IDs as ordinary transactions.

#### Scenario: Provenance is block-scoped
- **WHEN** a provenance record names one block inside a document
- **THEN** the fan-out plan SHALL NOT suppress unrelated blocks in the same document or subtree.

### Requirement: AutoCard Candidate Suppression
The system SHALL suppress AutoCard candidate scheduling for provenance-matched plugin-authored excerpt operations while preserving unrelated AutoCard behavior.

#### Scenario: Plugin-authored excerpt update is suppressed
- **WHEN** a transaction updates a block listed in active AutoCard-suppression provenance
- **THEN** the plan SHALL place the operation in AutoCard suppressed operations and SHALL NOT schedule it as an AutoCard candidate.

#### Scenario: User edit after provenance expires is evaluated
- **WHEN** a later transaction updates the same block after provenance expiration
- **THEN** the plan SHALL allow normal AutoCard candidate routing when the operation otherwise qualifies.

#### Scenario: Delete cancellation remains active
- **WHEN** a delete transaction targets a block with pending AutoCard work
- **THEN** AutoCard cancellation routing SHALL remain available and SHALL NOT be disabled by candidate suppression.

### Requirement: Scoped Native Riff Upsert
The system SHALL preserve Native Riff upsert block IDs through transaction planning, action pumping, and Xiuyuan sync.

#### Scenario: Upsert plan carries block IDs
- **WHEN** a transaction contains Native Riff add or update signals with block IDs
- **THEN** the fan-out plan SHALL include those block IDs in Native Riff upsert routing.

#### Scenario: Xiuyuan sync receives scoped block IDs
- **WHEN** the action pump handles a Native Riff upsert plan
- **THEN** it SHALL call the Xiuyuan sync owner with the planned block IDs and the sync request SHALL include `scope.blockIds`.

#### Scenario: Scoped native read is preferred
- **WHEN** a Xiuyuan sync read request includes `scope.blockIds`
- **THEN** the native Riff read adapter SHALL prefer reading those block IDs directly instead of fetching broad incremental results and filtering afterwards.

### Requirement: Document-tree Refresh Remains Allowed
The system SHALL continue to route document-tree refresh for transactions that create, move, or touch document tree structure even when AutoCard candidate scheduling is suppressed.

#### Scenario: Excerpt child doc still refreshes document tree scope
- **WHEN** a plugin-authored excerpt transaction creates or updates a document node
- **THEN** the plan SHALL allow document-tree refresh routing.

### Requirement: Legacy Native Riff Handler Alignment
The system SHALL make the legacy renderer Native Riff transaction handler consume the same fan-out plan as the kernel-ingest path.

#### Scenario: Legacy path scopes upsert
- **WHEN** kernel transaction ingest is disabled and a Native Riff upsert transaction is handled by the legacy handler
- **THEN** the handler SHALL use the fan-out plan upsert block IDs and SHALL NOT run an unscoped incremental sync for that transaction.
