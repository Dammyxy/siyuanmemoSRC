## Why

Native Riff Compatibility can import a source block such as `反思>>反思` as a plain `builtin-riff-sync` item card, losing quick-symbol render evidence. Review then renders the whole source block on the front instead of using the quick-symbol front/back contract.

This must be fixed now because existing riff-managed cards can still contain valid quick-symbol source grammar even when their projected card metadata is incomplete.

## What Changes

- Add deterministic repair for riff-managed cards whose live source block still contains supported quick-symbol grammar.
- Reuse the same quick-symbol evidence path during Native Riff sync so newly synced cards preserve render semantics.
- Route repaired cards through the existing SRS Card Render Contract and Quick renderer instead of Review-side symbol guessing.
- Emit diagnostics when a riff-managed card looks repairable but required source evidence is missing or invalid.

## Capabilities

### New Capabilities
- `riff-symbol-render-repair`: Detect and repair Native Riff Compatibility cards with quick-symbol source grammar so Review receives the correct SRS Card Render Contract.

### Modified Capabilities
- None.

## Impact

- Affects Native Riff Compatibility sync/projection paths, SRS Card Render Contract resolution, quick-symbol Review routing, and repair diagnostics.
- Adds regression coverage for `builtin-riff-sync` / `riff-managed` item cards with missing quick metadata and live block content such as `反思>>反思`.
- No breaking changes to card IDs, block IDs, scheduling truth, or existing QuickCardRenderer behavior.
