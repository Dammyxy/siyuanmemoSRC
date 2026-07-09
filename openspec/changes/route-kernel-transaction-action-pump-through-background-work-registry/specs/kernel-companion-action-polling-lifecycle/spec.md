## ADDED Requirements

### Requirement: Kernel transaction polling uses background work lifecycle
Kernel transaction action polling SHALL submit polling work through the Kernel Companion Background Work registry and expose polling job state through the registry status Interface.

#### Scenario: Polling job accepted
- **WHEN** kernel transaction action polling starts
- **THEN** the registry records an accepted or running `kernel-transaction-action-polling` job

#### Scenario: Polling job completes
- **WHEN** a polling iteration finishes without cancellation
- **THEN** the registry records a terminal completed job with polling diagnostics

### Requirement: Polling shutdown cancels active work
Kernel transaction action polling MUST cancel or defer outstanding polling work on dispose or registry shutdown without executing late follow-up work.

#### Scenario: Dispose during polling
- **WHEN** the action pump is disposed while a polling job is running
- **THEN** the job becomes canceled and late dequeue/action results do not schedule another poll

#### Scenario: Shutdown before polling starts
- **WHEN** the registry shuts down before an accepted polling job starts
- **THEN** the job becomes deferred and its handler is not executed

### Requirement: Existing action ownership remains unchanged
Kernel transaction action polling SHALL keep backend dequeue/requeue, writer relay, native Riff action handling, and AutoCard candidate handling with their current application/backend owners.

#### Scenario: Native Riff action processed
- **WHEN** a polling job dequeues native Riff actions
- **THEN** the pump routes them to existing hybrid sync handlers and does not move write ownership into the registry or kernel companion

#### Scenario: Backend unavailable
- **WHEN** backend or writer relay dequeue is unavailable
- **THEN** the pump fails closed with existing backoff and diagnostics instead of using hidden local fallback behavior
