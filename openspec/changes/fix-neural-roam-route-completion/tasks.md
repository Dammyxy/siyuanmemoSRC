## 1. Route Log Completion

- [x] 1.1 Add a regression test proving Browser route log reads route-level Orbit and Hyperspace history independent of current engine.
- [x] 1.2 Add route-level history page/read helpers to `NeuralRoamQueue` and switch Browser controller to them.
- [x] 1.3 Add a regression test proving engine history clear does not remove Browser route log rows.
- [x] 1.4 Add a regression test proving cleared route logs are not rebuilt from engine-local history on later route saves.
- [x] 1.5 Preserve route-owned history from the latest route catalog snapshot and stop route snapshot replacement from merging engine histories into route history.

## 2. Backend Route Switch Completion

- [x] 2.1 Add a backend regression test for cached route A, SQL active route B, and advance request route B.
- [x] 2.2 Sync cached backend `NeuralRoamQueue` route state before route mismatch checks while preserving stale-route rejection.
- [x] 2.3 Add a renderer Review regression test for stale local active route snapshot before first next.
- [x] 2.4 Sync renderer NeuralRoam queue route state before Review next/feedback sends backend advance requests.

## 3. Review Close Lifecycle Completion

- [x] 3.1 Add a Review dialog close lifecycle regression test for dirty temporary route cancel.
- [x] 3.2 Prevent native Review dialog close from bypassing the component temporary-route close lifecycle.

## 4. Validation

- [x] 4.1 Run targeted route log, backend advance, Browser controller, and Review close lifecycle tests.
- [x] 4.2 Run `openspec validate fix-neural-roam-route-completion --strict`.
- [x] 4.3 Run `pnpm run check:boundaries` and `pnpm build`.
- [x] 4.4 Re-run targeted route ownership, renderer route sync, i18n label, boundary, and build validation for the route-log separation follow-up.
