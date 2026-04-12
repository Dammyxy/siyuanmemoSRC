# SM-18 集成动手指南

> 结论先说：SM-18 可以接入这个插件，但第一版应做“近似可用版 SM-18”，而不是追求与 SuperMemo 桌面版逐项等价的严格复刻；它必须接在现有 `ApplicationContext -> SchedulerRouter -> review preview/persistence` 主链路上，而不是塞进 Incremental Learning 队列里做旁路；第一阶段不改现有 Incremental Learning / Final Drill 队列规则，不改默认卡型到调度器的路由，也不做跨算法自动迁移。

本文档不是调研报告，而是未来真正动手集成 SM-18 时的开工手册。目标是让实现者读完后，能马上知道应该从哪里下手、先改什么、哪些地方不要碰，以及做到什么程度才算第一阶段收敛。

## 1. 背景与目标

当前插件已经具备多调度器、多队列和统一复习 UI 的基础设施，理论上可以安全容纳新的调度器实现。`sm18-re` 已经把 SM-18 的关键数学行为和一部分默认数据结构逆向出来，因此“工程上可用的 SM-18 v1”是可行的。

这份文档只解决“如何安全落地”这件事，不讨论产品层面的“是否应该默认启用 SM-18”。默认前提如下：

- 未来会在 `siyuan-plugin-siyuanmemo` 中新增一个可选的 `sm18` 调度器。
- 第一阶段目标是把 review、preview、persistence、inspector 所需的最小闭环打通。
- 第一阶段不追求与 SuperMemo 原生收藏级优化完全一致。
- 第一阶段不触碰现有渐进阅读队列规则，不触碰默认卡型路由，不做旧卡自动迁移。

## 2. 当前插件中的真实落点

未来实现必须以当前真实代码路径为准，而不是历史文档或旧目录。

### 2.1 主链路

当前活路径可以概括为：

```text
ApplicationContext
  -> SchedulerRouter
  -> UnifiedQueueStrategy / UnifiedReviewAdapter
  -> Review UI
  -> Persistence DTO / Mapper
```

关键入口如下：

- `src/application/ApplicationContext.ts`
  - 这里是组合根，负责把 `SchedulerRouter`、`UnifiedDataSourceManager`、`ReviewQueuePreparationService`、`ProgressiveReadingService` 等真实服务装配起来。
- `src/core/scheduler/SchedulerRouter.ts`
  - 这是调度器唯一的活路由入口。当前已经统一承载 `route(card, rating)` 和 `preview(card)` 两种能力。
- `src/application/adapters/UnifiedQueueStrategy.ts`
  - 这里已经通过 `schedulerRouter.preview(card)` 为复习项补充 `nextDues`，说明“评分预览”本来就是调度器层能力，不该在 UI 层单独重算。
- `src/application/adapters/UnifiedReviewAdapter.ts`
  - 这里负责把 `nextDues`、header、队列态等整理成 Review UI 可消费的数据。
- `src/infrastructure/persistence/dto/CardPersistenceDTO.ts`
  - 这里已经持有 `schedulerType` 和 `schedulerMeta`，说明调度器专属状态本来就有持久化落点。

### 2.2 这意味着什么

SM-18 的正确集成点是“调度器层”，不是“队列层”。

原因很直接：

- 队列负责“哪些卡进来、以什么顺序出现、低分是否轮转、是否落入 Final Drill”。
- 调度器负责“卡被评分后，记忆状态如何变化、下次时间如何算、预览如何展示”。
- 当前 review preview 已经依赖 `SchedulerRouter.preview()`，所以一旦 SM-18 被接入 `SchedulerRouter`，预览链路天然能复用。

如果把 SM-18 做成 Incremental Learning 的专用旁路，会直接破坏现有 `ui -> application -> core -> infrastructure` 的依赖方向，也会制造第二套 review/preview 逻辑。

## 3. `sm18-re` 结论提炼

未来实现只需要记住与工程落地直接相关的算法事实，不需要把 reverse engineering 报告全文搬进插件。

### 3.1 已经足够稳定的事实

- 遗忘曲线核心可写为：
  - `R = exp(-k * t / S)`
  - 其中 `k = ln(0.9)`，等价写法是 `R = 0.9^(t / S)`
- 成功复习时，稳定度更新的骨架是：
  - `S_new = S * SInc`
- 遗忘时，稳定度更新骨架是：
  - `S_new = max(S * SInc_lapse, POST_LAPSE_STABILITY_MOD)`
- 间隔由稳定度和 forgetting index 推导，不是单独拍脑袋给出的常数。
- 逆向结果里已经确认了一组关键常量：
  - `STARTUP_STABILITY = 1.2`
  - `STARTUP_INTERVAL = 6.9`
  - `POST_LAPSE_STABILITY_MOD = 0.87`
  - `POST_LAPSE_INTERVAL = 2.4`
  - `DEFAULT_SINC = 0.07`

### 3.2 真正复杂的地方

SM-18 最难的不是遗忘曲线公式，而是 `SInc` 的来源。

`sm18-re` 的结论非常重要：严格意义上的 SM-18 并不是“查一个固定矩阵就完了”。更真实的行为依赖 `sm8opt.dat` 这类统计表、不同稳定度分箱、R 分箱、样本数和回归加权。也就是说：

- 有公式，不代表就有“完整收藏级等价实现”。
- 没有收藏统计数据时，只能做一个近似但可工作的默认实现。
- 这正是为什么 v1 不该承诺“严格复刻 SuperMemo 桌面版”。

### 3.3 v1 的正确理解

第一阶段的 SM-18 应理解为：

- 使用逆向确认过的核心公式和关键常量；
- 使用默认/近似的 `SInc` 数据来源；
- 把 review、preview、persistence、inspector 所需的行为先统一起来；
- 明确保留将来接入 collection-aware `SInc` 提供器的扩展位。

## 4. 推荐集成策略

推荐使用明确的两阶段方案。

### 4.1 Phase 1：单一 canonical SM-18 核心

第一阶段只做一个唯一的、共享的 SM-18 内核，放在 `src/core/scheduler/*` 活路径内。建议形态如下：

- 新增 `SM18Scheduler`，实现现有调度器接口。
- 如果需要拆分辅助逻辑，限定在 `src/core/scheduler/strategies/sm18/*` 下，不要把公式分散到 UI、service 或 queue 层。
- 内部把“公式计算”和“`SInc` 来源”分开。
  - 公式计算负责 review / preview 的状态推进。
  - `SInc` 来源通过内部 provider 组织，v1 先接默认 provider。

这一步的重点不是把 SM-18 做得“最像 SuperMemo”，而是把它做成“插件内部唯一可信的 SM-18 计算源”。

### 4.2 Phase 2：可选的 collection-aware 优化

只有在 v1 跑稳之后，再考虑把 `sm8opt.dat` 级别的统计优化引入成第二阶段能力。

第二阶段也不应该改外部接口，而应该只替换内部的 `SIncProvider`。这样做的收益是：

- Review、preview、inspector、persistence 合同不需要重写。
- v1 到 v2 的升级不会要求 UI 或队列层改代码。
- 即便以后支持“导入某个工作区的优化数据”，也只影响调度器内部。

### 4.3 为什么这样选

这是当前插件最安全、最可维护的方案，因为它同时满足四件事：

- 不制造第二条调度路径。
- 不强依赖当前并不存在的收藏级统计数据。
- 不破坏现有队列职责边界。
- 允许未来继续向更高保真度升级。

## 5. 需要变更的接口与数据模型

这一节是未来实现最需要直接照着改的部分。

### 5.1 改动总览

| 改哪里 | 为什么 | 风险是什么 |
|---|---|---|
| 调度器层：`SchedulerRouter` + 新的 `SM18Scheduler` | 让 review 与 preview 共享同一个 SM-18 核心入口 | 如果在别处再写一套公式，review 与 preview 会分叉 |
| 持久化层：`CardPersistenceDTO` 及其 mapper 往返 | 保存 `schedulerType='sm18'` 与 `schedulerMeta.sm18` | 状态字段不全会导致回放、切换、调试困难 |
| 创建卡片入口：`CreateCardUseCase` | 控制新卡何时允许落到 `sm18` | 过早改默认路由会把迁移风险放大到所有新卡 |
| 复习预览层：`UnifiedQueueStrategy` / `UnifiedReviewAdapter` | 继续复用 `SchedulerRouter.preview()` 输出 next due | 如果 UI 自己单独重算，显示和真实评分会不一致 |
| 透明化 UI：未来 inspector / ReviewView 展示层 | 暴露 SM-18 状态便于解释与调试 | 如果 UI 再解析第二套状态或第二套公式，会形成长期维护陷阱 |

### 5.2 `schedulerType` 扩展

未来实现时，至少要统一把 `sm18` 加到以下类型体系中：

- `src/types/card.ts`
- `src/infrastructure/persistence/dto/CardPersistenceDTO.ts`
- `src/core/scheduler/SchedulerRouter.ts`

这里要注意一个现实问题：

- `CardPersistenceDTO` 和 `FSRSCard` 当前仍保留若干旧值，例如 `sm2`、`a-factor`、`riff`。
- `SchedulerRouter` 当前真正支持的 union 只有 `fsrs-v6 | sm15 | a-factor-v2`。
- `CreateCardUseCase.selectSchedulerType()` 当前返回的类型也还是旧集合。

因此未来集成 `sm18` 时，不能只改一个 union；必须把“类型定义、router 解析、创建入口、持久化约束”一起同步。

### 5.3 `schedulerMeta.sm18` 建议策略

建议沿用当前插件的通用兼容策略：

- 顶层通用字段继续维护：
  - `due`
  - `stability`
  - `difficulty`
  - `reps`
  - `lapses`
  - `lastReview`
  - `elapsedDays`
  - `scheduledDays`
- 同时新增 `schedulerMeta.sm18` 作为算法专属状态桶。

这样做的原因是：

- 现有很多浏览器、队列和 review surface 已经默认能读顶层通用字段。
- 只靠 `schedulerMeta.sm18` 会让大量通用 UI 失去基础兼容性。
- 但只靠顶层字段又不够表达 SM-18 的实现细节和未来版本信息。

推荐字段表见文末附录 A。

### 5.4 `SchedulerRouter` 需要承担的职责

未来接入 `sm18` 后，`SchedulerRouter` 至少应继续统一负责：

- `getSchedulerType(card)` 识别 `sm18`
- `route(card, rating)` 走 `SM18Scheduler.review()`
- `preview(card)` 走 `SM18Scheduler.preview()`
- `switchScheduler(card, newScheduler)` 对 `sm18` 有明确策略

这里最重要的决策是：**preview 和 review 必须共用同一个 `SM18Scheduler` 内核**。  
不允许为了“省事”在 preview 里写一套简化版计算。

### 5.5 新卡创建策略

第一阶段不建议修改默认卡型到调度器的路由。

具体建议如下：

- `CreateCardUseCase` 在 v1 只增加“显式指定 `schedulerType=sm18` 时允许落盘”的能力。
- 默认卡型选择保持原样：
  - `item` / `descriptor` 继续默认走 `fsrs-v6`
  - `topic` / `concept` 继续遵守当前活路径规则
- 不要在 v1 把所有 topic 或 concept 批量切到 `sm18`

理由很简单：一旦先改默认路由，后面就不得不同时处理数据迁移、设置面板、回滚策略、老卡兼容，这会让第一阶段范围失控。

## 6. 从 Incrementum 借鉴什么、避免什么

`incrementum-tauri` 值得参考，但不应该被照搬。

### 6.1 可以借鉴的部分

- 评分预览区间
  - 它把“评分后会去多久”做成显式 UI，这是 SM-18 很需要的可解释性能力。
- 透明化面板
  - `ReviewTransparencyPanel` / `FSRSInspector` 这种做法值得借鉴，尤其适合 SM-18 这种用户容易怀疑“为什么这样排”的算法。
- 会话态与撤销思路
  - 它在 review store 中保留会话进度、预览和 undo 思路，这对插件未来增强 review 体验有参考价值。
- 把“渐进阅读节奏”和“记忆算法”分开
  - 这是它设计里一个非常对的方向：阅读/抽取节奏是队列问题，长期记忆调度是算法问题。

### 6.2 明确要避免的部分

- 双实现并存
  - `incrementum-tauri` 的 review 路径和 preview 路径曾分别使用不同的 SM-18 实现入口，这是长期维护大坑。
- preview / review 分叉
  - `src-tauri/src/commands/review.rs` 中，`apply_sm18_review` 与 `preview_review_intervals` 走的是两套不同来源的 SM-18 类型，这种情况在本插件里必须禁止。
- 类型与校验漂移
  - 它的设置类型和 settings 校验枚举出现过不一致，说明“类型里有 `sm18`，但实际校验没放行”这类问题非常容易发生。
- 预览链路没有完全接通
  - `review.tsx` 曾出现 `previewIntervals={null}` 这种“有透明面板但没真正喂数据”的半吊子接线状态。

### 6.3 不要这样做

- 不要在多个文件维护两套 SM-18 公式。
- 不要让 preview 自己单独重算。
- 不要把渐进阅读节奏和记忆算法混成一个对象。
- 不要先改默认卡型路由。
- 不要先做“自动把旧 FSRS/SM15 卡转成 SM-18”的迁移。
- 不要把 inspector 写成另一套和 `SchedulerRouter` 无关的演示面板。

## 7. 实施步骤清单

下面的顺序是推荐实施顺序。按这个顺序做，风险最低。

### 步骤 1：锁定类型与状态模型

工作内容：

- 给 `schedulerType` 体系补上 `sm18`
- 定义 `schedulerMeta.sm18` 的结构
- 明确哪些通用顶层字段仍然由 SM-18 同步维护

完成标志：

- 类型定义里已经能合法表示 `sm18`
- 实现者无需再猜 `schedulerMeta.sm18` 应该存什么

### 步骤 2：实现单一 `SM18Scheduler` 内核

工作内容：

- 在 `src/core/scheduler/*` 活路径内新增 `SM18Scheduler`
- 内部统一承载 review 与 preview 计算
- 把 `SInc` 来源收口到一个内部 provider，而不是到处散落矩阵或常量

完成标志：

- `SM18Scheduler.review()` 与 `SM18Scheduler.preview()` 来自同一状态推进核心
- 默认 provider 已经能输出稳定、可测的近似结果

### 步骤 3：接入 `SchedulerRouter`

工作内容：

- 扩展 `SchedulerRouter.SchedulerType`
- 在 `_initializeSchedulers()` 中注册 `SM18Scheduler`
- 让 `resolveCardSchedulerType()` / `getSchedulerType()` / `switchScheduler()` 对 `sm18` 有明确行为

完成标志：

- 一个 `schedulerType='sm18'` 的卡能被 router 正确 review 和 preview
- 不需要 UI 或 queue 层知道 SM-18 内部细节

### 步骤 4：打通持久化与新卡入口

工作内容：

- 为 `CardPersistenceDTO` 增加 `schedulerMeta.sm18`
- 确保 mapper 往返不丢字段
- 在 `CreateCardUseCase` 中只增加“显式选择 `sm18` 时允许创建”这条路，不改默认卡型路由

完成标志：

- `sm18` 卡可以创建、保存、读取、再次复习
- 默认创建行为对现有卡型没有变化

### 步骤 5：打通 preview 链路

工作内容：

- 继续沿用 `SchedulerRouter.preview() -> UnifiedQueueStrategy -> UnifiedReviewAdapter` 这条现有链路
- 让 `sm18` 卡像其他调度器一样生成 `nextDues`

完成标志：

- Review UI 中 4 个评分按钮对 `sm18` 卡能显示有效 next due
- preview 与真实评分结果保持一致

### 步骤 6：增加基础透明化 UI

工作内容：

- 在现有 review UI 基础上增加轻量 inspector / transparency panel
- 展示最小必要状态：
  - `stability`
  - `difficulty`
  - `retrievability`
  - `repetition`
  - `lapses`

完成标志：

- 用户或开发者能看见 SM-18 的当前状态和下次预览
- UI 不需要再维护第二套算法逻辑

### 步骤 7：补齐测试与回归验证

工作内容：

- 写算法单测
- 写路由与持久化闭环测试
- 验证 preview 与真实评分一致性
- 做非 `sm18` 调度器回归检查
- 做 Incremental Learning 兼容检查

完成标志：

- `sm18` 新能力成立
- `fsrs-v6`、`sm15`、`a-factor-v2` 行为不回归

### 步骤 8：可选的第二阶段扩展

工作内容：

- 在不改外部合同的前提下，引入 collection-aware `SIncProvider`
- 评估是否需要导入收藏级统计数据或工作区级优化数据

完成标志：

- 只替换 provider 即可提升保真度
- UI、queue、persistence 合同不需要重写

## 8. 验证与风险

### 8.1 至少要覆盖的测试

- 算法单测
  - 新卡首轮评分
  - 成功评分路径
  - 遗忘评分路径
  - 极小/极大间隔边界
- 路由与持久化闭环
  - `schedulerType='sm18'` 的卡创建、保存、读取、评分后再次保存
- preview 一致性
  - `preview(card)` 对某一评分给出的结果，必须与真实 `route(card, rating)` 的间隔一致
- 非 SM-18 调度器回归
  - `fsrs-v6`
  - `sm15`
  - `a-factor-v2`
- Incremental Learning 兼容性
  - 卡进入队列、低分轮转、是否保留在队列、是否落入 Final Drill，都应继续由队列规则控制，而不是被 SM-18 改写

### 8.2 非目标

第一阶段明确不做以下事情：

- 不做严格 SuperMemo 收藏级等价复刻
- 不引入 `sm8opt.dat` 级别个性化统计优化
- 不改变现有 Incremental Learning / Final Drill 队列规则
- 不做旧卡从 FSRS/SM15 到 SM-18 的自动迁移
- 不先做设置面板或默认卡型路由切换

### 8.3 已知风险

- 没有收藏级优化数据时，v1 的区间表现不可能与 SuperMemo 桌面版逐题一致。
- 如果通用顶层字段与 `schedulerMeta.sm18` 更新逻辑分散，未来极易发生状态漂移。
- 如果透明化 UI 自己单独计算预览，显示结果会逐渐偏离真实调度结果。
- 如果未来要批量切换卡型默认调度器，必须另立迁移方案，不能在本指南基础上顺手加进去。

### 8.4 后续观察点

- `topic` / `concept` 是否真的适合长期切到 SM-18，还是继续由 `a-factor-v2` 承担更合理
- forgetting index 是否需要配置化
- 工作区级或用户级 `SIncProvider` 是否值得做
- inspector 是否需要暴露更多原始状态字段给高级用户

## 附录 A：`schedulerMeta.sm18` 建议字段表

建议把 `schedulerMeta.sm18` 当成“算法专属状态桶”，而不是把所有状态都硬塞回顶层通用字段。

| 字段 | 类型 | 必填 | 用途 | 备注 |
|---|---|---|---|---|
| `version` | `string` | 是 | 标识状态版本，例如 `sm18-v1-approx` | 便于未来升级或迁移 |
| `stability` | `number` | 是 | SM-18 语义下的稳定度 | 同时镜像到顶层 `stability` |
| `difficulty` | `number` | 是 | SM-18 语义下的难度 | 同时镜像到顶层 `difficulty` |
| `repetition` | `number` | 是 | 复习次数 | 建议镜像到顶层 `reps` |
| `lapses` | `number` | 是 | 遗忘次数 | 建议镜像到顶层 `lapses` |
| `lastGrade` | `1 | 2 | 3 | 4` | 否 | 上一次评分 | 方便调试和 inspector 展示 |
| `lastReviewAt` | `number` | 是 | 上次复习时间戳 | 建议镜像到顶层 `lastReview` |
| `elapsedDays` | `number` | 是 | 距上次复习经过的天数 | 建议镜像到顶层 `elapsedDays` |
| `scheduledInterval` | `number` | 是 | 本次排程出的间隔天数 | 建议镜像到顶层 `scheduledDays` |
| `forgettingIndex` | `number` | 是 | 当前使用的 forgetting index | v1 默认可固定为 `0.10` |
| `retrievability` | `number` | 否 | 当前可提取性快照 | 主要服务 inspector，不强制作为唯一真值 |
| `sincProvider` | `string` | 否 | 当前使用的数据来源标识 | 例如 `default-matrix` 或 `collection-opt` |

补充建议：

- 以顶层通用字段服务现有通用 UI 和列表视图。
- 以 `schedulerMeta.sm18` 服务算法专属状态、版本和未来升级。
- 不要把未来可能需要迁移的信息藏进 `meta` 的任意字段里。

## 附录 B：实施前检查清单

在真正开始编码前，先逐项确认下面这些前提仍然成立：

- `src/application/ApplicationContext.ts` 仍是实际组合根，调度器和 review 服务都从这里装配。
- `src/core/scheduler/SchedulerRouter.ts` 仍然同时承载 `route()` 和 `preview()`。
- `src/application/adapters/UnifiedQueueStrategy.ts` 仍然通过 router preview 生成 `nextDues`。
- `src/infrastructure/persistence/dto/CardPersistenceDTO.ts` 仍然是 `schedulerType` / `schedulerMeta` 的活持久化入口。
- `CreateCardUseCase` 仍然是主要的新卡创建入口之一。
- 当前 review UI 没有绕过 router 单独计算评分预览。
- 当前需求仍然是“先做可用近似版”，而不是“立即复刻收藏级严格版”。
- 当前阶段仍然不打算改默认卡型路由，也不打算做旧卡自动迁移。

### 文档验收标准

当下面这些问题都能直接从本文回答时，说明已经可以开始编码：

- 能说清楚 v1 与 v2 的边界。
- 能说清楚单一 SM-18 内核应该放在哪里。
- 能说清楚卡片状态要存哪些字段。
- 能说清楚 preview、review、inspector 三者如何共用同一状态。
- 能说清楚哪些现有队列行为不应被改动。
