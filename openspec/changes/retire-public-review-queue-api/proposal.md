## Why

Long-lived review queues have moved to backend projection, backend advance, and writer-owned commands, but Browser and Review still retain scattered access to public queue instances. Calls such as `getQueue().getCards()`, `addCards()`, `removeCards()`, `setFilter()`, and session snapshot methods keep the renderer close enough to queue internals to reintroduce hidden fallback and local authority.

This change retires public review queue APIs from runtime surfaces so queue classes remain domain implementations/adapters, while Browser and Review consume explicit read models and commands.

## What Changes

- Replace Browser long-lived queue reads with Queue Projection Readiness plus projection snapshot/rows hydration.
- Route Browser queue membership mutations through application command methods instead of direct queue instance methods.
- Route Review filter/session transfer through explicit review session transfer models instead of global `FilterGroupQueue` mutation.
- Keep queue instances accessible only inside approved composition, strategy, backend adapter, and test-helper seams.
- Add boundary checks that fail when UI or broad application runtime code uses public queue APIs as authority.
- Update architecture and DDD backlog docs with the new queue authority rule and deferred internal cleanup.

## Capabilities

### New Capabilities

- `review-queue-runtime-authority`: Defines which runtime surfaces may consume queue projections, backend advance, queue commands, and internal queue instances.

### Modified Capabilities

- None.

## Impact

- Affected source: `src/ui/browser/**`, `src/ui/review/**`, `src/application/services/**`, `src/application/managers/**`, `src/application/adapters/**`, `src/core/queue/domain/**`, and boundary scripts.
- Affected behavior: Browser and Review return explicit unavailable states when backend projection/command authority is absent, instead of using public queue APIs for local repair or mutation.
- Affected tests: Browser datasource/menu tests, Review transfer/filter tests, UnifiedQueueStrategy tests, queue projection rollout tests, and boundary checker tests.
