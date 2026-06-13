## Why

`UnifiedReviewAdapter` still accepts progressive render metadata with broad record checks and then casts it into `ProgressiveSourceLineage`, `ProgressiveDisclosureState`, `ProgressiveContentPayloadIdentity`, and `ProgressiveSourceAvailability`. That keeps malformed DTOs on the active Review render path and hides the contract behind `unknown as` assertions after earlier Review snapshot and Browser helper type debt was retired.

## What Changes

- Add a narrow typed DTO normalizer for progressive render metadata consumed by Review render context creation.
- Replace `UnifiedReviewAdapter`'s local progressive DTO casts with the typed normalizer while preserving existing render behavior for valid excerpt/derived-item cards and legacy source-lineage fallback metadata.
- Add focused Review adapter tests for valid DTO pass-through and malformed DTO rejection/fallback behavior.
- Do not change Review queue membership, feedback commit, storage durability, writer relay, backend RPC method strings, or progressive source ownership.

## Capabilities

### New Capabilities
- `review-progressive-render-dto`: Review render context progressive metadata is normalized through a typed DTO contract before entering the render context.

### Modified Capabilities
- None.

## Impact

- Affected code: `src/application/adapters/UnifiedReviewAdapter.ts`, `src/application/adapters/reviewRenderableContext.ts` or a sibling helper, and focused Review adapter tests.
- Runtime behavior: no intended UX or queue behavior changes; valid progressive render metadata remains visible to Review UI, while malformed progressive DTO fragments no longer pass as typed render context state.
- Boundaries: remains inside the Review adapter/render context slice and does not alter storage, SQL worker authority, kernel sidecar coordination, or writer relay ownership.
