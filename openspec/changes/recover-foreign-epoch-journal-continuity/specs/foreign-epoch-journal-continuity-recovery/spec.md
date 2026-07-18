## ADDED Requirements

### Requirement: Recovery begins with immutable evidence inventory
The system SHALL inventory missing/current/previous installation authority evidence, Verified Mutation Frontier, journal allocation, original mutation envelope, predecessor promotion coverage, durability receipt, relevant truth manifests, and recovery state without mutating any source evidence.

#### Scenario: Installation authority is missing
- **WHEN** recovery preview observes a non-empty installation without a current or previous authority file and temp-local contains only a device ID
- **THEN** it SHALL report `identity-authority-missing` and the incomplete evidence without generating an identity
- **AND** browser caches, temp-local values, `System.ID`, synchronized truth, timestamps, and operator input SHALL NOT independently become the authority candidate

#### Scenario: Sequence 404 incident is previewed
- **WHEN** recovery preview observes predecessor coverage 403 and an uncovered sequence 404 envelope under another epoch
- **THEN** it SHALL report every identity, sequence, mutation ID, payload hash, required truth output, and evidence source needed for a continuity decision
- **AND** it SHALL perform no authority, journal, truth, Frontier, projection, or cache write

### Requirement: Missing authority requires a certified publication intent
The system SHALL publish a missing installation authority only when durable incident evidence uniquely proves one device ID and intended current epoch, and the exact authority payload is bound into a content-addressed Worker plan.

#### Scenario: Durable evidence proves one authority candidate
- **WHEN** journal, Frontier, transition, manifest, and receipt evidence uniquely bind one device and current epoch without a competing candidate
- **THEN** preview MAY emit a versioned `authorityPublicationIntent` containing the exact authority payload and evidence hashes
- **AND** the intent SHALL distinguish corroborating browser/temp evidence from evidence that proves the candidate

#### Scenario: Authority evidence is insufficient or contradictory
- **WHEN** only browser/temp evidence survives, required durable evidence is missing, or more than one device/epoch candidate remains possible
- **THEN** preview SHALL report an explicit identity-authority blocker
- **AND** apply SHALL NOT publish an authority or continue to journal recovery

### Requirement: Authority publication is fenced, exact, and restart-bounded
The system SHALL execute an approved authority publication intent through the installation authority port while holding the Kernel identity initialization fence and active writer authority, SHALL verify exact read-back, and SHALL stop that apply stage pending normal restart.

#### Scenario: Approved missing authority is published
- **WHEN** apply revalidates the unchanged authority plan and backup receipt
- **THEN** the application coordinator SHALL publish only the Worker-certified payload and persist an `installation-authority-published` receipt after exact read-back
- **AND** it SHALL require restart and a fresh continuity preview before any journal, truth, or Frontier mutation

#### Scenario: Authority appears or changes after preview
- **WHEN** authority state differs from the approved missing-authority evidence
- **THEN** apply SHALL reject the stale plan without overwriting the authority

### Requirement: Recovery apply is bound to a deterministic plan
The system SHALL create a versioned content-addressed recovery plan for each recovery stage and SHALL re-read and re-hash all plan inputs under the applicable exclusive fences before applying it.

#### Scenario: Evidence changes after preview
- **WHEN** authority, identity candidate, journal, predecessor coverage, truth manifest, Frontier, or receipt evidence differs from the approved plan
- **THEN** apply SHALL reject the stale plan
- **AND** it SHALL remain in storage recovery without publishing new truth or coverage

### Requirement: Exact same-device adjacency must be proven
The system SHALL allow this recovery only when one device owns verified predecessor coverage and the intact uncovered mutation is the unique next journal sequence for that same device.

#### Scenario: Predecessor 403 and mutation 404 are continuous
- **WHEN** verified coverage ends at 403, the journal allocation proves 404 is next, the original envelope owns sequence 404, and device ownership matches
- **THEN** the recovery plan MAY classify the mutation as an adjacent foreign-epoch continuity candidate

#### Scenario: Ownership or sequence evidence is ambiguous
- **WHEN** device IDs differ, two mutations claim sequence 404, a sequence is missing, predecessor coverage conflicts, or allocation extends through incompatible evidence
- **THEN** recovery SHALL be rejected
- **AND** it SHALL NOT choose an owner, skip a sequence, renumber a mutation, or synthesize predecessor coverage

### Requirement: Original mutation identity is immutable
The system SHALL preserve the original mutation ID, device ID, identity epoch, journal sequence, payload, required truth outputs, durability receipt identity, and idempotency keys throughout recovery.

#### Scenario: Foreign-epoch mutation is promoted
- **WHEN** the validated recovery publishes sequence 404
- **THEN** every canonical output SHALL be derived from the unchanged original envelope under epoch `f771...`
- **AND** no field SHALL be rebound to the current `4afa...` epoch

### Requirement: Coverage advances only through verified original-epoch truth publication
The system SHALL use the normal idempotent Truth Promotion publication and verification boundary for the original epoch before recognizing coverage of the recovered sequence.

#### Scenario: All required outputs verify
- **WHEN** every required sequence-404 truth output publishes or already exists with the exact logical identity and checksum
- **THEN** original-epoch coverage MAY advance to 404 exactly once

#### Scenario: Publication is partial or fails verification
- **WHEN** any required output or manifest read-back cannot be verified
- **THEN** coverage SHALL remain below 404
- **AND** retry SHALL reuse the same mutation/output identities without appending a duplicate Review fact

### Requirement: Current authority transition inherits only verified coverage
The system SHALL transition the normal Frontier to the current verified or recovery-published installation authority only after normal restart has verified that authority, original-epoch coverage 404 is verified, and no incompatible current-epoch allocation exists.

#### Scenario: Current authority can continue at 405
- **WHEN** original epoch `f771...` has verified coverage 404, current authority epoch `4afa...` remains unchanged, and no conflicting journal evidence exists
- **THEN** the Frontier MAY record an evidence-backed transition and allocate 405 as the next sequence
- **AND** the sequence-404 envelope SHALL remain owned by epoch `f771...`

#### Scenario: Current authority changed or has conflicting mutations
- **WHEN** authority revision/epoch changed after preview or current-epoch journal evidence conflicts with the proposed transition
- **THEN** transition SHALL stop and require a new preview
- **AND** already verified original-epoch truth SHALL remain preserved

### Requirement: Recovery is explicit, fenced, idempotent, and resumable
The system SHALL expose preview, apply, and status as dedicated recovery operations, serialize authority apply against identity initialization and writer authority, serialize continuity apply against formal writes and truth publication, and persist phase receipts sufficient to resume after interruption.

#### Scenario: Apply is interrupted after authority publication
- **WHEN** the process stops after exact authority read-back but before restart classification
- **THEN** normal startup SHALL resolve that authority and recovery status SHALL resume from the authority receipt
- **AND** it SHALL NOT republish a different identity or continue using the stale pre-authority plan

#### Scenario: Apply is interrupted after truth publication
- **WHEN** the process stops after verified original-epoch publication but before Frontier transition
- **THEN** the next apply SHALL resume from verified phase evidence
- **AND** it SHALL NOT replay the Review command or duplicate canonical outputs

#### Scenario: Ordinary startup sees the incident
- **WHEN** no approved recovery apply is active
- **THEN** normal startup SHALL remain fail closed on `FRONTIER_FOREIGN_EPOCH_UNCOVERED`
- **AND** it SHALL NOT invoke the recovery automatically

### Requirement: Normal readiness exclusively re-enables Review writes
The recovery workflow SHALL NOT enable Review writes directly and SHALL require normal reload/restart classification to verify authority, Frontier, journal, truth, delta, and projection continuity.

#### Scenario: Post-recovery restart verifies all evidence
- **WHEN** recovery phases are complete and ordinary startup returns writable readiness with next journal sequence 405
- **THEN** the recovery receipt MAY become terminal and Review admission MAY follow the normal writable gate

#### Scenario: Post-recovery validation still fails
- **WHEN** ordinary startup reports any recovery, pressure, identity, Frontier, truth, delta, or projection blocker
- **THEN** Review writes SHALL remain disabled
- **AND** recovery status SHALL retain the blocker without claiming success

### Requirement: Live apply requires backup and audit evidence
The system SHALL require a verified pre-apply backup/export receipt and SHALL retain content-safe before/after hashes, plan identity, phase receipts, and final startup diagnostics.

#### Scenario: Backup evidence is absent
- **WHEN** apply is requested without the required backup/export receipt
- **THEN** apply SHALL refuse to mutate storage

#### Scenario: Recovery completes
- **WHEN** normal startup verifies the recovered state
- **THEN** diagnostics SHALL expose the operation ID, original epoch, current epoch, recovered sequence, output verification summary, and final Frontier without exposing card content
