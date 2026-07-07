# review-transaction-undo-journal Specification

## Purpose

Define Anki-style durable undo/go-back authority for worker-backed SiYuanMemo Review answers. The Review Transaction Undo Journal is the backend-owned evidence that can reverse an accepted answer without relying on renderer session state or Browser projection rows.

## ADDED Requirements

### Requirement: Review answer records durable undo evidence
The system SHALL record durable Review Transaction Undo Journal evidence for every undoable worker-backed Review answer before reporting that answer as undoable.

#### Scenario: Answer success includes undo journal evidence
- **WHEN** `SrsReviewKernel.answer` accepts a worker-backed Review rating
- **THEN** the system SHALL commit or reuse Review Ledger evidence, Card Schedule Store after-state, SessionQueueIndex advancement, and Review Transaction Undo Journal evidence in one durable success envelope
- **AND** the returned undo token SHALL identify the committed undo journal record

#### Scenario: Missing undo evidence disables undo
- **WHEN** Review Ledger and Card Schedule Store commit but undo journal evidence cannot be committed
- **THEN** the system SHALL NOT return an undo token
- **AND** it SHALL report explicit diagnostics that durable undo is unavailable for that answer

### Requirement: Undo restores authoritative card schedule state
The system SHALL undo a worker-backed Review answer by restoring authoritative Card Schedule Store state from Review Transaction Undo Journal before-state evidence.

#### Scenario: Undo restores before-state
- **WHEN** `SrsReviewKernel.undo` receives a valid undo token for the latest undoable worker-backed answer
- **THEN** the system SHALL restore the reviewed card's schedule fields from the journaled before-state
- **AND** it SHALL NOT derive the restored schedule from Browser projection rows, renderer card snapshots, or SQLite delta segment reconstruction alone

#### Scenario: Incomplete before-state fails closed
- **WHEN** the undo journal record lacks complete before-card schedule state
- **THEN** undo SHALL fail closed
- **AND** the system SHALL NOT partially mutate card schedule, Review Ledger, queue projection, or session state

### Requirement: Undo preserves Review Ledger audit history
The system SHALL represent undo as explicit reversal or supersession evidence rather than silently deleting accepted Review Ledger facts.

#### Scenario: Undo records reversal evidence
- **WHEN** a committed Review answer is undone
- **THEN** the system SHALL append or mark explicit reversal evidence referencing the original Review Ledger identity and undo journal identity
- **AND** audit/replay SHALL be able to explain both the original answer and the undo

#### Scenario: Reversed answer excluded from active derived counts
- **WHEN** Review replay, audit, or queue projection rebuild derives active Review count or due state
- **THEN** reversed/superseded answers SHALL NOT count as active accepted answers for current card schedule or queue membership
- **AND** raw audit history SHALL remain available

### Requirement: Undo restores SessionQueueIndex frontier
The system SHALL restore worker session current card, lookahead, session exclusions, and counters from Review Transaction Undo Journal evidence when undoing a worker-backed answer.

#### Scenario: Session frontier restored after undo
- **WHEN** the latest worker-backed answer is undone in an active session
- **THEN** `SrsReviewKernel.current`, `lookahead`, and `counters` SHALL reflect the journaled pre-answer SessionQueueIndex frontier
- **AND** renderer ReviewHistory or Review Session Cursor SHALL NOT choose the restored current card

#### Scenario: Restart-safe undo uses backend evidence
- **WHEN** the plugin restarts after an undoable answer but before undo is requested
- **THEN** `SrsReviewKernel.undo` SHALL use durable undo journal evidence to restore card schedule and session frontier when the session can be reattached
- **AND** it SHALL fail closed with explicit diagnostics when reattachment evidence is unavailable

### Requirement: Undo invalidates derived projections
The system SHALL invalidate or rebuild derived Review queue projection state after durable undo changes card schedule or active Review fact state.

#### Scenario: Projection is not undo authority
- **WHEN** undo restores a card to the Review queue or removes a reversed answer from active counts
- **THEN** BrowserProjectionIndex and queue projection rows SHALL be updated, invalidated, or rebuilt from authoritative card schedule and ledger evidence
- **AND** the system SHALL NOT treat a stale projection row as proof that undo succeeded

#### Scenario: Projection update failure fails closed
- **WHEN** undo commits schedule/reversal evidence but cannot record required projection invalidation or rebuild evidence
- **THEN** undo SHALL report explicit unavailable diagnostics
- **AND** Review readiness SHALL NOT be computed from stale projection fallback

### Requirement: Worker-backed go-back has no renderer fallback authority
The system SHALL prevent renderer-local ReviewHistory, Review Session Cursor, or Browser projection state from acting as undo authority for worker-backed Review sessions.

#### Scenario: Worker undo unavailable
- **WHEN** a worker-backed Review session receives go-back but the SRS Review Kernel has no valid undo journal evidence
- **THEN** go-back SHALL fail closed with a worker undo unavailable diagnostic
- **AND** the renderer SHALL NOT restore the previous card from local history as if undo succeeded

#### Scenario: Non-worker local sessions remain explicit
- **WHEN** a non-worker Review queue still uses local go-back behavior
- **THEN** diagnostics SHALL identify the path as non-worker local undo
- **AND** the behavior SHALL NOT be reused for RetrievalPractice or IncrementalLearning worker-backed sessions
