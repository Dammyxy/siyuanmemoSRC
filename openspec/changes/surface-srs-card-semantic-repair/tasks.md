## 1. Shared Repair Flow

- [x] 1.1 Move SRS Card Semantics repair preview/commit dialog flow from `BlockMenuHandler` into a shared DialogManager Interface.
- [x] 1.2 Route any retained repair callers through the shared DialogManager Interface.

## 2. Browser Maintenance Surface

- [x] 2.1 Add a Browser toolbar maintenance menu trigger.
- [x] 2.2 Add the `诊断并修复卡片类型` menu item and wire it to the shared repair flow.
- [x] 2.3 Remove the global repair action from the block-scoped menu.

## 3. Tests And Validation

- [x] 3.1 Add focused tests for Browser maintenance menu routing.
- [x] 3.2 Add focused tests for the shared DialogManager repair flow.
- [x] 3.3 Update i18n/backlog/docs as required by touched runtime code.
- [x] 3.4 Run focused tests, hidden fallback check, boundary check, build, OpenSpec validation, and diff hygiene checks.
