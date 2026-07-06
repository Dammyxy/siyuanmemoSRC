## ADDED Requirements

### Requirement: Review card preparation reuses fresh CDF refresh evidence
The system SHALL avoid rerunning expensive CDF live relation refresh during ordinary Review rating advancement when the selected next card already has fresh preparation evidence for the same CDF-relevant identity.

#### Scenario: Prepared card skips repeated CDF refresh
- **WHEN** ordinary Review rating advances to a next card that was already prepared with matching card identity and CDF-relevant metadata signature
- **THEN** the system SHALL reuse the prepared card evidence without calling full CDF live relation refresh again

#### Scenario: Missing preparation refreshes normally
- **WHEN** ordinary Review rating advances to a next card with no matching preparation evidence
- **THEN** the system SHALL run the existing CDF live relation refresh before exposing the card as prepared

#### Scenario: Stale preparation refreshes normally
- **WHEN** the selected card identity or CDF-relevant metadata signature differs from the cached preparation evidence
- **THEN** the system SHALL discard the stale evidence and run the existing CDF live relation refresh

### Requirement: Review card preparation preserves CDF correctness
The system SHALL preserve CDF duplicate and blocking behavior while optimizing the preparation path.

#### Scenario: Duplicate outcome still exits current card
- **WHEN** prepared CDF evidence contains a current-review duplicate outcome for the selected card
- **THEN** the system SHALL apply the existing duplicate-exit behavior instead of showing the card as reviewable

#### Scenario: Refresh failure is not hidden
- **WHEN** CDF live relation refresh fails or preparation evidence cannot be trusted
- **THEN** the system SHALL surface the existing unavailable or unprepared behavior and SHALL NOT use stale fallback evidence

### Requirement: Preparation timing remains diagnosable
The system SHALL expose copyable timing diagnostics that distinguish CDF refresh runs from preparation evidence reuse.

#### Scenario: Cache hit appears in timing evidence
- **WHEN** Review rating advancement reuses fresh CDF preparation evidence
- **THEN** timing diagnostics SHALL show that `prepare-selected-review-card` did not spend time in full `refresh-cdf-live-relation`

#### Scenario: Refresh run remains visible
- **WHEN** Review rating advancement must run CDF live relation refresh
- **THEN** timing diagnostics SHALL continue to attribute that cost to `consume-advance.refresh-cdf-live-relation`
