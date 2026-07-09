## Why

The first render-contract slice fixed repaired quick-symbol routing, but Review still has scattered renderer selection and silent quick-render fallback paths. SiYuanMemo needs one complete SRS card render contract so repaired cards keep semantic type, renderer family, front/back side, and explicit diagnostics across Browser repair and Review.

## What Changes

- Complete the SRS card render contract Interface with renderer kind, render family, front/back contract, required receipts, repair patch, and diagnostics.
- Move Review renderer selection for quick, Protyle, descriptor, concept, concept-definition, image occlusion, and multi-cloze through the render contract.
- Route quick-symbol front/back preparation through the contract instead of local Review guesses.
- Make quick renderer failures fail closed with explicit diagnostics instead of suppressing quick routing and falling back to Protyle.
- Extend focused regression coverage for the full render contract and quick-render diagnostic path.

## Capabilities

### New Capabilities
- `complete-srs-card-render-contract`: Defines the complete Review render contract for SRS cards, including renderer family, front/back side ownership, required receipts, and fail-closed diagnostics.

### Modified Capabilities
- `srs-card-render-contract`: Extends the previous quick-symbol slice into the complete Review render-routing contract.

## Impact

- Affected code: render contract resolver, Review render policy, Review presentation preparation, Review content renderer selection, quick-card render service/repository, tests, DDD docs, and backlog.
- No new external dependencies.
- No storage migration beyond deterministic repair patches produced by the existing semantic repair path.
