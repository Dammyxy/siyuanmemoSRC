## ADDED Requirements

### Requirement: Unified Current Route Add Entry
The system SHALL expose a single application-level operation for adding Concept cards to the active NeuralRoam route, and Browser, Review, and block-menu add actions MUST use that operation instead of each owning separate queue mutation logic.

#### Scenario: Browser selection uses unified route add
- **WHEN** a user selects Concept cards in Browser and triggers the NeuralRoam add action
- **THEN** the Browser action calls the shared current-route add operation with the selected Concept block ids
- **AND** it does not call runtime `NeuralRoamQueue.addCard` or `NeuralRoamQueue.addCards`

#### Scenario: Review menu uses unified route add
- **WHEN** a user opens the Review neural entry menu for an existing Concept card and chooses the add action
- **THEN** the Review menu calls the shared current-route add operation for that Concept block id
- **AND** it does not call runtime `NeuralRoamQueue.addCard` directly

#### Scenario: Block menu make Concept uses unified route add
- **WHEN** a user chooses a block-menu action that creates or ensures a Concept card and adds it to NeuralRoam
- **THEN** the Concept creation/ensure step completes before the shared current-route add operation runs
- **AND** the created Concept block id is the id submitted to the shared current-route add operation

### Requirement: Backend Mediated Batch Source Command
The system SHALL support a backend `neural-roam.command` command for setting multiple current-route source entries in one request.

#### Scenario: Batch add applies to active route
- **WHEN** the application submits a `set-sources` command with multiple Concept node ids and `enabled` not false
- **THEN** the backend applies each unique node id as an enabled source entry for the active NeuralRoam route
- **AND** the command returns the updated NeuralRoam view state and queue state

#### Scenario: Batch remove applies to active route
- **WHEN** the application submits a `set-sources` command with multiple node ids and `enabled` false
- **THEN** the backend disables each unique node id as a source entry for the active NeuralRoam route
- **AND** the command returns the updated NeuralRoam view state and queue state

#### Scenario: Stale route id fails closed
- **WHEN** the application submits a `set-sources` command with a route id that differs from the backend active route id
- **THEN** the backend returns an explicit mismatch or unavailable result
- **AND** no frontend local queue mutation is used to compensate

### Requirement: Concept Eligibility Is Preserved
The system SHALL only add Concept cards through the current-route add operation unless the selected block is first converted into a Concept card by an explicit make-Concept action.

#### Scenario: Browser skips or rejects non-Concept rows
- **WHEN** a Browser selection contains non-Concept cards for the NeuralRoam current-route add action
- **THEN** the non-Concept rows are not submitted to the backend source command
- **AND** the user receives the existing concept-only validation feedback adapted to current-route wording

#### Scenario: Existing Concept is added without recreation
- **WHEN** a Review or block-menu action targets a block that already has a Concept card
- **THEN** the shared current-route add operation uses the existing Concept block id
- **AND** it does not create a duplicate Concept card

#### Scenario: Make Concept then add creates missing Concept
- **WHEN** a make-Concept-and-add action targets a block without a Concept card
- **THEN** the application creates or ensures the Concept card first
- **AND** only after that submits the Concept block id to the backend current-route add command

### Requirement: Current Route Wording
The system SHALL present NeuralRoam add actions as current-route actions rather than queue actions.

#### Scenario: Browser action label names current route
- **WHEN** Browser renders the NeuralRoam add action
- **THEN** the visible label references NeuralRoam current route, not NeuralRoam queue

#### Scenario: Review and block-menu labels name current route
- **WHEN** Review or block-menu renders add-to-NeuralRoam actions
- **THEN** their visible labels reference current route/current route add semantics, not generic queue add semantics

#### Scenario: Result message names current route
- **WHEN** a current-route add action succeeds or fails
- **THEN** the user-facing result message references the NeuralRoam current route or current route source
- **AND** it does not describe the target as the old single NeuralRoam queue

### Requirement: Backend Unavailable Has No Local Fallback
The system SHALL fail the current-route add action explicitly when backend NeuralRoam command authority is unavailable, and MUST NOT fall back to renderer-local `NeuralRoamQueue` mutation for runtime UI entries.

#### Scenario: Backend command unavailable
- **WHEN** the shared current-route add operation cannot call backend `neural-roam.command`
- **THEN** it returns an explicit unavailable result to the caller
- **AND** no selected card is added through local `NeuralRoamQueue.addCard` or `NeuralRoamQueue.addCards`

#### Scenario: Backend command returns failure
- **WHEN** backend `neural-roam.command` returns failure, mismatch, or unavailable for a current-route add request
- **THEN** the UI reports the failure using current-route wording
- **AND** the UI does not retry by mutating the local NeuralRoam queue
