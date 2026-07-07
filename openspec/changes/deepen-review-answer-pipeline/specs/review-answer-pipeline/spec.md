## ADDED Requirements

### Requirement: Review answers are executed through a deep pipeline Module
The system SHALL execute SRS v2 Review `rate` and `skip` actions through a Review Answer Pipeline Module that owns answer sequencing behind one Interface.

#### Scenario: Runtime-backed rating returns one complete answer result
- **WHEN** a runtime-backed Retrieval Practice or Incremental Learning Review card is rated
- **THEN** the pipeline SHALL return the next visible card, counter snapshot, affected queue types, queue impact evidence, commit status, commit idempotency key, and optional commit promise as one result

#### Scenario: Runtime-backed skip advances through the same pipeline
- **WHEN** a runtime-backed Retrieval Practice or Incremental Learning Review card is skipped
- **THEN** the pipeline SHALL advance the session, sync counters, prepare the next visible card, and return queue-impact evidence through the same result Interface

### Requirement: Review answer pipeline preserves fail-closed runtime authority
The Review Answer Pipeline SHALL preserve worker/session runtime authority and SHALL NOT fall back to renderer queue review, projection hydration, or broad queue reads when the runtime rejects or cannot answer.

#### Scenario: Worker runtime unavailable keeps current item visible
- **WHEN** the worker/session runtime reports answer unavailability for the current Review card
- **THEN** the pipeline SHALL throw an explicit runtime-unavailable error and preserve the visible current item for compensation

#### Scenario: Stale current card conflict is not locally scored
- **WHEN** the session runtime reports a stale or mismatched current-card conflict
- **THEN** the pipeline SHALL throw an explicit runtime-conflict error and SHALL NOT call the local queue review mutation path

### Requirement: Review answer pipeline owns next-card presentation preparation
The Review Answer Pipeline SHALL consume the runtime answer result and prepare the next visible Review card before returning to the caller.

#### Scenario: Next card is prepared before visible assignment
- **WHEN** the runtime answer result contains a next card
- **THEN** the pipeline SHALL run Review card presentation preparation, replace the runtime current card with the prepared card, set the visible current item, sync the cursor, and prime preparation evidence for the following card

#### Scenario: CDF duplicate evidence can exit current duplicate safely
- **WHEN** next-card preparation reports that the current Review card is a noncanonical CDF duplicate that must exit
- **THEN** the pipeline SHALL preserve the existing duplicate exit behavior without scoring that card through a fallback path

### Requirement: Review answer pipeline emits structured diagnostics without broadening hot-path work
The Review Answer Pipeline SHALL record answer timing diagnostics through a structured timing Interface without requiring unrelated queue Module creation.

#### Scenario: Slow answer keeps existing timing step names
- **WHEN** a runtime-backed answer is slow enough to emit frontend timing diagnostics
- **THEN** the diagnostics SHALL include the runtime answer, cursor/counter sync, and `consume-advance.*` preparation step names

#### Scenario: Diagnostics do not trigger unrelated queue loading
- **WHEN** the pipeline records answer diagnostics for a Retrieval Practice rating
- **THEN** it SHALL NOT load FilterGroup, NeuralRoam, or other unrelated queue Modules merely to produce diagnostics
