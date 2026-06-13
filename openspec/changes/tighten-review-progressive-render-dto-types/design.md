## Context

Review render context assembly already has a dedicated module, `reviewRenderableContext`, but progressive metadata is still read in `UnifiedReviewAdapter` through shallow record checks and broad `unknown as Progressive*` casts. The adapter currently decides whether `meta.progressive.sourceLineage`, `disclosureState`, `payloadIdentity`, and `sourceAvailability` are valid enough to enter the Review render context.

The next type-debt slice should stay inside the Review render adapter path. It must not alter Review queue strategy, feedback advancement, backend durability, SQL worker ownership, kernel sidecar ownership, or writer relay routing.

## Goals / Non-Goals

**Goals:**

- Move progressive render DTO normalization behind a small Review render context interface.
- Preserve existing valid DTO behavior and legacy source-lineage fallback behavior.
- Reject malformed progressive DTO fragments before they enter typed Review render context state.
- Cover pass-through and malformed DTO behavior with focused tests.

**Non-Goals:**

- No changes to Review queue membership, scheduling, feedback commit, rollback, or cursor behavior.
- No changes to progressive write/source ownership, storage durability, SQL worker authority, writer relay, kernel sidecar, or backend RPC contracts.
- No repo-wide TypeScript strictness changes.

## Decisions

- Put the normalizer beside `buildReviewRenderableContext`.
  - Rationale: that module already owns the render context interface and has higher leverage than repeating adapter-local DTO checks.
  - Alternative considered: keep a private helper inside `UnifiedReviewAdapter`; rejected because it leaves the shallow adapter implementation and broad casts in place.

- Use explicit runtime guards for each progressive DTO shape.
  - Rationale: the source is card metadata, so TypeScript assertions alone do not protect the runtime contract.
  - Alternative considered: import the progressive source model types and keep `as` casts; rejected because that is the debt this change is removing.

- Keep legacy source-lineage synthesis for old excerpt/piece metadata.
  - Rationale: valid old cards without `sourceLineage` still need the same render context behavior.
  - Alternative considered: require only the new DTO shape; rejected because it would change Review display behavior for existing progressive cards.

## Risks / Trade-offs

- Valid but partially populated historical metadata could be stricter than before -> mitigate by keeping legacy source-lineage fallback and only accepting fully shaped typed DTO fragments.
- Guard logic could become a second model definition -> mitigate by keeping guards narrow and focused on the DTO fields consumed by Review render context, not on every progressive source model field.
- Tests could overfit implementation -> mitigate by testing through `UnifiedReviewAdapter.toUIState()` and the exported render-context normalizer behavior.
