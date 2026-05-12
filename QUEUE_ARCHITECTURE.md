# 活跃队列运行规范

最后更新：2026-05-13

本文是当前活跃队列语义的专题事实源，只覆盖运行时已注册的 6 个主队列：

- `RetrievalPractice`
- `IncrementalLearning`
- `FilterGroup`
- `FinalDrill`
- `NeuralRoam`
- `Leech`

如果文档与代码冲突，以当前主路径代码为准：

- `src/application/services/UnifiedDataSourceManager.ts`
- `src/core/queue/domain/*`
- `src/types/unified-data-source.ts`

内部 / 非活跃 queue 类，例如 `SubsetReviewQueue`、`TemporaryDrillQueue`，不属于本文承诺范围。

## 统一术语

- `membership rule`：一张卡是否属于该队列的成员资格规则。
- `active window`：复习后判断卡片是否继续留在当前队列的规则窗口。
- `base order`：队列在没有手动重排时的默认真实顺序。
- `manual/outstanding overlay`：在基础顺序之上插入手动加入或 outstanding 卡的队列层叠逻辑。
- `post-review retention`：评分后，这张卡是否留队的规则。
- `view-only sort`：浏览器只对快照副本做排序，不改变队列真实顺序。

## 跨队列总规则

1. 队列自己定义成员资格和复习后留队语义，不允许再用全局启发式替代。
2. 队列真实顺序的层次固定为：`base order -> 队列特有插入/扰动 -> 显式手动重排 -> 浏览器 view-only sort`。
3. `getCards()` 和 `getSnapshotRows()` 返回的都是队列真实顺序。
4. 浏览器列排序永远不调用 `queue.sort()` 或 `queue.reorder()`，只排序快照副本。
5. `reorder()` 只表示明确的手动重排动作，不代表浏览器临时排序。

## 活跃队列规范表

| 队列 | 成员资格 / 窗口 | 默认顺序 | 复习后留队规则 |
| --- | --- | --- | --- |
| `RetrievalPractice` | 学习/重学卡 `due <= now`；Review 卡 `due <= currentDayEnd`；默认不引入 New；允许 outstanding/manual 插入 | 基础顺序 `learning/relearning -> review -> manual`，各段内为 `due -> priority -> stable id`；outstanding/manual 在基础顺序之后 | 手动插入卡复习后必出队；Learning/Relearning 只有复习后 `due <= now` 才留队，Review 复习后 `due <= currentDayEnd` 留队；评分 `<3` 自动升级到 `FinalDrill` |
| `IncrementalLearning` | 混合 SRS 队列：学习/重学卡 `due <= now`；Review 卡 `due <= currentDayEnd`；New 卡按每日上限引入；rotation 材料按 review day | 基础顺序 `learning/relearning -> review -> new -> rotation -> manual`，各段内为 `due -> priority -> stable id` | 手动插入卡复习后必出队；Learning/Relearning 只有复习后 `due <= now` 才留队，Review/New/rotation 按 review day；评分 `<3` 自动升级到 `FinalDrill` |
| `FilterGroup` | 成员资格由持久化 `filter` 决定，并强制附加 `includeSuspended=false`；再叠加非黑名单、非 dismissed | `due -> priority -> id`；手动加入卡先合并去重，再走同一稳定排序 | 复习后只要仍匹配当前 `filter` 且未被显式移除 / 拉黑，就留队；评分 `<3` 自动升级到 `FinalDrill` |
| `FinalDrill` | 静态成员队列，无 today-window | 持久化条目顺序为主；默认比较器是 `priority -> due -> id`；展示时允许 `FlipElement` 做局部扰动，但不改写持久化顺序语义 | 不走调度器；评分 `4` 出队，评分 `1/2/3` 移到队尾并留队 |
| `NeuralRoam` | 成员资格由当前引擎 session 的可见节点与关联复习缓冲决定，无 today-window | 由 roam engine 路径顺序决定，不受浏览器排序影响 | 永不因“窗口”自动出队；有本地卡 backing 的节点可走 scheduler，但复习后仍留在 session；无 backing 的节点保持纯练习语义 |
| `Leech` | 成员资格是 `lapses >= threshold` 或手动加入，排除黑名单 | `lapses desc -> due asc -> priority desc -> id asc` | 继续按 today-window 判定留队：复习后仅当 `due <= currentDayEnd` 时留队；notify / suspend / tag 副作用在调度后执行 |

## 队列补充说明

### RetrievalPractice / IncrementalLearning

- 这两个队列都采用 SM-style availability：Learning/Relearning 使用精确时间，Review 使用当前 review day。
- `RetrievalPractice` 是 review-oriented 队列，默认排除 New；`IncrementalLearning` 是 Mixed SRS Queue，负责按每日上限引入 New。
- `Learn Ahead` 是普通队列清空后的显式动作，只查询未来 Learning/Relearning，默认窗口 20 分钟、最多 20 张；它不会把未来 Review 或 New 伪装成当前 due。
- outstanding/manual 卡发生在基础顺序之后，再由显式 `customOrder` 覆盖。
- 用户手动 `remove` 会写临时黑名单；评分导致的自然出队不会写临时黑名单。

### FilterGroup

- `filter` 是主语义，队列不会偷偷退化成 today-window 队列。
- review UI 中，`filter-group` 的 Topic / Concept 主按钮“下一张”以及同语义的 `Space/Enter` 快捷键，执行的是“仅在当前筛选会话内临时隐藏当前卡并前进”，不等价于 `Good(3)` 调度评分。
- 显式 `remove` 仍然写临时黑名单，因此 `rebuild()` 依然有意义：它会清空显式移除留下的 blacklist 并重新按当前 filter 取数。
- 上面的临时隐藏动作属于 UI 会话层行为：不会写 scheduler，不增加 answered/correct；`rebuild()` 后这些被临时隐藏的卡会重新出现。
- 手动加入卡只是补充成员资格来源，不是复习后永远保留的特权；评分后仍按当前 filter 镜像判断是否留队。

### FinalDrill

- `FlipElement` 只影响当前展示顺序，不代表持久化主顺序被洗牌。
- `skip()` 与评分 `1/2/3` 一样，都是把卡移动到队尾。
- 这是练习队列，不承担 SRS 调度更新。

### NeuralRoam

- 真实成员资格来自 engine session，不来自 `due`。
- 浏览器只能读取 roam 当前路径 / 可见节点快照，不能通过列排序改写 roam session 顺序。
- 只有确实绑定本地卡的节点才会把评分交给 scheduler；否则只是会话内练习反馈。

### Leech

- `Leech` 的建队列依据是 `lapses/manual membership`，不是 `due`。
- 但复习后是否继续留在当前列表，仍按 today-window 判定，避免 leech 队列变成长期堆积桶。

## 浏览器排序规范

- `sortQueueSnapshotRows()` 只排序快照副本。
- 列值相等时，稳定 fallback 固定为：`queueIndex -> blockId -> id`。
- 浏览器“按列排序”不改变：
  - 队列缓存
  - 队列持久化顺序
  - `customOrder`
  - `FinalDrill` 条目顺序
  - `NeuralRoam` session 路径顺序

## 当前相关稳定性债务

- `P1`：`XiuyuanSyncService` 仍应改成“先构建 `SyncChangeSet`，再单一提交”的两阶段同步。
- `P2`：`chooseCanonicalXiuyuan()` 仍应引入显式 ownership 语义，固定为 `local-owned > riff-managed > updatedAt > createdAt > id`。
- `P3`：`CardRepository.save()` 目前不是本轮稳定性主抓手，先维持薄包装边界。
