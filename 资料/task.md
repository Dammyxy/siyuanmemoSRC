# Project Task List

## Phase 8.1: UI2.0 全屏与计数器修复 (Completed ✅)
**完成日期**: 2026-01-28

- [x] **Part 1: 全屏功能修复** (Priority 0)
    - [x] 动态修改对话框容器的 maxWidth 样式
    - [x] 进入全屏时移除 maxWidth 限制，退出时恢复
    - [x] 在对话框容器和内容区域同时切换 fullscreen 类
    - [x] 参考 SiYuan 原生实现 (`siyuan/app/src/assets/scss/main/_main.scss:28-56`)
- [x] **Part 2: 提取练习计数器修复** (Priority 0)
    - [x] 适配 RetrievalPracticeAdapter 处理无新卡/复习卡区分的模式
    - [x] 检测 label 格式，非 '新卡/复习卡' 格式时使用 total 字段
    - [x] 修复提取练习界面计数器显示为 0 的问题
- [x] **Part 3: UI2.0 界面完善** (Priority 1)
    - [x] 移除筛选按钮，添加"打开为"（sticktab）按钮
    - [x] 添加"编辑SRS数据"按钮，替换"更多"按钮
    - [x] 修复计数器横排显示（移除 ariaLabel 的 flex 样式）
    - [x] 改进按钮点击事件处理（添加 stopPropagation）

**备注**：
- 全屏实现：通过动态修改内联样式的 maxWidth 实现真正的全屏效果
- 计数器兼容：支持两种统计格式（'新卡/复习卡' 和纯数字）
- 按钮功能：全屏、打开为（新标签/右侧/新窗口）、编辑SRS数据
- 提交记录：
  - `7495ddd`: fix: 修复 UI2.0 复习界面全屏和计数器显示问题

**技术要点**：
- ✅ 全屏样式：position: fixed + width/height 100vw/vh + z-index: 8
- ✅ 内联样式优先级：需动态设置 maxWidth 为空字符串才能被 CSS 覆盖
- ✅ 统计格式检测：label.includes('/') 判断是否为 '新卡/复习卡' 格式
- ✅ 适配器扩展：RetrievalPracticeAdapter 支持多种队列类型

---

## Phase 8: Vue UI 2.0 Unification & Refactoring (Completed ✅)
**完成日期**: 2026-01-28

- [x] **Phase 1: 移除原生界面代码** (Priority 0)
    - [x] 删除 `openNativeReview()` 函数（~60 行）
    - [x] 删除重复的 `openDrillDialog()` 和 `openFinalDrillDialog()` 函数
    - [x] 删除原生界面相关命令注册
    - [x] 修复 Alt+D 命令调用 `openFinalDrillDialog()`

- [x] **Phase 2: DeliberatePractice → FinalDrill 重命名** (Priority 1)
    - [x] 重命名函数：`openDeliberatePracticeDialog()` → `openFinalDrillDialog()`
    - [x] 更新命令注册（index.ts:286-292）
    - [x] 更新 TopBar 菜单项（TopBar.ts:104-111）
    - [x] 更新 i18n 翻译（zh_CN, en_US）

- [x] **Phase 3: filterGroupQueue → subsetQueue 内部重命名** (Priority 1)
    - [x] 添加私有字段：`private subsetQueue!: FilterGroupQueue`
    - [x] 添加兼容性 getter：`public get filterGroupQueue()`
    - [x] 更新队列初始化代码（index.ts:145-146）
    - [x] 保留外部 API 兼容性（BlockMenu, SRSBrowser, DataSource）

- [x] **Phase 4: Vue UI 2.0 热键系统修复** (Priority 0)
    - [x] 修复 dialog.ts 事件转发机制（lines 72-98）
    - [x] 添加 `dataKey` 属性支持思源热键系统
    - [x] 实现 CustomEvent 从 dialog 到 Vue 组件的转发

- [x] **Phase 5: 卡片切换动画** (Priority 2)
    - [x] 在 ReviewContent.vue 中添加 Vue Transition 组件
    - [x] 实现四种动画：fade, slide-left, slide-right, none
    - [x] 添加过渡 CSS（lines 240-281）

- [x] **Phase 6: 快捷键逻辑修复** (Priority 0)
    - [x] 修复显示答案条件（只在未显示时工作）
    - [x] 修复评分条件（只在已显示后才能评分）
    - [x] ReviewView.vue lines 107-134

- [x] **Phase 7: i18n 清理** (Priority 3)
    - [x] 删除 15 个未使用的翻译键
    - [x] 删除原生界面相关键（startDrillV2, startNeuralV2 等）
    - [x] 删除重复键（startQueuePractice）

**备注**：
- 所有 5 个队列现在都使用 Vue UI 2.0（提取练习、刻意练习、筛选复习、神经漫游、难点攻坚）
- 移除了 ~250 行原生界面代码
- 统一命名规范：FinalDrill 而非 DeliberatePractice
- 内部重命名：subsetQueue（外部保持 filterGroupQueue 兼容）
- 提交记录：
  - `cd1d107`: refactor: unify to Vue UI 2.0 and cleanup queue architecture
  - `32580ee`: chore: remove unused i18n keys (native UI)

**架构改进**：
- ✅ 标准复习 UI 用于 4 个队列（extraction, final drill, leech, filter group）
- ✅ 特殊 UI 仅用于神经漫游（话题模式）
- ✅ 完全移除 NativeReviewSession 依赖
- ✅ 热键系统与思源 CustomEvent 集成
- ✅ 卡片切换动画增强用户体验

---

## Phase P1.3: 四重筛选功能完善与滚动条修复 (Completed ✅)
- [x] **Part 1: 全局统计独立** (Priority 0)
    - [x] 添加 `allRows` ref 存储完整卡片数据
    - [x] 修改 `globalStats` 使用 `allRows` 而非 `rowsForFocus`
    - [x] 实现 `loadQueueAllCards()` 加载队列的所有卡片
- [x] **Part 2: 聚焦行为完善** (Priority 0)
    - [x] 修改 `handleSelectGlobal()` 完全重置所有筛选
    - [x] 修改 `handleExitFocus()` 调用 `handleSelectGlobal('__all__')`
    - [x] 修改 `handleSelectDoc()` 开启聚焦
- [x] **Part 3: 队列卡片加载修复** (Priority 0)
    - [x] 添加 `loadQueueCards` 到导入语句
    - [x] 修复点击队列提示"没有闪卡"的问题
- [x] **Part 4: 文档区滚动条修复** (Priority 1)
    - [x] 修复 flex 布局链不完整问题
    - [x] 为 `.card-browser__hierarchy` 添加 flex 布局
    - [x] 为 `.fsrs-browser-hierarchy` 添加高度约束和 overflow
- [x] **Part 5: TypeScript 错误修复** (Priority 1)
    - [x] 删除未使用的 `getCardContent` 函数
    - [x] 验证构建和类型检查通过
- [x] **Part 6: 文档输出** (Priority 2)
    - [x] 创建 Flex 滚动容器技能文档
    - [x] 创建四重筛选功能设计文档
    - [x] 创建交接报告

**备注**：
- Dual Data Source Pattern：三个数据源（rows, rowsForFocus, allRows）
- 聚焦开关管理：显式控制 `shouldFocusDocList`
- Flex 滚动模式：完整的布局链 + 正确的 CSS 属性
- 相关文档：`skills/flex-scrollable-container.md`, `资料/design_docs/four-layer-filter-design.md`

## Phase 7.11s: CLAUDE.md Documentation Optimization (Completed ✅)
- [x] **Part 1: Add Table of Contents** (Priority 1)
    - [x] Create comprehensive TOC at file beginning
    - [x] Organize by usage frequency (Quick Start, Architecture, SiYuan Integration, Workflow, Case Studies)
    - [x] Add clickable links to all major sections
- [x] **Part 2: Archive Case Study** (Priority 1)
    - [x] Extract NO Column Bug Fix case study to separate file
    - [x] Create `资料/logs/gpt/CaseStudies/NO_Column_Bug_Fix.md` (336 lines)
    - [x] Replace detailed case with 22-line summary + link
    - [x] Reduce CLAUDE.md from 1031 lines to 717 lines (-30.5%)
- [x] **Part 3: Improve Navigation** (Priority 2)
    - [x] Quick Start section highlights most-used content
    - [x] Clear categorization for different use cases
    - [x] Maintain all critical information while improving accessibility

**备注**：
- 文件大小优化：-314 行（30.5%）
- 导航改进：目录提供快速访问，最常用内容突出显示
- 可维护性：案例研究独立归档，CLAUDE.md 更简洁聚焦
- 工程日志：无需额外文档（优化任务本身）

## Phase 7.11r: Native UI Content Rendering Fix (Completed ✅)
- [x] **Bug Fix: Protyle Content Rendering** (Priority 0)
    - [x] Discover Protyle initialization modes (empty vs block)
    - [x] Implement automatic content loading by passing actual blockId
    - [x] Replace manual innerHTML manipulation with Protyle auto-loading
    - [x] Verify content displays correctly for all card types
- [x] **Documentation Update** (Priority 1)
    - [x] Add Protyle Editor Integration case study to CLAUDE.md
    - [x] Document two initialization modes and automatic loading pattern
    - [x] Create implementation report: `Phase7.11r_Native_UI_Content_Rendering_Fix.md`
    - [x] Add Plugin Development Reference section to CLAUDE.md

**备注**：
- 关键发现：Protyle 有两种初始化模式（空初始化 vs 块初始化）
- 正确做法：传入实际 blockId，让 Protyle 自动加载和渲染内容
- 性能权衡：重新创建 Protyle 实例（~50-100ms）vs 复杂手动渲染
- 最佳实践：参考 CardBrowser.vue 的实现模式
- 经验总结：让框架做它的工作，自动优于手动

## Phase 7.11q: Native UI Button Structure Fix (Completed ✅)
- [x] **Bug Fix 1: HTML 结构错误** (Priority 0)
    - [x] 分离为两个独立的 card__action div
    - [x] 第一个 div：上一张 + 显示答案
    - [x] 第二个 div：上一张 + 跳过 + 评分按钮
- [x] **Bug Fix 2: 缺少关键按钮** (Priority 0)
    - [x] 添加全屏按钮 (`data-type="fullscreen"`)
    - [x] 添加更多菜单按钮 (`data-type="more"`)
    - [x] 添加跳过按钮 (`data-type="-3"`)
- [x] **Bug Fix 3: 事件处理不完整** (Priority 1)
    - [x] 向上查找最近的 data-type 属性
    - [x] 处理全屏、更多、跳过按钮点击
    - [x] 更新键盘快捷键（0, x, X 支持跳过）
- [x] **Bug Fix 4: UI 状态切换逻辑** (Priority 1)
    - [x] updateUI() 显示第一个 div，隐藏第二个 div
    - [x] showAnswer() 隐藏第一个 div，显示第二个 div
    - [x] 添加 handleSkip(), toggleFullscreen(), openMoreMenu() 方法
- [x] **文档更新** (Priority 2)
    - [x] 创建工程日志：`Phase7.11q_Native_UI_Button_Fix.md`
    - [x] 记录 HTML 结构对比、事件处理技巧、状态机模式

**备注**：
- 关键发现：思源使用**两个独立**的 card__action div 实现状态切换
- 状态机模式：Question State → Answer State → Next Card
- 事件委托：当按钮内有子元素时，需向上查找 data-type
- 键盘快捷键智能判断：Space/Enter 在不同状态下有不同含义

## Phase 7.11p: Native UI Bug Fixes (Completed ✅)
- [x] **Bug Fix 1: 顶栏按钮功能错误** (Priority 0)
    - [x] 移除 index.ts 中重复的顶栏注册代码
    - [x] 更新 callback 为 `openCardBrowser()` 而非 `featureRemoved`
    - [x] 验证构建后代码包含正确实现
- [x] **Bug Fix 2: 卡片内容无法显示** (Priority 0)
    - [x] 修正 API 调用：`/api/block/getBlockInfo` → `/api/block/getDocInfo`
    - [x] 添加关键步骤：`protyle.wysiwyg.renderCustom(docResponse.data.ial)`
    - [x] 修正 action 参数：`response.data.rootID === response.data.id ? [] : []`
    - [x] 完整实现思源原生的 API 调用链
- [x] **Bug Fix 3: 添加聚焦特效** (Priority 2)
    - [x] 实现思源原生的聚焦逻辑（focus + range + selection）
    - [x] 在对话框打开后 100ms 自动执行
    - [x] 添加 try-catch 保护，兼容不同浏览器
- [x] **i18n 翻译补充** (Priority 2)
    - [x] 添加 `cardBrowser`: "卡片浏览器"
    - [x] 添加三个原生复习命令的中文翻译
- [x] **文档更新** (Priority 3)
    - [x] 创建详细工程日志：`Phase7.11p_Native_UI_Bug_Fixes.md`
    - [x] 记录问题根因、解决方案、技术洞察

**备注**：
- 关键发现：必须严格按照思源原生的 API 调用顺序
- API 调用链：getDocInfo → renderCustom → getDoc → onGet
- fetchPost 在插件中不可用，必须使用 fetch API
- 代码重复注册是隐蔽的 bug 来源，需要 grep 搜索验证
- 用户体验细节（聚焦、快捷键）影响操作流畅度

## Phase 7.11+: Native UI Enhancement (Completed ✅)
- [x] **Part 1: FilterGroupNativeAdapter Implementation** (Priority 1)
    - [x] Add `FilterGroupNativeAdapter` class to `adapter.ts`
    - [x] Import `FilterGroupQueue` from queue strategies
    - [x] Implement `toNativeCards()`, `getCardData()`, `getQueueName()`, `getCardType()`
- [x] **Part 2: Integration Update** (Priority 1)
    - [x] Update `index.ts` import statements
    - [x] Add filter-group branch to `openNativeReview()` method
    - [x] Remove "not supported" error handling
- [x] **Part 3: Command Registration** (Priority 1)
    - [x] Register `startNativeReviewExtraction` command
    - [x] Register `startNativeReviewFinalDrill` command
    - [x] Register `startNativeReviewFilterGroup` command
- [x] **Part 4: Code Quality Fixes** (Priority 2)
    - [x] Create `src/global.d.ts` to fix ICard/ICardData import errors
    - [x] Fix unused variable warnings (calculateNextDues, total, FSRSRetrievalProvider)
    - [x] Verify build passes (`npm run build`)
    - [x] Verify type check passes (`npx tsc`)

**备注**：
- 新增适配器：FilterGroupNativeAdapter（~40 行）
- 总代码量：~700 行（session.ts + adapter.ts + index.ts）
- 支持队列：提取练习、刻意练习、筛选练习（新增）
- 三个独立命令分别对应三种队列类型
- 未来优化：实现队列选择对话框（替代三个独立命令）

## Phase 7.11: Native UI Integration (Completed ✅)
- [x] **Part 1: Native Adapter Implementation** (Priority 1)
    - [x] Create `src/core/native/adapter.ts` (~100 lines)
    - [x] Implement `INativeReviewAdapter` interface
    - [x] Implement `ExtractionNativeAdapter` class
    - [x] Implement `FinalDrillNativeAdapter` class
- [x] **Part 2: Native Review Session** (Priority 1)
    - [x] Create `src/core/native/session.ts` (~500 lines)
    - [x] Implement `genCardHTML()` - HTML generation
    - [x] Implement `NativeReviewSession` class
    - [x] Implement event binding (rating, keyboard shortcuts)
    - [x] Implement Protyle editor integration
- [x] **Part 3: Plugin Integration** (Priority 1)
    - [x] Register `startNativeReview` command in index.ts
    - [x] Implement `openNativeReview()` method with NativeReviewSession
    - [x] Handle queue feedback on rating
- [x] **Part 4: Documentation** (Priority 2)
    - [x] Update design doc (`资料/design_docs/native_review_adapter.md`)
    - [x] Document API limitation and solution
    - [x] Document extensibility patterns

**备注**：
- 代码量统计：~660 行（session.ts + adapter.ts + index.ts）
- vs UI 2.0 的 2000+ 行（但功能失效）
- 原生复习界面通过复制核心逻辑实现（API 不可用）
- 支持队列：提取练习、刻意练习
- 可扩展：神经漫游、筛选复习、子集复习

## Phase 7.10: Card Browser Bug Fixes (Completed ✅)
- [x] **Part 1: AG Grid v35 Migration** (Priority 0)
    - [x] Remove CSS theme imports (ag-grid.css, ag-theme-balham.css)
    - [x] Update checkbox configuration to v35+ syntax
    - [x] Verify no console errors/warnings
- [x] **Part 2: NO Column Stability** (Priority 1)
    - [x] 采用统一 rowIndex 方案（不使用 queueIndex）
    - [x] NO 列使用 colId: 'noColumn' + onSortChanged 刷新
    - [x] Test NO column stability across sorts
- [x] **Part 3: Add to Queue Actions** (Priority 1)
    - [x] Add queue type definitions (QueueLike)
    - [x] Add "add-to-extraction-queue" action
    - [x] Add "add-to-deliberate-queue" action (finalDrillQueue 别名)
    - [x] Add "add-to-filter-group-queue" action
    - [x] Implement performAction handlers
    - [x] Test queue operations from context menu

**备注**：
- `deliberateQueue` 是 `finalDrillQueue` 的别名（index.ts:53-55），不是独立队列
- NO 列采用统一 rowIndex 方案，【全部闪卡】模式不设置 queueIndex（DeckDataSource.ts:77-80）

## Phase 7.9: Queue Sorting Fix & Browser Enhancement (Completed ✅)
- [x] **Part 1: Queue Sorting** (Priority 1)
    - [x] Add `queueIndex` field to `BrowserCard` interface
    - [x] Generate `queueIndex` in DataSource (FinalDrill, FilterGroup)
    - [x] Modify `no` column to use `queueIndex` (fixed position)
    - [x] Enable AG-Grid client-side sorting
- [x] **Part 2: Queue Reorder** (Priority 1)
    - [x] Extend `ISequencer` interface with `reorder()` method
    - [x] Extend `IQueueStrategy` interface with `reorder()` method
    - [x] Extend `QueueInterface` interface with `reorder()` method
    - [x] Implement `ListSequencer.reorder()`
    - [x] Implement `FinalDrillQueue.reorder()`
    - [x] Implement `FilterGroupQueue.reorder()`
    - [x] Implement `ExtractionPracticeQueue.reorder()` (special handling)
- [x] **Part 3: Browser UI** (Priority 1)
    - [x] Add sort change listener (`@sort-changed`)
    - [x] Add "Apply Sort to Queue" button
    - [x] Add `canApplySortToQueue` computed property
    - [x] Implement `handleApplySortToQueue()` method (with blockID matching)
    - [x] Fix AG-Grid v35 compatibility (getColumnState fallback)
    - [x] Add i18n strings (zh_CN, en_US)
- [x] **Part 4: Browser Hierarchy Fix** (Priority 0)
    - [x] Add `extraction` queue to `BrowserHierarchy.vue`
    - [x] Add `queueExtract` i18n strings

## Phase 7.6: Card Browser & Review UI Polish (Completed ✅)
- [x] **Part 1: Card Browser Optimization** (Priority 1)
    - [x] Fix `handleSelectDoc` in `CardBrowser.vue`: don't clear `activeQueueId` unless 'All' selected
    - [x] Fix `loadData` in `CardBrowser.vue`: pass `preset` and `activeDocId` to `DeckDataSource`
    - [x] Fix `loadCards` in `browserService.ts`: chain Preset -> Document -> Query (添加 queryText 参数)

- [x] **Part 2: Browser Context Menu** (Priority 2)
    - [x] Add `add-to-queue` action in `DeckDataSource.ts` (已在 Phase 7.10 完成)
    - [x] Implement `handleAddToQueue` in `CardBrowser.vue` (通过统一 handleAction → performAction 接口)
    - [x] Implement `buildDrillCardsFromBrowserCards` helper (内联在 handleApplySortToQueue 中)

- [x] **Part 3: Shortcut Logic** (Priority 3)
    - [x] Fix `openCardBrowser` in `src/index.ts`: implement singleton pattern

- [x] **Part 4: Review UI SRS Editor** (Priority 4)
    - [x] Add "Edit SRS Data" menu item in `ReviewView.vue`
    - [x] Implement `openSrsEditorDialog`

- [x] **Part 5: Review UI Open Menus** (Priority 5)
    - [x] Add "Open" submenu (New Tab, Right, New Window) in `ReviewView.vue`
    - [x] Implement `openCardInTab` and `openCardInNewWindow`

- [x] **Part 6: Breadcrumbs** (Priority 6)
    - [x] Render breadcrumbs in `ReviewHeader.vue`
    - [x] Handle `@breadcrumb-click` in `ReviewView.vue`

## Phase 7: Native UI Alignment (Completed)
- [x] Phase 7.1 Type System Extension
- [x] Phase 7.2 UI Component Rewrite
- [x] Phase 7.3 Adapter Updates
- [x] Phase 7.4 I18n Updates
- [x] Phase 7.5 Testing & Verification
