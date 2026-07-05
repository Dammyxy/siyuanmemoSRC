## MODIFIED Requirements

### Requirement: SQL-first review card mutation persistence
The system SHALL provide a SQL-first mutation persistence path for review-facing card updates that commits minimum authoritative Review feedback state before success, while reporting queue projection invalidation, projection patching, Browser warmup, and secondary durability work as separate observable effects.

#### Scenario: Ordinary Review feedback is not blocked by Browser sidebar warmup
- **WHEN** a SQL-first formal Review feedback mutation commits the minimum durable Review state
- **THEN** committed success SHALL NOT require non-visible Browser sidebar queue projection warmup, repair, or full row hydration to finish

#### Scenario: Browser warmup failure remains visible outside commit success
- **WHEN** Browser queue projection warmup is refreshing, stale, or unavailable after a Review feedback commit
- **THEN** the Review feedback result MAY report projection impact or diagnostics separately
- **AND** SHALL NOT convert derived Browser warmup failure into hidden Review commit success or hidden Review commit failure

#### Scenario: Current Review session projection patch remains allowed
- **WHEN** the active Review session can apply a queue projection hot patch or defer/stale impact for its own session cursor
- **THEN** that Review session work MAY run as part of Review feedback advancement
- **AND** SHALL remain distinct from broad Browser sidebar warmup
