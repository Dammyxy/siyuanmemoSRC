# SiYuanMemo Review Context

This context defines the domain language for SiYuanMemo review, learning, and queue behavior.

## Language

**Review Day**:
A user-facing learning day bounded by the configured day rollover rather than by calendar midnight.
_Avoid_: raw calendar day, wall-clock day

**SM-style Review Availability**:
A review availability model where graduated review cards are due by review day while learning and relearning steps are due by exact timestamp.
_Avoid_: all-cards-due-now, all-cards-today-window

**Learning Step**:
A short-interval scheduling step that becomes available only when its exact due timestamp has arrived.
_Avoid_: today-window review, daily review

**Review Card**:
A graduated SRS card whose availability is determined by the current **Review Day**.
_Avoid_: learning card

**Mixed SRS Queue**:
A queue that combines exact-time **Learning Steps**, day-based **Review Cards**, and daily-limited new-card introduction.
_Avoid_: due-now queue, today-window queue

**Retrieval Practice Queue**:
A review-oriented queue that serves current learning due cards and today review due cards without introducing new cards by default.
_Avoid_: new-card learning queue

**Current Learning Due**:
The subset of learning or relearning cards whose exact due timestamp is less than or equal to now.
_Avoid_: today due

**Learn Ahead**:
An explicit user action that serves future learning or relearning steps within a bounded time window and card cap after the normal queue is empty. Default: 20 minutes and 20 cards.
_Avoid_: early review, forced due, unlimited advance

**Today Review Due**:
The subset of review cards due within the current **Review Day**.
_Avoid_: current due

## Relationships

- A **Mixed SRS Queue** may contain **Learning Steps**, **Review Cards**, and new cards.
- A **Retrieval Practice Queue** may contain **Current Learning Due** cards and **Today Review Due** cards.
- **SM-style Review Availability** makes a **Learning Step** available only when it is **Current Learning Due**.
- **SM-style Review Availability** makes a **Review Card** available when it is **Today Review Due**.
- New cards enter a **Mixed SRS Queue** through daily limits before becoming **Learning Steps**.
- **Learn Ahead** may serve only future **Learning Steps**, bounded by both a time window and a maximum card count.

## Example Dialogue

> **Dev:** "After rating this card 3, it has a six-minute interval. Should it still be counted as due?"
> **Domain expert:** "It stays in the mixed SRS queue, but it is not current learning due until the six minutes pass."

## Flagged Ambiguities

- "due" was used to mean both **Current Learning Due** and **Today Review Due**. Resolved: learning/relearning uses exact time; review uses the current review day.
- `IncrementalLearning` and `RetrievalPractice` were described as today-window queues. Resolved for `IncrementalLearning`: it is a **Mixed SRS Queue**, not a single today-window queue.
- `RetrievalPractice` was considered for the same new-card semantics as `IncrementalLearning`. Resolved: it is review-oriented and does not introduce new cards by default.
- `Learn Ahead` was considered as a card-count-only setting. Resolved: it follows Anki-style time-window semantics with an additional maximum-card limit for user experience control.
