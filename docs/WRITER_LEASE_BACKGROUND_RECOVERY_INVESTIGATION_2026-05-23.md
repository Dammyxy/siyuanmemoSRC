# Writer Lease 后台恢复问题调查报告

日期：2026-05-23  
范围：SiYuanMemo kernel companion writer lease、writer relay、Review feedback、Kernel transaction action pump  
状态：代码级调查完成；`stabilize-desktop-primary-writer-lease` 已实现单元/集成级修复，尚未做长时间后台 live repro

## 1. 用户现象

思源放后台较久后，插件持续刷类似日志：

```text
[SiYuanMemo][FrontendInstanceRuntime] writer lease renew failed
reason: heartbeat
leaseHolder: null

[SiYuanMemo][KernelTransactionActionPump] Kernel transaction action polling failed
message: BACKEND_UNAVAILABLE: writer command unavailable: no active writer lease
```

随后复习卡片失败或卡在下一张。用户直觉是“后台内核 worker 掉了没抢回来”。

## 2. 当前运行模型

当前架构不是“kernel 是 writer”：

```text
kernel companion
  owns: writer lease, relay queue, relay result, broadcast wakeup
  does not own: siyuanmemo.db, scheduler writes, review feedback writes

frontend runtime
  owns: actual writer execution while holding writer lease
  mode: writer | follower

backend worker
  owns: SQL transaction execution after active writer calls it
```

所以关键不是 kernel worker 是否直接写 DB，而是：是否有一个 frontend runtime 成功持有 writer lease，并能调用 backend worker 执行 mutation。

## 3. 代码证据

### 3.1 lease 会被后台 timer throttling 间接清空

`src/kernel.ts`：

- `getActiveLease()` 发现 lease 过期后把 `writerLease` 清为 `null`。
- `writerRenewLease()` 在 `activeLease` 为空或 owner 不匹配时返回：
  `BACKEND_UNAVAILABLE: writer lease unavailable for renew; acquire lease first`
- `writerSubmitCommand()` 在 `activeLease` 为空时返回：
  `BACKEND_UNAVAILABLE: writer command unavailable: no active writer lease`

这能解释用户日志里的 `leaseHolder: null` 和后续 `no active writer lease`。

### 3.2 前端 hidden 状态下不会恢复 empty lease gap（修复前）

`src/application/clients/FrontendInstanceRuntime.ts`：

- writer heartbeat 走 `refreshOwnership('heartbeat') -> renewCurrentWriterLease('heartbeat')`。
- renew 失败后会 `writer.getLease()` 观察当前 lease。
- 观察到空 lease 时，本来有 `shouldRecoverEmptyPrimaryWriterLeaseGap()` 保护性恢复。
- 但该函数当前条件包含 `isDocumentHidden()`，hidden 时直接返回 `false`。

也就是说：后台期间 lease 过期后，canonical primary app 即使原来是 writer，也不会在 hidden 状态抢回空 lease。

### 3.3 kernel 也拒绝 hidden requester 抢空 lease（修复前）

`src/kernel.ts` 的 `writerAcquireLease()`：

- 如果没有 active lease 且 requester hidden，返回：
  `writer lease requester is hidden; foreground runtime required`

所以修复不能只改前端一行。若决定允许 hidden canonical writer 恢复，kernel 策略也要同步改。

### 3.4 ActionPump 会在 follower/no-writer 状态刷日志（修复前）

`src/application/handlers/KernelTransactionActionPump.ts`：

- runtime 不是 writer 时，`dequeueActions()` 走 `FollowerCommandClient.submitAndWait(kernel.transaction.dequeue)`。
- 若 kernel 没有 active writer lease，relay submit 失败，日志输出：
  `Kernel transaction action polling failed`
- 当前对这种 no-writer 状态没有专门 backoff，也不会先尝试 `ensureWritable()` 恢复。

这解释了后台久置后反复刷 `KernelTransactionActionPump` warning。

### 3.5 Review commit 在 follower 模式不会先抢回 writer（修复前）

`src/application/usecases/review/ReviewCommitUseCase.ts`：

- `execute()` 开头读取 runtime mode。
- 如果 mode 是 `follower`，后续直接走 follower relay：`submitAndWait(review.feedback)`。
- 只有 mode 是 `writer` 或 unknown writer path 时，才调用 `writerLeaseGuard.ensureWritable()`。

所以如果后台后 runtime 已经从 writer 降到 follower，用户回到复习页提交评分时，Review commit 可能直接 relay 到“空 writer”，而不是先抢回 writer。

## 4. 根因判断

当前最强假设：

```text
后台 timer throttling
  -> writer heartbeat 延迟
  -> kernel lease TTL 过期
  -> writerRenewLease 失败，observe 到 leaseHolder=null
  -> hidden recovery 被 FrontendInstanceRuntime 阻止
  -> runtime 进入 follower/no-writer
  -> ActionPump follower relay 无目标，持续 no active writer lease
  -> Review commit 若仍看到 follower，也走 relay，复习失败
```

这不是典型 backend worker 崩溃。backend worker unhealthy 也可能导致 lease release，但那条路径会有更明确日志：

```text
BACKEND_UNAVAILABLE: backend worker unhealthy: ...
```

用户贴出的日志核心是 lease holder 为空和 writer command unavailable，更符合 writer lease recovery 缺口。

## 5. 可证伪预测

### 假设 A：后台 timer throttling 导致 lease 过期

预测：

- 第一条异常多发生在 `reason: heartbeat`。
- `leaseHolder`、`leaseSurfaceId` 为 `null`。
- 思源回前台后，如果触发 `visibilitychange` 或 `focus`，应看到一次 ownership refresh。
- 若 refresh 没触发或 runtime 已停在 follower，复习提交继续走 relay 并失败。

### 假设 B：backend worker unhealthy 导致主动释放 lease

预测：

- 日志应包含 `backend worker unhealthy`。
- `FrontendInstanceRuntime` 会走 `releaseWriterLeaseForUnhealthyBackend()`。
- `ensureWritable()` 会抛 `BACKEND_UNAVAILABLE: backend worker unhealthy: ...`。

目前用户日志没有这类证据，优先级低于假设 A。

### 假设 C：前台恢复事件没有可靠触发

预测：

- 回到思源后没有 `visibility` ownership refresh 相关日志。
- `getMode()` 仍为 follower。
- Review commit 直接打 follower relay，没有先 `ensureWritable()`。

这可能是复习失败的直接原因，即使 lease 过期本身已发生在更早。

## 6. 修复方向

### 方向 1：前台可见时，follower/no-writer 先恢复 writer

在 follower relay 遇到 `no active writer lease` 前或之后，让 runtime 调用 `ensureWritable()`：

- 当前 runtime 是 visible canonical primary-app，且 observed lease 为空，则 acquire writer lease。
- acquire 成功后，ActionPump 本地执行 `kernel.transaction.dequeue`。
- Review commit 在 follower relay 返回 `no active writer lease` 后尝试 `ensureWritable()`；若抢回 writer，则走本地 backend worker `review.feedback`。
- document-window、auxiliary、hidden、backend unhealthy 继续 fail closed。

优点：

- 修用户最痛的“回前台复习失败”。
- 不让 hidden 后台窗口偷偷复活成 writer。
- 保持单 writer、无本地 fallback、无 kernel 写 DB。

风险：

- 需要调整 ReviewCommitUseCase / KernelTransactionActionPump 的恢复路径测试。
- 多窗口下必须证明 document-window 不会抢 primary-app。

### 方向 2：允许 hidden canonical primary writer 恢复 empty lease gap

改 `FrontendInstanceRuntime.shouldRecoverEmptyPrimaryWriterLeaseGap()` 和 `kernel.writerAcquireLease()` 的 hidden 空 lease guard，让 hidden canonical primary-app 可以抢回自己丢失的空 lease。

优点：

- 后台期间 lease gap 更短，ActionPump warning 更少。
- 和 `ARCHITECTURE.md` 中“canonical primary-app 在 empty lease gap 立即 reacquire”的描述更一致。

风险：

- hidden 窗口继续保持 writer，可能与用户当前可见窗口恢复策略冲突。
- kernel 现有测试明确覆盖“hidden requester when no writer lease exists rejects”，需要重新定义策略。
- 若 backend worker 也被浏览器节流或挂起，hidden reacquire 后仍可能无法执行真实 mutation。

### 方向 3：ActionPump 对 no-writer 状态降噪和 backoff

识别 `writer command unavailable: no active writer lease`：

- 记录一次 writer-unavailable event。
- 进入短 backoff，避免每秒刷 warn。
- 可选：只在状态变化时 warn。

优点：

- 降低日志污染。
- 不改变写入所有权。

风险：

- 只治噪声，不修复复习失败。
- 必须配合方向 1 或方向 2。

### 方向 4：Review UI 给 writer recovery 明确状态和 retry

当 Review commit 收到 writer unavailable：

- 显示“正在恢复写入权限”或类似提示。
- 触发一次 runtime recovery。
- 允许用户重试当前评分，不丢当前卡片状态。

优点：

- 降低“卡死”体感。

风险：

- 只是 UX 补强。底层 writer recovery 仍要修。

## 7. 讨论后已接受策略

讨论后决定把普通桌面端收紧为 **desktop primary-app role 强绑定**，并允许 hidden primary-app 恢复空 writer lease。

策略定义：

```text
desktop/std + Electron primary-app = 唯一桌面 writer 资格
desktop-window / QuickNote / auxiliary = 永远 follower-only
std + browser-desktop = 普通桌面内核下不当 writer
mobile = 维持现状，不走本次桌面 writer 策略
kernel = 继续只管 lease/relay，不写 siyuanmemo.db
```

允许的 hidden recovery 仅限窄条件：

```text
activeLease == null
currentProfile.surfaceRole == primary-app
currentProfile.writerEligibility == canonical
backendWorker healthy
current runtime 原本是 writer，或当前 visible 写动作触发 recovery
```

明确不允许：

- `desktop-window`、QuickNote、auxiliary 抢空 lease。
- 普通桌面内核里的 `browser-desktop` 抢空 lease。
- hidden requester 抢另一个 active primary writer。
- kernel companion 迁移为 DB writer。

实现建议：

1. `FrontendInstanceRuntime`：canonical desktop primary-app 在 heartbeat/relay observe 到 empty lease gap 时保持 writer mode 并 reacquire，即使当前 document hidden。
2. `kernel.ts`：保留 hidden requester 默认拒绝，但为 `writerProfile.surfaceRole=primary-app` 且 `writerEligibility=canonical` 的 empty-lease acquire 开窄口。
3. `ReviewCommitUseCase` / `KernelTransactionActionPump`：如果 runtime 已掉到 follower 且 relay 返回 no active writer，先尝试 primary-app recovery；成功后走本地 writer path，失败则 explicit unavailable，不本地 fallback。
4. ActionPump 对 no active writer lease 加 backoff/降噪，避免后台刷屏。

## 8. 建议回归测试

### FrontendInstanceRuntime

- hidden follower 仍不 acquire。
- visible canonical primary-app observe 到 empty lease 后 acquire。
- document-window observe 到 empty lease 后仍 fail closed。
- backend worker unhealthy 时不 acquire。

### KernelTransactionActionPump

- follower relay 遇到 `no active writer lease` 时调用 runtime recovery。
- recovery 成功后执行 local dequeue。
- recovery 失败时不 local fallback，并进入 writer-unavailable/backoff。

### ReviewCommitUseCase

- follower relay 返回 `no active writer lease` 后尝试 `ensureWritable()`。
- `ensureWritable()` 抢回 writer 后走 local `srsBackend.reviewFeedback()`。
- `ensureWritable()` 仍失败时，继续 explicit unavailable，不写本地 fallback。

### Kernel lease policy

- hidden canonical primary-app 是否允许 acquire empty lease。
- hidden document-window / auxiliary 仍拒绝。
- visible owner 仍受保护，不被 hidden requester 抢占。

## 9. 当前结论

代码链路支持用户现象。最可能根因是：

```text
后台心跳被节流导致 writer lease 过期，
hidden 状态禁止恢复 empty lease，
runtime 降 follower 后写操作没有先抢回 writer，
于是 follower relay 打到空 writer，复习失败。
```

这比“backend worker 掉了”更匹配当前日志。但最终确认还需要一组现场日志：

- 回前台时 `document.visibilityState`
- `FrontendInstanceRuntime.getMode()`
- `writer.getLease()` 当前 holder
- Review commit 前是否调用过 `ensureWritable()`
- 是否出现 `backend worker unhealthy`

讨论后产品策略已经收敛：普通桌面端不再追求“所有 renderer 都可抢 writer 的弹性”，而是将 writer 资格强绑定到 desktop primary-app role；hidden 只是不活跃显示状态，不应导致该 role 永久失去 writer 恢复资格。

## 10. 实现落点（2026-05-23）

已实现的代码行为：

- `src/kernel.ts`：`provisional-candidate` writer profile fail closed；hidden acquire 默认仍拒绝，但 empty lease 下允许 `primary-app/canonical` 窄口；active primary-app owner 仍不被 hidden requester 抢占。
- `src/application/clients/FrontendInstanceRuntime.ts`：hidden primary-app 只有在当前 runtime 已是 writer 且 observe 到 empty lease gap 时恢复；hidden follower startup 不 acquire；document-window / provisional browser frontend 在运行时也返回 explicit unavailable。
- `src/application/usecases/review/ReviewCommitUseCase.ts`：follower relay 遇到 `writer command unavailable: no active writer lease` 后调用 `ensureWritable()`；只有 `getMode()` 变为 writer 才本地调用 `review.feedback`。
- `src/application/handlers/KernelTransactionActionPump.ts`：dequeue relay 遇到 no-active-writer 后调用 `ensureWritable()`；恢复 writer 后本地 dequeue，恢复失败只上报 explicit unavailable；连续 no-active-writer polling 进入 bounded backoff。

已跑验证：

- `pnpm exec vitest run src/__tests__/kernelWriterLeasePolicy.test.ts --reporter=dot`
- `pnpm exec vitest run src/application/clients/__tests__/FrontendInstanceRuntime.test.ts --reporter=dot`
- `pnpm exec vitest run src/application/usecases/review/__tests__/ReviewCommitUseCase.test.ts --reporter=dot`
- `pnpm exec vitest run src/application/handlers/__tests__/KernelTransactionActionPump.test.ts --reporter=dot`
- grep 确认 kernel companion 没有 `siyuanmemo.db` / SQLite / 文件写入命中。
