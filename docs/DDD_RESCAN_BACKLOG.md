# DDD Re-Scan Backlog

Last update: 2026-03-11 (Round 33)

## 0. Task Deltas (newest first)

Use this section for task-level debt tracking when a task touches production code under `src/`.
Do not add an entry for skill-only or docs-only work.

### 2026-03-11 - neural history selected-frame override alignment

- Task: Fix the roam-history selected row so it no longer looks dimmer than Wake due to its own timeline-specific selected-style override.
- Touched slice: Browser neural history styling in `src/ui/browser/SRSBrowser.scss`.
- Debt fixed now: Removed the split visual treatment where history selection bypassed the shared selected-frame overlay and instead used a softer local background/shadow combination, which made the same selected state read inconsistently.
- Debt deferred: Selected styling is still managed by adjacent CSS rules instead of one shared reusable neural selected-frame primitive.
- Why deferred: The concrete problem was one history-specific override; consolidating all selected-state styling would be a broader stylesheet refactor.
- Next safe step: If more selection visuals drift, extract one reusable browser-side neural selected-frame pattern and make history/source/anchor all consume it.
- Validation: `pnpm build`.

### 2026-03-11 - neural list selected-frame contrast alignment

- Task: Tune browser-side neural selected rows so their blue frame matches the Wake selected-step brightness instead of staying slightly dimmer.
- Touched slice: Browser neural list styling in `src/ui/browser/SRSBrowser.scss`.
- Debt fixed now: Removed the remaining contrast gap between Wake selected cards and selected rows in history/source/anchor lists, so one selected-state model now reads with one consistent emphasis level.
- Debt deferred: The browser still uses separate selectors for timeline rows and generic neural list rows rather than one shared selected-state token block.
- Why deferred: This task is a bounded contrast adjustment; collapsing the selectors further would be style architecture work beyond the immediate visual bug.
- Next safe step: If more neural list variants appear, extract one shared selected-frame mixin/token set for all browser-side neural cards.
- Validation: `pnpm build`.

### 2026-03-11 - neural selection blue-frame parity for browser lists

- Task: Make selected neural history/source/anchor rows render a clearly visible blue frame comparable to the Wake selected-step card instead of only a subtle tint or timeline-dot change.
- Touched slice: Browser neural list styling in `src/ui/browser/SRSBrowser.scss`.
- Debt fixed now: Removed the visual mismatch where Wake had a strong selected frame but browser-side neural lists only showed low-contrast selection hints, which made the newly wired selection state look broken in real use.
- Debt deferred: Selected-row styling is still implemented by shared browser CSS selectors rather than a dedicated reusable neural selection token set.
- Why deferred: The bounded issue here is purely visual parity; extracting a fuller token system would broaden the task from a concrete UX fix into style architecture work.
- Next safe step: If neural browser visuals keep evolving, extract one shared selected-state token/mixin for history, source, anchor, and wake cards so contrast and shadow tuning stay aligned.
- Validation: `pnpm build`.

### 2026-03-11 - neural wake selected-node propagation across source and anchor surfaces

- Task: Make orbit centers, activation sources, worldline stations, and node-directed neural navigation actions push their selected node into the Wake selection state so the corresponding wake step gets the same blue selected frame.
- Touched slice: Browser neural roam UI in `src/ui/browser/SRSBrowser.vue`, `src/ui/browser/neural/{NeuralFocusList,NeuralAnchorList}.vue`, related browser neural styles, and targeted neural list tests.
- Debt fixed now: Removed the stale ownership split where only history or wake step selection updated the trace `isSelected` state, and deduped wake selection recomputation into one parent helper instead of scattering ad hoc event/node assignments.
- Debt deferred: History rows and source/anchor rows still do not share one unified cross-subview selection model; hidden subviews can retain their prior selected row semantics until the user reopens them.
- Why deferred: Solving the visible wake-highlight bug only requires parent-side trace selection propagation, while a full browser-wide selection model would broaden the slice into history selection persistence and subview state ownership.
- Next safe step: If cross-subview selection consistency becomes more important, extract one browser-level neural selection store that drives history, wake, source, and anchor selection from the same explicit mode (`event` vs `node`).
- Validation: Targeted `vitest` for `NeuralFocusList` and `NeuralAnchorList`, plus `pnpm build`.

### 2026-03-11 - browser explicit tab entry and split-screen tab workspace redesign

- Task: Restore an explicit browser-as-tab entry, let dialog browser sessions convert into stateful browser tabs, and make the browser tab layout usable in split-screen neural roam workflows without changing the default dialog-first entry path.
- Touched slice: Browser/dialog/menu/tab-manager UI slice in `src/ui/browser/SRSBrowser.vue`, `src/ui/browser/BrowserToolbar.vue`, `src/ui/browser/layoutProfile.ts`, `src/ui/browser/SRSBrowser.scss`, `src/application/managers/{TabManager,DialogManager,MenuManager}.ts`, plus i18n and targeted tests.
- Debt fixed now: Removed the hidden browser tab conversion path, separated tab layout preferences from dialog state, stopped coupling tab and dock layout rules, and introduced a serializable browser open-state handoff so dialog-to-tab conversion preserves the active neural/browser context.
- Debt deferred: There is still no full mounted `SRSBrowser` integration spec that drives dialog conversion, resize profile changes, and neural handoff across a real SiYuan surface lifecycle.
- Why deferred: The bounded value of this task is in the active browser surface slice, while a realistic multi-surface harness would be much heavier and more brittle than the targeted helper/component coverage added here.
- Next safe step: If the browser tab workspace keeps evolving, extract one dedicated browser-surface state hydrator from `SRSBrowser.vue` and add a narrow integration test around dialog-to-tab restoration plus layout-profile switching.
- Validation: Targeted `vitest` for tab manager, dialog manager, menu manager, browser toolbar, and tab layout helpers, plus `pnpm build`.

### 2026-03-11 - browser neural jump handoff to existing review tab

- Task: Make browser-side neural roam jumps reuse an already open neural review tab instead of always reopening the dialog, while keeping dialog fallback when no tab exists.
- Touched slice: Browser/review/tab-manager handoff in `src/ui/browser/SRSBrowser.vue`, `src/ui/browser/neural/reviewSurfaceHandoff.ts`, `src/ui/review/v2/ReviewView.vue`, `src/application/managers/TabManager.ts`, plus i18n and targeted tests.
- Debt fixed now: Removed the hard-wired browser `openNeuralRoamDialog()` reopen path for neural jump actions, added an explicit review-tab runtime bridge instead of implicit queue-state coupling, and localized the review-surface routing policy into a browser helper so future tab/dialog behavior changes stay in one slice.
- Debt deferred: There is still no full browser integration spec that mounts `SRSBrowser` and asserts end-to-end handoff across a real SiYuan custom-tab lifecycle.
- Why deferred: The active test stack has good unit seams around the new manager/helper bridge, but a realistic `SRSBrowser` plus SiYuan tab runtime harness would be substantially heavier and more brittle than the bounded value of this task.
- Next safe step: If this handoff evolves further, extract one browser-side neural navigation action helper from `SRSBrowser.vue` and add a focused slice test around jump/focus/fallback orchestration.
- Validation: Targeted `vitest` for the tab-manager neural sync path, the review-tab bridge, and the browser review-surface handoff helper, plus `pnpm build`.

### 2026-03-11 - wake convergence render split and lazy detail loading

- Task: Reduce Wake open-time jank by moving repeated-node convergence work off the first render path and resolving non-target route details only when the user selects or expands a step.
- Touched slice: Browser neural trace UI in `src/ui/browser/SRSBrowser.vue`, `src/ui/browser/neural/traceAggregation.ts`, `src/ui/browser/neural/NeuralActivationTracePanel.vue`, plus neural trace types, i18n, and targeted tests.
- Debt fixed now: Replaced the eager `step × history` convergence pass with a history index plus single-step resolver, removed duplicate trace-step selection work on panel preview/jump, and added explicit idle/loading/ready state so the UI no longer assumes every repeated step is fully materialized up front.
- Debt deferred: There is still no explicit perf telemetry or browser-slice integration test that asserts `getActivationTrace()` call counts across a full Wake open cycle.
- Why deferred: The active repo already lacks focused `SRSBrowser` neural trace integration coverage, and adding timing-sensitive assertions inside the Vue SFC test surface would add more brittleness than signal for this bounded task.
- Next safe step: If Wake still feels heavy in larger sessions, add one focused browser-slice helper extraction around trace hydration so call-count and cache invalidation behavior can be unit-tested directly.
- Validation: Targeted `vitest` for neural trace aggregation and Wake panel behavior, plus `pnpm build`.

### 2026-03-11 - wake convergence semantics for repeated node activations

- Task: Keep neural history event-first, then teach Wake to recognize repeated hits versus multi-route convergence when different paths activate the same node in one session.
- Touched slice: Browser neural trace UI in `src/ui/browser/SRSBrowser.vue`, `src/ui/browser/neural/traceAggregation.ts`, `src/ui/browser/neural/NeuralActivationTracePanel.vue`, `src/ui/browser/neural/NeuralHistoryList.vue`, plus neural trace i18n and targeted tests.
- Debt fixed now: Removed the ambiguity where duplicated history rows for the same node looked like a wake bug by surfacing repeat-hit counts in history and route convergence details in Wake without changing the core single-event trace contract.
- Debt deferred: Wake still renders only a primary route plus expandable alternates; there is still no full merged DAG view and no cross-session convergence merge.
- Why deferred: Expanding the domain trace contract to multi-parent graph semantics would cut across queue persistence, engine logic, and browser rendering, which is outside the safe boundary for this task.
- Next safe step: If the convergence model proves useful, add one focused visual iteration on alternate-route readability and decide whether a separate graph-only inspector is worth introducing later.
- Validation: Targeted `vitest` for neural trace aggregation, wake panel, history list, and neural-roam i18n labels, plus `pnpm build`.

### 2026-03-11 - wake trace semantic root and inferred badge cleanup

- Task: Fix Wake / 航迹 summary semantics so hyperspace traces show 当前 / 直接传导节点 / 主激活源, and stop synthetic trace steps from overwriting role labels with a generic root tag.
- Touched slice: Browser neural trace UI in `src/ui/browser/SRSBrowser.vue`, `src/ui/browser/neural/NeuralActivationTracePanel.vue`, `src/ui/browser/neural/types.ts`, plus neural trace i18n and targeted tests.
- Debt fixed now: Removed positional `steps[0]` root guessing in wake summaries and replaced synthetic-root badge clobbering with role-preserving badges plus a weaker inferred marker.
- Debt deferred: Neural roam glossary is still only partially harmonized; other subviews and settings surfaces still carry older conductor/root wording outside the wake panel.
- Why deferred: This task is intentionally bounded to wake trace semantics so the browser slice changes stay low-risk and do not trigger a wider terminology sweep across unrelated surfaces.
- Next safe step: If the wake wording lands well in real use, do one focused glossary pass across source lists, history labels, and settings copy to align the rest of neural roam.
- Validation: Targeted `vitest` for wake panel and neural-roam i18n labels, plus `pnpm build`.

### 2026-03-11 - neural roam switch dedupe and path arrow alignment

- Task: Fix repeated neural roam path nodes after switching back into orbit and move the roam-path background arrow left into the path center.
- Touched slice: Queue/browser slice in `src/core/queue/domain/NeuralRoamQueue.ts`, `src/core/queue/domain/__tests__/NeuralRoamQueue.test.ts`, and `src/ui/browser/SRSBrowser.scss`.
- Debt fixed now: Removed another asymmetric engine-switch bridge bug by adding orbit-side carry-target reuse instead of always replaying `setCurrentFocus`, and replaced fragile percentage-only arrow positioning with bounded left offsets.
- Debt deferred: Visual tuning still relies on manual acceptance rather than automated layout assertions; neural roam path presentation still has no screenshot-style regression coverage.
- Why deferred: The current test stack is good for queue state and weak for pixel-accurate CSS, so adding brittle DOM-style assertions would create more maintenance cost than signal.
- Next safe step: If the arrow still feels off in real usage, do one focused visual pass on the roam-path pane and capture a stable screenshot-based acceptance workflow outside unit tests.
- Validation: Targeted `vitest` for `NeuralRoamQueue.test.ts`, plus `pnpm build` and `pnpm diagnostics`.

### Entry template

### YYYY-MM-DD - <short task name>

- Task: <user request or short internal summary>
- Touched slice: <bounded context and key files>
- Debt fixed now: <local debt removed in this task>
- Debt deferred: <high-risk or out-of-scope debt left for later>
- Why deferred: <reason it was not safe or reasonable now>
- Next safe step: <smallest safe follow-up>
- Validation: <build, diagnostics, targeted tests, or manual checks>

## 1. Re-scan summary

- Build verification: `pnpm build` passed.
- Code-only non-test scan (`*.ts/*.vue`, excluding tests):
  - `Result<any>` / `as any`: `0`
  - `getAllItems(` runtime usage: `0`
- Active-path fallback/degrade re-scan:
  - Browser/review/session/scheduler targeted fallback branches: cleared in this round.

## 2. Round 33 completed

- Browser single-path convergence (removed legacy TabManager fallback):
  - `src/ui/browser/SRSBrowser.vue`
  - `src/application/managers/DialogManager.ts`
  - `src/ui/browser/composables/useGridInteractions.ts`
- Scheduler strictness (removed silent fallback semantics):
  - `src/core/scheduler/SchedulerRouter.ts`
  - `src/core/scheduler/index.ts`
- Queue/neural degrade-branch removal:
  - `src/core/queue/sequencers/PrioritySequencer.ts` (drop legacy debug id fallback fields)
  - `src/core/queue/neural/HistoryFilter.ts` (remove filter failure degrade return path)
  - `src/core/queue/neural/WeightedWalkEngine.ts` (replace unreachable fallback return with explicit invariant error)
- Browser migration TODO/fallback wording cleanup:
  - `src/ui/browser/browserService.ts`
- Previously identified debt points verified cleared:
  - `src/application/handlers/AutoCardHandler.ts` (no fallback/degrade keywords)
  - `src/application/usecases/xiuyuan/*` (`Result<any>` = 0)
  - `src/ui/browser/*` (`as any` = 0)

## 3. Remaining non-DDD / debt focus (latest)

| Priority | Issue | Typical Locations | Suggested Action |
|---|---|---|---|
| P1 | Mojibake/encoding debt in long-lived docs and some comments | `ARCHITECTURE.md`, selected large Vue/TS files with historical garbled comments | Run dedicated UTF-8 restoration pass (content-preserving) |
| P1 | Legacy compatibility service surface still exists but no longer used on active browser path | `ApplicationContext` (`tabManager` service exposure) | Evaluate bounded removal/retire plan and adjust integration tests |
| P2 | Repeated local i18n helper patterns (`t(key, fallback)`) | UI components in browser/review | Optional dedupe via shared translator utility (low risk, non-functional) |

## 4. Next convergence batch

1. Execute UTF-8 restoration pass for architecture and core active docs.
2. Shrink `ApplicationContext` compatibility surface where active callers are already migrated.
3. Do low-risk i18n helper dedupe in browser/review slices.
