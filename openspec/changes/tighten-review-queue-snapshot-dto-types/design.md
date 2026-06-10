## Context

Review tabs serialize runtime state into `ReviewTabRuntimeState`, including an optional `ReviewQueueSessionSnapshot`. `TabManager.normalizeReviewQueueSessionSnapshot()` currently clones unknown tab data and returns it directly as `ReviewQueueSessionSnapshot`, which leaves `cachedCards`, `currentItem`, `forwardBuffer`, and `lastCounterSnapshot` typed as generic records. Full `tsc --noEmit` reports this as two touched-slice type errors in `TabManager.ts`.

## Goals / Non-Goals

**Goals:**

- Make Review queue snapshot restoration type-explicit inside `TabManager`.
- Keep valid queue snapshot cards and counter snapshots available to `UnifiedQueueStrategy.restoreSessionSnapshot()`.
- Reject malformed card/counter snapshot DTOs rather than smuggling broad records through the active queue contract.
- Remove the `TabManager.ts` `tsc` errors for this DTO narrowing slice.

**Non-Goals:**

- Do not change Review tab data schema, queue snapshot version, queue type strings, queue ownership, or restore ordering.
- Do not refactor `UnifiedQueueStrategy`, Review adapter DTO projection, `ApplicationContext`, backend RPC, SQL worker, writer relay, or kernel sidecar behavior.
- Do not enable repo-wide `strict` or solve unrelated type errors outside this slice.

## Decisions

- Add local type guards/normalizers in `TabManager.ts` for snapshot `FSRSCard` values and `QueueCounterSnapshot`.
  - Rationale: the unsafe values originate from external/custom-tab data at the TabManager restore seam, so the normalization should live where the unknown data enters the Review runtime.
  - Alternative considered: cast cloned records to `FSRSCard`/`QueueCounterSnapshot`. Rejected because that would silence the type checker without proving the runtime contract.
- Keep validation structural and bounded to fields required by the active interfaces.
  - Rationale: this narrows DTOs enough for queue restoration without rewriting the card model or adding migration logic.
- Test through `TabManager.registerAll()` and the Review tab init callback.
  - Rationale: the public seam is the custom-tab lifecycle, not private normalizer functions.

## Risks / Trade-offs

- Malformed snapshots that previously slipped through as plain records will now be dropped from the restored queue snapshot. Mitigation: this is explicit normalization at an external data seam, and valid snapshots remain preserved by focused tests.
- Full project typecheck may still fail outside this slice. Mitigation: validation will include a filtered `tsc --noEmit` check for `TabManager.ts` plus targeted tests/build.
