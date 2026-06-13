## Context

`unified-data-source.ts` is a source of truth for many active queue and Browser contracts. It has earned its place historically, but it now mixes several Interface families:

- Queue type literals and queue core behavior.
- Review scheduling and review result contracts.
- Queue projection rollout/readiness diagnostics.
- Unified data-source manager facade.
- NeuralRoam session queue methods.
- Browser filters and Review tab transfer state.
- Data router and queue UI config.
- Shared errors and helper functions.

This makes the module difficult to navigate and makes imports less intentional. The split should improve Depth and Locality without changing behavior.

## Goals / Non-Goals

**Goals:**

- Split contracts by caller intent rather than by arbitrary file size.
- Preserve the existing `@/types/unified-data-source` import path as a compatibility barrel.
- Migrate a small number of low-risk imports to the new modules to prove the seams.
- Keep queue/review/projection runtime behavior unchanged.
- Add coverage that the compatibility barrel still exports expected public contracts.

**Non-Goals:**

- No queue runtime rewrite.
- No queue projection policy change.
- No Review feedback or scheduler behavior change.
- No NeuralRoam behavior change.
- No repo-wide import churn in the first slice.
- No AI workbench or agent-related cleanup.

## Decisions

- Use caller-oriented contract families as the split axis.
  - Rationale: callers need smaller Interfaces such as queue projection read contracts or Browser filter contracts, not the whole unified data-source surface.
  - Alternative considered: split purely by type declarations versus functions. Rejected because it would not reduce caller knowledge.

- Keep `src/types/unified-data-source.ts` as a compatibility barrel during migration.
  - Rationale: removing the barrel would cause broad import churn and make validation noisy.
  - Alternative considered: update all imports at once. Rejected because the first change should prove the seams with limited blast radius.

- Move runtime-free contracts first.
  - Rationale: type and helper relocation should not alter queue object lifetimes or queue manager behavior.
  - Alternative considered: split manager implementation and contracts together. Rejected because manager implementation belongs in a later bounded Queue change.

- Require import direction checks after each migrated slice.
  - Rationale: a type split can accidentally introduce concrete UI/application/core dependencies.
  - Alternative considered: rely only on TypeScript build. Rejected because build success does not prove layer Locality.

## Risks / Trade-offs

- Too many tiny modules could make navigation worse -> mitigate by grouping around real caller Interfaces and applying the deletion test.
- Barrel compatibility could hide unfinished migration -> mitigate by documenting migrated families and remaining barrel-only exports.
- Type-only refactor may look low risk but affect circular imports -> mitigate with focused build, boundary checks, and selected runtime tests for Browser/Review/Queue import sites.
