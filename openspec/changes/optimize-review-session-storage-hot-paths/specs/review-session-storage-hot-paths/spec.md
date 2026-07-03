## ADDED Requirements

### Requirement: Review feedback reuses session advancement result
For SRS v2 Review queues, the system SHALL use the next card and counter snapshot produced by the Review session advancement command after successful feedback instead of immediately reloading or reselecting the next card through a second queue `next()` call.

#### Scenario: Successful rating advances to prepared next card
- **WHEN** a user rates a card in an IncrementalLearning or RetrievalPractice Review session and `answerAndAdvance` returns an advanced result with a next card
- **THEN** the Review surface displays that returned next card without issuing a redundant full queue reload or projection snapshot read

#### Scenario: Advancement conflict remains fail-closed
- **WHEN** `answerAndAdvance` returns a conflict or unavailable result for the current card
- **THEN** the Review surface reports or handles the explicit conflict/unavailable path and MUST NOT silently fall back to a stale local queue snapshot

### Requirement: Worker review feedback preflight avoids unnecessary main DB reads
The worker Review feedback hot path SHALL skip persisted main DB reads when there are no non-empty conflict sources and the worker has evidence that the persisted main DB reflects its own recent Review feedback persistence.

#### Scenario: Own Review feedback write keeps fast-skip eligible
- **WHEN** `review.feedback` persists its own durable Review result and no external conflict source is present
- **THEN** subsequent `review.feedback` preflight does not read the persisted main DB solely because queue projection replacement occurred

#### Scenario: External conflict source forces merge check
- **WHEN** a non-empty sync conflict source or persisted main DB hash divergence is present
- **THEN** `review.feedback` preflight reads and merges the relevant source before reporting committed success

### Requirement: UnifiedStorage Xiuyuan card reads are pure
UnifiedStorage read methods SHALL NOT mutate card DTOs, Xiuyuan payloads, indexes, or dirty state while serving read requests.

#### Scenario: Read by Xiuyuan id does not dirty storage
- **WHEN** a caller invokes `getCardDTOsByXiuyuanId()` on an already loaded store
- **THEN** the method returns matching card DTOs without changing indexes or marking the store dirty

#### Scenario: Malformed bindings require explicit repair
- **WHEN** a read encounters cards that can only be associated with a Xiuyuan through legacy or malformed binding evidence
- **THEN** the read reports or omits them according to the canonical read contract and MUST NOT repair them as a hidden side effect

### Requirement: Xiuyuan-bound card lookup uses maintained indexes
UnifiedStorage SHALL maintain a Xiuyuan-to-card lookup index during canonical load and DTO mutations so common Review, Queue, and Browser reads avoid scanning all card DTOs.

#### Scenario: Indexed lookup returns deterministic card order
- **WHEN** multiple card DTOs are bound to a Xiuyuan id
- **THEN** lookup by Xiuyuan id returns the bound cards in deterministic card id order using the maintained index

#### Scenario: DTO mutation updates Xiuyuan index
- **WHEN** a card DTO is created, updated, rebound, or deleted
- **THEN** the Xiuyuan-to-card index reflects the new membership before subsequent reads
