# Full History Resume Audit Prompt

用途：当你要开启“全历史逐条审计”，专门查找 SiYuanMemo 在中断、压缩上下文、`继续`、`keep going` 后可能遗留的高风险未完成代码时，复制下面提示词给 Codex。

## Prompt A: Read-Only Audit

```text
请使用 `$siyuanmemo-plugin-dev` 技能，对 `siyuan-plugin-siyuanmemo/` 做一次全历史恢复/中断风险审计。

目标：
- 找出过去任务中因为中断、上下文压缩、用户要求“继续”、或 agent 只跑测试就收尾而可能漏掉的高风险代码。
- 重点审计那些在 `docs/DDD_RESCAN_BACKLOG.md` 里写了 “debt cleared / 暂缓债务清零 / 无 / 已偿还 / fixed now”，但可能没有完整代码、测试、文档证据的条目。
- 不要把绿色测试当成完成证明；测试只是证据之一。必须先重建 acceptance checklist，再逐项映射到代码、测试、文档、或明确 deferral。

范围：
- 只审计 `siyuan-plugin-siyuanmemo/` 当前 active runtime，不以历史 docs、旧目录、backup 文件为真源。
- 从最新 backlog delta 开始倒序审，优先覆盖最近 30 个 task delta；如发现系统性问题，再扩大到更早条目。
- 优先高风险 bounded contexts：SQL read model / storage persistence / review feedback / queue membership / neural roam / source existence / scheduler / sync / AI Arena。
- 对每个候选条目，确认 active call chain：UI/application entry -> application service/port -> core domain -> infrastructure adapter。

审计方法：
1. 读取 `docs/DDD_RESCAN_BACKLOG.md`，建立候选条目清单。优先匹配：
   - `debt cleared`
   - `暂缓债务清零`
   - `Debt deferred: 无`
   - `已偿还`
   - `继续`
   - `fallback`
   - `SQL`
   - `source`
   - `queue`
   - `review`
   - `neural`
2. 对每个候选条目抽取 acceptance checklist：
   - Task / Summary
   - Debt fixed now
   - Debt deferred / Why deferred
   - Public interfaces / types
   - Test Plan / Validation
   - ARCHITECTURE.md 是否应同步
3. 用 `rg` 追代码证据，不要只看文件名：
   - composition root 是否注入
   - port/interface 是否扩展
   - repository/service 是否实现
   - UI/data source 是否接入 active path
   - fallback/unhappy path 是否存在且不会返回错结果
   - tests 是否覆盖 happy path、fallback、SQL unavailable、stale cache、missing source、排序/分页/批量选择等关键契约
4. 风险分级：
   - P0：已声称完成，但 active runtime 会崩、写错数据、丢数据、或破坏复习/同步语义。
   - P1：已声称完成，但有 acceptance bullet 缺代码或缺关键 fallback/test。
   - P2：代码完成但 ARCHITECTURE/backlog/test plan 过期，容易误导后续 agent。
   - P3：真实 deferred debt，记录清楚且不影响当前 active path。
5. 不要开始大规模重构。默认只审计和产出报告；除非我明确说“开始修复”，不要改生产代码。

输出要求：
- 新建或更新 `docs/FULL_HISTORY_RESUME_AUDIT_REPORT.md`。
- 报告必须包含：
  - 审计窗口：审到哪些 backlog 条目，哪些未审。
  - 高风险发现表：风险级别、条目日期/标题、声称完成的内容、实际证据、缺口、影响路径、建议修复批次。
  - 误报/已确认安全表：为什么安全，证据在哪。
  - 下一批审计建议：按风险排序。
- 最后给我一份短摘要，不要只说测试通过。必须说清楚：
  - 找到几个 P0/P1/P2/P3。
  - 哪些需要马上修。
  - 哪些只是文档漂移。
  - 哪些是真 deferred debt。

验证要求：
- 审计报告是 docs-only 时，至少跑：
  - `rg` 交叉检查关键 claims
  - `git diff --check`
- 如果你改了生产代码，必须跑相关 targeted tests 和 `pnpm build`。
```

## Prompt B: Fix Approved Audit Batch

```text
请继续使用 `$siyuanmemo-plugin-dev` 技能，修复 `docs/FULL_HISTORY_RESUME_AUDIT_REPORT.md` 中我指定的这一批问题：

指定批次：
- <粘贴 P0/P1/P2 编号或表格行>

修复规则：
- 只修指定批次，不顺手扩大到其它历史债。
- 每个问题先重建 acceptance checklist，再映射到代码、测试、文档。
- 修 active runtime path，不修历史 trap path。
- 如果发现指定问题其实是误报，要在报告里改成“误报/安全”，写清证据，不要硬改代码。
- 如果发现问题比预期大，先记录最小安全修复和剩余 deferred debt，不要一次性重构全仓。

完成要求：
- 更新相关代码和 focused tests。
- 如 active architecture 或 backlog 状态改变，同步 `ARCHITECTURE.md` / `docs/DDD_RESCAN_BACKLOG.md`。
- 更新 `docs/FULL_HISTORY_RESUME_AUDIT_REPORT.md` 中对应行的状态。
- 验证至少包括 targeted tests、`pnpm build`、`git diff --check`。
- 最终回复必须按 `$siyuanmemo-plugin-dev` 的四段格式：主改动 / 顺手清掉的债 / 暂缓债务 / 验证。
```

## Practical Notes

- 不建议一次要求“审完全仓并全部修复”。先用 Prompt A 产出报告，再用 Prompt B 按 P0/P1 批次修。
- 如果审计窗口太大，先从最新 30 个 backlog task delta 开始。高风险模式稳定后，再每轮向前推进 30 个。
- 最危险的信号不是测试失败，而是：
  - backlog 写了“清零”，但没有对应代码路径。
  - 只有 repository test，没有 application/UI active path test。
  - 有 fallback，但 fallback 会静默返回错页、错计数、错队列成员。
  - ARCHITECTURE.md 仍描述旧 schema、旧 port、旧 composition。
  - 兼容 adapter 或备用 path 仍保留旧 SQL / old storage / old queue 语义。
