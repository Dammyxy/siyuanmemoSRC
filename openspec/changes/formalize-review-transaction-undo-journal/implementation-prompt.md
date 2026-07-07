# Implementation Prompt

请在 active worktree 执行：

`H:\project-F\flashcard\.worktrees\siyuan-plugin-siyuanmemo\kernel-companion-p0`

不要动 baseline mirror：

`H:\project-F\flashcard\siyuan-plugin-siyuanmemo`

不要碰 / stage：

`examples/`

请使用技能：

- `$siyuanmemo-plugin-dev`
- `$diagnose`
- `$improve-codebase-architecture`
- `$openspec-apply-change`
- 若开始写代码，再用 `$tdd`

目标 change：

`formalize-review-transaction-undo-journal`

先跑：

```powershell
git status --short --branch
openspec status --change "formalize-review-transaction-undo-journal" --json
openspec instructions apply --change "formalize-review-transaction-undo-journal" --json
```

## 全局架构判断

这不是局部 UI go-back 修复。请从全局 SRS 架构角度做，允许大重构，但必须让外部 Interface 更小、更深：

```text
SrsReviewKernel
  startSession / current / answer / skip / undo / lookahead / counters / diagnostics
```

内部可以重构成更深的 `ReviewTransactionRuntime` 或等价 Module，隐藏：

- scheduler state application
- Review Ledger append/reuse
- Card Schedule Store commit/restore
- Review Transaction Undo Journal
- SessionQueueIndex frontier
- projection invalidation/rebuild
- replay/audit diagnostics

不要让 renderer cursor、BrowserProjectionIndex、SQLite delta、Domain Sync repair 变成 answer/undo authority。

## Anki 参考目标

先读本地 Anki：

- `H:\project-F\flashcard\anki\rslib\src\scheduler\answering\mod.rs`
- `H:\project-F\flashcard\anki\rslib\src\scheduler\answering\revlog.rs`
- `H:\project-F\flashcard\anki\rslib\src\scheduler\queue\undo.rs`
- `H:\project-F\flashcard\anki\rslib\src\collection\transact.rs`
- `H:\project-F\flashcard\anki\rslib\src\revlog\undo.rs`

要吸收的是形状，不是照搬：

```text
answer_card
  -> transaction
  -> card state mutation
  -> revlog append
  -> queue update
  -> undo evidence
```

SiYuanMemo 对应目标：

```text
SrsReviewKernel.answer
  -> one durable Review transaction envelope
  -> Review Ledger fact
  -> Card Schedule Store after-state
  -> Review Transaction Undo Journal before/after evidence
  -> SessionQueueIndex advance
  -> derived projection invalidation/rebuild evidence

SrsReviewKernel.undo
  -> read undo journal evidence
  -> restore Card Schedule Store before-state
  -> append/mark Review Ledger reversal evidence
  -> restore SessionQueueIndex frontier
  -> invalidate/rebuild derived projections
```

## 关键约束

- 不要物理删除 review history 作为默认 undo；用 reversal/supersession evidence。
- undo evidence 缺失时 fail closed，不准用 renderer ReviewHistory 假装成功。
- worker-backed RetrievalPractice / IncrementalLearning 先做；非-worker queue 本地 undo 暂时显式隔离。
- 不要混入 native SQLite/WAL、host bridge cache、manual/right-click queue membership 修复。
- 如果实现发现当前 Module 太浅，可以重构，但每刀要有测试证明。

## 推荐执行顺序

1. 先写 failing tests：
   - restart 后 worker undo 仍可恢复 schedule/frontier。
   - worker undo evidence 缺失时 renderer fallback 不得恢复。
   - undo 后 ledger/schedule/projection counts 一致。
2. 再加 Review Transaction Undo Journal storage contract。
3. 再把 `SrsReviewKernel.answer()` 写入 undo evidence。
4. 再实现 `SrsReviewKernel.undo()` durable reversal。
5. 最后清理 renderer go-back adapter fallback。

## 验证

至少跑：

```powershell
pnpm exec vitest run worker/review/__tests__/SrsReviewKernel.test.ts worker/review/__tests__/WorkerReviewSessionRuntime.test.ts --pool=forks --maxWorkers=1 --minWorkers=1
pnpm exec vitest run worker/bootstrap/rpc/BackendReviewRpcAdapter.test.ts packages/contracts/src/__tests__/backend-rpc.test.ts --pool=forks --maxWorkers=1 --minWorkers=1
pnpm run check:boundaries
pnpm build
openspec validate formalize-review-transaction-undo-journal --strict
git diff --check
git status --short --branch
```

完成后汇报：

- 哪些 Review answer / undo authority debt 已退休
- 哪些非-worker/local undo debt 暂缓
- 是否仍需要用户提供“复习后重启回 42”的新日志
