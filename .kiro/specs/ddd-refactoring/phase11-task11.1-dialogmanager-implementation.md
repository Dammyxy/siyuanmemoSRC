# Phase 11 Task 11.1：完善 DialogManager

生成时间：2026-02-19
状态：📋 规划中

## 目标

在 DialogManager 中实现 ReviewDialogManager 的所有功能，确保功能完全一致。

## ReviewDialogManager 方法分析

### 核心方法（需要迁移）

| 方法 | 功能 | 使用场景 | 优先级 |
|------|------|---------|--------|
| `openRetrievalPractice()` | 打开提取练习对话框 | 顶栏菜单 | 高 |
| `openIncrementalLearning()` | 打开渐进学习对话框 | 顶栏菜单 | 高 |
| `openFinalDrill()` | 打开刻意练习对话框 | 顶栏菜单 | 高 |
| `openNeuralRoam(options?)` | 打开神经漫游对话框 | 顶栏菜单 | 高 |
| `openRetrievalPracticeWithFilter(options)` | 打开提取练习（带过滤） | 块菜单 | 高 |
| `openIncrementalLearningWithFilter(options)` | 打开渐进学习（带过滤） | 块菜单 | 高 |
| `openTemporaryDrill(blockIds)` | 打开临时练习对话框 | 块菜单 | 高 |
| `openLeechReview()` | 打开难点攻坚对话框 | 顶栏菜单 | 中 |
| `openFilterGroupPractice()` | 打开分组队列对话框 | 顶栏菜单 | 中 |
| `openSubsetReview(blockIds)` | 打开子集复习对话框 | 旧代码 | 低 |
| `openDrillWithCards(cards, mode, options)` | 打开练习对话框（基于卡片列表） | 旧代码 | 低 |

### 辅助方法（内部使用）

| 方法 | 功能 | 是否需要迁移 |
|------|------|-------------|
| `destroyCurrentDialog()` | 销毁当前对话框 | ✅ 是 |
| `createDialog(options)` | 创建标准复习对话框 | ✅ 是 |
| `checkInitialized()` | 检查初始化状态 | ✅ 是 |

## 实现计划

### Step 1：分析 DialogManager 当前状态（15 分钟）

**任务**：
1. 读取 DialogManager 的完整实现
2. 对比 ReviewDialogManager 的方法
3. 列出缺失的方法

**输出**：
- DialogManager 当前方法列表
- 缺失方法列表
- 需要修改的方法列表

### Step 2：实现核心方法（45 分钟）

**任务**：
1. 实现 `openRetrievalPracticeWithFilter(options)`
2. 实现 `openIncrementalLearningWithFilter(options)`
3. 实现 `openTemporaryDrill(blockIds)`
4. 实现 `openFinalDrill()`
5. 实现 `openNeuralRoam(options?)`

**实现细节**：

#### 1. openRetrievalPracticeWithFilter

```typescript
/**
 * 打开提取练习对话框（带过滤条件）
 * 
 * @param options 过滤选项
 * @param options.blockIds 块 ID 列表
 * @param options.dueOnly 是否只显示到期卡片
 */
async openRetrievalPracticeWithFilter(options: {
  blockIds: string[];
  dueOnly: boolean;
}): Promise<void> {
  if (!(await this.checkInitialized())) return;
  this.destroyCurrentDialog();

  try {
    // 获取 UnifiedDataSourceManager
    const manager = this.context.getUnifiedDataSourceManager();
    const filterGroupQueue = manager.getQueue(QueueType.FilterGroup);
    
    // 设置临时过滤条件
    const filter: any = {
      blockIds: options.blockIds,
      cardType: 'item',  // 只接受 Item
    };
    
    if (options.dueOnly) {
      filter.dueDate = {
        lte: new Date(),
      };
    }
    
    // 应用过滤条件
    if (typeof (filterGroupQueue as any).setFilter === 'function') {
      (filterGroupQueue as any).setFilter(filter);
    }
    
    // 清除临时黑名单（全部模式）
    if (!options.dueOnly && typeof (filterGroupQueue as any).clearTemporaryBlacklist === 'function') {
      (filterGroupQueue as any).clearTemporaryBlacklist();
    }
    
    // 创建对话框
    const queue = new UnifiedQueueStrategy(QueueType.FilterGroup);
    const adapter = new UnifiedReviewAdapter({ i18n: this.i18n });
    
    this.currentDialog = createVueDialog({
      hideTitle: true,
      component: ReviewView,
      dataKey: 'dialog-opencard',
      transparent: true,
      isReview: true,
      props: {
        app: this.plugin.app,
        i18n: this.i18n,
        title: this.i18n?.retrievalPractice || '提取练习',
        queue: queue as any,
        adapter: adapter as any,
        plugin: this.plugin,
      },
      events: {
        close: () => {
          // 清除过滤条件
          if (typeof (filterGroupQueue as any).setFilter === 'function') {
            (filterGroupQueue as any).setFilter({});
          }
          this.destroyCurrentDialog();
        },
      },
      width: 'min(860px, 96vw)',
      height: 'min(720px, 90vh)',
      onClose: () => {
        this.currentDialog = null;
      },
    });
    
    console.log('[DialogManager] ✅ Retrieval practice dialog created with blockIds filter');
  } catch (err) {
    console.error('[DialogManager] Failed to open retrieval practice dialog:', err);
    await pushErrMsg(this.i18n?.loadFailed || '加载失败');
  }
}
```

#### 2. openIncrementalLearningWithFilter

```typescript
/**
 * 打开渐进学习对话框（带过滤条件）
 * 
 * @param options 过滤选项
 * @param options.blockIds 块 ID 列表
 * @param options.dueOnly 是否只显示到期卡片
 */
async openIncrementalLearningWithFilter(options: {
  blockIds: string[];
  dueOnly: boolean;
}): Promise<void> {
  if (!(await this.checkInitialized())) return;
  this.destroyCurrentDialog();

  try {
    // 获取 UnifiedDataSourceManager
    const manager = this.context.getUnifiedDataSourceManager();
    const filterGroupQueue = manager.getQueue(QueueType.FilterGroup);
    
    // 设置临时过滤条件
    const filter: any = {
      blockIds: options.blockIds,
      // 渐进学习接受所有类型（Item + Topic）
    };
    
    if (options.dueOnly) {
      filter.dueDate = {
        lte: new Date(),
      };
    }
    
    // 应用过滤条件
    if (typeof (filterGroupQueue as any).setFilter === 'function') {
      (filterGroupQueue as any).setFilter(filter);
    }
    
    // 清除临时黑名单（全部模式）
    if (!options.dueOnly && typeof (filterGroupQueue as any).clearTemporaryBlacklist === 'function') {
      (filterGroupQueue as any).clearTemporaryBlacklist();
    }
    
    // 创建对话框
    const queue = new UnifiedQueueStrategy(QueueType.FilterGroup);
    const adapter = new UnifiedReviewAdapter({ i18n: this.i18n });
    
    this.currentDialog = createVueDialog({
      hideTitle: true,
      component: ReviewView,
      dataKey: 'dialog-opencard',
      transparent: true,
      isReview: true,
      props: {
        app: this.plugin.app,
        i18n: this.i18n,
        title: this.i18n?.incrementalLearning || '渐进学习',
        queue: queue as any,
        adapter: adapter as any,
        plugin: this.plugin,
      },
      events: {
        close: () => {
          // 清除过滤条件
          if (typeof (filterGroupQueue as any).setFilter === 'function') {
            (filterGroupQueue as any).setFilter({});
          }
          this.destroyCurrentDialog();
        },
      },
      width: 'min(860px, 96vw)',
      height: 'min(720px, 90vh)',
      onClose: () => {
        this.currentDialog = null;
      },
    });
    
    console.log('[DialogManager] ✅ Incremental learning dialog created with blockIds filter');
  } catch (err) {
    console.error('[DialogManager] Failed to open incremental learning dialog:', err);
    await pushErrMsg(this.i18n?.openFailed || '打开渐进学习失败');
  }
}
```

#### 3. openTemporaryDrill

```typescript
/**
 * 打开临时练习对话框
 * 
 * @param blockIds 块 ID 列表
 */
async openTemporaryDrill(blockIds: string[]): Promise<void> {
  this.destroyCurrentDialog();

  if (blockIds.length === 0) {
    await pushMsg(this.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
    return;
  }

  try {
    const { TemporaryDrillStrategy } = await import('@/core/queue/strategies/TemporaryDrillStrategy');
    const { SubsetPracticeAdapter } = await import('@/ui/review/v2/adapters/SubsetPracticeAdapter');
    const { ReviewView } = await import('@/ui/review/v2');

    const title = `临时练习 (${blockIds.length} 张)`;
    const session = new TemporaryDrillStrategy({
      blockIds,
      deckID: riff.BUILTIN_DECK_ID,
      storage: this.context.getStorage()
    });
    const adapter = new SubsetPracticeAdapter({
      i18n: this.i18n,
      label: title,
      queueName: 'temporary-drill'
    });

    this.currentDialog = createVueDialog({
      hideTitle: true,
      component: ReviewView,
      dataKey: 'dialog-temporary-drill',
      props: {
        app: this.plugin.app,
        i18n: this.i18n,
        title,
        plugin: this.plugin,
        queue: session as any,
        adapter: adapter as any,
      },
      events: {
        close: () => this.destroyCurrentDialog(),
      },
      width: '80vw',
      height: '70vh',
      onClose: () => {
        this.currentDialog = null;
      },
    });

    // 样式调整
    const dialogEl = this.currentDialog.dialog.element;
    const scrim = dialogEl.querySelector('.b3-dialog__scrim') as HTMLElement;
    const container = dialogEl.querySelector('.b3-dialog__container') as HTMLElement;

    if (scrim) {
      scrim.style.backgroundColor = 'var(--b3-theme-surface)';
    }
    if (container) {
      container.style.maxWidth = '1024px';
    }

    setTimeout(() => {
      const focusEl = dialogEl.querySelector('.block__icon') as HTMLElement;
      if (focusEl) {
        focusEl.focus();
      }
    }, 100);

    console.log('[DialogManager] ✅ Temporary drill dialog opened');
  } catch (err) {
    console.error('[DialogManager] Failed to open temporary drill:', err);
    await pushErrMsg(this.i18n?.drillFailed || '临时练习启动失败');
  }
}
```

#### 4. openFinalDrill

```typescript
/**
 * 打开刻意练习对话框
 */
async openFinalDrill(): Promise<void> {
  if (!(await this.checkInitialized())) return;
  this.destroyCurrentDialog();

  try {
    // 使用 createUnifiedReviewDialog 创建对话框
    this.currentDialog = createUnifiedReviewDialog({
      plugin: this.plugin,
      queueType: QueueType.FinalDrill,
      title: this.i18n?.finalDrill || '刻意练习',
      onClose: () => {
        this.currentDialog = null;
      }
    });
    
    console.log('[DialogManager] ✅ Final drill dialog created');
  } catch (err) {
    console.error('[DialogManager] Failed to open final drill dialog:', err);
    await pushErrMsg(this.i18n?.drillFailed || '机械练习启动失败');
  }
}
```

#### 5. openNeuralRoam

```typescript
/**
 * 打开神经漫游对话框
 * 
 * @param options 可选配置
 * @param options.seedBlockId 种子块 ID
 * @param options.includeSeedAsFirst 是否将种子块作为第一张卡片
 * @param options.resetHistory 是否重置历史记录
 */
async openNeuralRoam(options?: { 
  seedBlockId?: string; 
  includeSeedAsFirst?: boolean; 
  resetHistory?: boolean 
}): Promise<void> {
  if (!(await this.checkInitialized())) return;
  this.destroyCurrentDialog();

  try {
    // 清理神经漫游队列的历史记录
    const neuralQueue = this.context.getUnifiedDataSourceManager().getQueue(QueueType.NeuralRoam);
    if (neuralQueue && typeof (neuralQueue as any).clearHistory === 'function') {
      (neuralQueue as any).clearHistory();
      console.log('[DialogManager] ✅ Neural roam history cleared');
    }

    // 使用 createUnifiedReviewDialog 创建对话框
    this.currentDialog = createUnifiedReviewDialog({
      plugin: this.plugin,
      queueType: QueueType.NeuralRoam,
      title: this.i18n?.neuralReviewTitle || '神经漫游',
      onClose: () => {
        this.currentDialog = null;
      }
    });

    console.log('[DialogManager] ✅ Neural roam dialog created');
  } catch (err) {
    console.error('[DialogManager] Failed to open neural roam dialog:', err);
    await pushErrMsg(this.i18n?.neuralReviewFailed || '神经复习启动失败');
  }
}
```

### Step 3：实现辅助方法（15 分钟）

**任务**：
1. 实现 `destroyCurrentDialog()`
2. 实现 `checkInitialized()`

**实现细节**：

```typescript
/**
 * 销毁当前对话框
 */
destroyCurrentDialog(): void {
  if (this.currentDialog) {
    this.currentDialog.destroy();
    this.currentDialog = null;
  }
}

/**
 * 检查初始化状态
 */
private async checkInitialized(): Promise<boolean> {
  // 检查 ApplicationContext 是否已初始化
  if (!this.context) {
    await pushErrMsg(this.i18n?.initFailed || 'FSRS 插件初始化失败，请打开控制台查看错误');
    return false;
  }
  return true;
}
```

### Step 4：添加类型定义（15 分钟）

**任务**：
1. 添加方法参数的类型定义
2. 添加返回值的类型定义

**实现细节**：

```typescript
/**
 * 过滤选项接口
 */
export interface FilterOptions {
  /** 块 ID 列表 */
  blockIds: string[];
  /** 是否只显示到期卡片 */
  dueOnly: boolean;
}

/**
 * 神经漫游选项接口
 */
export interface NeuralRoamOptions {
  /** 种子块 ID */
  seedBlockId?: string;
  /** 是否将种子块作为第一张卡片 */
  includeSeedAsFirst?: boolean;
  /** 是否重置历史记录 */
  resetHistory?: boolean;
}
```

### Step 5：测试（30 分钟）

**任务**：
1. 编译测试
2. 功能测试
3. 边缘情况测试

**测试用例**：

| 测试用例 | 预期结果 |
|---------|---------|
| 打开提取练习（到期） | 显示到期卡片 |
| 打开提取练习（全部） | 显示所有卡片 |
| 打开渐进学习（到期） | 显示到期卡片（Item + Topic） |
| 打开渐进学习（全部） | 显示所有卡片（Item + Topic） |
| 打开临时练习 | 显示所有卡片，评分不影响间隔 |
| 打开刻意练习 | 显示刻意练习队列 |
| 打开神经漫游 | 显示神经漫游队列 |
| 空卡片列表 | 显示提示消息 |
| 未初始化 | 显示错误消息 |

## 验收标准

### 必须达成

1. ✅ DialogManager 实现了所有核心方法
2. ✅ 所有方法的功能与 ReviewDialogManager 一致
3. ✅ 编译成功，无错误
4. ✅ 所有测试用例通过

### 期望达成

1. ✅ 代码清晰，易于维护
2. ✅ 类型定义完整
3. ✅ 错误处理完善

### 可选达成

1. ⏭️ 添加单元测试
2. ⏭️ 添加文档注释
3. ⏭️ 性能优化

## 时间估算

| 步骤 | 预计时间 |
|------|---------|
| Step 1 | 15m |
| Step 2 | 45m |
| Step 3 | 15m |
| Step 4 | 15m |
| Step 5 | 30m |
| **总计** | **2h** |

## 风险评估

### 高风险

1. **功能不一致**：新实现可能与旧实现有细微差异
   - 缓解措施：仔细对比代码，确保逻辑一致

### 中风险

1. **依赖问题**：可能缺少某些依赖
   - 缓解措施：检查所有导入，确保依赖完整

### 低风险

1. **类型错误**：TypeScript 会捕获大部分错误
   - 缓解措施：逐步实现，每步都编译测试

## 下一步

**立即开始 Step 1**：分析 DialogManager 当前状态

---

**Task 11.1 状态：📋 规划完成，等待执行**
