## ADDED Requirements

### Requirement: Domain sync repair actions remain usable
The system SHALL keep domain sync repair preview and conflict direction handling available when diagnostics contain repairable evidence.

#### Scenario: Repair preview remains usable from conflict dialog
- **WHEN** the manual sync conflict dialog opens with repairable domain sync diagnostics
- **THEN** the repair preview action returns a preview, unrepairable, or no-repair result instead of an internal hash-method error

#### Scenario: Conflict direction UI stays available
- **WHEN** manual sync conflict sources still need direction selection
- **THEN** the dialog continues to offer direction handling independent of whether Review safety allows non-risky Review actions
