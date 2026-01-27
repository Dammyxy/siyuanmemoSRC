# Phase 5: Universal Review Board (UI 2.0) - Implementation Plan (Revised)

**目标**: 抛弃修补 `ReviewPanel.vue` (v1) 的思路，基于 Phase 4 的抽象架构，从零构建一个**纯粹、驱动化、可组装**的复习界面 (UI 2.0)。
**修正**: 本计划已根据 2026-01-25 审计反馈进行了扩充，增强了接口定义的完整性。

> **✅ 最新完成**: Phase 8 - Vue UI 2.0 统一与重构 (2026-01-28)
> **✅ 之前完成**: Phase 7.11r (内容渲染修复) + Phase 7.11s (文档优化) - 2026-01-27
> **✅ 已完成**: Phase 7.1-7.11q（详见下方章节）
> **📋 下一步**: 待定（等待用户指派新任务）

---

## 1. 核心架构 (Architecture)

### 1.1 数据流 (Data Flow)
```
[QueueStrategy (Model)] ◄─── Standardized Interface (Phase 5.0)
      │
      ▼ (via Adapter)
[ReviewUIState (ViewModel)] 
      │
      ▼ (Reactive State)
[useReviewSession (Controller Hook)] 
      │
      ▼
[ReviewView.vue (Pure View)] ─── User Event ──► [Hook.actions]
```

### 1.2 关键接口定义 (Expanded)

#### `ReviewUIState` (ViewModel)
UI 组件只认这个对象。包含了 v1 的所有关键状态。
```typescript
interface ReviewUIState {
  // Header Area
  header: {
    stats: {
      current: number;
      total: number;
      label: string; // e.g. "Final Drill"
      queueName: string;
    };
    breadcrumbs: Array<{ 
      icon: string; 
      text: string; 
      id?: string;
      action?: string; // Action ID for hook
    }>;
  };

  // Content Area
  content: {
    type: 'protyle' | 'html' | 'empty';
    data: string; // HTML string or BlockID
    id: string;   // Unique key for Vue :key
  };
  
  // Overlay Area (Explicit)
  overlay?: {
    component: string; // 'NeuralGraph' | 'AnswerButtons'
    props: Record<string, any>;
    layout: 'top' | 'bottom' | 'cover';
  };

  // Action Area
  actions: {
    showAnswer: boolean;
    grades: Array<{ label: string; value: number; color: string; kb: string }>;
    menu: IQueueCommand[]; 
    toolbar: Array<{ icon: string; label: string; command: string }>;
  };

  // Transitions & Meta (New)
  meta: {
    transition: 'slide-left' | 'slide-right' | 'fade' | 'none';
    resumePrompt?: {
        message: string;
        data: unknown;
    };
    drillStats?: {
        correct: number;
        duration: number;
    };
  };
}
```

#### `IAdapter` (The Bridge)
```typescript
interface IAdapter {
    /** 
     * Convert Queue Item + Queue State -> UI State 
     * @param queue The source queue strategy (access size, stats)
     * @param item The item (card/block info)
     * @param context Context like showAnswer status
     */
    toUIState(queue: IQueueStrategy, item: any, context: AdapterContext): Promise<ReviewUIState>;
    
    /** Handle async data fetching (like breadcrumbs) independent of main render */
    fetchAuxiliaryData?(item: any): Promise<Partial<ReviewUIState>>;
}
```

## 2. 实施步骤 (Execution Steps)

### Phase 5.0: 接口标准化 (Standardization) - [Critical Pre-requisite]
为了统一 Adapter 的实现，必须先统一后端的接口。
*   **统一 `IQueueStrategy`**: 确保所有 Queue (FinalDrill, Neural, Retrieval) 都实现标准接口：
    *   `getUIConfig(item)`
    *   `onFeedback(item, result)`
    *   `size()`

### Phase 5.1: 基础设施 (Infrastructure)
*   **目录结构**: `src/ui/review/v2/`
*   **Types**: 根据 **Contract v2** 创建 `types.ts`。
*   **Hook**: 实现 `useReviewSession.ts`。
    *   持有 `Ref<ReviewUIState>`。
    *   管理副作用 (Reveal, Grade)。
    *   处理生命周期 (Protyle Destroy)。

### Phase 5.2: 纯组件开发 (Pure Components)
*   `ReviewView.vue`: 根容器，负责 Layout 和挂载 Hook。
*   `ReviewHeader.vue`: 渲染 Stats 和 Breadcrumbs (emit `action` events)。
*   `ReviewContent.vue`:
  *   **Idempotent Protyle Manager**: 管理 Protyle 生命周期。
  *   **Protyle 管理方案**: 使用内部 ProtyleManager，由 Hook 的 `onMounted/onUnmounted` 控制生命周期，不由 Adapter 提供 `cleanup()`。
  *   **Overlay**: 使用 `OVERLAY_REGISTRY` (Static Map) 渲染组件。
*   `ReviewActions.vue`: 纯渲染组件。
    *   **Keyboard Shortcuts**: 全部逻辑移至 `useReviewSession` Hook 中统一管理（统一管理所有副作用）。

### Phase 5.3: 试点迁移 (Pilot - Final Drill)
*   **FinalDrillAdapter**:
    *   实现 List -> `ReviewUIState` 转换。
    *   **Persistence**: 实现 `meta.resumePrompt` 逻辑。
*   **入口**: 增加 `/flashcard drill-v2` 命令进行测试。

### Phase 5.4: 功能补全 (Feature Parity)
*   **Async Breadcrumbs**: Adapter 实现 `fetchAuxiliaryData`，Hook 负责合并状态。
*   **Context Menu**: 将 `IQueueCommand` 绑定到 UI 按钮。

### Phase 5.5: 扩展与替换 (Mainstream)
*   迁移 `RetrievalPracticeQueue` (FSRS)。
*   迁移 `NeuralRoamQueue` (Overlay)。
*   **Sunset**: 删除 v1 代码。

## 3. 风险控制
**Problem**: `ReviewContent.vue` silently returns if `protyle.wysiwyg` is not immediately available after `new Protyle()`.

-   **Remove Silent Fail**: Log error if Element cannot be found.
-   **Retry Logic**: Use `nextTick` or `setTimeout` poll to wait for Protyle DOM injection.
-   **Fallback**: If Protyle fails, render `docData.content` directly into `hostRef`.
-   **Fix Constants**: Verify if `Constants` is available. If not, hardcode `CB_GET_ALL` (value: 2) or import if available.
-   **Robustness**: Keep the retry/fallback logic for the DOM element access.

**状态**: 🔴 待修复 (已定位到 Crash 原因)

**状态更新**: ✅ 已修复（改为从 `siyuan` 模块构造 Protyle + 保留 waitForWysiwyg/fallback）

**Solution**:
-   Implement `getInitialTotal()?` in `IQueueStrategy`.
-   Or verify logic: Only set `initialTotal` when it is 0 AND we have a valid "start of session" signal.

**状态**: ✅ 已实现（在 `useReviewSession` 挂载时抓取 `getStats().size` 作为会话 initialTotal，并通过 AdapterContext 传递）

## Phase 6: Core Integration Architecture (The "Provider" Pattern)

**Goal**: Elevate FSRS plugin from a standalone tool to a standard extender of Siyuan's Riff Core.

**设计决策记录**: [资料/design_docs/2026-01-25_queue_provider_decisions.md](资料/design_docs/2026-01-25_queue_provider_decisions.md)

### 6.1 Core Abstraction (`src/core/extensions/`)

Define standard interfaces that any plugin (not just FSRS) could use to provide queues.

#### 6.1.1 `QueueProvider<TItem>` 接口

```typescript
export interface QueueProvider<TItem = any> {
  // === 基础信息 ===
  readonly id: string;
  readonly displayName: string;

  // === 核心操作（必须） ===
  getDueCards(options: Record<string, unknown>): Promise<TItem[]>;
  reviewCard(cardId: string, rating: number, reviewedCards?: TItem[]): Promise<void>;
  skipReviewCard(cardId: string): Promise<void>;

  // === 扩展操作（可选） ===
  postponeCard?(cardId: string, days: number): Promise<void>;
  advanceCard?(cardId: string, days: number): Promise<void>;
  resetCard?(cardId: string): Promise<void>;
  setPriority?(cardId: string, priority: number): Promise<void>;

  // === UI 支持（可选） ===
  getStats?(): Promise<QueueStats>;
  getReviewUI?(item: TItem | null): Promise<ReviewUIProvider<TItem>>;
}

export interface QueueStats {
  current: number;
  total: number;
  reviewed?: number;
  remaining?: number;
}
```

#### 6.1.2 `ReviewUIProvider<TItem>` 接口

```typescript
export interface ReviewUIProvider<TItem = any> {
  // === UI 组件 ===
  component: Component;

  // === 数据适配 ===
  adapter: IAdapter<TItem>;

  // === 上下文 ===
  context?: ProviderContext;
}

export interface IAdapter<TItem> {
  toUIState(
    queue: QueueProvider<TItem>,
    item: TItem,
    context: AdapterContext
  ): Promise<ReviewUIState>;

  fetchAuxiliaryData?(item: TItem): Promise<Partial<ReviewUIState>>;
}

export interface AdapterContext {
  showAnswer: boolean;
  session?: {
    startTime: number;
    resumed: boolean;
  };
}

export interface ProviderContext {
  queue?: Record<string, unknown>;
  ui?: Record<string, unknown>;
}
```

#### 6.1.3 目录结构

```
src/core/extensions/
├── QueueProvider.ts      # QueueProvider 接口
├── ReviewUIProvider.ts   # ReviewUIProvider 接口
├── index.ts              # 导出入口
├── README.md             # 文档说明
└── __tests__/
    └── interfaces.spec.ts # 接口测试
```

# 单元测试
npm test -- src/core/extensions/__tests__/interfaces.spec.ts
```

### 6.2 Refactoring
-   Convert `RetrievalPracticeQueue` -> `FSRSRetrievalProvider`
-   Convert `FinalDrillV2Session` -> `FinalDrillProvider`
-   Provider 实现：
### 6.3 RFC Preparation
- ✅ Adapter 导入链正确：所有 Adapter 从 `../types` 导入（间接使用统一接口）
- ✅ AdapterContext 字段统一：添加 `startedAt`、`startTime`、`resumed` 字段，避免 Provider/Adapter 混用时的字段不匹配
- ✅ 向后兼容性：通过 `types.ts` 中的 re-export 保持原有导入路径

#### 6.2.3 Phase 6.3 RFC & Contribution
-   Draft `queue_extension_rfc.md` for Siyuan Team.
-   Propose Go-side changes for `Riff`.
-   **状态**: 🟡 暂停 - 等待 Phase 6.2 P0 修复完成

## 4. 待澄清事项 (来自审计 Round 3)
以下事项不影响实施，但建议在开始前确认：

### 4.1 `fetchAuxiliaryData` 错误处理
**当前方案**: 仅 `catch(console.error)`，不会阻止状态更新。
**建议**: 考虑添加更明确的错误处理，或保持现状（因为辅助数据失败不应阻塞主渲染）。

### 4.2 Overlay Props 类型
**当前方案**: 使用 `Record<string, unknown>`。
**建议**: 保持现状，灵活性更高，在注释中说明每个 Overlay 组件的 Props 定义。

### 4.3 Breadcrumb 点击语义
**当前方案**: Contract 已注释明确 `id` 用于上下文切换，`action` 用于命令执行。
**状态**: ✅ 已明确，无需修改。

### 4.4 `updateState` 并发控制
**当前方案**: 每次调用 `updateState()` 都会重新设置主状态并获取辅助数据。
**建议**: 如遇到快速连续操作导致的问题，可添加取消令牌机制，当前实现已足够。

### 4.5 `cleanup()` 调用时机
**当前方案**: 已在 Phase 5.2 中明确："使用内部 ProtyleManager，由 Hook 的 `onMounted/onUnmounted` 控制生命周期，不由 Adapter 提供 `cleanup()`"。
**状态**: ✅ 已明确，无需修改。

## 5. 测试验证 (Testing & Verification)
### 5.1 单元测试
*   `FinalDrillAdapter.toUIState()`: 验证数据转换
*   `useReviewSession` 的各个方法：验证状态更新

### 5.2 集成测试
*   测试评分流程：评分 → 队列更新 → 新卡片渲染
*   测试显示答案：`reveal()` → 状态更新
*   测试空状态：队列为空时的渲染
*   测试快捷键响应
*   测试面包屑点击
*   测试 Protyle 内存泄漏（通过 DevTools Memory Profiler）

### 5.3 手动测试清单
*   [ ] Final Drill 基础流程（无面包屑、无动画）
*   [ ] Final Drill 完整流程（包含所有功能）
    -   ✅ `npx tsc` no type errors

### 7.4 Visual Polish & Testing ⏳️

#### Functional Testing
-   ✅ Retrieval Practice mode
-   ✅ Final Drill mode (cardMeta, toolbar, hasHiddenContent)
-   ✅ Leech mode (toolbar, hasHiddenContent)
-   ✅ Neural Roam mode (cardMeta, newCards/reviewCards, hasHiddenContent)
- ✅ Subset Practice mode (cardMeta, newCards/reviewCards, toolbar, hasHiddenContent)

#### Visual Testing
- ⏳ Visual regression vs SiYuan native UI
- ⏳ Responsive layout verification
- ⏳ Dark/light theme verification

#### Technical Verification
- ✅ `npm run build` pass
- ✅ `npx tsc` no type errors

### [✅] 7.6 Card Browser & Review UI Polish - 可略过
**Goal**: Address usability friction in Card Browser and complete Review UI native integration.

#### Part 1: Card Browser Optimization (P1)
- **Fix Selection Logic**:
    - `CardBrowser.vue`: `handleSelectDoc` should NOT clear `activeQueueId` unless "All Cards" is selected.
    - `CardBrowser.vue`: `loadData` must correctly pass `preset` to `DeckDataSource`.
- **Refine Filter Chain**:
    - `browserService.ts`: Ensure filter order is Preset -> Document -> Query.

#### Part 2: Browser Context Menu (P2)
- **Add to Queue**:
    - `DeckDataSource.ts`: Add `add-to-queue` action ID.
    - `CardBrowser.vue`: Implement `handleAddToQueue` handling:
        - Extract Practice
        - Deliberate Practice
        - Review Filter
        - Neural Roam

#### Part 3: Dialog Management (P3)
- **Singleton Pattern**:
    - `index.ts`: `openCardBrowser` must check/close existing dialog before creating new one.

#### Part 4: Review UI Menus (P4 & P5)
- **Edit SRS Data**:
    - `ReviewView.vue`: Add menu item calling `openSrsEditorDialog`.
- **Open Menu**:
    - `ReviewView.vue`: Add "Open in New Tab", "Open to Right", "Open in New Window".

#### Part 5: Breadcrumbs (P6)
- **Navigation**:
    - `ReviewHeader.vue`: Render breadcrumbs.
    - `ReviewView.vue`: Handle clicks via `openTab`.

### [✅] 7.7 Review UI Visual & Debug Polish - 可略过
**Goal**: Address visual/debug issues and significantly enhance Filter Group capabilities.

#### Part 1: Breadcrumb Debugging (P1 - High)
- **Problem**: Breadcrumbs not showing despite implementation.
- **Traceability**:
    - `api.ts`: Verify `getBlockBreadcrumb` return format (expected vs actual).
    - `ReviewView.vue`: Log `uiState.header.breadcrumbs` to check data flow.
    - `RetrievalPracticeAdapter.ts`: Debug `fetchAuxiliaryData` invocation and data merging.

#### Part 2: Rating Button Visuals (P1 - High)
- **Refactor**: Remove hardcoded style logic in `ReviewActions.vue`.
    - ❌ Delete `getGradeStyle` (inline style generator).
    - ✅ Update `getGradeClass` to map semantic colors to `b3-button--{state}`.
    - **Mapping**:
        - `var(--b3-theme-error)` -> `b3-button--error`
        - `var(--b3-theme-warning)` -> `b3-button--warning`
        - `var(--b3-theme-info)` -> `b3-button--info`
        - `var(--b3-theme-success)` -> `b3-button--success`
- **Adapter Cleanup**: Ensure all adapters return `var(--b3-theme-*)` constants.

#### Part 3: Card Browser Search & Filter (P2)
- **Feature**: Search box input should filter the "Document List" (left sidebar) in addition to the table.
- **Implementation**:
    - `CardBrowser.vue`: Add `filteredDocs` computed property based on `searchQuery`.

#### Part 4: Filter Group & Queue Enhancements (P2)
- **4.1 Scheduler Selection**:
    - `FilterGroupQueue.ts`: Support `schedulerType: 'fsrs' | 'null'` in config.
        - `fsrs`: Call `reviewRiffCard` (Standard Review).
        - `null`: Just remove from queue (Deliberate Practice).
- **4.2 UI Improvements**:
    - `FilterGroupEditorDialog.vue`: New dialog to create/edit groups (Name, Scheduler, Weight).
    - `index.ts`: Add "Start Filter Review" submenu to Top Bar (Right Click).
    - `index.ts`: Bind "Open Card Browser" to Top Bar (Left Click).
- **4.3 "Edit Later" Workflow**:
    - `index.ts`: Initialize default `edit-later` queue (Weight 10, Null Scheduler).
    - `ReviewView.vue`: Add "Edit Later" action to "More" menu.

---

## [✅ 已完成] Phase 7.8+7.9: SuperMemo 队列排序应用功能

**状态**: ✅ 核心功能已完成，等待补充修复

**完成日期**: 2026-01-26

**已完成内容**:
- [x] Phase 7.9 队列排序修复（no 列使用 queueIndex）
- [x] Phase 7.8 队列重排功能（reorder 方法）
- [x] 浏览器 UI 实现（"应用排序到队列"按钮）

**待补充修复** (Phase 7.9.1):
- [ ] 在 `BrowserHierarchy.vue` 中添加"提取练习"队列
- [ ] 添加 `queueExtract` 国际化文本
- [ ] 更新 `task.md` 标记 Phase 7.9 为已完成

**设计文档**: [`资料/logs/gemini/2026-01-26_Phase7.9_Fix_ExtractQueue_Design.md`](资料/logs/gemini/2026-01-26_Phase7.9_Fix_ExtractQueue_Design.md)

---

## [✅ 已完成] Phase 7.9.1: Browser Hierarchy Fix

**完成日期**: 2026-01-26

**目标**: 修复层级视图缺少"提取练习"队列的问题，恢复测试能力。

**设计文档**: [`资料/logs/gemini/2026-01-26_Phase7.9_Fix_ExtractQueue_Design.md`](资料/logs/gemini/2026-01-26_Phase7.9_Fix_ExtractQueue_Design.md)

**已完成**:
- [x] 在 `BrowserHierarchy.vue` 中添加"提取练习"队列
- [x] 添加 `queueExtract` 国际化文本
- [x] 更新 `task.md` 标记 Phase 7.9 为已完成

**备注**: 与 Phase 7.10 合并记录，详见 task.md

---

## [✅ 已完成] Phase 7.10: Card Browser Bug Fixes

**完成日期**: 2026-01-26

**问题**:
1. **AG Grid v35 兼容性问题**: 控制台报错 #239 和 deprecation 警告
2. **NO 列排序不稳定**: 点击其他列排序后，NO 列的序号会变化
3. **右键菜单缺少功能**: 无法从 Card Browser 右键菜单中将卡片加入队列

**已完成**:
- [x] Part 1: AG Grid v35 Migration (Priority 0)
    - [x] 移除 CSS 主题文件引入（ag-grid.css, ag-theme-balham.css）
    - [x] 更新复选框配置为 v35+ 语法
    - [x] 验证控制台无错误/警告
- [x] Part 2: NO Column Stability (Priority 1)
    - [x] 在 DeckDataSource.fetchRows() 中添加 queueIndex 分配
    - [x] 测试 NO 列在排序后的稳定性
- [x] Part 3: Add to Queue Actions (Priority 1)
    - [x] 添加队列类型定义 (QueueLike)
    - [x] 添加"加入练习队列"操作
    - [x] 添加"加入刻意队列"操作
    - [x] 实现 performAction 处理器
    - [x] 测试右键菜单队列操作

**设计文档**: [`资料/design_docs/2026-01-26_card_browser_bug_fixes.md`](../design_docs/2026-01-26_card_browser_bug_fixes.md)

**备注**: 详见 `task.md` Phase 7.10

---

## [📋 待办事项] Future Deferred Items (Backlog)

#### P1 - Filter Menu
- ⏭️ Placeholder in UI for now. TODO in ReviewView.vue:366
- **重要决策**：这可能可能与当前的 CardBrowser 高级筛选功能重叠
**建议**：
1. 强化 CardBrowser 的筛选能力（快速筛选按钮）
2. 优化 FilterGroup 的创建/编辑体验
3. 如确实需要复习时筛选，考虑"暂停当前队列"功能

#### P2 - Back Functionality
- ⏭️ Requires `IQueueStrategy.previous()` extension
- All queue strategies implement `previous()`
- Maintain history queue in `useReviewSession`
- **P3 - Pin to Tab**
- ⏭️ Requires SiYuan kernel support

---

**Phase 7.3 Adapter Updates** ✅
- FinalDrillAdapter: ✅ Complete
- LeechAdapter: ✅ Complete
- NeuralRoamAdapter: ✅ Complete
- SubsetPracticeAdapter: ✅ Complete
- RetrievalPracticeAdapter: ✅ Complete

**Phase 7.4 I18n Updates** ✅
- zh_CN.json: ✅ Complete (all translations added)
- en_US.json: ✅ Complete (synced with zh_CN)

### 7.5 Testing & Verification ✅
- Functional Testing: ✅
- Visual Testing: ⏳
- Technical Verification: ✅

### Conclusion

Phase 7 的核心适配器标准化工作已通过审查和技术验证，可以进入下一阶段的视觉打磨工作。
-   **Back Functionality**: ⏭️ Requires `IQueueStrategy.previous()` extension. Deferred per user decision.
-   **Filter Menu**: ⏭️ Placeholder in UI for now. TODO in ReviewView.vue:366.
-   **Pin to Tab**: ⏭️ Requires SiYuan kernel support.

---

## [✅ 已完成] Phase 7.9.1+7.10: Browser Hierarchy & Bug Fixes

**完成日期**: 2026-01-26

**已完成内容**:
- [x] Phase 7.9.1: 添加"提取练习"队列到层级视图
- [x] Phase 7.10: AG Grid v35 迁移
- [x] Phase 7.10: NO 列稳定性修复
- [x] Phase 7.10: 右键菜单队列操作

**备注**: 详见 `task.md` Phase 7.9.1 和 7.10

---

## [✅ 已完成] Phase 7.11p+7.11q: Native UI Bug Fixes & Button Structure

**完成日期**: 2026-01-26

**已完成内容**:
- [x] Phase 7.11p: 顶栏按钮、内容显示、聚焦特效修复
- [x] Phase 7.11q: HTML 结构错误修复（双 div 状态机）
- [x] Phase 7.11q: 缺少按钮修复（全屏、更多、跳过）
- [x] Phase 7.11q: 事件处理和键盘快捷键完善

**备注**: 详见 `task.md` Phase 7.11p 和 7.11q

---

## [✅ 已完成] Phase 7.11r: Native UI Content Rendering Fix

**完成日期**: 2026-01-27

**问题**: 原生复习界面白屏，无法显示卡片内容

**关键发现**:
- Protyle 有两种初始化模式：
  - **空初始化** (`blockId: ''`): 需要手动加载（插件环境不可行）
  - **块初始化** (`blockId: 'actual-block-id'`): 自动加载渲染 ✅

**解决方案**:
```typescript
// 为每张卡片重新创建 Protyle 实例，传入实际 blockId
this.protyle.destroy();
this.protyle = new Protyle(this.app, renderElement, {
  blockId: card.blockID,  // 关键：传入实际块ID
  action: [Constants.CB_GET_ALL],
  render: { background: false, gutter: true, breadcrumbDocName: true, title: true },
});
```

**核心原则**:
- 让 Protyle 做它的工作 - 不要对抗框架
- 自动优于手动 - 即使看似"低效"
- 参考工作代码 - CardBrowser.vue 有正确实现

**文档**:
- [CLAUDE.md - Protyle Editor Integration](../../CLAUDE.md#protyle-editor-integration)
- [Phase7.11r_Native_UI_Content_Rendering_Fix.md](../logs/gpt/Phase7.11r_Native_UI_Content_Rendering_Fix.md)

---

## [✅ 已完成] Phase 7.11s: CLAUDE.md Documentation Optimization

**完成日期**: 2026-01-27

**目标**: 优化 CLAUDE.md 可读性和可维护性

**已完成内容**:
- [x] 添加结构化目录（按使用频率组织）
- [x] 归档 NO Column 案例研究到独立文档
- [x] 文件大小从 1031 行减少到 717 行（-30.5%）

**优化成果**:
- ✅ **导航改进**: 目录提供快速访问，Quick Start 突出最常用内容
- ✅ **可维护性**: 案例研究独立归档，CLAUDE.md 更简洁聚焦
- ✅ **信息完整**: 所有关键信息保留，仅优化组织结构

**归档文件**:
- `资料/logs/gpt/CaseStudies/NO_Column_Bug_Fix.md` (336 行)

**备注**: 文档优化任务，无需额外工程日志

---

## [✅ 已完成] Phase 8: Vue UI 2.0 统一与重构

**完成日期**: 2026-01-28

**目标**: 统一所有队列到 Vue UI 2.0 架构，移除原生界面代码，标准化命名规范

**已完成内容**:

### Phase 8.1: 移除原生界面代码 (Priority 0)
- [x] 删除 `openNativeReview()` 函数（~60 行代码）
- [x] 删除重复的 `openDrillDialog()` 和 `openFinalDrillDialog()` 函数
- [x] 删除原生界面相关命令注册
- [x] 修复 Alt+D 命令调用 `openFinalDrillDialog()`

**影响文件**:
- `src/index.ts` - 移除 ~250 行原生界面相关代码

### Phase 8.2: DeliberatePractice → FinalDrill 重命名 (Priority 1)
- [x] 重命名函数：`openDeliberatePracticeDialog()` → `openFinalDrillDialog()`
- [x] 更新命令注册（index.ts:286-292）
- [x] 更新 TopBar 菜单项（TopBar.ts:104-111）
- [x] 更新 i18n 翻译（zh_CN.json, en_US.json）

**重命名理由**:
- FinalDrill 更准确地描述了队列的用途（最终冲刺练习）
- 与代码中实际的类名 `FinalDrillQueue` 保持一致
- 避免与 Deliberate Practice（刻意练习）概念混淆

### Phase 8.3: filterGroupQueue → subsetQueue 内部重命名 (Priority 1)
- [x] 添加私有字段：`private subsetQueue!: FilterGroupQueue`
- [x] 添加兼容性 getter：`public get filterGroupQueue()`
- [x] 更新队列初始化代码（index.ts:145-146）
- [x] 保留外部 API 兼容性

**兼容性设计**:
```typescript
// 内部使用新命名
private subsetQueue!: FilterGroupQueue;

// 外部 API 保持兼容
public get filterGroupQueue(): FilterGroupQueue {
  return this.subsetQueue;
}
```

**影响范围**:
- BlockMenu.ts - 右键菜单（通过 getter 自动兼容）
- SRSBrowser.vue - 浏览器显示（通过 getter 自动兼容）
- DeckDataSource.ts, FilterGroupDataSource.ts - 数据源集成（通过 getter 自动兼容）

### Phase 8.4: Vue UI 2.0 热键系统修复 (Priority 0)
- [x] 修复 dialog.ts 事件转发机制（lines 72-98）
- [x] 添加 `dataKey` 属性支持思源热键系统
- [x] 实现 CustomEvent 从 dialog 到 Vue 组件的转发

**技术方案**:
```typescript
// dialog.ts - 事件转发
if (options.dataKey && dialog.element.firstElementChild) {
  const forwardEvent = (event: Event) => {
    if ('detail' in event && typeof (event as any).detail === 'string') {
      const forwardedEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(forwardedEvent, 'detail', {
        value: (event as any).detail,
        writable: false,
      });
      const vueRoot = container.firstElementChild as HTMLElement;
      if (vueRoot) {
        vueRoot.dispatchEvent(forwardedEvent);
      }
    }
  };
  dialog.element.firstElementChild.addEventListener('click', forwardEvent);
}
```

### Phase 8.5: 卡片切换动画 (Priority 2)
- [x] 在 ReviewContent.vue 中添加 Vue Transition 组件
- [x] 实现四种动画：fade, slide-left, slide-right, none
- [x] 添加过渡 CSS（lines 240-281）

**动画类型**:
```css
/* 淡入淡出 */
.fsrs-review-transition-fade-enter-active,
.fsrs-review-transition-fade-leave-active {
  transition: opacity 0.2s ease;
}

/* 左滑 */
.fsrs-review-transition-slide-left-enter-active,
.fsrs-review-transition-slide-left-leave-active {
  transition: all 0.3s ease;
}

/* 右滑 */
.fsrs-review-transition-slide-right-enter-active,
.fsrs-review-transition-slide-right-leave-active {
  transition: all 0.3s ease;
}
```

### Phase 8.6: 快捷键逻辑修复 (Priority 0)
- [x] 修复显示答案条件（只在未显示时工作）
- [x] 修复评分条件（只在已显示后才能评分）
- [x] ReviewView.vue lines 107-134

**修复前问题**:
- 空格/回车在任何状态下都能显示答案
- 评分在未显示答案时也能触发

**修复后行为**:
```typescript
// 显示答案 - 只在答案未显示时工作
if ((key === ' ' || key === 'enter') && !state.value.actions.showAnswer) {
  hook.reveal();
  return;
}

// 评分 - 只在答案已显示后才能评分
if (['1', '2', '3', '4'].includes(key)) {
  if (state.value.actions.showAnswer) {
    void hook.grade(Number(key));
  }
  return;
}

// 跳过 - 任何时候都能工作
if (key === 's') {
  void hook.skip();
}
```

### Phase 8.7: i18n 清理 (Priority 3)
- [x] 删除 15 个未使用的翻译键
- [x] 删除原生界面相关键（startDrillV2, startNeuralV2 等）
- [x] 删除重复键（startQueuePractice）

**删除的键**:
```json
// 原生界面相关（9 个）
"startDrillV2", "startNeuralV2", "startReviewV2",
"startReviewProviderV2", "startDrillProviderV2",
"startNativeReviewExtraction", "startNativeReviewFinalDrill",
"startNativeReviewFilterGroup", "startQueuePractice"
```

**统计**:
- zh_CN.json: -9 行
- en_US.json: -6 行
- 总计: -15 行

---

## 架构改进总结

### 统一到 Vue UI 2.0
所有 5 个队列现在都使用 Vue UI 2.0：
1. **提取练习** (Extraction Practice) - Alt+R
2. **刻意练习** (Final Drill) - Alt+D
3. **筛选复习** (Filtered Review) - Alt+G
4. **神经漫游** (Neural Roam) - Alt+N（特殊 UI：话题模式）
5. **难点攻坚** (Leech Practice) - Alt+L

### 移除的代码
- 原生界面相关：~250 行
- 重复函数：~50 行
- 总计：~300 行代码清理

### 标准化命名
- ✅ FinalDrill 替代 DeliberatePractice
- ✅ subsetQueue 内部命名（外部保持 filterGroupQueue 兼容）
- ✅ 统一使用 Vue UI 2.0 组件

### 用户体验改进
- ✅ 热键系统完全集成思源 CustomEvent
- ✅ 快捷键逻辑符合直觉（状态感知）
- ✅ 卡片切换动画流畅
- ✅ 更多菜单正确定位

### 提交记录
- `cd1d107`: refactor: unify to Vue UI 2.0 and cleanup queue architecture
- `32580ee`: chore: remove unused i18n keys (native UI)


