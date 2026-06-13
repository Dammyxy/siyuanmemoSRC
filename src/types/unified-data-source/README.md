# Unified Data Source Contract Split

`src/types/unified-data-source.ts` remains a compatibility barrel during this migration. New or touched callers should import from the narrower modules below.

- `queue-core.ts`: queue type literals, queue observer contracts, review result contracts, queue counters, queue UI config, persistence/sync DTOs, and queue helper functions.
- `queue-projection.ts`: projection snapshots, rollout diagnostics, read path/mode contracts, and backend projection readiness types.
- `browser-contracts.ts`: Browser filters, filter-group session snapshots, and review-tab transfer state.
- `neural-roam-session.ts`: NeuralRoam session queue contracts, navigation/history/trace DTOs, batch snapshots, and the session queue guard.
- `manager-facade.ts`: the unified data-source manager facade used by UI and application services.
- `data-router.ts`: data-router/context-menu contracts and advanced-mode context-menu helper.
- `errors.ts`: shared data-source errors.

Remaining barrel-only exports after this slice: none intentionally. The barrel itself stays as the compatibility import path so existing callers can migrate incrementally without repo-wide churn.
