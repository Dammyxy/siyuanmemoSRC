## Why

`filter-group` Review sessions can be projection-backed globally for Browser/count consumers, but a live filtered Review session still owns dynamic filter state, manual entries, temporary blacklist, and transfer/session scope. The current Review strategy can reload from global projection rows and select a card outside the active filter.

## What Changes

- Keep `filter-group` Review session navigation on the live filtered queue when the queue strategy reloads cards.
- Preserve backend projection reads for Browser/count/projection-owned consumers outside the Review strategy path.
- Keep static subset Review sessions on their exact local scope, without hydrating global projection rows.
- Add regression coverage proving dynamic filtered Review and static subset Review do not read global projection rows.

## Capabilities

### New Capabilities
- `filter-group-review-read-routing`: Filter-group Review sessions use live queue scope instead of global projection rows.

### Modified Capabilities

## Impact

- `src/application/adapters/UnifiedQueueStrategy.ts`
- `src/application/adapters/__tests__/UnifiedQueueStrategy.static-subset-projection.spec.ts`
- `docs/DDD_RESCAN_BACKLOG.md`
