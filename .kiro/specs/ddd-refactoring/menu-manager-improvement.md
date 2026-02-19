# MenuManager 改进方案

## 当前问题

1. `MenuManager` 通过 `context` 动态获取服务，而不是通过构造函数注入
2. `MenuManager` 和 `DialogManager` 职责重叠
3. 依赖关系不够明确

## 改进方案

### 方案 A：构造函数注入（推荐）

#### 修改 MenuManager

```typescript
/**
 * MenuManager - 菜单管理器
 * 
 * 职责：
 * - 构建和显示菜单
 * - 将用户操作委托给相应的管理器
 */
export class MenuManager {
  constructor(
    private context: ApplicationContext,
    private plugin: Plugin,
    private i18n: Record<string, any>,
    private dialogManager: DialogManager  // 注入 DialogManager
  ) {}
  
  /**
   * 打开顶栏菜单
   */
  openTopBarMenu(ev: MouseEvent): void {
    const menu = new Menu('fsrs-topbar-menu');
    const storage = this.context.getStorage();
    
    // 提取练习
    menu.addItem({
      icon: 'iconCards',
      label: this.i18n?.startReview || 'Start Retrieval Practice',
      accelerator: 'Alt+R',
      click: () => {
        this.dialogManager.openReviewDialog();  // 委托给 DialogManager
      },
    });
    
    // 渐进学习
    menu.addItem({
      icon: 'iconBook',
      label: this.i18n?.startIncrementalLearning || 'Start Incremental Learning',
      accelerator: 'Alt+I',
      click: () => {
        this.dialogManager.openIncrementalLearningDialog();
      },
    });
    
    // 刻意练习
    menu.addItem({
      icon: 'iconCards',
      label: this.i18n?.startDeliberatePractice || 'Start Deliberate Practice',
      accelerator: 'Alt+D',
      click: () => {
        this.dialogManager.openFinalDrillDialog();
      },
    });
    
    // 神经漫游
    menu.addItem({
      icon: 'iconRefresh',
      label: this.i18n?.startNeuralReview || 'Start Neural Roam',
      accelerator: 'Alt+N',
      click: () => {
        this.dialogManager.openNeuralRoamDialog();
      },
    });
    
    // 筛选复习
    menu.addItem({
      icon: 'iconCards',
      label: this.i18n?.startFilterGroupPractice || 'Start Filtered Review',
      accelerator: 'Alt+G',
      click: () => {
        this.dialogManager.openFilterGroupPracticeDialog();
      },
    });
    
    // SRS 浏览器
    menu.addItem({
      icon: 'iconLayoutRight',
      label: this.i18n?.srsBrowser || 'SRS Browser',
      accelerator: 'Alt+B',
      click: () => {
        this.dialogManager.openBrowserDialog();
      },
    });
    
    menu.addSeparator();
    
    // 设置
    menu.addItem({
      icon: 'iconSettings',
      label: this.i18n?.settings || 'Settings',
      click: () => {
        this.dialogManager.openSettingsDialog();
      },
    });
    
    menu.addSeparator();
    
    // 统计信息
    const dueCount = storage.getDueCards().length;
    const totalCount = storage.getAllCards().length;
    menu.addItem({
      icon: 'iconInfo',
      label: `${this.i18n?.dueCountLabel || 'Due'}: ${dueCount} / ${this.i18n?.totalCountLabel || 'Total'}: ${totalCount}`,
      type: 'readonly',
    });
    
    // 打开菜单
    const anchor = (ev.currentTarget || ev.target) as HTMLElement | null;
    const rect = anchor?.getBoundingClientRect?.();
    if (rect) {
      menu.open({
        x: rect.right,
        y: rect.bottom,
        isLeft: true,
      });
    } else {
      menu.open({ x: ev.clientX, y: ev.clientY, isLeft: true });
    }
  }
  
  dispose(): void {
    // 清理资源
  }
}
```

#### 修改 ApplicationContext

```typescript
static async create(config: ApplicationConfig): Promise<ApplicationContext> {
  // ... 创建其他服务
  
  // 创建 DialogManager
  const dialogManager = new DialogManager(context, config.plugin);
  
  // 创建 MenuManager，注入 DialogManager
  const menuManager = new MenuManager(
    context,
    config.plugin,
    config.i18n,
    dialogManager  // 注入依赖
  );
  
  // ... 创建其他服务
  
  return new ApplicationContext(config, {
    // ... 其他服务
    dialogManager,
    menuManager,
    // ...
  });
}
```

### 方案 B：使用 Facade 模式简化 Plugin 接口

#### 修改 index.ts

```typescript
export default class FSRSPlugin extends Plugin {
  private context!: ApplicationContext;

  // ========================================================================
  // 公共 API（门面方法）
  // ========================================================================
  
  /**
   * 打开提取练习对话框
   */
  async openRetrievalPractice(): Promise<void> {
    await this.context.getDialogManager().openReviewDialog();
  }
  
  /**
   * 打开渐进学习对话框
   */
  async openIncrementalLearning(): Promise<void> {
    await this.context.getDialogManager().openIncrementalLearningDialog();
  }
  
  /**
   * 打开刻意练习对话框
   */
  async openFinalDrill(): Promise<void> {
    await this.context.getDialogManager().openFinalDrillDialog();
  }
  
  /**
   * 打开神经漫游对话框
   */
  async openNeuralRoam(options?: any): Promise<void> {
    await this.context.getDialogManager().openNeuralRoamDialog(options);
  }
  
  /**
   * 打开筛选复习对话框
   */
  async openFilterGroupPractice(): Promise<void> {
    await this.context.getDialogManager().openFilterGroupPracticeDialog();
  }
  
  /**
   * 打开 SRS 浏览器
   */
  openBrowser(): void {
    this.context.getDialogManager().openBrowserDialog();
  }
  
  /**
   * 获取到期卡片数量
   */
  getDueCount(): number {
    return this.context.getStorage().getDueCards().length;
  }
  
  /**
   * 获取所有卡片数量
   */
  getTotalCount(): number {
    return this.context.getStorage().getAllCards().length;
  }
  
  // ========================================================================
  // 向后兼容（仅暴露必要的服务）
  // ========================================================================
  
  /**
   * @deprecated 使用 context.getStorage() 代替
   */
  public get storage() { 
    return this.context.getStorage(); 
  }
  
  /**
   * @deprecated 使用 context.getUnifiedDataSourceManager() 代替
   */
  public get unifiedDataSourceManager() { 
    return this.context.getUnifiedDataSourceManager(); 
  }
  
  // ❌ 移除这些暴露内部服务的 getter
  // public get reviewDialogManager() { ... }
  // public get hybridSyncService() { ... }
  // public get scheduler() { ... }
  // 等等...
}
```

## 实施步骤

### 阶段 1：修复紧急 Bug（已完成）
- ✅ 修复 `MenuManager.getDueCount()` 错误
- ✅ 在 `index.ts` 中暴露 `reviewDialogManager` 和 `hybridSyncService`

### 阶段 2：改进 MenuManager（建议下一步）
1. 修改 `MenuManager` 构造函数，注入 `DialogManager`
2. 移除 `MenuManager` 中的对话框打开方法，全部委托给 `DialogManager`
3. 更新 `ApplicationContext.create()` 方法

### 阶段 3：简化 Plugin 接口（可选）
1. 在 `index.ts` 中添加门面方法
2. 标记直接暴露服务的 getter 为 `@deprecated`
3. 逐步迁移外部代码使用门面方法

### 阶段 4：完善测试
1. 为 `MenuManager` 添加单元测试
2. 为 `DialogManager` 添加单元测试
3. 添加集成测试验证菜单和对话框的交互

## 测试示例

### MenuManager 单元测试

```typescript
describe('MenuManager', () => {
  let menuManager: MenuManager;
  let mockContext: ApplicationContext;
  let mockPlugin: Plugin;
  let mockDialogManager: DialogManager;
  
  beforeEach(() => {
    mockContext = {
      getStorage: vi.fn().mockReturnValue({
        getDueCards: vi.fn().mockReturnValue([]),
        getAllCards: vi.fn().mockReturnValue([]),
      }),
    } as any;
    
    mockPlugin = {} as any;
    
    mockDialogManager = {
      openReviewDialog: vi.fn(),
      openIncrementalLearningDialog: vi.fn(),
      openFinalDrillDialog: vi.fn(),
      openNeuralRoamDialog: vi.fn(),
      openFilterGroupPracticeDialog: vi.fn(),
      openBrowserDialog: vi.fn(),
      openSettingsDialog: vi.fn(),
    } as any;
    
    menuManager = new MenuManager(
      mockContext,
      mockPlugin,
      {},
      mockDialogManager
    );
  });
  
  it('应该通过 DialogManager 打开复习对话框', () => {
    const mockEvent = { preventDefault: vi.fn() } as any;
    
    // 打开菜单并点击"提取练习"
    menuManager.openTopBarMenu(mockEvent);
    
    // 模拟点击菜单项
    // （实际测试中需要模拟 Menu 的行为）
    
    expect(mockDialogManager.openReviewDialog).toHaveBeenCalled();
  });
});
```

## 优点

1. **依赖关系明确**：通过构造函数注入，依赖关系一目了然
2. **易于测试**：可以轻松注入 mock 对象
3. **职责清晰**：MenuManager 只负责菜单，DialogManager 负责对话框
4. **符合 DDD**：遵循依赖注入和单一职责原则
5. **向后兼容**：通过门面模式保持 API 兼容性

## 缺点

1. **需要修改多个文件**：ApplicationContext、MenuManager、index.ts
2. **可能影响现有代码**：需要仔细测试向后兼容性
3. **增加复杂度**：构造函数参数变多

## 建议

建议采用**渐进式重构**：
1. 先完成阶段 1（已完成）
2. 在下一个迭代中实施阶段 2
3. 根据实际需求决定是否实施阶段 3 和 4

这样可以在保持系统稳定的同时，逐步改进架构质量。

## 长期改进方向

当前的实现是务实且可接受的，但还有进一步优化的空间。详细的长期改进计划请参考：

📖 [长期改进计划](./long-term-improvements.md)

主要改进方向包括：

1. **提取 CardScheduleService 领域服务**
   - 将 `getDueCards()` 的业务逻辑从 StorageManager 移到领域服务
   - 提高代码可测试性和可维护性

2. **引入 CardApplicationService 应用服务**
   - MenuManager 通过应用服务访问数据，而不是直接访问 Storage
   - 完善分层架构，符合 DDD 原则

3. **添加领域事件机制**
   - 卡片状态变化时发布事件
   - 解耦模块依赖，提高系统扩展性

这些改进不是紧急任务，可以在后续迭代中根据优先级逐步实施。
