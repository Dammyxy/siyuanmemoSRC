## Why

Repaired legacy symbol cards can regain the correct `Item` semantic kind while still losing their review renderer or front/back presentation. SiYuanMemo needs a stable render contract so Review and Browser repair produce cards that keep both type and rendering evidence.

## What Changes

- Add an SRS card render contract capability that resolves renderer kind, render family, quick-symbol evidence, and front/back availability from one Module.
- Route Review presentation preparation through the render contract for quick-symbol cards, including correct front/back side selection.
- Extend semantic repair so deterministic symbol-card repairs restore minimal quick-symbol render evidence, not only `CardType`.
- Surface explicit diagnostics when a card cannot be rendered because source grammar, source block, or routing evidence is missing.
- Add regression coverage for repaired legacy symbol cards and quick-card side selection.

## Capabilities

### New Capabilities
- `srs-card-render-contract`: Resolves and repairs Review render contracts for SRS cards so semantic type, renderer kind, and front/back display remain aligned.

### Modified Capabilities

## Impact

- Affected code: card semantics repair, Review render policy, Review presentation preparation, quick-card rendering tests, and DDD backlog/context documentation.
- No new external dependencies.
- No storage migration beyond explicit repair patches for cards selected by the existing semantic repair action.
