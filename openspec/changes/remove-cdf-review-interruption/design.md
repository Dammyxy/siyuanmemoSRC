## Context

The removed interruption path was centered in `ReviewView.vue`: `reviewCdfInterruptionPanel` detected blocking CDF live relation issues, hid `ReviewContent`, showed a CDF diagnostic panel, and used `advanceWithoutFeedback({ kind: "blocked-cdf" })` to skip the card without scoring. Browser also exposed a `cdf-abnormal` preset and CDF diagnostic result UI, keeping the diagnosis system discoverable after the Review block was removed.

## Decisions

1. Delete Review interruption before deeper CDF engine deletion.
   - Rationale: this directly fixes study-flow interruption with small blast radius.
   - Alternative: delete all live relation code first. Rejected because CDF creation/rendering/editor-save paths still depend on parts of that engine.

2. Remove Browser abnormal diagnostic surfaces in the same pass.
   - Rationale: they are the user-visible diagnostic system paired with the Review interruption.
   - Alternative: keep Browser diagnostics only. Rejected because user intent is to remove the diagnostic system from normal flow.

3. Preserve CDF card rendering and creation.
   - Rationale: CDF cards remain valid study cards; only abnormal diagnosis interruption is being removed.

## Risks

- Removing too much CDF live relation code may break CDF rendering or editor save behavior.
- Browser CDF filter/action tests may need adjustment after removing `cdf-abnormal` and diagnostic menu entries.
