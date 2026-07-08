## Context

The interruption path is centered in `ReviewView.vue`: `reviewCdfInterruptionPanel` detects blocking CDF live relation issues, hides `ReviewContent`, shows a CDF repair panel, and uses `advanceWithoutFeedback({ kind: "blocked-cdf" })` to skip the card without scoring. Browser also exposes a `cdf-abnormal` preset and CDF repair result UI, keeping the diagnosis/repair system discoverable after the Review block is removed.

## Decisions

1. Delete Review interruption before deeper CDF engine deletion.
   - Rationale: this directly fixes study-flow interruption with small blast radius.
   - Alternative: delete all live relation repair code first. Rejected for this pass because CDF creation/rendering/editor-save paths still depend on parts of that engine.

2. Remove Browser abnormal/repair surfaces in the same pass.
   - Rationale: they are the user-visible diagnostic system paired with the Review interruption.
   - Alternative: keep Browser repair only. Rejected because user intent is to remove the diagnostic/repair system from normal flow.

3. Preserve CDF card rendering and creation.
   - Rationale: CDF cards remain valid study cards; only abnormal diagnosis/repair interruption is being removed.

## Risks

- Removing too much CDF live relation code may break CDF rendering or editor save behavior.
- Browser CDF filter/action tests may need adjustment after removing `cdf-abnormal` and repair menu entries.
