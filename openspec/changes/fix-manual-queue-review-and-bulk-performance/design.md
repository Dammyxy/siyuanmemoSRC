## Context

The active Browser add-menu currently exposes both `add-to-retrieval-queue` and `add-to-retrieval-queue-all`. Both routes reach `UnifiedDataSourceManager.batchAddToQueue()` and `RetrievalPracticeQueue.addCards()`. The only difference is `QueueAddSource` (`manual` vs `manual-add-all`), but `RetrievalPracticeQueue` ignores that source, so the UI shows two choices with the same effect.

Retrieval Practice persists manual additions under `retrievalPracticeQueue`. The local `queue.handleReview()` path eventually reaches `RetrievalPracticeQueue.removeCardAfterReview()`, which can remove manual membership. The worker-owned review-session path intentionally avoids `queue.handleReview()` for speed and authority, so successful feedback can advance the session and write card schedule without clearing the manual membership record. On restart, the persisted membership is loaded again and the same cards reappear.

The same code area contains batch operation latency risk: Browser actions and queue changes can fan out into per-card operations, repeated cache invalidation, and repeated observer/projection refreshes. The fix should avoid adding another fallback path and instead make the active bulk/worker paths authoritative.

## Goals / Non-Goals

**Goals:**
- Make explicit Browser add-to-Retrieval review behave as a real rescheduling review and clear persisted manual membership after successful rating.
- Keep local session and worker session behavior consistent for manual queue membership cleanup.
- Replace duplicate add-menu choices with one clear menu item per queue while keeping old action IDs routeable for compatibility.
- Reduce jank for large selected-row batch operations by using bulk APIs, single cache invalidation, and coalesced observer/projection refreshes.
- Add tests that reproduce the restart-sensitive manual queue count issue and representative large-batch action latency patterns.

**Non-Goals:**
- Rebuild the review scheduler, queue projection model, or worker database ownership.
- Change Final Drill, Neural Roam, or Filter Group product semantics beyond shared batch plumbing that is already on the touched path.
- Add compatibility fallbacks that silently hide unavailable writer/backend ownership.
- Promise a global performance rewrite for every plugin action in one pass; this change targets Browser and queue batch operations first.

## Decisions

### Manual queue review uses formal scheduling

When a user explicitly adds cards to Retrieval Practice from Browser and rates them, the review MUST write the formal schedule. This matches the user's expectation that manually practiced cards are naturally rescheduled and prevents future-due cards from remaining stuck in manual review forever.

Alternative considered: keep default filtered review as preview-only and only remove manual membership. That would fix the restart count but would not satisfy the desired "reviewed means rescheduled" behavior.

### Cleanup belongs in the review commit/membership boundary

Manual membership cleanup should run after a successful committed review for Retrieval Practice and Incremental Learning manual additions. The worker session path must not call the full `queue.handleReview()` path just to get the cleanup side effect. Instead, expose or reuse a bounded membership sync command that removes the reviewed card from persisted manual membership after the schedule commit is accepted.

Alternative considered: clean only in frontend after feedback. That is weaker because worker feedback is the commit authority; frontend cleanup could be skipped by writer/follower ownership or lost during restart.

### UI shows one add action per queue

The menu should show `提取练习` and `渐进学习` once. Legacy route IDs such as `add-to-retrieval-queue-all` and `add-to-incremental-queue-all` can remain accepted internally during the change to avoid breaking older commands/tests, but they should not be shown in the menu.

Alternative considered: rename the two actions with longer explanations. Since source currently has no active semantic difference, clearer labels would still expose a false choice.

### Batch operations use explicit bulk contracts

Browser batch actions should prefer manager/application bulk APIs that accept all selected IDs/cards at once. Each batch operation should emit at most one cache invalidation cycle and one observer/projection refresh group for the affected queues/cards. Missing bulk authority should fail explicitly instead of falling back to slow per-card UI-owned loops.

Alternative considered: debounce existing per-card loops. Debounce can reduce visible updates but leaves redundant writes and stale intermediate state risks.

## Risks / Trade-offs

- Formal scheduling for manually added future cards changes prior preview-only behavior -> Limit it to explicit Browser manual queue additions and cover with tests.
- Worker-side cleanup may touch queue persistence from backend/session code -> Keep the boundary as an application/manager command or explicit membership port, not direct DB writes from UI or kernel relay.
- Coalescing batch events can hide partial failures -> Return attempted/changed/failed counts and surface one message with failures included.
- Removing duplicate menu entries may affect users who learned the old label -> Keep old route IDs internally and update tests/i18n references.
