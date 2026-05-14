# Runtime Smoke Closure - 2026-05-14

OpenSpec change: `close-runtime-smoke-and-archive-stale-changes`
Product worktree: `H:/project-F/flashcard/.worktrees/siyuan-plugin-siyuanmemo/kernel-companion-p0`
Production code changes: none

## Environment

- Active runtime worktree status before closure: existing production diff from prior `surface-learning-curve-evidence` work was present and was not edited by this closure pass.
- Current worktree branch reported by `git branch --show-current`: `externalize-srs-algorithms-and-index-queues`.
- Plugin build path: `H:/SiYuanXY/data/plugins/siyuan-plugin-siyuanmemo`.
- Deployed plugin bundle observed:
  - `index.js`: 2026-05-14 13:28:09, 6,592,632 bytes.
  - `index.css`: 2026-05-14 13:28:09.
  - `kernel.js`: 2026-05-13 23:47:24.
  - `plugin.json`: version `0.2.1`, backends/kernels/frontends include `all`.
- SiYuan API port check: `127.0.0.1:6806` was reachable.
- CDP port check: `127.0.0.1:9222` was not reachable.
- `node scripts/siyuan-plugin-state.cjs status` failed with `fetch failed`, consistent with missing CDP renderer access.

## Privacy Guard

Evidence in this report omits tokens, secrets, document body, kramdown, markdown, prompts, answers, card content, and raw block ids. Automated test output that includes synthetic ids is test-only and not live user content.

## Browser Backend-Migration Closure

Live Browser UI smoke could not be run because CDP on `127.0.0.1:9222` was unavailable. The deferred live checks are recorded as environment-blocked until SiYuan is launched with a reachable debug target.

Automated closure evidence:

```powershell
node scripts\backend-migration-performance-smoke.cjs 1
```

Result: passed.

Summary:

| Suite | Legacy-like | Backend+writer | Delta |
| --- | ---: | ---: | ---: |
| Browser deck query | 11189.28 ms | 8266.21 ms | -26.12% |
| Review commit use case | 5589.62 ms | 6174.66 ms | +10.47% |
| AI prompt runtime | 4910.75 ms | 5722.25 ms | +16.52% |

Focused Browser/action evidence:

```powershell
pnpm vitest run src/ui/browser/datasource/__tests__/DataSourceUtils.batch-actions.test.ts src/ui/browser/composables/__tests__/useCardActions.test.ts src/application/services/__tests__/CardEditorApplicationService.test.ts src/application/services/__tests__/BrowserApplicationService.deck-query.test.ts src/application/services/__tests__/BrowserApplicationService.queue-query.test.ts --reporter=dot
```

Result: 5 files, 35 tests passed.

Closure decision: `retire-ui-legacy-backend-migration-interfaces` task 6.7 is closed by automated evidence plus explicit CDP blocker for live UI click smoke. No production fallback or UI SQL path was reintroduced.

## Kernel Runtime Closure

Live two-window writer/follower relay smoke could not be run because CDP on `127.0.0.1:9222` was unavailable, so two renderer windows could not be controlled or inspected safely.

Live AI streaming smoke could not be run because a safe configured provider/streaming test target was not available in this closure pass, and CDP was unavailable for UI observation.

Focused kernel/AI evidence:

```powershell
pnpm vitest run src/application/clients/__tests__/FrontendInstanceRuntime.test.ts src/application/clients/__tests__/FollowerCommandClient.test.ts src/application/clients/__tests__/KernelSidecarClient.test.ts src/application/services/__tests__/AIWorkbenchPromptRuntime.test.ts src/application/services/__tests__/AIBackendSessionService.test.ts --reporter=dot
```

Result: 5 files, 72 tests passed.

Covered non-live behaviors include push command wake-up, duplicate command/result handling, reconnect drain, push unavailable watchdog behavior, follower relay timeout/unavailable propagation, kernel sidecar unavailable envelopes, AI backend unavailable propagation, and prompt runtime backend mode.

Closure decision: `kernel-performance-fast-paths` tasks 6.5 and 6.6 are closed with explicit live-environment blockers plus focused automated evidence. Any live regression found later should become a separate focused OpenSpec change.

## Low-End Editor Diagnostic Closure

Live editor matrix rows could not be rerun because CDP on `127.0.0.1:9222` was unavailable. VM rows could not be run because 2 core / 4GB and 2 core / 8GB VM profiles were not available in this environment.

Smoke utility evidence:

```powershell
pnpm vitest run scripts/__tests__/live-low-end-editor-smoke-utils.test.ts --reporter=dot
```

Result: 1 file, 7 tests passed.

Existing dated evidence remains the source of recorded plugin-off/plugin-on 6x rows:

- `docs/performance/live-low-end-editor-idle-jank-diagnostic-2026-05-07.md`
- `docs/performance/branch-ab-startup-editor-jank-report-2026-05-08.md`

Closure decision: remaining `diagnose-low-end-editor-idle-jank` matrix/report tasks are closed as explicit environment blockers plus existing dated evidence. The prior follow-up `stabilize-editor-writer-lease-and-empty-poll-jank` remains the correct focused fix lineage; no new production change is justified by this closure pass.

## Archive Readiness

Validated during closure:

- `retire-ui-legacy-backend-migration-interfaces`: strict validation passed after task closure.
- `kernel-performance-fast-paths`: strict validation passed after task closure.
- `diagnose-low-end-editor-idle-jank`: strict validation passed after task closure.

Archive-ready after this pass:

- `retire-ui-legacy-backend-migration-interfaces`
- `kernel-performance-fast-paths`
- `diagnose-low-end-editor-idle-jank`

Not archived in this pass because the user asked to apply the closure change, not archive stale changes.
