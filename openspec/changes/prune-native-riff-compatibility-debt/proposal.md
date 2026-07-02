## Why

Native Riff compatibility remains visible in ordinary SiYuanMemo-owned SRS paths even after Riff stopped being scheduling truth. Duplicate Riff ports, always-present adapters, and multiple sync entry paths keep a retired dependency mentally and structurally expensive.

## What Changes

- Consolidate duplicate Native Riff add-card interfaces into one explicit compatibility module.
- Keep ordinary SiYuanMemo-owned SRS creation/review/scheduling free of Native Riff write capability by default.
- Route Progressive, Topic-derived item, and AutoCard Native Riff behavior only through explicit compatibility decisions.
- Remove or make unavailable any inactive Native Riff compatibility paths that only exist as speculative fallback or dual-path wiring.
- Record follow-up debt for Review render legacy projection and storage legacy loader cleanup without mixing those larger slices into this change.

## Capabilities

### New Capabilities

- `native-riff-compatibility`: Defines explicit, non-default Native Riff interoperability behavior for card registration, sync triggers, and compatibility command ownership.

### Modified Capabilities

- None.

## Impact

- Affected application modules: `ApplicationContext`, `ProgressiveReadingService`, `TopicDerivedItemService`, `AutoCardHandler`, Native Riff policy and port/adapter files.
- Affected infrastructure modules: SiYuan Riff adapter wiring and event/transaction Native Riff sync handlers.
- Affected tests: focused Native Riff policy, Progressive/Topic-derived/AutoCard compatibility tests, ApplicationContext writer relay/transaction fanout tests, boundary/fallback checks.
- No new external dependencies.
