## Context

`ApplicationContext.ts` wires SiYuanMemo startup and exposes many getters. Some factory bundles already help, but the root still acts as composition root, service registry, runtime policy holder, backend worker wiring surface, UI manager provider, and typed getter facade.

The goal is not to replace the composition root. The goal is to make internal seams deeper so a Browser, Review, storage, or sync change does not require understanding the full root Interface.

## Goals / Non-Goals

**Goals:**

- Inventory `ApplicationContext` dependencies by bounded-context slice.
- Define narrow internal composition Interfaces for selected factories or bundles.
- Reduce broad `ApplicationContext`-shaped dependencies in low-risk factory seams.
- Preserve startup order, service lifetimes, and public getter compatibility.
- Document remaining broad getter debt with next safe steps.

**Non-Goals:**

- No service locator rewrite.
- No dependency injection framework.
- No repo-wide caller migration.
- No behavior changes to Browser, Review, storage, sync, writer relay, backend worker, kernel sidecar, or AI workbench.
- No TypeScript `strict` or `skipLibCheck` policy change.

## Decisions

- Keep `ApplicationContext` as the external composition root and shrink internal Interfaces first.
  - Rationale: startup order and service lifetime are sensitive; changing the external root would raise risk without immediate Leverage.
  - Alternative considered: split `ApplicationContext` into multiple public roots. Rejected as too broad for the first change.

- Start with factories that already form seams.
  - Rationale: `createReviewBrowserServiceBundle` and `createApplicationBackendRuntimeBundle` already group dependencies, so narrowing their input Interfaces has good Locality.
  - Alternative considered: start from leaf services. Rejected because leaf changes would not reduce broad composition knowledge.

- Treat the audit output as an implementation artifact, not a permanent architecture layer.
  - Rationale: the audit should guide safe migrations and avoid speculative abstractions.
  - Alternative considered: build a full dependency graph tool first. Rejected because manual focused audit is enough for this slice.

- Preserve broad getters as compatibility facade during the change.
  - Rationale: removing broad getters in the same pass would create repo-wide churn and blur validation.
  - Alternative considered: delete broad getters as soon as their first replacement exists. Rejected because many callers still rely on the public facade.

## Risks / Trade-offs

- The audit could become documentation-only with low Leverage -> mitigate by also narrowing at least one real factory seam.
- Narrow Interfaces could duplicate type declarations -> mitigate by defining them near the factory that owns the seam and only for dependencies it actually consumes.
- Startup behavior could change accidentally -> mitigate with existing startup/runtime wiring tests plus focused tests for factory dependency lists.
