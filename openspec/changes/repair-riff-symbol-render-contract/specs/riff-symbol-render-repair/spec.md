## ADDED Requirements

### Requirement: Riff-managed symbol cards resolve quick render contract
The system SHALL resolve a riff-managed `builtin-riff-sync` item card with supported quick-symbol live source grammar to the quick-symbol SRS Card Render Contract even when projected card metadata lacks quick-symbol fields.

#### Scenario: Existing riff card with missing quick metadata
- **WHEN** a riff-managed `builtin-riff-sync` item card references a live source block whose markdown/content is `反思>>反思` and the card lacks `symbolType`, `forceQuickRender`, and quick-symbol receipts
- **THEN** the SRS Card Render Contract SHALL expose quick renderer kind, quick-symbol family, source-block/card receipts, and before/after reveal sides for the quick renderer

#### Scenario: Source grammar unavailable
- **WHEN** a riff-managed `builtin-riff-sync` item card has no readable live source block content
- **THEN** the system SHALL fail closed with diagnostics and SHALL NOT infer a quick renderer from stale projected faces alone

### Requirement: Native Riff sync preserves symbol render evidence
The system SHALL persist or expose quick-symbol render evidence during Native Riff Compatibility sync when a riff-managed source block contains supported quick-symbol grammar.

#### Scenario: Newly synced native riff symbol card
- **WHEN** Native Riff Compatibility sync imports a source block containing supported quick-symbol grammar such as `A>>B`
- **THEN** the projected card evidence SHALL be sufficient for Review to route through the existing Quick renderer without Review-side symbol parsing

### Requirement: Review does not guess symbol rendering
Review SHALL consume SRS Card Render Contract output for quick-symbol routing and SHALL NOT independently classify arbitrary Riff card text as a quick-symbol card.

#### Scenario: Ordinary riff card with symbol-like text but no repair evidence
- **WHEN** Review receives an ordinary Riff card without repair evidence or valid live quick-symbol source grammar
- **THEN** Review SHALL keep the non-quick render route and expose diagnostics rather than using a hidden quick fallback
