# DDD Re-Scan Backlog

Last update: 2026-02-26 (Round 33)

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
