## Why

CDF abnormal diagnostics currently interrupt Review by replacing the review card with a CDF blocking panel and advancing the card without scoring. The user wants Review to continue normally and to remove the CDF abnormal diagnosis/repair surfaces that keep pulling study flow into repair mode.

## What Changes

- Remove the Review CDF interruption panel and blocked-CDF no-score advancement path.
- Remove Browser CDF abnormal / CDF repair user surfaces that expose the same diagnostic system.
- Keep ordinary CDF card creation/rendering/editor save behavior intact in this first pass.

## Impact

- Affected code: `src/ui/review/v2/ReviewView.vue`, `src/ui/review/v2/types.ts`, Browser CDF abnormal/repair UI, i18n keys, focused tests.
- Runtime behavior: CDF cards with abnormal live relation metadata no longer interrupt Review flow.
- Non-goal: delete the entire `core/card/cdf-live-relation` engine in this first change.
