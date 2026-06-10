## Context

`TabManager.registerAll()` registers SiYuan custom-tab callbacks whose `this` value is supplied by SiYuan at runtime. The current implementation repeats `this as unknown as TabRuntimeContext` in every callback. `TopBarManager` also uses `@ts-ignore` to read the plugin initialization flag before opening Browser. These are narrow but visible type-debt seams in active production code.

## Goals / Non-Goals

**Goals:**

- Keep Browser, Review, and Review AI custom-tab lifecycle behavior unchanged.
- Move custom-tab `this` normalization behind one typed helper so each callback body receives a `TabRuntimeContext`.
- Replace the topbar initialization suppression with an explicit plugin type.
- Add focused tests that exercise the registration callback seam and topbar initialization gate.

**Non-Goals:**

- Do not enable repo-wide `strict`.
- Do not change SiYuan custom tab ids, tab data shape, open/close behavior, Review ownership, Browser read model, backend RPC, SQL worker, writer relay, or kernel sidecar behavior.
- Do not refactor `ApplicationContext` or broad composition root type casts in this slice.

## Decisions

- Add a small `withTabRuntimeContext()` helper inside `TabManager.ts`.
  - Rationale: the SiYuan callback `this` value is an external runtime contract, so one local helper gives better locality than repeated double casts.
  - Alternative considered: augment SiYuan `Custom` callback types globally. Rejected because this slice should not edit third-party declarations or widen repo typing.
- Add a local `TopBarRuntimePlugin` type for `TopBarManager`.
  - Rationale: `TopBarManager` depends on `isInitialized`, `openSRSBrowser`, and `openSettings`; making that interface explicit removes the suppression without changing plugin runtime.
  - Alternative considered: expose a new public readiness method. Rejected because it changes the plugin class surface beyond this debt slice.
- Keep focused coverage at the seam rather than adding broad UI integration.
  - Rationale: the risk is callback wiring and initialization gating, not Browser or Review behavior.

## Risks / Trade-offs

- SiYuan callback `this` typing remains external to TypeScript. Mitigation: concentrate the assertion in one helper and cover registered lifecycle callbacks.
- `TopBarManager` still reads `isInitialized` directly. Mitigation: document it as an explicit local interface and keep behavior unchanged.
- Broader type debt remains in `ApplicationContext`, Browser filter/sort helpers, and Review adapters. Mitigation: defer those to separate narrow changes.
