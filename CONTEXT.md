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

**Queue Projection Readiness**:
A shared availability state for a queue projection that tells callers whether a projection is readable, preparing, or unavailable, including its projection identity when readable.
_Avoid_: generic projection unavailable, Browser retry state, fallback readiness

**Browser Queue View Lifecycle**:
The Browser surface flow that prepares a selected queue, consumes **Queue Projection Readiness**, creates the queue datasource, and hands it to the grid for first-row rendering.
_Avoid_: scattered queue load glue, UI projection repair

**Topic Container**:
A block that owns Topic-derived item creation. A document block and a non-document block such as a super block can both be valid **Topic Containers**.
_Avoid_: document-only Topic, assuming Topic means document block

**SRS Browser Card Universe**:
The set of SRS cards that SiYuanMemo can manage through its card identity and browser projection. Arbitrary SQL block results are candidates only after intersecting with this card universe.
_Avoid_: treating all matching `blocks` rows as SRS Browser cards

**Custom Review Surface**:
A SiYuanMemo-owned review UI that renders card content outside SiYuan's native block renderer. It must explicitly preserve supported link and reference behavior because native rendering is not automatically available.
_Avoid_: assuming temporary or deliberate practice cannot render links by nature

**Semantic Session Read Model**:
A presentation-ready read model derived from Semantic session owner state for Browser, Review sidebar, or session inspection surfaces. It does not write Semantic state, execute Semantic commands, or perform UI selection side effects.
_Avoid_: calling backend read-model assembly a projection builder, because core Semantic session projection is a lower-level derived structure.

**Review Session Cursor**:
The in-memory position and volatile movement state for a single Review session: current index, cached cards, forward buffer, one-time avoidance, and session-local exclusions. It does not own queue membership rules, scheduling, review commit, or backend projection storage.
_Avoid_: calling this the Review session manager, because `useReviewSession` owns UI session orchestration and `SharedReviewSessionRegistry` owns shared surface registration.

**Review Current Item Command**:
The Review session advancement command that applies the currently visible card for a single Review session: selected next card, restored snapshot card, failed-feedback compensation restore, or explicit clear. It does not choose queue membership, persist review feedback, or own NeuralRoam next-item selection.
_Avoid_: calling this a queue cursor or NeuralRoam advance owner; it only applies current-item mutation after another owner chooses the item.

**Review Feedback Advancement**:
The post-feedback Review session transition that applies local Review session state after queue feedback succeeds or fails; it does not choose queue membership, commit scheduling, call the writer, or select NeuralRoam next items.
_Avoid_: review commit, scheduler feedback, queue membership update, NeuralRoam advance

**NeuralRoam Advance**:
The backend-authoritative Review progression for NeuralRoam sessions that returns the next item, exhaustion, or explicit unavailability from the backend advance contract.
_Avoid_: local NeuralRoam cursor, projection-backed NeuralRoam review, renderer-selected NeuralRoam next item

## Relationships

- A **Mixed SRS Queue** may contain **Learning Steps**, **Review Cards**, and new cards.
- A **Retrieval Practice Queue** may contain **Current Learning Due** cards and **Today Review Due** cards.
- **SM-style Review Availability** makes a **Learning Step** available only when it is **Current Learning Due**.
- **SM-style Review Availability** makes a **Review Card** available when it is **Today Review Due**.
- New cards enter a **Mixed SRS Queue** through daily limits before becoming **Learning Steps**.
- **Learn Ahead** may serve only future **Learning Steps**, bounded by both a time window and a maximum card count.
- **Queue Projection Readiness** is consumed by Browser views and owned by application/backend coordination, not by UI retry logic.
- **Browser Queue View Lifecycle** consumes **Queue Projection Readiness** and owns Browser-side retry/attach decisions, but does not materialize queue projections.
- **Topic Container** identity must not depend on whether the owning block is a document block.
- **SRS Browser Card Universe** scopes Browser filters, SQL searches, counts, and bulk operations to cards managed by SiYuanMemo.
- **Custom Review Surfaces** share review rendering requirements with native-like review surfaces, including supported link and reference behavior.
- A **Semantic Session Read Model** is derived from Semantic session owner state and may consume core Semantic session projection, but it remains a read-only presentation model for Browser, Review sidebar, or session inspection callers.
- A **Review Session Cursor** sits inside a Review session and consumes queue rows/cards, but it is not the queue authority and does not decide scheduling outcomes.
- A **Review Current Item Command** sits beside the **Review Session Cursor** and applies the visible current card after cursor restore, ordinary advancement, or compensation chooses that card.
- **Review Feedback Advancement** consumes **Review Session Cursor** and **Review Current Item Command** state after a queue feedback result, while queue membership, scheduling commit, writer relay, and NeuralRoam next-item selection stay outside it.
- **NeuralRoam Advance** selects NeuralRoam next items before **Review Current Item Command** applies them to the visible Review session.

## Example Dialogue

> **Dev:** "After rating this card 3, it has a six-minute interval. Should it still be counted as due?"
> **Domain expert:** "It stays in the mixed SRS queue, but it is not current learning due until the six minutes pass."

## Flagged Ambiguities

- "due" was used to mean both **Current Learning Due** and **Today Review Due**. Resolved: learning/relearning uses exact time; review uses the current review day.
- `IncrementalLearning` and `RetrievalPractice` were described as today-window queues. Resolved for `IncrementalLearning`: it is a **Mixed SRS Queue**, not a single today-window queue.
- `RetrievalPractice` was considered for the same new-card semantics as `IncrementalLearning`. Resolved: it is review-oriented and does not introduce new cards by default.
- `Learn Ahead` was considered as a card-count-only setting. Resolved: it follows Anki-style time-window semantics with an additional maximum-card limit for user experience control.
- Queue projection "not ready" was used for normal preparation, transient infrastructure unavailability, and terminal projection failures. Resolved: **Queue Projection Readiness** separates readable, preparing, and unavailable states.
- Browser queue loading mixed readiness, retry, datasource creation, and attach decisions. Resolved: **Browser Queue View Lifecycle** owns Browser-side queue preparation before grid attach.
- Topic was implicitly treated as document-block-only in some creation flows. Resolved: **Topic Container** includes non-document blocks such as super blocks when they own Topic-derived item creation.
- SRS Browser filtering was ambiguous between arbitrary block SQL and plugin-managed cards. Resolved: **SRS Browser Card Universe** is the outer scope; SQL results are intersected with it.
- Temporary and deliberate practice were described as unable to render links. Resolved: the issue belongs to **Custom Review Surface** rendering, not to those practice modes as domain concepts.
- Semantic read assembly was ambiguous with core projection building. Resolved: **Semantic Session Read Model** names the presentation-ready read model derived from Semantic session owner state, while core projection remains the lower-level tree/path/branch derivation.
- Review session state was ambiguous between UI session orchestration, shared surface registration, and volatile queue movement. Resolved: **Review Session Cursor** names only the in-memory movement state within one Review session.
- Review feedback handling was ambiguous between scheduler commit, queue membership update, and local session transition. Resolved: **Review Feedback Advancement** names only the post-feedback local Review session transition.
- NeuralRoam progression was ambiguous with local cursor/projection review. Resolved: **NeuralRoam Advance** is backend-authoritative and the renderer only consumes its result.
