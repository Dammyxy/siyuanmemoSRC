## ADDED Requirements

### Requirement: Batch actions use bounded bulk execution
The system SHALL execute Browser selected-row batch actions through bounded bulk application or manager APIs when those APIs exist. Batch add, remove, delete, priority, suspend, postpone, advance, spread, and review-scope preparation MUST avoid per-row live queue reads and repeated per-row refreshes on the active path.

#### Scenario: Batch queue add
- **WHEN** the user adds multiple selected Browser rows to a queue
- **THEN** the system MUST call one bulk queue-add command for the selected valid cards and perform one cache/query invalidation cycle

#### Scenario: Batch card mutation
- **WHEN** the user applies a supported mutation to multiple selected Browser rows
- **THEN** the system MUST process the selection with a bulk command or a bounded chunked command and report attempted, changed, and failed counts

#### Scenario: Missing bulk authority
- **WHEN** a batch action requires a bulk authority that is unavailable
- **THEN** the system MUST fail explicitly with a user-visible unavailable result instead of silently falling back to a slow per-row UI-owned loop

### Requirement: Batch refresh and notification are coalesced
The system SHALL coalesce cache invalidation, observer notification, and projection refresh work triggered by one user batch action. The UI MUST receive one coherent completion result rather than repeated row-level updates that make the plugin appear frozen.

#### Scenario: Successful large batch action
- **WHEN** a large selected-row batch action completes with at least one changed card
- **THEN** affected Browser data and queue counts MUST refresh through one grouped invalidation/notification flow

#### Scenario: Partial failure in batch action
- **WHEN** a large selected-row batch action partially fails
- **THEN** the system MUST refresh changed rows once and report the failed count without retrying every failed row through unrelated fallback paths

### Requirement: Batch operations remain responsive under large selections
The system SHALL keep large Browser batch operations responsive by avoiding synchronous per-row UI blocking and by bounding expensive work with chunking or worker/application execution where needed.

#### Scenario: Large selection add or mutate
- **WHEN** the user applies a supported batch action to a large selection
- **THEN** the main review/browser UI MUST avoid long synchronous loops and the operation MUST produce one final feedback message with counts
