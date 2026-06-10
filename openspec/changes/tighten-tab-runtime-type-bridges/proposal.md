## Why

Production type debt still clusters around SiYuan custom-tab runtime bridges and one topbar initialization check. These casts make active runtime seams harder to audit before any future `strict` tightening.

## What Changes

- Replace the topbar `@ts-ignore` initialization check with an explicit typed plugin capability.
- Introduce a narrow custom-tab runtime callback helper so tab lifecycle callbacks stop repeating unchecked `this as unknown as TabRuntimeContext` casts.
- Keep runtime behavior, tab type strings, JSON tab data, Review/Browser ownership, and SiYuan APIs unchanged.
- Add focused coverage proving tab registration still wires Browser, Review, and Review AI lifecycle callbacks through the typed runtime helper.

## Capabilities

### New Capabilities

- `typed-runtime-bridges`: Internal runtime bridge typing for SiYuan custom tab and topbar entrypoints.

### Modified Capabilities

- None.

## Impact

- Affected code: `src/application/managers/TabManager.ts`, `src/ui/menu/TopBar.ts`, and focused tests.
- APIs: no public API, JSON-RPC method, storage, scheduler, writer relay, or kernel sidecar behavior changes.
- Dependencies: no new runtime dependency.
