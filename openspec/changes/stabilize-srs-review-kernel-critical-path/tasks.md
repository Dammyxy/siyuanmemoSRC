## 1. Exploration and Contract

- [ ] 1.1 Map active Review answer path from UI to worker runtime and list each authority currently involved.
- [ ] 1.2 Define `SrsReviewKernel` Interface types for `startSession`, `answer`, `skip`, `undo`, `lookahead`, counters, and diagnostics.
- [ ] 1.3 Document which existing modules become adapters vs kernel internals.

## 2. Tests First

- [ ] 2.1 Add kernel contract tests for rating advancing to next card from session state.
- [ ] 2.2 Add kernel contract tests for skip/session remove without projection requery.
- [ ] 2.3 Add kernel contract tests for undo/go-back preserving journal/session evidence.
- [ ] 2.4 Add no-fallback test proving renderer cursor/projection patching cannot become active authority after worker kernel is selected.

## 3. Implementation

- [ ] 3.1 Wrap current worker Review session runtime with the kernel Interface.
- [ ] 3.2 Move Review session counters/lookahead diagnostics behind kernel result types.
- [ ] 3.3 Thin `UnifiedQueueStrategy` feedback path to call kernel answer/skip and map the result.
- [ ] 3.4 Remove or quarantine production use of renderer-owned cursor advancement for worker-owned sessions.

## 4. Docs and Validation

- [ ] 4.1 Update `CONTEXT.md` with the SRS Review Kernel term.
- [ ] 4.2 Update `ARCHITECTURE.md` Review path diagram.
- [ ] 4.3 Update `docs/DDD_RESCAN_BACKLOG.md` with debt retired/deferred.
- [ ] 4.4 Run focused Review/kernel tests.
- [ ] 4.5 Run `pnpm run check:boundaries`.
- [ ] 4.6 Run `pnpm build`.
- [ ] 4.7 Run `openspec validate stabilize-srs-review-kernel-critical-path --strict`.
