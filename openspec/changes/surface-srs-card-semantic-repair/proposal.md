## Why

卡片类型修复现在藏在块菜单里，但它实际是全库级 SRS Card Semantics 诊断/修复，不依赖当前块。用户发现类型错乱时通常在 SRS Browser 里排查，所以入口应放在 Browser 的维护/诊断 surface，降低发现成本并避免“块级操作”的误导。

## What Changes

- Add a visible SRS Browser toolbar maintenance menu that exposes `诊断并修复卡片类型`.
- Move the preview/commit dialog flow behind one shared application-facing repair action so Browser and any retained menu entry do not duplicate repair UI logic.
- Keep repair explicit: preview first, commit only after user confirmation, and report unavailable/failed states without hidden fallback.
- Remove or downgrade the block-menu repair entry as the primary entry because it is not block-scoped.

## Capabilities

### New Capabilities
- `srs-card-semantic-repair-surface`: Browser-owned maintenance entry for explicit SRS Card Semantics diagnosis and repair.

### Modified Capabilities

## Impact

- Affected code: `src/ui/browser/BrowserToolbar.vue`, `src/ui/browser/SRSBrowser.vue`, `src/ui/browser/browserActionMenuRuntime.ts`, `src/application/managers/BlockMenuHandler.ts`, `src/application/managers/DialogManager.ts` or a small shared application module, i18n files, focused tests.
- Runtime behavior: Browser users gain a visible maintenance entry for card-type repair; repair remains explicit and evidence-previewed.
- No data model or external dependency changes.
