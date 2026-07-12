## ADDED Requirements

### Requirement: Deferred reconciliation cannot expose stale normal readiness
Review journal projection reconciliation SHALL remain synchronous unless the Review read model can explicitly represent its pending state without exposing stale queue data as normal.

#### Scenario: Reconciliation remains required for readable queue truth
- **WHEN** pending journal evidence can change initial ready counts or session entries and no explicit pending read model exists
- **THEN** startup SHALL complete reconciliation before those queue results report normal readiness

#### Scenario: Reconciliation is proven safe to defer
- **WHEN** focused tests prove callers receive an explicit pending/unavailable state until reconciliation completes
- **THEN** reconciliation MAY run as registry-managed deferred maintenance
- **AND** status SHALL expose its lifecycle and terminal failure without a legacy snapshot fallback
