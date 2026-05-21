## ADDED Requirements

### Requirement: NeuralRoam includes same-block card relationships
NeuralRoam SHALL treat other review cards sharing the current block ID as same-block related candidates.

#### Scenario: Current block has sibling review cards
- **WHEN** NeuralRoam expands candidates from a block that has multiple local review cards
- **THEN** it SHALL include at most one same-block sibling card candidate for that expansion

#### Scenario: Current block has no sibling review cards
- **WHEN** NeuralRoam expands candidates from a block with no other local review cards
- **THEN** same-block relationship expansion SHALL produce no candidate and SHALL NOT fail the roam

### Requirement: Same-block candidates use local card universe
Same-block relationship lookup SHALL use the local SiYuanMemo card universe rather than SiYuan Riff or legacy `fsrs_cards` tables.

#### Scenario: Same-block lookup runs
- **WHEN** NeuralRoam resolves same-block card candidates for a block ID
- **THEN** it SHALL query local card records by block ID through the application card read path
- **AND** it SHALL NOT query Riff or legacy `fsrs_cards` for the relationship

### Requirement: Same-block candidates exclude the current displayed card
Same-block relationship expansion SHALL exclude the currently displayed or entry-source card ID from sibling candidates.

#### Scenario: Entry card has same-block siblings
- **WHEN** a user starts `从当前块临时漫游` from a review card and that block has multiple cards
- **THEN** the same-block candidate set SHALL exclude the entry card ID
- **AND** it MAY include other cards sharing the same block ID

#### Scenario: A card was recently shown
- **WHEN** a same-block sibling card was already seen in the active NeuralRoam history window
- **THEN** it SHALL be filtered by the active seen/history policy before selection

### Requirement: Same-block candidates are ranked above graph neighbors
Same-block sibling cards SHALL rank above ordinary backlink, outgoing-link, and indirect graph neighbors while preserving explicit entry first-screen behavior.

#### Scenario: Same-block sibling and backlink both exist
- **WHEN** NeuralRoam has both same-block sibling candidates and normal graph neighbor candidates
- **THEN** the same-block sibling candidate SHALL be preferred over normal graph neighbors unless the explicit entry first-screen item has not yet been shown

### Requirement: Same-block history distinguishes block and card identity
NeuralRoam history SHALL preserve block identity as the node ID and card identity as optional card metadata for same-block card visits.

#### Scenario: Same block has multiple card visits
- **WHEN** NeuralRoam visits two different cards that share one block ID
- **THEN** history entries SHALL use the shared block ID as `nodeId`
- **AND** history entries SHALL include card identity so the two displayed cards remain distinguishable

### Requirement: Same-block relationship is visible in trace and UI
Same-block card visits SHALL expose a distinct association type and user-facing label.

#### Scenario: Same-block card is displayed
- **WHEN** NeuralRoam displays a card selected through same-block relationship expansion
- **THEN** its association type SHALL be `same-block-card`
- **AND** trace/history labels SHALL describe it as `同块卡片`
- **AND** compact UI badges SHALL use `同块`
