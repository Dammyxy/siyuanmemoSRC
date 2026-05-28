## ADDED Requirements

### Requirement: Runtime SQL profile covers Browser Read Model surfaces
The system SHALL profile Browser Read Model snapshot, matched-ID, page-hydration, row-by-ID hydration, and action-target lookup paths before adding indexes or replacing SQL query plans for those paths.

#### Scenario: Profile reports Browser Read Model timings
- **WHEN** the Runtime SQL profile runs against a valid `siyuanmemo.db`
- **THEN** the result SHALL include Browser Read Model timing summaries for snapshot, matched-ID, page-hydration, row-by-ID hydration, and action-target lookup surfaces where those surfaces are implemented

#### Scenario: Profile evidence gates Browser read optimization
- **WHEN** an implementation proposes a new Browser Read Model index or query-plan replacement
- **THEN** the change SHALL reference Runtime SQL profile evidence showing the measured bottleneck, query plan, or budget failure that justifies the optimization
