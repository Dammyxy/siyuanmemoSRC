## ADDED Requirements

### Requirement: Review surface exposes one NeuralRoam action menu
The review surface SHALL expose one route-style NeuralRoam toolbar action with tooltip `神经漫游` when the current review item has a block ID.

#### Scenario: Current review item has no block ID
- **WHEN** the current review item has no usable block ID
- **THEN** the review surface SHALL hide or disable the NeuralRoam action instead of showing an empty action menu

#### Scenario: Current review item has available actions
- **WHEN** the current review item has a usable block ID
- **THEN** the NeuralRoam action SHALL open a two-level menu with non-empty groups only

### Requirement: NeuralRoam action menu uses grouped entry actions
The NeuralRoam menu SHALL group available actions under `临时漫游`, `建立并漫游`, and `建立`.

#### Scenario: Temporary roam actions
- **WHEN** the current block can be used as a roam seed
- **THEN** the `临时漫游` group SHALL include `从当前块临时漫游`

#### Scenario: Concept temporary roam actions
- **WHEN** the current card or block resolves to one or more associated concept blocks
- **THEN** the `临时漫游` group SHALL include `从概念临时漫游`, using a concept selection submenu when multiple concept blocks are available

#### Scenario: Establish-and-roam actions
- **WHEN** the current block can be saved as a station or made into a concept card
- **THEN** the `建立并漫游` group SHALL show only applicable actions from `建立为空间站并立即漫游` and `制作为概念卡并立即漫游`

#### Scenario: Establish-only actions
- **WHEN** the current block can be saved, made into a concept card, or added as an existing concept card
- **THEN** the `建立` group SHALL show only applicable actions from `建立为空间站`, `制作为概念卡`, `制作为概念卡并加入队列`, and `加入神经漫游队列`

### Requirement: Entry actions use block identity for NeuralRoam paths
NeuralRoam entry actions SHALL use block IDs as path seeds and SHALL NOT use card IDs as graph node identities.

#### Scenario: Current-block temporary roam from review
- **WHEN** a user selects `从当前块临时漫游` from a review card
- **THEN** the system SHALL start a new NeuralRoam path with `focusBlockId` equal to the current card's block ID
- **AND** the first displayed item SHALL remain the current review card when its card ID is available

#### Scenario: Concept temporary roam
- **WHEN** a user selects `从概念临时漫游`
- **THEN** the system SHALL start a new NeuralRoam path with `focusBlockId` equal to the selected concept block ID
- **AND** the first displayed item SHALL be the selected concept card or concept node

#### Scenario: Immediate concept roam
- **WHEN** a user selects `制作为概念卡并立即漫游`
- **THEN** the system SHALL create or confirm the concept card, add it to the NeuralRoam queue, and open NeuralRoam with that concept block ID as `focusBlockId`

#### Scenario: Immediate station roam
- **WHEN** a user selects `建立为空间站并立即漫游`
- **THEN** the system SHALL save the current block as a station and open NeuralRoam with that block ID as `focusBlockId`

### Requirement: Immediate NeuralRoam entries start from explicit focus
Immediate NeuralRoam actions SHALL start from explicit focus options and SHALL NOT open NeuralRoam with a no-argument dialog call.

#### Scenario: Next card follows selected entry path
- **WHEN** NeuralRoam is opened by a temporary or immediate roam action
- **THEN** the next card after the first displayed item SHALL be selected from the selected `focusBlockId` graph or same-block relationships
- **AND** the system SHALL NOT use a stale previous NeuralRoam focus, station, or hyperspace activation source as the next-card source

### Requirement: Temporary NeuralRoam entries restore engine mode per tab
Temporary NeuralRoam entries SHALL force orbit mode and store tab-local restoration metadata for the review tab that opened them.

#### Scenario: Temporary entry closes without manual mode change
- **WHEN** a temporary NeuralRoam tab closes and the user did not manually change engine mode in that tab
- **THEN** the system SHALL restore the engine mode that was active before the temporary entry

#### Scenario: Temporary entry closes after manual mode change
- **WHEN** a temporary NeuralRoam tab closes after the user manually changed engine mode in that tab
- **THEN** the system SHALL keep the user's chosen engine mode

#### Scenario: Multiple NeuralRoam tabs exist
- **WHEN** multiple NeuralRoam tabs exist at the same time
- **THEN** temporary engine restoration metadata SHALL be stored per tab runtime
- **AND** the change SHALL NOT require independent per-tab NeuralRoam path state

### Requirement: Block menus and review menus share entry action orchestration
Block menu concept actions and review NeuralRoam menu actions SHALL reuse shared application entry orchestration for concept creation, queue insertion, station creation, and immediate NeuralRoam opening.

#### Scenario: Existing block menu concept action starts roam
- **WHEN** the existing block-menu action `制作为概念卡并立即漫游` runs
- **THEN** it SHALL open NeuralRoam with the created or confirmed concept block ID as explicit `focusBlockId`

#### Scenario: Existing block menu concept action adds to queue
- **WHEN** the existing block-menu action `制作为概念卡并加入队列` runs
- **THEN** it SHALL create or confirm the concept card and add it to the NeuralRoam queue without opening NeuralRoam
