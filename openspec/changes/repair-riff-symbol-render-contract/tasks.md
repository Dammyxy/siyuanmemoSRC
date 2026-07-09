## 1. Regression Feedback Loop

- [x] 1.1 Add SRS Card Render Contract regression for a riff-managed `builtin-riff-sync` item card with source `反思>>反思` and missing quick metadata
- [x] 1.2 Add Review render policy regression proving the same card routes to `specialRendererKind: quick`
- [x] 1.3 Add negative regression proving stale projected faces alone do not trigger quick rendering when live source evidence is missing

## 2. Riff Symbol Render Repair Module

- [x] 2.1 Create the Riff Symbol Render Repair Module with a small interface over card metadata and live source content
- [x] 2.2 Detect supported quick-symbol grammar only for riff-managed Native Riff Compatibility item cards
- [x] 2.3 Return explicit quick-symbol render evidence, repair patch data, receipts, and diagnostics
- [x] 2.4 Fail closed with diagnostics when live source evidence is missing, empty, or not parseable

## 3. Render Contract And Sync Wiring

- [x] 3.1 Wire repair evidence into SRS Card Render Contract resolution without adding Review UI symbol parsing
- [x] 3.2 Reuse the repair Module from the Native Riff sync/projection path so newly synced symbol cards persist render evidence
- [x] 3.3 Preserve existing QuickCardRenderer parsing and card identity/scheduling fields

## 4. Documentation And Validation

- [x] 4.1 Update DDD debt/backlog notes for the resolved Native Riff symbol render repair
- [x] 4.2 Run focused regression tests for render contract and Review render policy
- [x] 4.3 Run `pnpm run check:boundaries`, hidden fallback check, and `pnpm build`
