# SiYuanMemo Review Context

This context defines the domain language for SiYuanMemo review, learning, and queue behavior.

## Product Boundary

SiYuanMemo is a self-contained memory system and incremental-reading system. SiYuan is the content host, while SiYuanMemo owns card identity, scheduling truth, review history, Browser membership, incremental reading, excerpts, and topic-derived learning items.

Review and Browser are equally important learning surfaces. Excerpts and Topic-derived items belong to incremental reading, not to a separate AI-owned workflow.

Plugin-owned AI reasoning is retired. Host SiYuan Agent/MCP owns AI assistance and calls SiYuanMemo only through explicit bounded tools such as `memo_query`, `memo_card`, `memo_review`, and `memo_ui`.

Arena is retired as a product surface. AI Arena behavior must stay no-op or unsupported, and SRS algorithm comparison may remain only as internal diagnostic evidence until a dedicated migration-safe deletion pass removes the remaining Arena-era storage/type names.

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

**AutoCard Decision Relay**:
The AutoCard decision routing module that resolves candidate decisions through backend/writer relay when enabled, sends follower decisions to the writer, and falls back to local compatibility-read only when backend decision ownership is explicitly disabled or unavailable by policy.
_Avoid_: AutoCard execute runtime, card creation owner, Xiuyuan write path, Topic-derived side-effect owner

**AutoCard Execute Relay**:
The AutoCard write-routing module that submits execution envelopes to backend `autocard.execute`, routes follower instances through writer relay, refreshes writer ownership before direct backend execution, and fails closed when backend or writer relay ownership is unavailable.
_Avoid_: AutoCard decision selection, local planner execution, Xiuyuan application service ownership, Topic-derived item creation semantics, listener retry scheduling

**AutoCard Listener Candidate Runtime**:
The AutoCard listener lifecycle module that tracks transaction-derived candidate contexts, settle timers, transient retries, already-processing follow-ups, lifecycle diagnostics, and listener cleanup. It decides when a candidate is re-evaluated, not how a decision is selected or how card-creation side effects execute.
_Avoid_: AutoCard Decision Relay, AutoCard Execute Relay, local planner rules, Xiuyuan write owner, Topic-derived item creation, document scan semantics

**SRS Browser Card Universe**:
The set of SRS cards that SiYuanMemo can manage through its card identity and browser projection. Arbitrary SQL block results are candidates only after intersecting with this card universe.
_Avoid_: treating all matching `blocks` rows as SRS Browser cards

**SiYuanMemo-owned SRS**:
The default learning system where SiYuanMemo owns card identity, scheduling truth, review history, and Browser membership.
_Avoid_: Riff as source of truth, native deck as primary scheduler

**Native Riff Compatibility**:
Optional interoperability with SiYuan's native Riff deck for importing, registering, or rating native cards without making native Riff the scheduling authority.
_Avoid_: mandatory Riff sync, shadow-card truth, default dual scheduling

**Browser Read Model**:
The authoritative Browser-facing read contract that resolves matched row identity, count, page hydration, row-by-ID hydration, action targets, and source-existence state for deck, query, block-ID, and queue views. It reads from the declared owner for each view and must not replace unavailable owner data with stale local queue or snapshot data.
_Avoid_: grid cache, Browser UI state, Review projection builder, local queue fallback

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

**Review CDF Preparation Evidence**:
The Review-side evidence that a card has already passed CDF current-card open refresh and optional next-dues preparation for a specific card identity plus CDF-relevant metadata signature. It owns completed evidence, pending next-card preparation, and event-order invalidation for that evidence; it does not choose the next Review card, persist CDF repair actions, or own CDF source materialization.
_Avoid_: queue cache, Review session cursor state, CDF write/repair owner, backend prepared-card read model

**Review Ledger**:
The durable, idempotent fact record for an accepted Review answer. It contains the review identity, commit idempotency key, rating, reviewed time, and after-state evidence needed to reconcile or replay the answer; it is not the SQLite delta segment file.
_Avoid_: delta append proof, projection cache row, renderer feedback success flag

**Card Schedule Store**:
The durable current scheduling state for a card after Review commit. It owns the committed after-card schedule before success is reported; queue projection rows are derived read-model state, not this store.
_Avoid_: queue projection authority, Review session cursor, Browser row cache

**Delta Sync Adapter**:
The SQLite delta/checkpoint layer that exports, checkpoints, diagnoses, and recovers storage changes from durable Review facts and schedule state. It may read sealed segment evidence during diagnostics/recovery/reload, but ordinary same-runtime Review answer success must not depend on reconstructing historical sealed segments.
_Avoid_: Review Ledger, Card Schedule Store, kernel answer authority

**NeuralRoam Advance**:
The backend-authoritative Review progression for NeuralRoam sessions that returns the next item, exhaustion, or explicit unavailability from the backend advance contract.
_Avoid_: local NeuralRoam cursor, projection-backed NeuralRoam review, renderer-selected NeuralRoam next item

**Review Transaction Safety Envelope**:
The pre-feedback and failed-feedback safety boundary for a Review transaction: pre-review card snapshot, queue rollback snapshots, session-local exclusion snapshot, persistent rollback on go-back, and no-persist compensation after failed feedback.
_Avoid_: scheduler commit, queue membership selection, local Review advancement, NeuralRoam next-item selection

**Review History**:
The bounded LIFO record of previously visible Review items and their optional Review transaction, used by go-back and failed-feedback cleanup.
_Avoid_: queue cache, browser history, review event log, scheduler history

**Review Transaction Runtime**:
The Review session module that presents one interface for capturing Review transactions, recording **Review History**, go-back rollback, failed-feedback compensation, and clearing session transaction state. It composes **Review Transaction Safety Envelope** and **Review History** but does not choose queue membership, commit scheduling, own cursor movement, or select NeuralRoam next items.
_Avoid_: review commit runtime, queue strategy, scheduler transaction, NeuralRoam advance owner

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
- **AutoCard Decision Relay** chooses the decision owner before AutoCard execute side effects run.
- **AutoCard Execute Relay** chooses the backend/writer owner for AutoCard execution envelopes, but does not execute local card creation itself.
- **AutoCard Listener Candidate Runtime** decides when transaction-derived AutoCard candidates are evaluated; **AutoCard Decision Relay** and **AutoCard Execute Relay** decide backend/writer command ownership after evaluation begins.
- **SRS Browser Card Universe** scopes Browser filters, SQL searches, counts, and bulk operations to cards managed by SiYuanMemo.
- **SiYuanMemo-owned SRS** owns ordinary card creation, scheduling, review history, and Browser membership.
- **Native Riff Compatibility** may consume or update native Riff cards only as an explicit interoperability path.
- **Native Riff Compatibility** must not create a second scheduling truth for cards already owned by **SiYuanMemo-owned SRS**.
- A **Browser Read Model** consumes **SRS Browser Card Universe** and, for projection-backed queue views, consumes queue projection identity before hydrating Browser rows.
- **Custom Review Surfaces** share review rendering requirements with native-like review surfaces, including supported link and reference behavior.
- A **Semantic Session Read Model** is derived from Semantic session owner state and may consume core Semantic session projection, but it remains a read-only presentation model for Browser, Review sidebar, or session inspection callers.
- A **Review Session Cursor** sits inside a Review session and consumes queue rows/cards, but it is not the queue authority and does not decide scheduling outcomes.
- A **Review Current Item Command** sits beside the **Review Session Cursor** and applies the visible current card after cursor restore, ordinary advancement, or compensation chooses that card.
- **Review Feedback Advancement** consumes **Review Session Cursor** and **Review Current Item Command** state after a queue feedback result, while queue membership, scheduling commit, writer relay, and NeuralRoam next-item selection stay outside it.
- **Review CDF Preparation Evidence** consumes the card selected by Review session authority and prepares that card's CDF open-refresh result for reuse, while next-card selection, CDF write/repair, and backend prepared-card ownership stay outside it.
- **NeuralRoam Advance** selects NeuralRoam next items before **Review Current Item Command** applies them to the visible Review session.
- **Review Transaction Safety Envelope** wraps risky Review feedback mutation before **Review Feedback Advancement** applies local session transition.
- **Review History** stores the previous visible item and optional **Review Transaction Safety Envelope** transaction for go-back or failed-feedback cleanup.
- **Review Transaction Runtime** composes **Review Transaction Safety Envelope** and **Review History** behind the interface consumed by the Review strategy.

## Example Dialogue

> **Dev:** "After rating this card 3, it has a six-minute interval. Should it still be counted as due?"
> **Domain expert:** "It stays in the mixed SRS queue, but it is not current learning due until the six minutes pass."

> **Dev:** "Should quick-card creation also add a native Riff card?"
> **Domain expert:** "No by default. Quick-card creation belongs to SiYuanMemo-owned SRS; native Riff registration is compatibility, not the learning truth."

## Flagged Ambiguities

- "due" was used to mean both **Current Learning Due** and **Today Review Due**. Resolved: learning/relearning uses exact time; review uses the current review day.
- `IncrementalLearning` and `RetrievalPractice` were described as today-window queues. Resolved for `IncrementalLearning`: it is a **Mixed SRS Queue**, not a single today-window queue.
- `RetrievalPractice` was considered for the same new-card semantics as `IncrementalLearning`. Resolved: it is review-oriented and does not introduce new cards by default.
- `Learn Ahead` was considered as a card-count-only setting. Resolved: it follows Anki-style time-window semantics with an additional maximum-card limit for user experience control.
- Queue projection "not ready" was used for normal preparation, transient infrastructure unavailability, and terminal projection failures. Resolved: **Queue Projection Readiness** separates readable, preparing, and unavailable states.
- Browser queue loading mixed readiness, retry, datasource creation, and attach decisions. Resolved: **Browser Queue View Lifecycle** owns Browser-side queue preparation before grid attach.
- Topic was implicitly treated as document-block-only in some creation flows. Resolved: **Topic Container** includes non-document blocks such as super blocks when they own Topic-derived item creation.
- AutoCard decision routing was ambiguous with AutoCard execution and Xiuyuan writes. Resolved: **AutoCard Decision Relay** owns only decision resolve routing/local compatibility-read; execute side effects remain separate.
- AutoCard execute routing was ambiguous with local execution side effects. Resolved: **AutoCard Execute Relay** owns backend/follower/writer relay routing and unavailable diagnostics; local planner, Xiuyuan, and Topic-derived writes remain behind application execution runtime/services.
- AutoCard listener retry/settle state was ambiguous with decision and execute command ownership. Resolved: **AutoCard Listener Candidate Runtime** owns candidate lifecycle timing/diagnostics only; decision/execute routing and write side effects stay outside it.
- SRS Browser filtering was ambiguous between arbitrary block SQL and plugin-managed cards. Resolved: **SRS Browser Card Universe** is the outer scope; SQL results are intersected with it.
- "Riff" was used to mean native card registration, import, feedback, sync, and scheduling truth. Resolved: **SiYuanMemo-owned SRS** is the default truth; **Native Riff Compatibility** is optional interoperability.
- Browser read ownership was ambiguous between grid datasource sessions, queue projections, SQL card-universe reads, and stale local queue cards. Resolved: **Browser Read Model** owns Browser-facing matched IDs/counts/hydration and must consume the declared owner for each view.
- Temporary and deliberate practice were described as unable to render links. Resolved: the issue belongs to **Custom Review Surface** rendering, not to those practice modes as domain concepts.
- Semantic read assembly was ambiguous with core projection building. Resolved: **Semantic Session Read Model** names the presentation-ready read model derived from Semantic session owner state, while core projection remains the lower-level tree/path/branch derivation.
- Review session state was ambiguous between UI session orchestration, shared surface registration, and volatile queue movement. Resolved: **Review Session Cursor** names only the in-memory movement state within one Review session.
- Review feedback handling was ambiguous between scheduler commit, queue membership update, and local session transition. Resolved: **Review Feedback Advancement** names only the post-feedback local Review session transition.
- Review CDF preparation was ambiguous between queue cursor cache, current-card refresh glue, and next-card prewarm state. Resolved: **Review CDF Preparation Evidence** names only the keyed refresh/preparation evidence and its invalidation ordering.
- NeuralRoam progression was ambiguous with local cursor/projection review. Resolved: **NeuralRoam Advance** is backend-authoritative and the renderer only consumes its result.
- Review rollback handling was ambiguous between queue rollback, card snapshot restore, session exclusion restore, and visible current-item compensation. Resolved: **Review Transaction Safety Envelope** owns transaction safety; **Review Feedback Advancement** only applies the restored item locally.
- Review go-back storage was ambiguous with queue cache and review logs. Resolved: **Review History** names only the bounded in-memory previous-item stack inside one Review strategy.
- Review transaction orchestration was ambiguous between direct Strategy glue and separate safety/history modules. Resolved: **Review Transaction Runtime** is the Strategy-facing module for capture, record, go-back rollback, failed-feedback compensation, and clear.
