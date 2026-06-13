## Context

Review session behavior has been deepened through `useReviewSession` and review-session modules, but the view still hosts many unrelated runtime seams. Some runtime helpers already exist, which makes this a good follow-up: move more non-rendering glue behind small UI-owned Modules while preserving the current Review View template and session Interface.

## Goals / Non-Goals

**Goals:**
- Reduce `ReviewView.vue` ownership of non-rendering host runtime concerns.
- Extract focused runtime Modules for plugin context/truth flush, source refresh wiring, inline editor bridge, CDF interruption projection, and viewport/data observer state where safe.
- Keep extracted Modules deep by moving state and behavior together, not only wrapper functions.
- Add focused tests for extracted runtimes and keep Review View tests as integration smoke.

**Non-Goals:**
- No Review session algorithm or queue strategy changes.
- No scheduler, feedback commit, rollback, or Review transaction runtime changes.
- No AI sidecar, AI workbench, Semantic activation, NeuralRoam route semantics, or agent work.
- No visual redesign.

## Decisions

1. Extract host runtime seams one at a time.
   - Rationale: `ReviewView.vue` is large and sensitive; each seam needs characterization coverage before movement.
   - Alternative rejected: split the whole view into many files in one pass; that risks template and reactive-state regressions.

2. Keep UI-owned runtime Modules in `src/ui/review/v2`.
   - Rationale: these modules shape view state and host integration, not application domain behavior.
   - Alternative rejected: move host runtime into application services; that would invert ownership and leak UI details into application.

3. Explicitly exclude AI and agent surfaces.
   - Rationale: user no longer wants investment in plugin AI/agent features because SiYuan official agent is expected.
   - Alternative rejected: extract AI sidecar state at the same time; that mixes priorities and expands scope.

4. Preserve `useReviewSession` as the session Interface.
   - Rationale: this change thins the view around the session, not the session internals.
   - Alternative rejected: refactor session cursor/transaction behavior here; that would cross a different seam.

## Risks / Trade-offs

- Risk: reactive refs lose update timing when moved. Mitigation: write focused runtime tests and one or two Review View smoke tests.
- Risk: extracted module becomes a pass-through. Mitigation: move state, command, and computed projection together.
- Risk: accidental AI/Semantic/NeuralRoam edits. Mitigation: scope grep before final diff and document excluded paths.
