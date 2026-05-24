## ADDED Requirements

### Requirement: Runtime Surfaces Do Not Use Public Queue Instances As Authority
The system SHALL prevent Browser and Review runtime surfaces from using public queue instances as the authoritative source for long-lived queue reads or mutations.

#### Scenario: Browser reads long-lived queue rows
- **WHEN** Browser displays a long-lived Review queue such as Retrieval Practice, Incremental Learning, FilterGroup, FinalDrill, Leech, or NeuralRoam
- **THEN** the displayed rows SHALL come from backend projection/read-model paths or explicit unavailable states rather than `queue.getCards()` fallback

#### Scenario: Review advances NeuralRoam
- **WHEN** Review advances a NeuralRoam session
- **THEN** the next item SHALL come from backend NeuralRoam Advance rather than local `NeuralRoamQueue` state-machine methods

### Requirement: Runtime Queue Mutations Use Application Commands
The system SHALL route Browser and Review queue membership mutations through application command interfaces instead of direct queue instance mutation methods.

#### Scenario: Browser adds cards to a queue
- **WHEN** Browser adds selected cards to FinalDrill, FilterGroup, NeuralRoam, or another long-lived queue
- **THEN** the mutation SHALL use an application command or backend-mediated command and SHALL return explicit unavailable if that command capability is absent

#### Scenario: Browser removes cards from a queue
- **WHEN** Browser removes selected cards from the current queue
- **THEN** the mutation SHALL use an application command and SHALL NOT call `queue.removeCards()` directly from the UI

### Requirement: Transfer State Does Not Leak Queue Internals To UI
The system SHALL keep queue-specific session snapshot methods behind dedicated transfer/runtime modules.

#### Scenario: Review opens as tab or split
- **WHEN** Review transfers a queue session to a tab or split surface
- **THEN** the UI SHALL obtain serializable transfer state from a transfer runtime instead of directly depending on queue-specific snapshot methods

### Requirement: Boundary Checks Guard Public Queue API Retirement
The system SHALL include automated checks that reject reintroduction of public queue API authority in runtime surfaces.

#### Scenario: UI code calls public queue authority methods
- **WHEN** a guarded UI file calls `getQueue().getCards()`, `queue.addCards()`, `queue.removeCards()`, `queue.setFilter()`, or queue session snapshot methods outside an allowlisted transfer/runtime owner
- **THEN** the boundary check SHALL fail with a message identifying the file and method

#### Scenario: Internal queue implementation uses queue methods
- **WHEN** core queue implementation, backend adapter code, or focused tests use queue methods internally
- **THEN** the boundary check SHALL allow those calls
