# SiyuanMemo 插件架构说明

最后更新：2026-04-29

本文是当前运行时架构与主数据流的单一事实来源（Single Source of Truth），面向协作者、贡献者与 AI 代理。它描述的是当前仍在生效的主路径，不负责保留历史迁移过程。

---

## 1. 文档目的与边界

本文覆盖：

- 当前分层架构与依赖方向
- 组合根与运行时装配
- Browser / Review / Queue / Scheduler 主链路
- Progressive / Excerpt / Topic-derived item 主链路
- AI Workbench / Capture 主链路
- Arena 主链路（AI 策略包竞技 + SRS 算法只读竞技，默认关闭）
- 完整运行时文件职责地图
- 开发边界与改动守则

本文不覆盖：

- 历史迁移复盘
- 旧架构兼容层的设计意图
- 普通用户使用手册

主校准源如下：

1. `src/index.ts`
2. `src/application/ApplicationContext.ts`
3. `src/types/unified-data-source.ts`
4. 活跃调用链对应的 `src/` 代码

如果文档与代码冲突，以代码为准。

---

## 2. 当前分层架构总览

插件的固定主依赖方向是：

`ui -> application -> core -> infrastructure`

```mermaid
flowchart TD
  UI["UI 层\nsrc/ui/*\nVue 组件 / Composables / Surface glue"] --> APP["Application 层\nsrc/application/*\n编排 / 用例 / 查询 / 管理器 / 端口"]
  APP --> CORE["Core 层\nsrc/core/*\nQueue / Scheduler / Card / Xiuyuan 领域规则"]
  CORE --> INFRA["Infrastructure 层\nsrc/infrastructure/*\nSiyuan / Riff / 持久化 / 通知 / LLM 适配"]

  APP --> CTX["ApplicationContext\n唯一组合根"]
  CTX --> UDSM["UnifiedDataSourceManager\n统一队列与观察者中心"]
  CTX --> SR["SchedulerRouter\n调度路由中心"]
  CTX --> PR["ProgressiveReadingService\n渐进阅读 / 摘录编排"]
  CTX --> AI["ReviewAIWorkbenchRegistry\nAI 工作台会话注册中心"]
  CTX --> AR["ArenaKernelService\nAI / SRS 竞技场内核"]
```

各层职责：

- `ui/*`：界面、用户交互、表面状态、对外可见 surface 的粘合逻辑。
- `application/*`：用例编排、管理器、查询、服务装配、端口定义、跨领域流程。
- `core/*`：队列规则、调度规则、卡片领域、修远领域、共享事件与核心能力。
- `infrastructure/*`：Siyuan / Riff / 文件 / 通知 / LLM 等外部系统适配。

当前活跃的 bounded contexts：

- Browser
- Review
- Queue / Scheduler
- Card CRUD
- Xiuyuan
- Progressive / Excerpt
- Topic-derived item
- AI Workbench / Capture
- Arena
- Mobile entry
- Siyuan / Riff integration

---

## 3. 启动与装配流程（Composition Root）

运行时启动主链路：

1. `src/index.ts` 的 `onload()` 先同步注册 Browser / Review / Review AI custom tab 类型
2. 每个 custom tab 的 `init` 先渲染 loading shell，并等待 `contextReady`
3. 调用 `ApplicationContext.create({ plugin, i18n })`
4. `ApplicationContext.create()` 完成后 resolve `contextReady`，由 `TabManager` runtime helper 真正 mount Vue tab surface
5. `src/index.ts` 再注册顶栏、Dock、事件处理器、Slash 命令、移动端入口等外层 UI 胶水

`ApplicationContext` 是当前唯一组合根。它负责：

- 初始化 `StorageManager` / `UnifiedStorageManager`
- 初始化 `SchedulerRouter` / `RescheduleService`
- 初始化 `UnifiedDataSourceManager`，并在组合根注入队列持久化与 `LeechActionEffectsPort`；Leech queue 不在 manager 内部默认构造 Siyuan effects adapter
- 装配 `CardApplicationService` / `BrowserApplicationService` / `ReviewApplicationService`；其中 `ReviewApplicationService` 的 `ReviewSiyuanPort`、`CardContentQueryService` / `DataAccessFacade` 的 `QuerySiyuanPort` 由组合根注入，不在 service/facade 内默认构造基础设施 adapter
- SQL active 时给 `CardApplicationService` 注入 `SqlCardReadModel`，并把 `SqlUnifiedStorageRepository` 作为 `BrowserDeckReadPort` 注入 `BrowserApplicationService` / `DocTreeReviewScopeService`；卡片计数、Browser stats、deck 主表分页、source-existence cache、root-scope 候选与 card-type-marker 扫描优先走 `cards` 表 v3 投影列和索引，legacy、SQL 不可用或 SQL 不可表达条件再回到 `UnifiedStorageManager` / snapshot 读模型
- 装配 `DialogManager` / `MenuManager` / `TabManager` / `DockManager`；`DialogManager`、`MenuManager`、`TabManager`、`BlockMenuHandler`、`PracticeQueueManager`、`ReviewScopeCardCreationSyncService` 的 Siyuan / Progressive / Leech effects 依赖由 `ApplicationContext` 通过应用端口注入，不在 manager/service 内部默认构造基础设施 adapter
- 装配 Browser 所需的 Siyuan port 与 datasource factory；`BrowserApplicationService` 不直接依赖 `src/ui/browser/*`
- 装配 Review special renderer service；`ReviewContent.vue` 不直接创建 core infrastructure repository
- 装配 `XiuyuanApplicationService` / `XiuyuanSyncService`
- 装配 `ProgressiveReadingService` / `SelectionExcerptService` / `SelectionTopicContinuationService` / `TopicDerivedItemService`
- 装配 `ConfiguredCaptureStorageService` / `ReviewAIWorkbenchRegistry` / `AIWorkbenchService`
- 初始化 `siyuanmemo.db` 的 sql.js 持久化层；首次启动先把旧 `unified-cards.msgpack`、`queues.msgpack`、月度 review logs 与 `arena/store.json` 迁入 SQL，迁移失败才回退旧文件存储；SQL active 后 DB 以二进制文件写入，旧 base64 envelope 只作为读取兼容与迁移备份
- 装配 `ArenaStoreService` / `ArenaKernelService`，把 AI 策略包竞技和 SRS 只读算法竞技挂到同一个应用层内核；`arena.enabled` 默认为 `false`，关闭时不接入复习建议或 AI 策略包覆盖；开启后 Arena 数据写入 SQL

这意味着：

- 任何运行时服务暴露、服务替换、启动顺序问题，先看 `ApplicationContext`
- 任何 custom tab 恢复失败或重载后消失的问题，先看 `src/index.ts` 的提前注册 + `contextReady` lazy mount 桥接
- 任何 surface 是如何被打开的，先看 `src/index.ts` + `DialogManager` / `TabManager`
- 任何“这个能力到底算哪个 bounded context”的争议，先看组合根里它如何被装配和谁在消费它

---

## 4. 关键运行入口与主链路

### 4.1 Browser

主要入口：

- `src/index.ts` 顶栏点击
- `src/application/managers/MenuManager.ts`
- `src/application/managers/DialogManager.ts::openBrowserDialog()`

主链路：

1. 入口动作落到 `DialogManager.openBrowserDialog()`
2. 挂载 `src/ui/browser/SRSBrowser.vue`
3. `SRSBrowser.vue` 消费：
   - `BrowserApplicationService`
   - `TabApplicationService`
   - `UnifiedDataSourceManager` facade
4. Browser 在全量 / 队列 / deck 等模式下，通过 application queries、统一队列快照或 SQL deck read port 加载数据；SQL active 的 deck 主表走 `COUNT + LIMIT/OFFSET + page hydrate`，`getDeckMatchedIds()` 用 SQL 返回完整匹配 id 列表，missing-block / retrievability 等不能由当前 SQL 投影表达的条件显式回退旧 snapshot 路径
5. Browser DTO、query parser、stable row id 与排序显示契约以 `src/types/browser.ts` 为共享契约；application query kernel 只依赖 `src/application/queries/browser/shared/*` 与 `src/types/browser.ts`，不再 import UI browser module
6. 右键批量动作通过当前数据源持有的 `UnifiedDataSourceManager` 批量入口执行：删卡走 `batchDeleteCards(cardIds, { blockIds })`，优先级/重置/暂停/恢复走 `batchUpdateCards(cards)`，加入/移除队列走 `batchAddToQueue()` / queue `addCards()` 与 `removeCards()`；`postpone/advance/spread` 走 `RescheduleService -> UnifiedStorageCardUpdateAdapter -> UnifiedStorageManager.batchUpdateCards()`，SQL active 时再一次 `cards` upsert + persist；这些入口在应用层分块 upsert / 批量删除 / 一次队列持久化后统一发布 `CardDeleted / CardsDeleted`、`card-updated` 与 `queue-changed`，单卡 API 只作为旧调用 fallback
7. UI 增量刷新由 `useBrowserAdapterSync`、`useIncrementalGridUpdates`、`useQueueBridge` 驱动；Browser SQL、文档树读取、queue block projection、preview breadcrumb 等 Siyuan 调用必须显式拿到 Browser 侧 Siyuan port，不再依赖 browser service 模块全局状态，也不从 UI 直接 import infrastructure Siyuan API

### 4.2 Review

主要入口：

- `DialogManager.openReviewDialog()`
- `DialogManager.openSubsetReviewDialog()`
- `DialogManager.openNeuralRoamDialog()`
- `DialogManager` 中的 leech / filter-group / browser handoff 等 review 打开流

主链路：

1. `DialogManager` 选择队列与 header variant，并根据 `settings.ui` 决定桌面端标准 review 入口是走 dialog 还是 `TabManager.openReviewTabInNewTab(...)`
2. dialog 路径走 `createUnifiedReviewDialog(...)`；tab 路径走 `TabManager` 的 review tab handoff
3. dialog 工厂装配：
   - `UnifiedQueueStrategy`
   - `UnifiedReviewAdapter`
   - `SchedulerRouter`
   - `UnifiedDataSourceManager`
4. 挂载 `src/ui/review/v2/ReviewView.vue`
5. `useReviewSession.ts` 绑定 `reviewSessionController.ts`；controller 统一驱动 `next / reveal / grade / skip / custom`，并且所有“直接把某张卡写成当前卡”的恢复/刷新入口都会先走 queue strategy 的 `hydrateCurrentItem()` 显示态补水，再更新 UI，避免外部刷新、会话恢复、AI 新卡同步等路径把原始 `FSRSCard` 直接塞回当前位后丢掉 runtime `nextDues`；当当前队列项在评分前已被删除或失效时，queue strategy 会抛出 `QueueItemUnavailableError`，controller 只重新 `queue.next()` 跳到下一张，不记录复习历史，也不把 session 误置为空完成态
6. review header 的二级动作仍由 `ReviewView.vue` 编排：
   - `AI 侧栏` 统一走 `ReviewAIWorkbenchRegistry`
   - `更多` 菜单中的优先级编辑走 `CardEditorApplicationService.updatePriority(...)`
   - `更多` 菜单中的“编辑当前内容”走 `ReviewApplicationService.getBlockKramdown/updateBlockMarkdown(...)`，通过共享 `LargeTextEditorDialog` 编辑当前块原始 Markdown；保存后只调用 `ReviewContent.refreshVisibleContent()` 原地刷新当前内容，不重建 review session
   - tab 模式下插件托管的“在新页签中打开”走 `TabManager.openReviewTabInNewTab(...)`，而“右侧/下方分屏当前复习”先通过 `SharedReviewSessionRegistry` 提升或复用共享 review session，再交给 `TabManager.openReviewTab(...)`
   - `更多` 菜单中的暂停动作走 `CardEditorApplicationService`
   - `更多` 菜单中的删除动作走 `CardApplicationService`
   - progressive excerpt / open-as / fullscreen / SRS editor 继续复用既有 application / dialog 主链
7. `ReviewContent.vue` 继续在 `主 Protyle / special renderer` 之间路由；special renderer 所需的 quick / descriptor render services 由 `ApplicationContext.createReviewRenderServices()` 在 composition root 创建 Siyuan block adapters 后，经 `ReviewView.vue` 注入 `ReviewContent.vue`；`createReviewRenderServices()` 只接收已注入 adapter，不再默认 new block adapter，`ReviewContent.vue` 也不再自建 fallback render services；Image Occlusion 与 Xiuyuan list-template 读取块属性 / Markdown / breadcrumb 时只接收 `ReviewSiyuanPort` 投影，不直连 `@/infrastructure/siyuan/api`；其中普通 `builtin-multi-cloze` Item 已回到主 Protyle / 原生编辑路径，历史 `quick-default` 标记也会被普通 multi-cloze 契约压回 native path，只有 `inline-formula-cloze` 继续走专用 `MultiClozeCardRenderer`；`UnifiedReviewAdapter` 会把普通 multi-cloze 与 topic-derived Item 标记为 native inline hidden 候选，最终由 `ReviewContent` 的 DOM 检测按思源 flashcard 配置给 `mark/list/heading/superBlock` 加隐藏 class；special renderer 仍通过 `getEditableSource()` 向 `ReviewView.vue` 暴露当前可编辑块，同块编辑保存或经 `TransactionWebSocketService` 共享 transaction stream 命中的源块刷新则走 `refreshVisibleContent()`：主 Protyle 调 `reload(false)`，special renderer 只重挂自身子组件，外层 review content key 只表达卡片身份
8. review tab 现在区分 `surface id` 与 `shared review session id`：前者仍用于 tab 生命周期/AI companion 绑定，后者只用于插件托管分屏共享同一套 review controller
9. SQL active 的队列候选真相是 `cards` 当前状态；`queue_state` 只保存筛选配置、临时黑名单、手动加入、session 排除和手动顺序等 overlay。手动加入卡解析按 card id / block id 定点查询，查不到才清理无效 manual entry，不再常规回退到无过滤全量 `getCards()`

当前 review surface 路由补充：

- `reviewOpenInNewTabByDefault` 只影响桌面端标准全局 review 入口：提取练习、渐进学习、刻意练习、筛选复习、神经漫游，以及 filter-backed retrieval / incremental handoff。
- `reviewOpenFullscreenByDefault` 只影响 dialog 模式的初始打开状态；一旦走 tab 路径，该设置被忽略。
- `TabManager.openReviewTabInNewTab(...)` 不再隐式退化成右侧分屏；只有显式 `position: 'right' | 'bottom'` 才会走分屏。
- filter-backed retrieval / incremental 在切到 tab 时，不直接复用 live queue，而是通过 `FilterGroupQueue.serializeSessionSnapshot()` -> `ReviewTabTransferState(kind='filter-group-session')` 把 filter、临时黑名单和可见顺序交给 `TabManager` 恢复。
- Browser / Review / Review AI companion 的 restore 现在统一走“提前注册 custom tab -> loading shell -> `contextReady` 后 mount runtime”主链，不再依赖 `ApplicationContext.create()` 之后才晚注册 tab。
- `subset-review`、`temporary-drill`、`leech` 等依赖上下文/live queue 实例的会话型 review 仍保持 dialog-only，直到 tab restore parity 明确建模。

评分主链：

```mermaid
sequenceDiagram
  participant UI as ReviewView / useReviewSession
  participant QS as UnifiedQueueStrategy
  participant Q as QueueDomain
  participant UDSM as UnifiedDataSourceManager
  participant RCU as ReviewCommitUseCase
  participant SR as SchedulerRouter
  participant SRS as SRS v2 Kernel
  participant LOG as ReviewLogService
  participant SQL as SqliteDatabaseService
  participant AR as ArenaKernelService
  participant B as SRSBrowser

  UI->>QS: onFeedback(rate)
  QS->>Q: handleReview(cardId, rating)
  Q->>UDSM: commitReview(QueueReviewCommand)
  UDSM->>RCU: execute(command)
  RCU->>SQL: runTransaction(review.feedback)
  RCU->>UDSM: getCard(cardId)
  RCU->>SR: answer(card, rating, QueueReviewContext)
  SR->>SRS: preview / answer
  SRS-->>SR: SchedulingDecision
  RCU->>SR: commit(decision)
  SR->>SRS: commit policy
  SR-->>RCU: ReviewCommitResult
  RCU->>SQL: row-level upsert updated card
  RCU->>LOG: append ReviewLogV2 when schedule is written
  RCU->>AR: record SRS Arena batch when enabled
  SQL-->>RCU: commit + one binary persist
  RCU->>UDSM: onCardUpdatedFromScheduler(updatedCard)
  RCU-->>Q: QueueReviewCommitResult
  Q->>Q: session membership / current item advance
  UDSM-->>B: data change event
  B->>B: incremental grid patch
```

失败补偿语义：

- `QueueItemUnavailableError` 只表示当前卡评分前已消失，继续沿用“清理 stale item -> 下一张”的专用路径，不写 review history，也不套普通补偿
- 其他 feedback 失败，尤其是 SQL persist 失败，`UnifiedQueueStrategy` 会丢弃刚压入的失败 history，恢复 queue rollback snapshot、session 排除、当前项、计数/cache，并通过 `UnifiedDataSourceManager.restoreCardSnapshotForFailedFeedback()` 用 `suppressAutosave` 恢复评分前 card 内存态；补偿本身不再触发第二次落盘

### 4.3 Progressive / Excerpt / Topic-derived item

当前这些能力已经在主路径上，不是临时实验分支。

主要入口：

- `DialogManager.openProgressiveSplitDialog()`
- `ProgressiveExcerptHotkeyHandler`
- `BlockMenuHandler` 中的 progressive excerpt 入口
- `ReviewView.vue` 对 `PROGRESSIVE_EXCERPT_REQUEST_EVENT` 的响应
- `AutoCardHandler` 中的 topic continuation / topic-derived item 入口
- 编辑器选区右键中的 `摘录` / `在 Topic 下创建 Item`
- 插件命令与热键中的 `⌥⇧X`（摘录为 Topic）/ `⌥⇧Z`（当前选区创建 Item）

`⌥⇧X` 的 editor fallback 会先解析原生文本 Range，保留单块/跨块局部选区切片；如果当前没有文本 Range，则继续识别 SiYuan 的 `.protyle-wysiwyg--select` 块选区，并复用块菜单同一套 full-block snapshot 与 `SelectionExcerptService` 下游链路。

主链路分工：

- `ProgressiveReadingService`：渐进阅读、拆分、摘录、来源追踪、文档与卡片编排的核心应用服务
- `SelectionExcerptService`：把选择态 surface 接到 `ProgressiveReadingService` 的轻量门面
- `SelectionTopicContinuationService`：把选区继续制卡的 topic/excerpt 语境判定、planner 结果适配，以及“普通选区改 source mark + 立刻创建 1 个 Item”的 manual-cloze 分流收敛到 topic-derived 主链，同时负责“从当前块高亮补齐 Item”的块级 fan-out
- `TopicDerivedItemService`：在 topic / excerpt 语境下创建 topic-derived item

当前 manual-cloze 的 DOM / 错误契约补充：

- Topic / 摘录语境里的 `⌥⇧Z` 与右键 `在 Topic 下创建 Item` 会先把 source 选区写成 tokenized `mark`：默认是 `data-type="text mark"`，如果选区本身就是单个内联 `span[data-type]`，则保留原 token（例如 `block-ref`）并追加 `mark`
- `SelectionTopicContinuationService` 生成的 manual-cloze `artifactContentDom` 与 source 写回共用同一套 tokenized mark helper，因此 block-ref 这类选区不会因为高亮而丢掉原有内联语义
- `applyPreparedSelectionClozeMark()` 成功时返回显式 `applied / already-applied`，失败时直接抛底层 Siyuan kernel 错误；`ProgressiveExcerptHotkeyHandler` 只负责记录上下文日志并把原始错误消息透传到 toast，而不是再把保存失败折叠成泛化布尔值
- mark 识别主链按 `data-type` token 列表是否包含 `mark` 判定，不再要求精确字符串 `data-type="mark"`
- Siyuan 3.6.5 的 `/block/updateBlock` 返回会先在 `infrastructure/siyuan/api.ts` 归一化成统一 mutation result；如果 update 成功但响应里没有新的 op id，则回退返回请求 block id，避免 active path 再碰到 `result.doOperations is not iterable`
- `⌥⇧Z` 固定只处理当前这 1 个空；如果选区里已经覆盖多个高亮，则直接提示改走块菜单的 `从当前块高亮补齐 Item`

集成边界：

- `ProgressiveSiyuanPort` / `ProgressiveSiyuanAdapter`
- `ProgressiveNativeRiffPort` / `ProgressiveNativeRiffAdapter`
- `ConfiguredCaptureStoragePort` / `ConfiguredCaptureStorageSiyuanAdapter`

### 4.4 AI Workbench / Capture

主要入口：

- `DialogManager.openAiWorkbenchDialog()`
- `TabManager` 打开的 review companion tab
- `ReviewView.vue` 与 `ReviewAIWorkbenchRegistry` 的 review session 交互

主链路分工：

- `ReviewAIWorkbenchRegistry`：持有 standalone service 与按 review session 隔离的 AI service
- `AIChatSkillRegistry` / `AIWorkbenchSkillRegistry`：通用聊天 Skill 注册表与旧入口兼容层；运行时会把内置 `general-chat` / `concept-coach` 与 `settings.ai.userSkills[]` 合并解析为同一种 resolved skill 描述符
- `AIChatToolRegistry` / `AIChatToolExecutorService`：插件内工具、网页工具、变量缓存和制卡工具的描述符、启用策略、执行链与透明化日志；支持按组/单工具启用、执行/结果审批、变量引用和多轮工具链续跑
- `AIChatVarStoreService`：会话级变量缓存，支撑长工具结果的 `ListVars` / `ReadVar`
- `AIWorkbenchSessionStoreService`：通过 `FileService` 持久化 AI 会话索引与单会话记录文件；当前 schema v5 以统一树节点池 + per skill/tab active leaf 保存会话，并额外保存 review 队列级 `reviewChatKey`、按 `contextSignature` 分仓的 `conceptCoachResultsByContext`、工具透明化兼容字段与制卡目标记忆；旧 `skill -> tab -> thread/result` 记录会迁移到树世界线，旧 review 结构化结果会按当前上下文签名补种一次
- `AIFlashcardToolService`：AI 制卡工具的应用层门面，负责复用 AI 制卡目标记忆、解析显式目标覆盖、写入思源源块、读取 mutation 子树，并按模式桥接到 `XiuyuanApplicationService` 或思源原生 Riff 制卡；自测卡 active mode 现在只保留 `list-item / mark / heading / super-block` 四种原生路径，统一走 detailed mutation + 结构根块解析；`cdf-structure` 语义制卡则先解析概念锚点到“当前上下文已有概念文档 or 目标笔记本精确标题命中 or 当前目标笔记本手动搜索/手动新建后选定”，再把已选 anchor 物化成 AI 专用混合 CDF 源块树 `((concept-doc))::定义 / 维度;;值 / 维度;;; + 子级条目`；描述符条目仍只保存 `items[].text`，但当同一 descriptor group 下有多个 items 时，契约要求每个 text 都直接编码 `提示→答案`（例如 `前身→恒星`），后续继续依赖 `parseCueAndAnswer()` 在 scan/create 阶段拆回 cue/answer；随后直接基于 mutation rows + kramdown 构造 `CdfScanResult` 并委托 `CreateCdfMultilineCardsUseCase.executeFromScanResult()` 建卡，不再依赖插入后第二次按根块 ID live scan
- `AISelfTestCardCreationService`：`AI 理解与制卡 / 自测卡片` 的模式分发门面，负责把当前工作台选择的 `creationMode` 与候选草稿映射到具体制卡工具，不让 UI 或 workbench runtime 直接拼装原生/插件制卡细节
- `AIWorkbenchService`：通用 AI chat runtime，负责会话编排、树节点生命周期、消息版本/分支/分隔/隐藏/固定、Skill 切换、工具执行、审批状态、结构化结果渲染适配、候选项编辑制卡和历史管理；general-chat 的工具审批通过后会在原工具链里继续执行，拒绝会把拒绝结果回传模型，达到最大轮数后仍会请求一次最终总结；composer 触发的发送/追问/编辑后重发/失败重试现在都会把失败归属到对应 `assistant-text` 节点，带上 `requestSourceMessageId + failureDiagnostic + failureRunMode` 持久化到会话树里，顶部全局 `error` 只保留给非消息类失败；review 场景下 `general-chat` 继续按 `reviewChatKey` 复用同队列聊天历史，但 `concept-coach` 的结构化结果、tab rerun 与 follow-up 改为按当前 `contextSignature` 分仓，切卡后默认切到当前卡自己的结构化工作区；`cdf-structure` 现在是 `concept-coach` 的一等结构化阶段，支持概念锚点/定义候选/描述符组选择与语义制卡；旧 `make-cards` / `tutor` / `explain` 打开请求会归一到 `concept-coach`
- `src/types/settings.ts`：AI provider / model / tool / web-search / prompt 的持久化真相源；旧 `baseUrl/apiKey/model` 会迁移为 `providers[] + defaultModelId`，旧 explain-only prompt 在 contract version 升级后直接回落到当前默认模板；内置 `concept-coach` 默认 Prompt 现在改为 Andy 兼容的方法论，但仍输出当前 canonical 结构化结果；`cdf-structure` 默认提示词会显式要求模型在任一描述符组拥有超过 1 个子项时，把每个描述符条目都写成 `提示→答案`
- `AIPromptContractRegistry`：Skill-aware 系统契约注册表；维护 `concept-coach/full-run` 整份 JSON schema 与 `concept-coach/<tab>` 局部 schema，也会根据用户 structured skill 的 sections 动态生成最小 JSON contract，并为运行时追加和设置页只读说明提供同一份事实源；`self-test-cards` 现在要求模式无关的 canonical 草稿字段，由运行时再按当前 `creationMode` 本地渲染到具体卡型，并额外约束 `summary` 短、`answer` 短、`details` 默认稀疏；`cdf-structure` 则继续要求语义 JSON，并把“multi-item descriptor group 的每个 `items[].text` 必须使用 `提示→答案`”作为系统契约
- `AIPromptComposer`：只负责推荐 Skill prompt 模板描述与默认 base/tab Prompt，不再承担运行时结构化协议拼接；设置页里“恢复推荐模板”拿到的是和运行时一致的 Andy 兼容默认文案
- `ConfiguredCaptureStorageService`：仍作为 Progressive / Excerpt 的捕获存储服务保留，但不再是 AI workbench 的运行依赖

当前 Skill 主路径补充：

- standalone dialog 默认打开 `general-chat`；review sidecar / companion tab 默认读取 `settings.ai.chatDefaults.reviewDefaultSkillId`（默认 `general-chat`），显式 `concept-coach` 与旧别名 `make-cards / explain / tutor` 仍会优先命中结构化流程；用户仍可在同一 shell 内切换 Skill
- review AI 会话按 `reviewChatKey = queueType + queueLabel/title` 复用最近持久化记录；`ReviewAIWorkbenchRegistry` 仍按真实 `reviewSessionId` 隔离 live runtime；切换闪卡只在 review sidecar 可见或 companion tab 存在时刷新 runtime-only `liveContext/contextSignature` 与 stale 状态，不自动读写 AI session index，也不自动切换 general-chat 历史；显式打开、发送消息、AI 结果变化仍按原会话持久化规则落盘；`concept-coach` 则只显示当前卡 `contextSignature` 对应的结构化结果，没有命中时展示空态而不是继续挂上一张卡的结果
- `general-chat` 使用树上的 skill-scoped 活动 worldline 投影，可调用 `context-read`、`siyuan-read`、`review-read`、`web`、`vars` 工具组；未配置搜索 backend 时只保留 URL 抓取，不伪装搜索能力；历史回灌时只带主链 `user / assistant primary` 文本，不再把 tool-log、approval、supplemental reply、failure bubble 或 `<tool-chain-summary>` UI 摘要重新喂给模型
- 读工具默认自动执行；`FetchWebPage / SearchWeb / QueryBlocksSql` 默认 `ask-once`；`flashcard-write` 等写入意图工具默认 `ask-always`；审批通过后会恢复同一轮工具链继续执行，并有“重复相同工具+参数”防抖与总调用预算，避免无限读同一上下文
- `general-chat` 的 OpenAI / OpenAI-compatible provider 走真 SSE 文本增量和 abort；Claude/Gemini 先继续 buffered，但复用同一套运行中/停止态 UI
- 首轮运行把 `baseRun + 6 个 tab.run` 与 `concept-coach/full-run` 契约组合成最终 `system` prompt，并通过 `LLMPort` 请求 `json_object` 输出模式，一次性填充 `工作定义 -> 多视角理解 -> 整合理解 -> 自测卡 -> CDF 语义卡 -> 现实触发器`；其中 `self-test-cards` 固定输出 canonical 自测草稿，`cdf-structure` 固定输出语义 JSON，不再要求模型直接产出 `:::` / `;;;` markdown；当某个描述符组下有超过 1 个子项时，模型必须把每个 `items[].text` 写成 `提示→答案`
- `concept-coach` 的首轮用户 prompt 以 skill scope 节点写入，因此会在 5 个 tabs 里共享可见；Tab 局部重跑、tab 追问和 tab 结果都以 tab scope 节点写入，只影响当前 tab 的活动 leaf
- Tab 局部重跑只组合 `baseRun + 当前 tab.run + concept-coach/<tab>`，只替换当前 tab 的结构化结果与当前 tab 世界线投影
- Tab 追问只使用当前 `tab.followUp`，并携带“当前分隔段 + pinned 节点”的当前 tab 结果上下文，隐藏节点不会进入模型上下文
- `多视角理解` / `整合理解` 的结构化结果归一化容忍别名、wrapper、直接 section、字符串/数组/对象混合形状；部分成功会显示可恢复内容和 warning，不再静默空白
- `自测卡片` section 现在保存 canonical 草稿 `{ creationMode, cards[] }`；每张草稿主结构为 `id / kind / selected / summary / prompt / answer / details / clozeTargets`，旧 `question / answer`、`draftMarkdown + mode` 和遗留 `modeDrafts.multi-mark / cdf-multiline` 结果会在读取时兼容归一，但 active path 不再生成或切换到这两种旧模式。内置默认 Prompt 语义上要求 `summary` 只作简短识别、`prompt` 短且需要回忆、`answer` 通常控制在 `3-20` 个字、`details` 默认空数组且仅在必要时补 1-2 条极短上下文，并优先覆盖辨析 / 因果 / 应用 / 反例 / 触发等题型。工作台顶部只保留 `list-item / mark / heading / super-block` 四种原生模式，本地直接重渲染，不再为 `multi-mark / cdf-multiline` 走二段 draft 生成
- structured 结果仍按 `contextSignature` 标记 stale，但 stale 现在只表示“继续追问当前结构化阶段前需要重跑”；用户仍可查看历史、编辑候选卡、切换本地自测模式并基于旧结果制卡，`general-chat` 不受该 stale 限制
- 旧 explain session 会保留历史消息作为 legacy session 打开，并显示“旧解释结果仅供查看，重跑后生成完整 tabs”的提示；重跑后生成新的 `concept-coach` 五阶段结果
- `AiWorkbenchPane.vue` 现在是通用 chat shell：顶部 Skill 切换、按 Skill 显示 tab/section、消息流支持文本、结构化结果、底部 composer 和 context 附加；主 timeline 使用 reply-first render projection，只显示用户消息/最终回复/结构化结果/分隔，tool timeline、审批历史、推理和诊断默认折叠到回复下方，pending 审批显示为当前回复下方的 inline approval card，消息操作移到消息尾部 toolbar，尾部 `•••` 菜单改为受控弹层，支持点空白、`Escape` 或执行动作后关闭；消息请求失败会直接渲染成当前会话流里的 error bubble，并在消息尾部提供“重试本次 / 编辑后重发”，不再长期占用顶部全局错误 banner

UI surface：

- `src/ui/ai/AiWorkbenchDialog.vue`
- `src/ui/ai/AiWorkbenchPane.vue`

### 4.5 Mobile entry

当前移动端主路径：

1. `src/index.ts` 判断 `isMobile`
2. 顶栏动作改为 `DialogManager.openMobileQueueLauncherDialog()`
3. 挂载 `src/ui/mobile/MobileReviewLauncher.vue`
4. 用户从 launcher 继续进入 queue-specific review 或 browser

桌面端顶栏主路径仍是 `openBrowserDialog()`。

---

## 5. 文件职责地图（完整运行时地图）

说明：

- 本节覆盖当前运行时主链路与高频文件职责
- 目标不是枚举所有历史文件，而是让协作者能快速定位“这类行为该去哪一层、哪一组文件找”
- `__tests__`、备份文件、历史迁移文档不作为主架构基线

### 5.1 根入口（`src/`）

- `src/index.ts`：插件生命周期入口；创建 `ApplicationContext`，注册顶栏、Dock、命令、Slash、移动端入口与事件处理器。
- `src/main.ts`：独立前端挂载入口，主要用于调试 / standalone surface。
- `src/App.vue`：前端壳层组件。
- `src/commands.ts`：命令入口的轻量封装。
- `src/index.scss`：全局样式入口。
- `src/global.d.ts` / `src/shims-vue.d.ts`：全局与 Vue 类型声明。

### 5.2 Application 层（`src/application/*`）

组合根与管理器：

- `src/application/ApplicationContext.ts`：唯一组合根、服务注册表、生命周期与依赖注入容器。
- `src/application/managers/DialogManager.ts`：Browser / Review / AI / Progressive dialog 总入口。
- `src/application/managers/MenuManager.ts`：顶栏与菜单动作编排。
- `src/application/managers/TabManager.ts`：Browser / Review / AI companion tab 生命周期与 handoff。
- `src/application/managers/DockManager.ts`：Dock panel 初始化与交互。
- `src/application/managers/BlockMenuHandler.ts`：块菜单、文档菜单、编辑器菜单入口动作。
- `src/application/managers/PracticeQueueManager.ts` / `ReviewSyncManager.ts`：复习与同步相关的应用层管理。

核心应用服务：

- `src/application/services/UnifiedDataSourceManager.ts`：统一队列创建、缓存、失效、观察者通知中心。
- `src/application/services/CardApplicationService.ts`：卡片创建 / 更新 / 删除的应用编排入口；SQL active 时通过 read model `countCards()` 提供 due / total 计数。
- `src/application/services/BrowserApplicationService.ts`：Browser 读模型、统计与交互动作的主服务；SQL active 时优先消费 `BrowserDeckReadPort` 做 deck page、matched ids、rows-by-ids、stats 与 source-existence 懒刷新，SQL 不可用或查询不可表达时回退旧 snapshot kernel。
- `src/application/services/ReviewApplicationService.ts`：复习流程相关编排；依赖 `ReviewSiyuanPort`，由 `ApplicationContext` 注入 `ReviewSiyuanAdapter`。
- `src/application/services/SettingsService.ts` / `ReviewLogService.ts` / `RiffBlacklistService.ts`：配置、日志、黑名单等横切服务；其中 `ReviewLogService` 在 SQL active 时写 `review_events / drill_events / reschedule_events`，旧 JSON 月度分片只作为迁移来源或 SQL 失败后的 fallback；`SettingsService` 在 init/update 时负责把持久化的 `ui.enableDebugLogs` 同步到运行时 logger 级别与 console bridge。
- `src/application/services/XiuyuanSyncService.ts`：Riff 对账服务；增量/全量先规划 `SyncChangeSet`，再通过 Xiuyuan repository 单次提交；增量只做幂等 upsert / 元数据同步，全量才允许删除 riff-owned Xiuyuan；native `removeFlashcards` 现在走同服务内的 `riff-managed` 定向本地删除，而不是再依赖增量同步或 full sync 才收敛。
- `src/application/services/ReviewQueuePreparationService.ts` / `DocTreeReviewScopeService.ts`：review scope 与 queue preparation 编排；SQL active 时 doc-tree scope 先用 `root_id IN (...)` 查询候选 card id，再按 id hydrate，SQL 不可用时回 storage scan。
- `src/application/services/ReviewScopeCardCreationSyncService.ts`：review scope 内的卡片增删事件桥接；监听 `CardCreated / CardDeleted / CardsDeleted`，把新增或删除同步到 `UnifiedDataSourceManager`，让打开中的 Browser / Review 队列通过统一 observer 链路刷新。
- `src/application/services/ConfiguredCaptureStorageService.ts`：capture 目标存储解析与写入策略。
- `src/application/services/ExcerptRecordService.ts`：摘录记录与去重相关服务。
- `src/application/services/ProgressiveReadingService.ts`：progressive split / excerpt 的主编排服务。
- `src/application/services/SelectionExcerptService.ts`：选择态摘录门面。
- `src/application/services/SelectionTopicContinuationService.ts`：选区继续制卡门面，负责同步 menu 预判和异步 progressive source context 解析。
- `src/application/services/TopicDerivedItemService.ts`：topic continuation / derived item 创建编排。
- `src/application/services/AIWorkbenchSessionStoreService.ts`：AI 会话索引 + 单会话 JSON 持久化。
- `src/application/services/ArenaStoreService.ts`：Arena store facade；SQL active 时写 `algorithm_registry / arena_predictions / arena_outcomes / arena_metric_bins / arena_score_snapshots / ai_arena_events / ai_card_attributions`，旧 `arena/store.json` 只作为迁移来源或 fallback；非复习 AI 动作通过 `commitBatch()` 把 match、score snapshot、card attribution 合成一次 store 提交，SQL path 只触发一次 persist，legacy JSON path 只读改写一次。
- `src/application/services/ArenaKernelService.ts`：Arena 统一内核；负责 AI 场景池、策略包加权抽样、pin/retire/clone/challenge 管理、AI 行为评分、SRS 七选手只读 counterfactual、Universal/Calibration metric 与 delayed attribution；`recordAIEvent / applyAttributedReviewFeedback / selectAIPack` 以“一逻辑 AI 动作最多一次 persist”为边界提交。
- `src/application/services/ReviewAIWorkbenchRegistry.ts`：AI 工作台会话注册中心。
- `src/application/services/AIChatSkillRegistry.ts`：通用 AI chat Skill 注册表；负责合并内置 Skill 与 `settings.ai.userSkills[]`，并把用户 chat / structured skill 解析成统一的 runtime 描述符与 tab/section 元数据。
- `src/application/services/AIChatToolRegistry.ts`：AI chat 工具描述符、工具组、执行策略与可见性注册。
- `src/application/services/AIChatToolExecutorService.ts`：AI chat 工具执行链，负责插件内读工具、网页抓取/搜索、制卡工具执行、执行/结果审批、长参数/长结果变量缓存与 `$VAR_REF{{...}}` 引用解析。
- `src/application/services/AIChatApprovalService.ts`：AI chat 写工具审批请求的轻量状态服务。
- `src/application/services/AIChatVarStoreService.ts`：AI chat 会话级变量缓存，支撑 `ListVars` / `ReadVar`。
- `src/application/services/AIFlashcardToolService.ts`：AI 制卡工具门面，集中处理制卡目标解析、块写入、mutation 子树定位，以及原生 Riff / Xiuyuan 制卡桥接。
- `src/application/services/AISelfTestCardCreationService.ts`：自测卡模式分发门面，把 `creationMode + draftMarkdown` 映射到原生列表项/标记/标题/超级块或插件多标记/CDF 工具。
- `src/application/services/SharedReviewSessionRegistry.ts`：插件托管 review 分屏的共享 session 注册中心。
- `src/application/services/AIWorkbenchService.ts`：通用 AI chat runtime 与 concept-coach 结构化 renderer 的状态和动作编排。

适配器、工厂、查询、用例：

- `src/application/factories/createUnifiedReviewDialog.ts`：统一 review dialog 工厂。
- `src/application/factories/createReviewRenderServices.ts`：review special renderer service 装配边界，接收 composition root 注入的 quick / descriptor block adapters 后创建 render services。
- `src/application/adapters/UnifiedQueueStrategy.ts`：review session 到 queue domain 的策略适配；`IncrementalLearning` 现在走独立的 requery-after-feedback 模式，评分/跳过后只记录一次性 `avoidOnceCardId + avoidOnceBlockId` 可见身份，下一次 `next()` 会重新读取 queue 视图并优先切到不同 source block 的卡，只有没有替代 block 时才退化到同 block 兄弟卡或同卡，而不是继续复用 `pendingRotateCardId + currentIndex + cache hot patch` 的本地轮转链；同时它也是 review 当前卡显示态 hydration 的唯一活跃入口，`next()/goBack()` 之外的 restore/refresh/load-by-block 会复用同一套 `maybeAddNextDues()` 逻辑，而不是在 controller 再复制一份预览计算；它直接注册为 `UnifiedDataSourceManager` observer，收到当前队列 `queue-changed` 会失效本地缓存，收到 `card-deleted` 会从缓存与前进 buffer 移除匹配卡；如果评分时确认当前 active item 已不存在，则清理 stale item 并抛 `QueueItemUnavailableError`；其他 feedback 失败会做不落盘补偿，恢复 queue snapshot、session exclusions、当前卡与评分前 card 内存态
- `src/application/adapters/UnifiedReviewAdapter.ts`：review UI 状态与动作适配。
- `src/application/queries/browser/*`：Browser 查询对象与处理器；shared 目录承载 application 可用的 browser row projection / sort / filter helper，并为 SQL page hydrate 复用同一套 Browser row 投影。
- `src/application/queries/card/*`：卡片查询对象与处理器。
- `src/application/queries/DataAccessFacade.ts`：查询门面与统一数据访问入口；依赖 `QuerySiyuanPort`，由 `ApplicationContext` 注入 `QuerySiyuanAdapter`。
- `src/application/queries/CardContentQueryService.ts`：批量块内容查询服务，依赖 `QuerySiyuanPort`，由 `ApplicationContext` 注入 `QuerySiyuanAdapter`。
- `src/application/usecases/card/*`：卡片 CRUD 用例。
- `src/application/usecases/xiuyuan/*`：修远创建 / 删除 / 重绑定 / 查询用例。
- `src/application/commands/card/*` / `src/application/commands/xiuyuan/*`：命令对象层。

Handlers / entries / helpers：

- `src/application/handlers/AutoCardHandler.ts`：自动制卡、topic continuation、与 Riff / Progressive 的事件联动；当前监听制卡走“transaction 只标记候选块，300ms settled 后重读真实块状态再做 planner / Xiuyuan ensure”的语义触发模型。
- `src/application/handlers/ProgressiveExcerptHotkeyHandler.ts`：编辑器 / review 摘录热键入口。
- `src/application/entries/*`：surface 级入口解析，如 block context、selection resolver、review entry registry。
- `src/application/helpers/CardCreationHelper.ts`：建卡共享辅助逻辑。

端口与接口：

- `src/application/ports/*`：应用层端口定义，约束基础设施依赖方向；`BrowserDeckReadPort` 是 Browser deck SQL 读优化端口，UI 不直接依赖 SQLite。
- `src/application/interfaces/*`：应用层接口契约。

### 5.3 Core 层（`src/core/*`）

队列与调度：

- `src/core/queue/domain/BaseReviewQueue.ts`：队列聚合根基类。
- `src/core/queue/domain/RetrievalPracticeQueue.ts`：检索练习队列。
- `src/core/queue/domain/FinalDrillQueue.ts`：最终训练队列。
- `src/core/queue/domain/IncrementalLearningQueue.ts`：渐进学习队列。
- `src/core/queue/domain/FilterGroupQueue.ts`：筛选复习队列。
- `src/core/queue/domain/NeuralRoamQueue.ts`：神经漫游队列。
- `src/core/queue/domain/LeechReviewQueue.ts`：难点攻坚队列。
- `src/core/queue/domain/SubsetReviewQueue.ts` / `TemporaryDrillQueue.ts`：会话性与辅助队列。
- `src/core/queue/sequencers/*` / `src/core/queue/schedulers/*`：队列内抽卡与排序策略。
- `src/core/queue/neural/*`：神经漫游引擎、历史、trace、传播相关能力。
- `src/core/scheduler/SchedulerRouter.ts`：全局调度路由器。
- `src/core/scheduler/AdvanceEngine.ts` / `PostponeEngine.ts` / `SpreadEngine.ts` / `rescheduleService.ts`：重排与计划引擎；浏览器 Spread 全局默认只收 due/outstanding，勾选“考虑未来复习”才纳入收集期内未来卡，队列模式用 `collectAllCards` 分摊当前队列全集。
- `src/core/scheduler/strategies/*`：具体调度器实现。
- `src/core/scheduler/strategies/SM2ReadOnlyScheduler.ts`：Arena 专用 SM-2 只读评估器，只参与 counterfactual，不进入正式调度路由。
- `src/core/scheduler/strategies/ClassicSMScheduler.ts`：Arena 专用 classic SM 家族只读评估器，覆盖 `sm5 / sm8 / sm18 / sm20` 的 shadow prediction，不进入正式调度路由。

存储、卡片、修远：

- `src/core/storage/*`：统一存储、持久化回调、底层存储管理；`UnifiedStorageManager.batchUpdateCards()` 用于调度/浏览器批量写，批内只重排一次 due 索引、只安排一次 autosave。
- `src/core/card/*`：卡片领域对象、渲染、卡型实现与卡片规则。
- `src/core/card-builder/*`：卡型识别、元数据提取与构建辅助。
- `src/core/card-type/*`：卡型标记与规则映射。
- `src/core/xiuyuan/domain/*`：修远聚合、值对象、领域服务、领域事件。
- `src/core/xiuyuan/infrastructure/XiuyuanRepository.ts`：修远仓储核心实现。
- `src/core/xiuyuan/templates/*`：内置模板与模板注册。

共享能力：

- `src/core/shared/domain/events/EventBus.ts`：共享事件总线。
- `src/core/infrastructure/websocket/TransactionWebSocketService.ts`：事务级 `ws-main` 事件总线订阅与 handler 分发；当前是 AutoCard、doc tree review scope、native riff add/remove 路由、review source refresh 的唯一活跃 transaction 入口。
- `src/core/infrastructure/websocket/QuickCardWebSocketService.ts`：旧快速卡 websocket；当前不在 active runtime 链路中，仅保留作历史实现参考，不应重新接回第二条监听源。
- `src/core/siyuan/*`：核心 Siyuan API 封装；不应成为 UI / application 直连入口。

### 5.4 Infrastructure 层（`src/infrastructure/*`）

Siyuan / Riff / LLM 适配器：

- `src/infrastructure/siyuan/BrowserSiyuanAdapter.ts`
- `src/infrastructure/siyuan/ReviewSiyuanAdapter.ts`
- `src/infrastructure/siyuan/QuerySiyuanAdapter.ts`
- `src/infrastructure/siyuan/ManagerSiyuanAdapter.ts`
- `src/infrastructure/siyuan/CardCreationSiyuanAdapter.ts`
- `src/infrastructure/siyuan/CardDeletionSiyuanAdapter.ts`
- `src/infrastructure/siyuan/AutoCardSiyuanAdapter.ts`
- `src/infrastructure/siyuan/AutoCardRiffAdapter.ts`
- `src/infrastructure/siyuan/XiuyuanSiyuanAdapter.ts`
- `src/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter.ts`
- `src/infrastructure/siyuan/ProgressiveSiyuanAdapter.ts`
- `src/infrastructure/siyuan/ProgressiveNativeRiffAdapter.ts`
- `src/infrastructure/siyuan/ConfiguredCaptureStorageSiyuanAdapter.ts`
- `src/infrastructure/siyuan/AISiyuanAdapter.ts`
- `src/infrastructure/llm/OpenAICompatibleLLMAdapter.ts`：统一 `LLMPort` 的基础设施适配器，支持 OpenAI-compatible / OpenAI / Claude / Gemini 协议和结构化输出传输诊断；provider 自定义 endpoint 既可写完整 URL，也可写 sy-f-misc 风格的相对路径（如 `/chat/completions`、`/messages`、`/models/{model}:generateContent`），运行时会先按 `baseUrl` 解析成最终请求地址，再发起真实上游请求，避免相对地址误打到宿主环境。

持久化与支撑：

- `src/infrastructure/persistence/*`：卡片仓储、DTO、mapper、持久化映射。
- `src/infrastructure/persistence/sqlite/*`：sql.js 单文件持久化层；`SqliteDatabaseService` 负责 `siyuanmemo.db`、schema、算法注册、FTS5 能力检测、二进制 DB 落盘、事务级 persist 合并与 persist 失败后的 SQL 内存状态恢复，schema v3 在 `cards` 增加 Browser 常用投影、`search_text/card_type_marker`、`source_exists/source_checked_at/source_missing_at` 与索引；repository 负责 unified store、Browser deck SQL read port、source-existence cache、queue state、review logs 与 Arena append-only 数据。SQL active 时 `algorithm_card_state` 是当前调度状态权威来源，`cards`/DTO 的调度字段只作为兼容快照与查询投影；`SqliteMigrationService` 负责旧 msgpack/JSON 到 SQL 的一次性迁移，并执行 `algorithm-card-state-production-v1` 回填、备份与 dirty diagnostic。
- `src/infrastructure/queries/CardReadModel.ts` / `SqlCardReadModel.ts`：卡片读模型实现；legacy 读内存 `UnifiedStorageManager`，SQL active 读 `SqlUnifiedStorageRepository.queryCards()/countCards()`，先走 `cards` 表索引字段，再执行 suspended/tags/customFilter 等残余过滤。
- `src/infrastructure/services/FileService.ts` / `QueuePersistenceService.ts`：文件与队列持久化支撑；SQL active 时 `QueuePersistenceService` 只读写 `queue_state`，旧 `queues.msgpack` 只作为迁移来源或 fallback。
- `src/infrastructure/queue/*`：队列相关副作用适配器。
- `src/infrastructure/events/*`：基础设施层事件处理。
- `src/infrastructure/notifications/SiyuanErrorNotificationAdapter.ts`：错误通知适配器。

### 5.5 UI 层（`src/ui/*`）

Browser：

- `src/ui/browser/SRSBrowser.vue`：Browser 主视图。
- `src/ui/browser/SRSBrowserAdapter.ts` / `SRSBrowserQueueView.ts`：Browser 桥接与队列视图逻辑。
- `src/ui/browser/composables/*`：Browser 状态、刷新、排序、筛选、动作封装。
- `src/ui/browser/datasource/*`：Browser UI-side datasource 实现；共享 DTO、query parser、row id、sort contract 已迁到 `src/types/browser.ts`，application query 不从这里取契约；deck datasource 在 service 提供 `getDeckPage/getDeckMatchedIds` 时直接使用应用层分页端口，不再先构造全量 snapshot。
- `src/ui/browser/components/*` / `dialogs/*` / `utils/*`：Browser 交互组件与工具。

Review：

- `src/ui/review/v2/ReviewView.vue`：复习主界面。
- `src/ui/review/v2/useReviewSession.ts`：复习会话状态机。
- `src/ui/review/v2/*`：header / actions / overlays / providers / dialogs / neural tab bridge 等 review 子组件。
- `src/ui/review/components/*`：各卡型渲染组件。
- `src/ui/review/index.ts`：只导出 active v2 review surface；历史 `ReviewViewAdapter` / provider-backed review path 不再是运行时入口。

移动端、渐进阅读、AI：

- `src/ui/mobile/MobileReviewLauncher.vue`：移动端队列 launcher。
- `src/ui/progressive/ProgressiveSplitDialog.vue`：progressive split surface。
- `src/ui/ai/AiWorkbenchDialog.vue`：standalone AI dialog。
- `src/ui/ai/AiWorkbenchPane.vue`：AI pane 主内容。

其他 UI：

- `src/ui/settings/SettingsPanel.vue`：设置面板。
- `src/ui/srs/*`：SRS 数据编辑与透明度相关 UI。
- `src/ui/arena/ArenaManagerDialog.vue`：Arena Manager 管理面板，用于查看 AI / SRS 排名、时间线和策略包管理动作。
- `src/ui/xiuyuan/*`：修远模板与专用 UI。
- `src/ui/menu/TopBar.ts`：顶栏菜单入口。
- `src/ui/components/*` / `src/ui/shared/*`：通用 UI 原子组件与共享加载逻辑。

### 5.6 类型与工具（`src/types` / `src/utils`）

核心类型：

- `src/types/unified-data-source.ts`：`QueueType`、`IReviewQueue`、observer、Neural Roam session contract。
- `src/types/browser.ts`：Browser 共享 DTO、open-state、筛选/排序契约、query parser、stable card id helper；用于隔离 application query 与 UI browser module。
- `src/types/card.ts` / `review.ts` / `scheduler.ts` / `settings.ts`：各主业务域类型。
- `src/types/ai.ts`：AI workbench surface、session 与交互契约。
- `src/types/result.ts`：统一 Result 类型。
- `src/types/queue-browser.ts` / `reschedule*.ts` / `logging.ts`：各 surface 与横切类型。

共享工具：

- `src/utils/logger.ts`：统一日志入口；通过 `applyDebugLogPreference()` 把设置层的“调试日志”开关映射到运行时 `debug/warn` 级别和 legacy console bridge。
- `src/utils/dialog.ts`：dialog surface 创建工具。
- `src/utils/configMigrator.ts` / `simpleModeRemovalMigrator.ts`：配置迁移工具。
- `src/utils/queryCache.ts` / `batchQuery.ts` / `sqlOptimizer.ts`：查询与缓存工具。
- `src/utils/errorReporter.ts` / `EventEmitter.ts`：错误与事件辅助。
- `src/utils/*` 下其他性能、日期、异步工具：作为横切支撑，不承载业务规则。

---

## 6. 统一队列系统（Unified Data Source）

统一队列契约定义于：

- `src/types/unified-data-source.ts`

统一队列运行时中心：

- `src/application/services/UnifiedDataSourceManager.ts`

当前主字面量队列类型：

- `retrieval-practice`
- `final-drill`
- `incremental-learning`
- `filter-group`
- `neural-roam`
- `leech`

补充说明：

- `subset`、temporary drill 等会话型 surface 存在，但不是 `QueueType` 主字面量的一部分
- `neural-roam` 的字面量不变，但当前活跃契约是 focus-first
- 活跃队列语义以 `QUEUE_ARCHITECTURE.md` 为专题事实源；其中固定了 6 个活跃队列的 `membership rule / base order / post-review retention`
- 浏览器列排序是 view-only 行为，不允许通过 `queue.sort()` 或 `reorder()` 改写真实队列顺序
- 复习后是否留队由具体队列自己的 active-window 语义决定，而不是统一 today-window 或历史启发式

`UnifiedDataSourceManager` 负责：

- 懒加载并缓存队列实例
- 统一暴露队列 facade
- 统一暴露 Browser 可用批量 facade：`batchUpdateCards`、`batchDeleteCards`、`batchAddToQueue`、`batchRemoveFromQueue`
- 处理卡片变更后的队列失效与重建
- 统一处理卡片删除同步：发布 `card-deleted` 数据事件，并为所有可能受影响的队列发布 `queue-changed`
- 通过 observer / data change event 通知 Browser、Review 与其他消费者

具体队列实现位于：

- `src/core/queue/domain/*`

当前 6 个活跃队列的运行时摘要：

- `RetrievalPractice` / `IncrementalLearning`：today-window 队列，基础顺序 `due -> priority -> id`，允许 outstanding/manual 稀疏插入；其中 `IncrementalLearning` 的 unified review 推进现在以“反馈后重新读取 queue.getCards() 视图”为单一真相源，评分或跳过后把同一 source block 的兄弟卡视为同一个可见卡单元并优先避开，存在不同 block 替代卡时强制切过去，不再在 unified 层本地 splice/rotate 当前缓存数组
- `FilterGroup`：filter-backed 队列，复习后按当前 filter 镜像留队
- `FinalDrill`：静态练习队列，评分 `4` 出队，评分 `1/2/3` 留队并移到尾部
- `NeuralRoam`：engine-session 队列，不因窗口自动出队
- `Leech`：按 `lapses/manual membership` 建队列，但复习后仍按 today-window 判定留队

---

## 7. Browser 架构与数据流

打开链路：

1. `DialogManager.openBrowserDialog()`
2. 挂载 `SRSBrowser.vue`
3. Browser 从 `BrowserApplicationService`、`TabApplicationService`、`UnifiedDataSourceManager` 读取数据与动作

Browser 核心职责：

- 表格视图与 hierarchy 视图
- queue / global / filtered / deck 等模式切换
- 队列计数、排序、筛选、卡片批量动作
- 文档预览与单路径打开
- Neural Roam 的 browser-side 子视图

Browser 分层边界：

- `src/types/browser.ts` 是 Browser surface 与 application query 共用的 DTO / open state / query parser / row identity / sort display contract 来源。
- `src/application/queries/browser/shared/*` 承载 application 可复用的 row projection、filter 与排序逻辑；`BrowserApplicationService`、`BrowserDeckQueryKernel`、`QueueBrowserQueryKernel` 不从 `src/ui/browser/*` 导入契约或 helper。
- SQL active 的 Browser deck 主表读取由 `BrowserDeckReadPort` 承接：`DeckDataSource.fetchRows()` 调 `BrowserApplicationService.getDeckPage()`，repository 做 `COUNT + LIMIT/OFFSET` 后只 hydrate 当前页；选择“全部匹配”调 `getDeckMatchedIds()` 取完整有序 id 列表，批量动作再按 id hydrate。
- Source existence 以 SiYuan `blocks` 为真源、SQLite 为懒刷新缓存：正常 deck 查询排除 known missing 且 unknown fail-open，`__lost__` / `missing-block-only` 读取 known missing；stats 先返回 SQL 当前统计并后台刷新 stale/unknown；`QueueBrowserQueryKernel` 只用 SQL source cache 标记 missing，不物化队列 membership/order。
- Browser 搜索优先使用 `search_text/content_text/tags/root/deck` 投影；当前 sql.js 构建不支持 FTS5 时走 `LIKE` fallback，不硬建 FTS 表；retrievability 等 SQL 不可表达查询显式回 snapshot。
- `src/ui/browser/browserService.ts` 只保留 UI-side helper；SQL、消息、文档树和 block projection 必须显式传入 `BrowserSiyuanPort` / `UnifiedDataSourceManager`，不再维护全局 browser context。
- Browser 右键批量动作不直连底层 infra：删除、优先级、重置、暂停/恢复经 `UnifiedDataSourceManager.batchDeleteCards()` / `batchUpdateCards()`，队列加入/移除经 `batchAddToQueue()` 或 queue domain `addCards()` / `removeCards()`；完成后 datasource 只做一次 cache invalidate / reload / forceRefresh。
- `src/ui/browser/browserService.v2.ts` 已删除，旧 import 不应恢复。

当前 Browser 主刷新机制：

- `useBrowserAdapterSync`：订阅数据变化
- `useIncrementalGridUpdates`：按受影响 card / snapshot id 做表格补丁刷新
- `useQueueBridge`：刷新队列计数与 queue-side 状态

Browser 不应：

- 直接实现调度规则
- 绕过 application service 直接写入底层存储
- 把 `core/siyuan/*` 当成默认调用入口
- 让 application query/service 反向 import `@/ui/browser/*`

当前 suspended / pause 真相源补充：

- Browser 的 `已暂停` 预设、统计与卡片投影现在以统一存储中的 `meta.suspended` / dismiss-state 为主，不再把 `attributes.custom-fsrs-suspended` 当作现行查询真相源。
- Browser 的批量暂停/恢复只更新统一存储与 cache，不再写块属性。
- `custom-fsrs-suspended` 仅保留为旧卡片兼容读取来源，不再是后台写入目标。

---

## 8. Review 架构与数据流

Review surface 的当前统一点是：

- 打开由 `DialogManager` 决策
- session 由 `createUnifiedReviewDialog` 建立
- queue 行为经 `UnifiedQueueStrategy`
- UI shape 经 `UnifiedReviewAdapter`
- special renderer service 由 `ApplicationContext.createReviewRenderServices()` 经 `ReviewView.vue` 注入 `ReviewContent.vue`

Review 运行时要点：

- `ReviewView.vue` 负责界面、键盘交互、progressive excerpt 触发、AI companion session 对齐，以及 review header `更多` 菜单对 `ReviewApplicationService` / `CardEditorApplicationService` / `CardApplicationService` 的二级动作编排；块内容编辑与当前依赖块 transaction 命中时只软刷新当前 `ReviewContent`，其中 transaction 来自共享 `TransactionWebSocketService` 而非每个复习面单独监听 `ws-main`；用户正在主 Protyle 内原生编辑时跳过自动 source refresh
- `useReviewSession.ts` 负责把 Vue 生命周期绑定到共享或本地 `reviewSessionController`
- `reviewSessionController.ts` 负责真正的 review session 状态机、动作串行化，以及多 surface 共享时的单一 authoritative controller；它不自己计算 `nextDues`，只在 restore/refresh/load-by-block 等直写当前卡路径上调用 queue strategy 的显示态 hydration
- queue-specific header / actions / variant 由 adapter 与 queue config 决定
- `TabManager` 负责 review tab、browser handoff、AI companion tab 复用；插件托管 review 分屏时会携带 `sharedReviewSessionId + reviewState`
- deprecated provider-backed path 已移除：`ProviderBackedQueueStrategy`、`QueueProvider`、`ReviewViewAdapter`、`ReviewViewController` 与 `src/core/extensions/*` 不再属于 active review runtime

这意味着：

- 评分、跳过、custom action 先查 `useReviewSession.ts`
- 如果是 queue semantics，继续查 `UnifiedQueueStrategy.ts`
- 如果是 UI 展示或 header variant，继续查 `UnifiedReviewAdapter.ts`
- 如果是 special renderer infrastructure 装配，查 `ApplicationContext.createReviewRenderServices()` 与 `createReviewRenderServices.ts`，不要在 UI 组件里直接创建 repository / Siyuan adapter，也不要给 `ReviewContent.vue` 增加 fallback factory

当前 review-side suspend 补充：

- review header `更多` 菜单里的暂停/恢复统一走 `CardEditorApplicationService`，只更新统一存储中的 dismiss-state，不再写 `custom-fsrs-suspended`。
- `CardEditorApplicationService.loadSnapshot()` 仍会对缺少显式 dismissed meta 的旧卡片兼容读取 `custom-fsrs-suspended=true`，但该属性不再是现行写回目标。

---

## 9. Progressive / Excerpt / Topic-derived item

当前 progressive 相关能力已经汇聚到一条主路径：

- progressive split：`DialogManager` -> `ProgressiveSplitDialog.vue` -> `ProgressiveReadingService`
- progressive excerpt：热键 / block menu / review surface -> `SelectionExcerptService` -> `ProgressiveReadingService`
- editor manual continuation：`ProgressiveExcerptHotkeyHandler` -> `SelectionTopicContinuationService` -> `TopicDerivedItemService` -> `ProgressiveReadingService`
- topic continuation：`AutoCardHandler` -> `TopicDerivedItemService` -> `ProgressiveReadingService`

角色划分：

- `ProgressiveReadingService`
  - 创建 split piece / excerpt / 相关 workbench 文档
  - 维护来源块、来源文档、摘录记录、去重与回滚
  - 协调 card service、capture storage、Riff / Siyuan 边界
- `SelectionExcerptService`
  - 负责把 selection-oriented 输入适配到主 progressive 服务
- `SelectionTopicContinuationService`
  - 负责在菜单打开时同步判断当前选区是否位于 topic / excerpt 语境
  - 负责把选区 DOM/文本拆成 `plannerContent` 与 `artifactContentDom` 两份载荷：前者保留 block-ref 等 planner 语义，后者保留 `[*]` 锚文本、高亮和内联结构供 Item 子文档直接落地
  - 负责当前块 native `mark` 的批量扫描与 fan-out，把每个高亮拆成 1 个 `manual-cloze` candidate，并在 artifact DOM 里只保留当前目标高亮、展平其它高亮
- `TopicDerivedItemService`
  - 在 topic / excerpt 语境中派生 item，并保持 lineage
  - excerpt-doc 下强制直挂 `Item` 子文档；excerpt-block 下保留 daily-note 文档容器并写回 `parentExcerptId`
  - 手动 Topic cloze 优先使用 `contentDom` 创建 Item 子文档，而不是把 `[*]` / `mark` 退化成纯 `((id))` / `==...==` 文本

块级入口补充：

- 编辑器右键 / `⌥⇧Z`：单空即时处理，只允许单块单目标
- `BlockMenuHandler`：为 Topic / excerpt 语境且当前块已有 native `mark` 的块图标菜单增加 `从当前块高亮补齐 Item`，只扫描当前块，不做整篇 Topic 文档批量补齐

边界规则：

- 对 Siyuan 文档 / 块结构的实际写操作，经 `ProgressiveSiyuanPort`
- 对 native Riff 同步，经 `ProgressiveNativeRiffPort`
- 对 capture 落点，经 `ConfiguredCaptureStoragePort`

Progressive 制卡契约：

- split / excerpt / topic-derived 生成物创建的是本地 Xiuyuan / FSRS 卡，并通过 `ProgressiveNativeRiffPort` 注册到原生 Riff；linear split 只立即为当前 active piece 建 Topic 卡，完成当前片后再释放下一片，nonlinear split 则立即为全部 piece 建 Topic 卡。
- 术语约定：自动生成的摘录统一视为 `Topic`，在 Topic / 摘录语境里自动或手动生成的练习统一视为 `Item`。
- 新创建的 progressive artifact 标题统一使用 `Topic / Item` 前缀，内建容器标题也同步为 `Topic 工作台`、`SiYuanMemo Topic`、`SiYuanMemo Topic 库`；历史已生成文档不做批量重命名。
- 摘录即 Topic：摘录文档、全局摘录库摘录和 Daily Note 摘录块上的后续符号/选区制卡，都会落到本地 derived Item 卡 + 原生 Riff 注册，而不是把块级 card-type 属性当作事实源。
- `⌥⇧Z` 与右键 `在 Topic 下创建 Item` 的 active path 一致：在 Topic / 摘录语境里，只要有非空单块选区就允许继续创建 Item；结构化 quick 语法沿用 planner-derived，普通选区则先把 source 选区包成原生 `data-type="mark"`，再立刻创建 1 个 manual-cloze Item。离开 Topic / 摘录语境后，`⌥⇧Z` 会退回普通文档选区包裹挖空并沿用现有普通制卡链路。
- Topic / excerpt 中的 `mark` 型 cloze 归手动 continuation 所有：程序性加亮会注册一次性 suppression，避免 `AutoCardHandler` 再按 topic-derived 自动生成第二张；手打 `==...==` / `{{...}}` / `>>` / `::` / `;;` 仍保留现有 auto symbol 链。
- derived Item 默认按普通 `Item` 契约复习；即使保留 symbol/question/answer 等派生元数据，也不会再仅凭旧式 quick-like metadata 被稳定 quick force path 误送进 quick renderer，只有显式 quick 契约卡才走 quick 渲染。
- 这些 progressive 卡的类型真相源保存在本地 Xiuyuan / FSRS 数据里，不依赖块级 `custom-fsrs-card-type`；块属性只保留必要的 `custom-xiuyuan-id`、原生 Riff 标记，以及 `custom-fsrs-reading-*` 来源/lineage 信息。
- 新的 progressive-owned `piece` / `excerpt` / `derived-item` 不再写 deprecated `custom-fsrs-card-type`，保存 / 更新 / sync 触达时也会显式 scrub 旧 attr；但非 progressive 的历史 quick/card/sync 路径仍可能兼容读写该旧属性。

---

## 10. AI Workbench / Capture

AI 工作台的当前架构已经从“固定 tab 工作台”升级为通用聊天壳，分成五层：

1. 服务注册与会话隔离
2. Skill registry / prompt contract
3. 通用 chat runtime / tool runtime / approval runtime
4. 版本化 session store / 统一树形会话与兼容投影
5. UI surface 与结构化 renderer

服务层：

- `ReviewAIWorkbenchRegistry`
  - 管理 standalone service
  - 管理按 review session 隔离的 AI workbench service
  - standalone 默认从 `general-chat` 启动；review sidecar / companion tab 默认从 `settings.ai.chatDefaults.reviewDefaultSkillId` 启动（默认 `general-chat`），显式 legacy explain/make-cards/tutor 打开请求仍会归一到 `concept-coach`
  - review 队列共享聊天只在新 runtime 初次打开时按 `reviewChatKey` 加载最近持久化会话，不把同队列不同 review 窗口合并成一个 live runtime
- `ArenaKernelService`
  - AI Arena 使用显式场景注册，不靠自由推断入池；v1 注册 `topic-auto-card / candidate-card-generation / card-prompt-rewrite / descriptor-augmentation / concept-expression-coach / note-refinement`
  - 池 key 固定由 `surface + scenarioId + targetKind + skillId/tabId` 组成；`AIWorkbenchService` 在 standalone、review sidecar、review companion 入口把 pool 上下文传给内核
  - 策略包只覆盖 prompt 与工具策略，不覆盖模型；模型选择继续由用户当前 AI settings 决定
  - 用户行为事件（exposure / accept / edit / rerun / abandon / create / manual-bad）和低权重 judge 信号会更新同一份评分快照；制卡成功会记录 card attribution，后续复习反馈再回流到来源策略包；SQL active 时这些事件全部进入 `ai_arena_events / ai_card_attributions`
- `AIChatSkillRegistry`
  - 注册内置 Skill 描述符：`general-chat` 与 `concept-coach`
  - `general-chat` 是默认通用聊天 Skill，可使用读工具、网页工具与变量工具
  - `concept-coach` 保留 `AI 理解与制卡` 的结构化 prompt、五阶段结果和候选卡 renderer，但 tab 不再是独立运行时主路径
- `AIChatToolRegistry`
  - 注册工具描述符、工具组、参数 schema、执行策略和可见性
  - 当前工具组为 `context-read`、`siyuan-read`、`review-read`、`flashcard-write`、`web`、`vars`
  - `SearchWeb` 只有在配置 `tavily | bocha | google-cse` backend 时可见；`FetchWebPage` 始终可用；`QueryBlocksSql / FetchWebPage / SearchWeb` 默认走 `ask-once`，上下文/思源/复习读取工具默认自动执行，写工具继续 `ask-always`
- `AIChatToolExecutorService`
  - 通过 `AISiyuanPort` 和浏览器 `fetch` 执行读工具与网页工具
  - 长参数 / 长结果写入 `AIChatVarStoreService`，再通过 `ListVars` / `ReadVar` 或 `$VAR_REF{{...}}` 回读
  - 支持执行审批与结果审批；`ask-once` 命中缓存后会继续真实执行工具，而不是只返回假成功
  - 写工具通过 `AIFlashcardToolService` 写入思源源块并调用 Xiuyuan，不直接在 UI 层拼装建卡细节
- `AIFlashcardToolService`
  - 复用 AI 自测卡最近一次目标记忆，或解析工具参数中的显式 `targetMode/notebookId/targetBlockId`
  - 统一用思源 detailed mutation API 写入 Markdown，再按 mutation 子树解析原生列表项 / 标记 / 标题 / 超级块或插件列表模板结构
  - 原生 list-item 会在 SQL 短时不可读时回退到根列表项 `getBlockKramdown()`，但只接受实际列表项根块，不把外层 list 容器当作制卡根
  - 原生模式通过 `AISiyuanPort.addRiffCards()` 创建思源原生卡片，插件模式继续调用 `XiuyuanApplicationService.createFromBlocks()` / `createListTemplateCards()`，并把成功目标回写为新的默认制卡位置
  - `cdf-structure` 语义制卡继续先做概念解析预览，但现在支持只在当前目标笔记本内搜索 `type='d'` 文档块，或在该笔记本根目录一键新建概念文档并把锚点写成 `resolved-manual`；自动解析不会覆盖手动结果，目标笔记本变化时 `resolved-notebook / resolved-manual` 会按 `notebookId` 变 stale；真正建卡时不再逐定义/逐描述符直接 `createFromBlocks()`，而是先写入一棵真实 CDF 源块树，再复用 `CreateCdfMultilineCardsUseCase`
- `AISelfTestCardCreationService`
  - 自测卡候选制卡的应用层分发门面
  - 根据当前工作台 `creationMode` 解析每张 canonical 自测草稿：active path 只保留原生 `list-item / mark / heading / super-block` 本地渲染；旧 `multi-mark / cdf-multiline` 仅作历史读取兼容
  - 汇总每项 `mode / insertedRootBlockId / sourceBlockIds / warnings / error`，供 pane 直接透明展示
- `AIWorkbenchSessionStoreService`
  - 通过 `FileService` 落盘 `index + per-session record`
  - 提供会话历史列表、按 id 读取、重命名、删除
  - 当前 `schemaVersion: 5` 保存树形会话、`reviewChatKey`、按 `contextSignature` 分仓的 concept-coach 结构化结果、线程兼容投影与 CDF 解析状态；读取旧记录时继续迁移为树世界线，并补齐缺失的 review 队列 key / 结构化结果索引
  - 额外保存 `AI 理解与制卡 / 自测卡片` 的最近制卡目标记忆，独立于会话 record 与设置页 schema
- `AIWorkbenchService`
  - 管理当前 session、历史索引、上下文抽屉 / 历史抽屉 UI 状态
  - 维护 `activeSkillId + activeTabId`、树节点、兼容 thread 投影、compact render 投影、tool timeline、pending approvals、vars、diagnostics
  - 运行前按当前 surface / scenario / target kind 选择 Arena 策略包，并把策略包 prompt/tool 覆盖合入 resolved skill；低信心、高分歧或连续不满意时只显示轻量挑战者提示，不做高频 head-to-head
  - `general-chat` 走多轮 `LLMPort -> tool calls -> tool results` 循环；读工具自动执行，`QueryBlocksSql / FetchWebPage / SearchWeb` 默认首次审批后缓存决定，写工具继续每次审批；审批工具暂停等待用户确认，确认后在原轮次继续执行
  - `general-chat` 每次回复链路写入 `runGroupId`，中间 assistant/tool/approval 标记为 `presentation=supplemental`，最终回复标记为 `presentation=primary`
  - 每条最终回复下方都可折叠查看工具调用次数、轮次、耗时、参数摘要、结果摘要、变量缓存引用与审批历史；这些透明化摘要只用于 UI，不再回灌模型历史；运行时仍会对重复相同工具+参数与总调用预算做保护；达到最大工具轮数后会再请求一次“不要再调用工具”的最终答复
  - `concept-coach` 仍走结构化 JSON 主链：首轮全量生成 `工作定义 / 多视角理解 / 整合理解 / 自测卡片 / CDF 语义卡 / 现实触发器` 6 个 stage，局部重跑只替换当前 stage，follow-up 只带当前 stage 结果
  - review 同队列切卡只更新 live context，不截断模型历史；structured skill 旧结果会按 context signature 标为 stale，但 Pane 只在 stale 时禁用该结构化阶段的 follow-up，仍允许查看、编辑、切换自测模式与制卡
  - `多视角理解` / `整合理解` 的归一化容忍字段别名、wrapper、直接 section、字符串/数组/对象混合形状，并把 `full / partial / empty` 诊断挂到 assistant structured result；concept-coach tab 结果现在统一先经过 `AIWorkbenchResultFormatter` 转成 markdown，所以 `多视角理解` 的 `标签项 -> 解释项` 层级可同时复用到 UI 与导出
  - `自测卡片` 的勾选项/编辑状态按当前结果消息版本保存；结果数据主结构为 `creationMode + canonical cards[]`，旧问答卡和旧 mode-specific 草稿会在读取时兼容归一
  - 工作台切换自测模式时，会同步更新 `settings.ai.conceptCoach.selfTest.defaultCreationMode`；当前只存在原生模式切换与本地预览，不再对 `multi-mark / cdf-multiline` 触发二段 draft 生成
  - 自测制卡不再硬编码 `builtin-basic-qa`；服务层通过 `AISelfTestCardCreationService` 分发到原生列表项/标记/标题/超级块四种 active mode，本地 UI 不直接调用思源 API、原生 Riff 或 Xiuyuan use case；旧 `multi-mark / cdf-multiline` 仅保留历史会话读取兼容
  - concept-coach assistant result 现在支持 `发送到思源`：复用自测制卡目标记忆，把当前 tab 的 markdown 追加成时间戳分节块写回日记或指定块，UI 仍只调 `AIWorkbenchService -> AISiyuanPort`
  - 对 DeepSeek / OpenAI-compatible 等 provider 保留 `json_object` 默认路径和 prompt-only JSON 传输兜底，诊断记录 profile / transport / status / raw body
  - 旧 explain-only 会话保留历史消息作为 legacy session 查看，重跑后再生成完整 `concept-coach` sections
- `AIPromptComposer`
  - 只提供推荐 Skill 模板描述与默认 base/tab Prompt，并与 Andy 兼容的内置 `concept-coach` 默认文案保持一致
  - 不再承担运行时结构化协议拼接职责
- `AIPromptContractRegistry`
  - 注册 `concept-coach/full-run` 与 `concept-coach/<tab>` JSON contract
  - `self-test-cards` contract 现在要求模式无关的 canonical 草稿字段（`id / kind / selected / summary / prompt / answer / details / clozeTargets`）；首轮结构化 prompt 不再追加 mode-specific 合同，具体卡型格式由本地 renderer 或插件模式二段 draft 生成决定
  - contract 语义明确要求短 `summary`、短 `answer`、默认稀疏的 `details` 与“宁缺毋滥”的候选卡质量阈值，而不是鼓励长 explanation
  - 作为运行时 prompt 追加和设置页只读 contract 说明的共同事实源
- `ConfiguredCaptureStorageService`
  - 解析 Progressive / Excerpt 当前 capture 目标与持久化策略；AI workbench 不再直接依赖它

模型与设置边界：

- `LLMPort`：上层统一使用 OpenAI-shaped `messages / tools / toolChoice / responseFormat / reasoning / stream / modelRef` 请求形状
- `OpenAICompatibleLLMAdapter`：在基础设施层适配 OpenAI-compatible / OpenAI / Claude / Gemini 协议，并把 provider diagnostic 统一回传给 runtime
- `src/types/settings.ts`：AI 设置主结构为 `providers[] + defaultModelId + chatDefaults + webSearch + toolPolicies + skillPromptOverrides + userSkills[]`
- 旧 `baseUrl/apiKey/model` 仍可读，并在归一化时迁移为默认 provider；新设置写入不再以旧字段作为主结构

UI 层：

- `DialogManager.openAiWorkbenchDialog()`：standalone dialog，默认 `general-chat`
- `DialogManager.openArenaManagerDialog()`：Arena Manager dialog；仅在 `arena.enabled === true` 时可打开，用于管理 AI / SRS 双域排名、时间线、pin / retire / clone / challenge 动作
- `TabManager.openReviewAICompanionTab(...)`：review companion tab，默认遵循 `settings.ai.chatDefaults.reviewDefaultSkillId`
- `ReviewView.vue`：在 review session 生命周期里对齐 AI companion 上下文；仅在 Arena 开启时，对 item / descriptor 复习前后接入 SRS Arena advisory 与复习反馈记录
- `AiWorkbenchPane.vue`
  - 渲染通用 chat shell：Skill 切换、模型/工具入口、标题、历史/上下文抽屉、底部 composer
  - 消息区使用 compact render projection：主列表只显示用户消息、最终回复、结构化 Skill 结果和分隔；tool log、审批历史、reasoning、diagnostics 默认折叠到最终回复下方的透明化面板
  - pending approval 在对应回复下方显示 inline approval card；消息复制、编辑、分支、隐藏上下文、固定、插入分隔等操作统一落到消息尾部 toolbar；尾部 `•••` 菜单使用受控弹层而不是原生 `<details>`；消息请求失败会以内联 error bubble 归属到本次对话分支，并提供“重试本次 / 编辑后重发”
  - `concept-coach` 的五阶段 tab 作为结构化结果卡的 section/switch 展示；`general-chat` 隐藏 tab，直接显示单时间线；自测卡模式切换时，native 模式直接本地重渲染，插件模式显示“生成中 / 重试”并按需补齐缓存后的 preview 与制卡 payload；stale 结果显示轻量提示而不是整块锁死

外部边界：

- `AISiyuanPort`：Siyuan 读写
- `LLMPort`：LLM 调用
- `ConfiguredCaptureStoragePort`：capture 存储选择

---

## 11. 调度、同步与事件系统

调度主入口：

- `src/core/scheduler/SchedulerRouter.ts`
- `src/core/scheduler/srs-v2/*`
- `src/application/usecases/review/ReviewCommitUseCase.ts`
- `src/application/services/ReviewLogService.ts`
- `src/application/services/ArenaKernelService.ts` 的 SRS Arena 只读 advisory 默认关闭，开启后也不改变正式调度路由

当前职责：

- `ReviewCommitUseCase` 是正式复习提交边界：读取当前卡 -> `SchedulerRouter.answer()` -> `commit()` -> 写 `ReviewLogV2` -> 记录 SRS Arena 批次 -> 发布队列/卡片事件；SQL active 时这条链包在 `SqliteDatabaseService.runTransaction('review.feedback')` 中，card 行级 upsert、review event、Arena batch 最终只触发一次二进制 DB persist。队列只提交 `QueueReviewCommand`，不再自己拼正式 revlog 或补丁式写 due
- `SchedulerRouter` 是薄门面：保留旧 `preview/route` 兼容入口，负责把 SRS v2 的 `preview -> answer -> commit` 决策流转交给内核；它只持久化调度结果，不拥有正式 revlog。调度与重排写入统一经过 `UnifiedStorageCardUpdateAdapter`，批量卡片使用 `UnifiedStorageManager.batchUpdateCards()` 更新内存索引，SQL active 时同批 `SqlUnifiedStorageRepository.upsertCards()` 后一次 persist
- `SrsV2Kernel` 显式建模 `SchedulingChoices / ReviewAttempt / SchedulingDecision / ReviewCommitResult`，并在同一入口处理 `reviewTime + memoryStateAsOf` 的提前复习锚点语义
- `SrsV2QueuePolicy` 统一 `RetrievalPractice / IncrementalLearning` 的 formal 取卡顺序：Learning/Relearning 到点卡、今日 Review、每日上限内 New；同层按 `due -> priority -> stable noise -> id` 排序。Incremental 的 Topic/Concept/阅读/网页材料继续走 rotation 回访语义
- 队列通过 `QueueReviewSchedulingContext` 只声明成员资格之外的会话语义，例如 `queueType / queueMode / commitPolicy / isFiltered / customStudy`；调度写入是否发生由 SRS v2 commit policy 决定。手动 future 卡和 `FilterGroup` future 卡默认 `filtered-preview + preview-only`，只有显式重排/设置切换才 `write-schedule`
- `FinalDrill` 是练习覆盖层，不走正式调度，只追加独立 `DrillLogV2` 月度分片；`NeuralRoam` 绑定真实卡时可提交正式 SRS，但不会因 due 窗口自动退出 session；`Leech` 只负责难点治理成员资格，正式复习仍走 SRS v2
- 成功写正式排期时，`ReviewCommitUseCase` 追加 `ReviewLogV2`；SQL active 时进入 `review_events`，旧月度 JSON 分片只作为 fallback/迁移来源；旧 `ReviewLog` 保留只读/兼容，`DrillLogV2` 默认不参与 FSRS 参数优化和 Arena 正式归因
- 对不支持的调度路径显式报错，而不是静默降级
- 对 item / descriptor 复习，Arena 开启后会在正式调度之外通过 contestant adapters 并行预估 `fsrs-v6 / sm2 / sm5 / sm8 / sm15 / sm18 / sm20` 七个只读选手，输出四按钮预测、置信度、解释、归因字段、weighted optimum、分歧幅度和领先者；`sm19` 只注册为 `official-pending` 禁用算法，`a-factor-v2` 不进入 v1 SRS contest pack
- SRS Arena 主评分是 Universal/Calibration metric：按 predicted retrievability 进入 0.0-1.0 十分箱，SQL 中维护 `arena_metric_bins`，快照里的 score 用负 RMS 表示“越接近 0 越好”；Brier/即时误差只做诊断信号
- `SrsTransparencyApplicationService` / `SrsEditorDialog.vue` / `ReviewView.vue` 只展示轻量分歧提示和透明度事实；只有 `arena.srs.advisoryOnly === false` 且样本数达到 `minimumReviewsForConfidence` 时才允许进入实验写入路径，默认不接管正式 due

同步与事件主入口：

- `EventBus`
- `UnifiedDataSourceManager` observer 事件
- `TransactionWebSocketService`（订阅宿主 `eventBus.on('ws-main')`，不再 monkey-patch 主 `WebSocket.onmessage`；当前承载 AutoCard、doc tree review scope、review source refresh，以及统一的 native Riff transaction 路由）
- `XiuyuanSyncService`（仍是唯一的 Riff 增量/全量对账执行器；transaction 侧的 native riff add/update 走 debounced `incrementalSync()`，native `removeFlashcards` 走同服务内的 managed-local delete route，不恢复旧的 transaction-driven 拉取主链）
- `AutoCardHandler`（候选块队列 -> settled 评估 -> Xiuyuan ensure/create）

主设计原则：

- Browser / Review 刷新优先走事件与统一数据源通知
- 不依赖分散轮询来维持主状态一致性
- WebSocket、Riff、Xiuyuan 同步都属于 infrastructure / handler 边界，不应反向污染 UI 直接调用链
- `ReviewScopeCardCreationSyncService` 是 Xiuyuan 领域事件进入 review scope 数据源同步的应用层桥；`CardCreated` 继续走新增同步，`CardDeleted / CardsDeleted` 统一转发到 `UnifiedDataSourceManager.onCardsDeleted(cardIds, blockIds)`，由后者负责 `card-deleted` 与各队列 `queue-changed` 通知

当前 Riff / Xiuyuan 同步边界补充：

- Xiuyuan ownership 的主字段是 `xiuyuan.meta.ownership`，只允许 `local-owned` / `riff-managed`；历史数据缺失时才从 `templateID === 'builtin-riff-sync'` 或 `meta.source === 'riff-sync'` 懒推断并在保存/canonicalization 时回填。
- canonical Xiuyuan 裁决固定为 `local-owned > riff-managed > updatedAt > createdAt > id`，不再直接依赖模板/source 作为主判据。
- `XiuyuanSyncService` 的增量/全量同步是两阶段：`buildIncrementalChangeSet()` / `buildFullChangeSet()` 只读规划 `creates / metadataUpdates / deletes / blacklistCleanup / checkpointAdvance / postDetectTargets / stats`，`applyPlannedSync()` 只把已决策的变更交给 repository。
- `XiuyuanRepository.applySyncChangeSet()` 是同步主提交边界：creates、metadata updates、deletes、blacklist cleanup 和 checkpoint 在一个 `UnifiedStorageManager.runWriteTransaction(...)` 内变更并只调用一次 `storage.save()`；保存成功后才执行块属性/领域事件等副作用。
- `postDetectTargets` 属于提交后的幂等跟进步骤；失败只记录日志和计数，不回滚已经成功提交的同步结果。
- `custom-xiuyuan-id` / `custom-fsrs-xiuyuan-id` 已降级为旧数据兼容兜底读取来源，不再作为自动同步里的真相源，也不再对 managed Riff Xiuyuan 做后台写入、自修复清理或删除时清空。
- 增量同步触发器现在只允许 `plugin-start` / `browser-open`；`review-open` 已无运行语义，仅作为遗留默认三件套归一化输入被折叠回 `['plugin-start']`。
- 原生思源闪卡的近实时同步现在走独立 `NativeRiffSyncTriggerHandler`：native add/update 事务只在命中相关 attrs/块变化时 debounce 调度一次 `XiuyuanSyncService.incrementalSync()`；native `removeFlashcards` 则直接把 blockIds 路由到 `XiuyuanSyncService.handleNativeRiffRemove()`，只删除本地 `riff-managed` 记录，并做队列化防重入；它不放回 `AutoCardHandler`，也不重新承担即时 settle 猜测逻辑。
- Riff 增量对账使用 `UnifiedStorageManager.riffSyncState` 持久化 checkpoint；checkpoint 必须和 canonical store 同轮提交，提交失败时不会前进；当 Riff API 只能按时间窗拉取时，默认从上次成功增量时间回退 5 秒，再依赖 blockId / XiuyuanId 幂等 upsert 去重。
- 增量对账不执行删除，只拉取外部变化并同步合法的非调度元数据；native 删除由 transaction 路由直接落本地，除此之外的遗漏删除仍只允许 full reconcile 兜底，因此 full sync 默认周期为 24 小时。
- 插件主动删除走 `blockId` 驱动的事件链：`DeleteCardUseCase / DeleteCardsUseCase` 不再直接调用 Riff 删除 API，只负责本地 Xiuyuan / CardDTO 删除、块属性清理与短期 `deletionTracker` 标记；`RiffSyncEventHandler` 只把事件里的 `blockId / blockIds` 转发给 `XiuyuanSyncService.deleteSync*()`，缺失 blockId 时只记 `warn` 并跳过，不再把 `cardId` 误传给 `removeRiffCards()`。
- `XiuyuanSyncService.deleteSync*()` 的失败兜底现在与增量对账共享持久黑名单：`removeRiffCards()` 多次失败且 `deleteSync.useBlacklistFallback === true` 时，会把 blockId 落到 `RiffBlacklistService`，避免浏览器/复习页刷新后又被增量或全量对账补回。
- ownership 规则固定为 local-owned 优先：同一 block 已存在 AutoCard / 手动创建的本地 Xiuyuan 时，Riff 对账不创建第二个 Xiuyuan、不改模板/卡面结构、不覆盖本地调度数据；riff-owned 仅允许同步合法元数据并在 full reconcile 中删除。
- `UnifiedStorageManager` 的 canonical store 现已升级到 version 2：除 `xiuyuans / cardDTOs / riffBlacklist / riffSyncState` 外，还持久化 `deletedCardDTOs / deletedXiuyuans` tombstone；冲突 hash 从 32-bit 升级为 64-bit FNV-1a，并把 tombstone 与 checkpoint 一起纳入内容哈希。
- `UnifiedStorageManager` 的 merge 先合并 tombstone 再合并实体；若实体 `updatedAt` 不晚于 tombstone 的 `deletedAt`，实体会被直接丢弃，防止多窗口/外部旧快照把已删卡片或 Xiuyuan 合并回来。只有远端 `lastModifiedBy === instanceId` 的同实例异常回退才记 `error`，正常多窗口/外部 writer 恢复保留 `warn`。
- 当前仍不提供跨设备分布式锁；多窗口/多端同时写入会由 storage merge、逻辑 face 去重与稳定 Xiuyuan/card id 收敛。

---

## 12. 关键接口契约与边界规则

高频契约：

- `IReviewQueue`
- `IUnifiedDataSourceManagerFacade`
- `IDataRouter`
- `ISchedulerRouter`
- `IQueueStrategy`
- `AIWorkbenchOpenOptions`
- `BrowserCard` / `BrowserOpenState` / `ParsedBrowserQuery` in `src/types/browser.ts`

边界规则：

1. UI 依赖 application 抽象，不直接承载核心领域规则。
2. Application 通过 `src/application/ports/*` 依赖外部系统；`src/infrastructure/*` 提供实现。
3. Domain 规则放在 `src/core/*`，不要把业务规则塞回 UI 或 adapter。
4. `src/core/siyuan/*` 不是 UI / application 默认直连边界；优先端口 + adapter。
5. Application query/service 不从 `@/ui/browser/*` 取 Browser 契约；共享契约放在 `src/types/browser.ts` 或 application query shared helper。
6. UI 不新增 `@/infrastructure/*` 直连；确有历史例外时需要在 `scripts/check-boundaries.cjs` allowlist 中显式说明。
7. 不要把以下路径当活跃架构基线：
   - `src/domain/queues/*`
   - `src/index.simplified.ts`
   - `src/core/extensions/*`
   - `*.backup`
   - `*.bak`
   - `*.corrupted`

---

## 13. AI/开发改动守则

改动时默认遵守：

1. 先找真实入口，再顺着 `ui -> application -> core -> infrastructure` 追主链。
2. 保持单路径确定性，不新增 fallback / dual path 去掩盖 active-path 缺陷。
3. 改动影响组合根、bounded context 归属、主数据流时，同步更新本文档。
4. Progressive / AI / Mobile / Neural Roam 都已经是活跃主路径，不要把它们当旁路实验代码。
5. 如果只是 docs / skill 变更，不写 `docs/DDD_RESCAN_BACKLOG.md`。
6. 如果触碰运行时代码，最低验证为 `pnpm build`；仅文档任务则做代码交叉核对与 grep 验证即可。

---

## 14. 当前状态快照（2026-04-26）

当前架构基线：

- 运行时唯一组合根是 `ApplicationContext`
- 插件入口是 `src/index.ts`
- Browser 与 Review 共享 `UnifiedDataSourceManager` + `SchedulerRouter`
- 正式评分链路已切到 application 层 `ReviewCommitUseCase`：队列提交 `QueueReviewCommand`，use case 调用 `SchedulerRouter.answer()/commit()` 写正式 due 或保持 preview-only，并在正式写入时追加 `ReviewLogV2` 与发布队列/卡片事件
- `SchedulerRouter` 保持 SRS v2 薄门面职责；`RetrievalPractice / IncrementalLearning` 的正式记忆取卡由 `SrsV2QueuePolicy` 统一日内到点、复习上限、新卡上限与稳定排序，`FinalDrill` 只写独立 `DrillLogV2`
- Browser 共享契约已收口到 `src/types/browser.ts`；application query kernel 不再 import UI browser helper，UI-side browser service 也不再保存全局 manager/api/query 状态
- `DialogManager` 负责 dialog surface，`TabManager` 负责 tab surface 与 surface handoff
- 桌面端标准 review 入口现在由 `DialogManager` 按 `settings.ui.reviewOpenInNewTabByDefault` / `reviewOpenFullscreenByDefault` 做统一路由；filter-backed review 进入 tab 时通过 transfer-state 恢复 session
- Review runtime 只保留 `ReviewView.vue` v2 + `UnifiedQueueStrategy` + `UnifiedReviewAdapter` 主链；旧 provider-backed review extension path 已删除，special renderer service 由 application factory 注入
- 主数据持久化优先使用 `siyuanmemo.db`；浏览器插件 application 层通过 sql.js 单写，kernel.js 只保留未来算法计算 RPC 位置，不直接写 DB
- 移动端入口已收敛到 `openMobileQueueLauncherDialog()` -> `MobileReviewLauncher.vue`
- Neural Roam 保持 `neural-roam` 字面量，但活跃契约是 focus-first、history/session-aware
- Progressive / Excerpt / Topic-derived item 已在主路径中
- AI Workbench / Capture 已在主路径中，并升级为通用 chat shell + Skill runtime；standalone 默认 `general-chat`，review 默认 Skill 由 `settings.ai.chatDefaults.reviewDefaultSkillId` 决定（默认 `general-chat`），review 聊天按队列级 `reviewChatKey` 复用持久化会话但 live runtime 仍按真实 review session 隔离
- Arena 已在组合根中作为应用层内核装配，但默认关闭：启用后 AI Arena 管理显式场景池和策略包评分，SRS Arena 对 item / descriptor 通过 `fsrs-v6 / sm2 / sm5 / sm8 / sm15 / sm18 / sm20` contestant adapters 做只读建议，`sm19` 只登记为官方实现待接入；它只提供透明度、权重建议、挑战者管理和 delayed attribution，默认不接管正式模型选择或调度写回
- AI 设置主结构是 `providers[] + defaultModelId + chatDefaults + webSearch + toolPolicies + skillPromptOverrides + userSkills[]`；旧 `baseUrl/apiKey/model` 只作为读取兼容和迁移来源
- AI 设置页现在区分“内置 Skill 覆盖”和“用户声明式 Skill 管理”：`concept-coach` 仍沿用 `skills.conceptCoach.baseRun` 与 `skills.conceptCoach.tabs.<tab>.{run,followUp}`，默认推荐模板已经切到 Andy 兼容语义；用户 skill 通过 `userSkills[]` 声明 Prompt、工具组、sections、renderer 和 surface hints；结构化 JSON 契约仍由系统注册表托管，不开放 JS/HTML/runtime 脚本
- AI chat runtime 当前支持插件内读工具、网页抓取/可选搜索、变量缓存、tool timeline、树形 worldline、compact reply projection 和写工具审批卡；第一阶段不做本地文件系统/脚本执行，也不做独立图形化 world-tree 页面
- AI 理解与制卡的 `自测卡片` section 支持候选草稿编辑/选择、全选/取消全选、模式切换和“制卡选中项”；候选结果现在以 canonical 草稿字段保存，再按当前模式本地渲染到原生列表项/标记/标题/超级块四种 active mode；默认模板会把 Andy 风格的理解与出题要求压进 canonical 字段，而不是回退到 mode-specific Markdown。写入位置可记忆为目标笔记本今日日记或指定文档/块 ID，stale 结果仍可查看、编辑和制卡，只在继续追问该阶段前要求重跑
- AI 理解与制卡的 `CDF 语义卡` section 与 `自测卡片` 解耦：模型输出的是概念锚点/定义候选/描述符组的语义 JSON，UI 先做概念文档解析预览与勾选，再走独立语义制卡；未命中时可在当前目标笔记本内搜索 `type='d'` 文档块，或直接在笔记本根目录一键新建概念文档并立即绑定；旧 `cdf-multiline` 仍作为历史兼容可读，但不再是新的主入口

当前文档定位：

- `ARCHITECTURE.md`：当前人类可读的运行时总览
- `docs/DDD_RESCAN_BACKLOG.md`：生产代码债务与任务 delta
- `QUEUE_ARCHITECTURE.md`：队列专题补充材料
- `docs/AI_HANDOFF_GUIDE.md` / `docs/DEVELOPER_GUIDE.md`：仅作历史对照，不作活跃主路径基线

再次强调：

- 代码优先于文档
- 当前主架构以 `src/` 现行调用链为准
