## ADDED Requirements

### Requirement: Review primes next-card CDF preparation

Runtime-backed Review sessions SHALL be able to prepare CDF live relation evidence for the next card before a rating consumes it.

#### Scenario: Worker session exposes bounded next-card lookahead

- **GIVEN** a worker-backed Review session has a current card and at least one queued future card
- **WHEN** the session state is returned to the frontend runtime
- **THEN** it SHALL include at most one cloned lookahead card selected by the backend Review Session Cursor
- **AND** exposing that lookahead SHALL NOT advance the session current card or reread the queue projection

#### Scenario: Next-card preparation is reused after rating

- **GIVEN** a runtime-backed Review session has a current card and a known next card
- **WHEN** the current card is exposed to the user
- **THEN** the Review strategy SHALL start preparing CDF evidence for the next card
- **AND** when rating advances to that same next card, the visible `consume-advance.prepare-selected-review-card` path SHALL reuse the prepared evidence rather than performing a second full `refresh-cdf-live-relation`

#### Scenario: Stale next-card evidence falls back safely

- **GIVEN** pending or cached next-card evidence no longer matches the selected card identity or CDF-relevant metadata signature
- **WHEN** Review advances to the selected card
- **THEN** the Review strategy SHALL discard that evidence for the selected card
- **AND** it SHALL run the existing full CDF live relation refresh before exposing the card

#### Scenario: Delayed queue changes preserve keyed CDF evidence

- **GIVEN** next-card CDF evidence has been prepared for a worker-backed Review session
- **WHEN** a delayed ordinary `queue-changed` event arrives for the same queue
- **THEN** the Review strategy SHALL invalidate queue cursor cache as needed
- **AND** it SHALL preserve the prepared CDF evidence unless the event carries full-refresh semantics or card identity changes that match the prepared card

#### Scenario: Current-card updates do not erase next-card prime evidence

- **GIVEN** completed CDF evidence exists for the current card and pending CDF evidence exists for the next card
- **WHEN** a delayed `card-updated` event arrives for only the current card
- **THEN** the Review strategy SHALL invalidate only the current completed evidence
- **AND** it SHALL preserve the pending next-card evidence for reuse when rating advances

#### Scenario: Duplicate evidence remains fail-closed

- **GIVEN** primed CDF evidence says the selected card is a noncanonical duplicate
- **WHEN** Review advances to that card
- **THEN** the Review strategy SHALL apply the existing unavailable-current-card handling
- **AND** it SHALL NOT expose the duplicate card as reviewable
