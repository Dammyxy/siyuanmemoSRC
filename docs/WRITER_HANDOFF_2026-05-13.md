# SiYuanMemo Writer Strategy Handoff - 2026-05-13

## Purpose

This handoff is for a new conversation about SiYuanMemo writer ownership, writer lease stability, and cross-end strategy.

Use this with:

- `siyuanmemo-plugin-dev`
- `diagnose` if starting from the stuck-review bug
- `openspec-explore` if discussing strategy only
- `grill-with-docs` if changing ADR / ownership docs

Active worktree:

```text
H:/project-F/flashcard/.worktrees/siyuan-plugin-siyuanmemo/kernel-companion-p0
```

Current branch:

```text
externalize-srs-algorithms-and-index-queues
```

Do not edit the baseline mirror at:

```text
H:/project-F/flashcard/siyuan-plugin-siyuanmemo
```

## User Problem

Observed review failure:

```text
BACKEND_UNAVAILABLE: writer takeCommand unavailable: current instance is not active writer
BACKEND_UNAVAILABLE: writer command unavailable: no active writer lease
NEURAL_ROAM_ADVANCE_UNAVAILABLE: writer-unavailable
```

Visible behavior: Review page stays open, user grades/nexts a NeuralRoam card, then "next card" gets stuck loading for a long time.

Important log pattern:

- `FrontendInstanceRuntime mode changed writer -> follower`
- `relay polling lost writer lease`
- `leaseHolder: null`
- `KernelTransactionActionPump polling failed`
- `UnifiedQueueStrategy Failed to process feedback`
- `ReviewSessionController slow review grade phase durationMs: 1482374`

Root issue to discuss: writer lease can temporarily have no active holder while visible review surface still needs to commit. Follower relay then has nowhere to send mutation commands.

## Current Implementation Shape

Current architecture is not "kernel is writer".

```text
kernel companion
  owns: lease, command queue, result queue, broadcast wakeups, private facade
  does not own: siyuanmemo.db, scheduler writes, Riff writes, review commit business state

frontend runtime instance
  owns: actual active writer mutation execution when it holds lease
  mode: writer | follower

backend worker
  owns: SQL transaction execution once called by active writer path
```

Reference docs:

- `docs/ADR-003-kernel-sidecar-coordinator.md`
- `ARCHITECTURE.md`, sections around `kernel.js`, `Phase 4`, and writer relay
- `docs/KERNEL_PLUGIN_SYSTEM_RESEARCH.md`

Key source files:

- `src/kernel.ts`
- `src/application/clients/FrontendInstanceRuntime.ts`
- `src/application/clients/FollowerCommandClient.ts`
- `src/application/clients/KernelSidecarClient.ts`
- `src/infrastructure/siyuan/SiyuanKernelCompanionAdapter.ts`
- `src/application/ApplicationContext.ts`
- `src/application/services/UnifiedDataSourceManager.ts`
- `packages/contracts/src/kernel-rpc.ts`

## Changes Already Made In This Session

### 1. Stuck NeuralRoam Feedback Mitigation

`UnifiedDataSourceManager.neuralRoamAdvance()` now calls `runtime.ensureWritable()` before using follower relay when local runtime mode says follower.

Behavior:

- If stale follower can reacquire writer, it executes backend `neural-roam.advance` directly.
- If another writer still owns lease, it keeps follower relay / explicit unavailable.
- No local queue fallback was added.

Files:

- `src/application/services/UnifiedDataSourceManager.ts`
- `src/application/services/__tests__/UnifiedDataSourceManager.queue-projection-rollout.test.ts`

Validation already run:

```text
pnpm exec vitest run src/application/services/__tests__/UnifiedDataSourceManager.queue-projection-rollout.test.ts
node scripts/check-hidden-fallbacks.cjs
pnpm run check:boundaries
pnpm build
```

### 2. Backend Plugin Sample Alignment

Kernel companion source/build was aligned with the official backend-plugin sample:

- moved root `kernel.js` source into `src/kernel.ts`
- added `/// <reference types="siyuan/kernel" />`
- upgraded `siyuan` dev dependency to `1.2.2-alpha.0`
- added sample-style webpack kernel build via `webpack.kernel.config.cjs`
- package still emits `dist/kernel.js`
- `plugin.json` now has `minAppVersion: 3.6.4`
- `plugin.json.kernels` now covers `windows/linux/darwin/ios/android/harmony/docker/all`

Files:

- `src/kernel.ts`
- `webpack.kernel.config.cjs`
- `package.json`
- `plugin.json`
- `vite.config.ts`
- `scripts/check-no-kernel-db-owner.cjs`
- `docs/KERNEL_PLUGIN_SYSTEM_RESEARCH.md`
- `ARCHITECTURE.md`
- `docs/DDD_RESCAN_BACKLOG.md`

## Current Dirty Diff Context

There are intentional uncommitted changes from this session:

- writer stale-follower fix and tests
- kernel source/build migration
- docs/backlog updates
- deletion of root `kernel.js`

Before changing writer strategy, inspect current status:

```text
git status --short -uall
```

Expected notable entries:

```text
D  kernel.js
?? src/kernel.ts
?? webpack.kernel.config.cjs
M  package.json
M  plugin.json
M  vite.config.ts
M  src/application/services/UnifiedDataSourceManager.ts
M  src/application/services/__tests__/UnifiedDataSourceManager.queue-projection-rollout.test.ts
M  docs/DDD_RESCAN_BACKLOG.md
M  docs/KERNEL_PLUGIN_SYSTEM_RESEARCH.md
M  ARCHITECTURE.md
```

## Known Writer Model Details

Kernel side:

- `writer.hello`
- `writer.getLease`
- `writer.acquireLease`
- `writer.renewLease`
- `writer.releaseLease`
- `writer.submitCommand`
- `writer.takeCommand`
- `writer.completeCommand`
- `writer.failCommand`
- `writer.getCommandResult`
- broadcasts:
  - `memo.writer.leaseChanged`
  - `memo.writer.command`
  - `memo.writer.commandResult`

Lease scoring in `src/kernel.ts` currently favors:

```text
primary-app > document-window > auxiliary > unknown
```

Visible normal app surfaces can reclaim from lower-priority, hidden, stale, auxiliary, or expired owners. Focus is diagnostic, not ordinary ownership authority.

`FrontendInstanceRuntime` has stable:

- `instanceId`
- `runtimeScopeId`
- `surfaceId` in lease payload

This matters for mapping console logs back to a real window.

## Discussion Threads For Next Session

### Thread A - Stable Main Window Writer

User question: how to identify and bind the main SiYuan app window as writer?

Current likely signal:

```text
locationHref includes /stage/build/app
and does not include /window.html
and does not look like QuickNote/enhance auxiliary surface
```

Open question: is this stable across desktop versions, mobile, docker browser UI, and future SiYuan shell changes?

Possible direction:

- Keep current role detection but make `primary-app` winner more explicit.
- Add diagnostics UI/status showing current owner role, `runtimeScopeId`, `locationHref`, `visibilityState`.
- Add manual "pin this window as writer" later, not as first-line default.

### Thread B - Unique Kernel As Writer

User suggested: "窗口那么多，我直接绑定唯一内核为 writer 怎么样".

Current ADR says no:

```text
kernel.js does not write siyuanmemo.db
kernel capabilities writesSiyuanMemoDb: false
```

Pros if kernel becomes writer:

- no frontend window election
- mobile/docker/frontends can all call one backend authority
- review commit no longer depends on a visible writer window

Cons / blockers:

- kernel would need DB ownership, file persistence, transaction serialization, migration policy
- browser worker/application write contracts would need relocation
- sql.js / binary DB writes in goja/kernel runtime need proof
- Riff / scheduler / queue projection / private API ownership all change
- bigger rollback risk than lease stabilization

Likely safe conclusion: do not jump to kernel as unique writer until there is an OpenSpec/ADR for full SQL ownership migration.

### Thread C - Cross-End Strategy

Now manifest declares:

```text
windows/linux/darwin/ios/android/harmony/docker/all
```

That only means backend plugin can load where supported. It does not mean cross-end writer strategy is solved.

Need decide separately:

- desktop multi-window
- Android frontend + same kernel
- Docker/web UI frontend + same kernel
- multiple devices with sync, where each device has its own kernel process

Important distinction:

```text
same kernel process: one lease authority can coordinate windows
different device/kernel process: no shared in-memory lease; sync conflict policy needed
```

### Thread D - Better Failure UX

Current fix reduces stale follower case, but if no writer can be acquired the review action still errors.

Possible next small task:

- map writer-unavailable to an explicit Review banner/retry/reopen hint
- avoid infinite loading perception
- include owner diagnostics in error text/log

Do this without changing queue semantics or adding local fallback.

## Suggested Next Conversation Prompt

```text
Use siyuanmemo-plugin-dev and openspec-explore. Read docs/WRITER_HANDOFF_2026-05-13.md first.
I want to decide SiYuanMemo writer strategy: stable main-window writer vs manual pinned writer vs unique kernel writer.
Do not implement yet. Map current runtime, risks, and recommend a staged strategy for desktop, Android, and Docker.
```

## Guardrails

- Do not add hidden fallback local writes when writer unavailable.
- Do not let follower write backend projection or review feedback locally.
- Do not let kernel write `siyuanmemo.db` unless a full ownership migration ADR/spec exists.
- Keep UI/application direct access to kernel RPC forbidden; use `KernelCompanionPort` / `KernelSidecarClient`.
- If implementation starts later, update `docs/DDD_RESCAN_BACKLOG.md` and `ARCHITECTURE.md`.

