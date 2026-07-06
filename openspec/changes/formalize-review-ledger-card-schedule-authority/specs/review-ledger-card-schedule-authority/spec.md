# review-ledger-card-schedule-authority Specification

## Purpose

Define the Anki-style durable Review storage authority for SiYuanMemo: Review Ledger facts plus Card Schedule Store state are the source of truth for accepted answers, replay, audit, and explicit repair planning.

## ADDED Requirements

### Requirement: Review answer authority is ledger plus card schedule state

The system SHALL treat an accepted Review answer as durable only when the Review Ledger fact and Card Schedule Store after-state are both committed or already proven idempotently committed.

#### Scenario: Answer success has both facts

- **WHEN** `SrsReviewKernel.answer` accepts a rating command
- **THEN** it SHALL commit or reuse one idempotent Review Ledger fact for the answer
- **AND** it SHALL commit the matching Card Schedule Store after-state for the reviewed card
- **AND** it SHALL return success only after both authoritative facts are available

#### Scenario: Ledger failure fails closed

- **WHEN** Review Ledger append/reuse fails or returns contradictory evidence
- **THEN** the answer SHALL fail closed
- **AND** the system SHALL NOT report answer success from queue projection, SQLite delta evidence, renderer cursor state, or Browser rows

#### Scenario: Schedule failure fails closed

- **WHEN** Card Schedule Store commit fails or contradicts the accepted Review Ledger fact
- **THEN** the answer SHALL fail closed
- **AND** the system SHALL NOT append a fallback success fact or advance session authority as if the answer committed

### Requirement: Replay and reconciliation use authoritative Review facts

The system SHALL replay or reconcile Review-derived state from Review Ledger and Card Schedule Store evidence before using derived queue projection or sync/delta artifacts.

#### Scenario: Startup derives projection from authoritative facts

- **WHEN** startup detects stale or missing Review queue projection state
- **THEN** it SHALL use Review Ledger and Card Schedule Store evidence as the authority for rebuilding derived Review queue membership/counts
- **AND** it SHALL NOT use stale projection rows as proof that a reviewed card is still due

#### Scenario: Incomplete evidence does not replay

- **WHEN** a Review Ledger fact exists without matching Card Schedule Store after-state, or schedule state exists without matching ledger evidence
- **THEN** replay SHALL report an explicit diagnostic
- **AND** replay SHALL NOT silently reschedule, decrement counts, or mark the answer successful from partial evidence

### Requirement: Review storage audit reports count and schedule divergence

The system SHALL provide bounded diagnostics that compare Review Ledger count, card `reps/lastReview/due` schedule state, and derived queue/read-model state without mutating data.

#### Scenario: Audit detects record count rollback risk

- **WHEN** Review Ledger evidence indicates accepted answers newer than the card schedule state or derived queue counts
- **THEN** audit SHALL report the affected card ids, latest ledger fact metadata, card schedule metadata, and divergence reason
- **AND** audit SHALL remain read-only

#### Scenario: Audit treats projection mismatch as derived-state debt

- **WHEN** Review Ledger and Card Schedule Store agree but BrowserProjectionIndex or queue projection rows disagree
- **THEN** audit SHALL classify the mismatch as derived projection debt
- **AND** it SHALL NOT reinterpret the authoritative Review answer as missing

### Requirement: Repair is explicit, idempotent, and evidence-gated

The system SHALL repair Review Ledger / Card Schedule Store divergence only through an explicit preview/apply flow with evidence fingerprints and idempotency keys.

#### Scenario: Preview builds bounded repair plan

- **WHEN** audit finds evidence-complete Review storage divergence
- **THEN** repair preview SHALL return a bounded plan with source evidence fingerprints, affected cards, proposed mutations, and stale-plan guards
- **AND** preview SHALL NOT mutate cards, ledger rows, review events, sync metadata, or projections

#### Scenario: Apply rejects stale or incomplete plan

- **WHEN** repair apply receives a stale plan, missing confirmation metadata, missing idempotency key, or incomplete evidence
- **THEN** it SHALL fail closed
- **AND** it SHALL NOT perform partial schedule, ledger, or projection mutation
