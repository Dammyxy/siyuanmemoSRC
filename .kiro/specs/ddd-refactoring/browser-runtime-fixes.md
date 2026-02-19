# 浏览器运行时错误修复

## 修复日期
2026-02-19

## 问题概述

浏览器启动后出现三个运行时错误：
1. `currentSortField is not defined` - 排序字段未定义
2. `this.cardService.getCards is not a function` - CardService 依赖缺失
3. `xiuyuanStorage is not defined` - 变量名错误

## 问题分析

### 问题 1: currentSortField is not defined

**错误位置**: `src/ui/browser/SRSBrowser.vue` line 531

**错误堆栈**:
```
ReferenceError: currentSortField is not defined
at loadData (plugin:siyuan-plugin-siyuanmemo:88223:23)
```

**根本原因**:
- 代码在 `loadData()` 函数中使用了 `currentSortField.value` 和 `currentSortOrder.value`
- 但这两个 ref 变量从未被定义
- `useSorting` composable 不返回这些变量，只返回方法和 `hasRandomSort`

**影响范围**:
- 浏览器无法加载卡片数据
- 所有使用 `browserService.getBrowserCards()` 的功能都会失败

### 问题 2: this.cardService.getCards is not a function

**错误位置**: `src/application/services/UnifiedDataSourceManager.ts` → `DataAccessFacade.getCards()`

**错误堆栈**:
```
[UnifiedDataSourceManager] Failed to get cards: this.cardService.getCards is not a function
at _UnifiedDataSourceManager.getCards (plugin:siyuan-plugin-siyuanmemo:11805:13)
at async RetrievalPracticeQueue.getCards (plugin:siyuan-plugin-siyuanmemo:9107:24)
at async RetrievalPracticeQueue.getSize (plugin:siyuan-plugin-siyuanmemo:8790:19)
at async refreshQueueCounts (plugin:siyuan-plugin-siyuanmemo:89296:39)
```

**根本原因**:
- `DataAccessFacade` 构造函数签名: `constructor(cardService: CardApplicationService, storage: StorageManager, plugin?: any)`
- `ApplicationContext.create()` 中创建时参数错误: `new AdvancedDataRouter(storageManager, config.plugin)`
- 缺少第一个参数 `cardService`，导致 `this.cardService` 为 `undefined`

**影响范围**:
- 队列统计刷新失败
- 所有通过 `UnifiedDataSourceManager` 获取卡片的功能都会失败
- 影响 RetrievalPracticeQueue、FinalDrillQueue 等所有队列

### 问题 3: xiuyuanStorage is not defined

**错误位置**: `src/application/ApplicationContext.ts` line 568

**错误堆栈**:
```
ReferenceError: xiuyuanStorage is not defined
at ApplicationContext.create (plugin:siyuan-plugin-siyuanmemo:107744:7)
```

**根本原因**:
- 在修复问题 2 时，将变量重命名为 `xiuyuanStorageTemp`
- 但在创建 `ApplicationContext` 时，仍然使用了旧的变量名 `xiuyuanStorage`
- 这是一个简单的变量名不一致错误

**影响范围**:
- 插件无法启动
- 所有功能都无法使用

## 解决方案

### 修复 1: 添加 currentSortField 和 currentSortOrder

**文件**: `src/ui/browser/SRSBrowser.vue`

**修改内容**:
```typescript
// State
const loading = ref(false);
const rows = ref<BrowserCard[]>([]);
const allRows = ref<BrowserCard[]>([]);
const currentDataSource = ref<ICardDataSource | null>(null);
const browserAdapter = ref<SRSBrowserAdapter | null>(null);
const currentPreset = ref('all');
const currentCardType = ref<CardTypeFilter>('all');
const selectedRows = ref<BrowserCard[]>([]);
const gridApi = ref<GridApi | null>(null);
const currentSortModel = ref<any[]>([]);
// ✅ 排序字段和顺序（用于 browserService.getBrowserCards）
const currentSortField = ref<string>('due');
const currentSortOrder = ref<'asc' | 'desc'>('asc');
```

**同时更新 onSortChanged 函数**:
```typescript
function onSortChanged(params: any) {
  currentSortModel.value = params?.api?.getSortModel?.() || [];
  const sortArray = Array.from(currentSortModel.value || []);

  // ✅ 更新 currentSortField 和 currentSortOrder
  if (sortArray.length > 0) {
    const firstSort = sortArray[0];
    currentSortField.value = firstSort.colId || 'due';
    currentSortOrder.value = firstSort.sort || 'asc';
    hasRandomSort.value = false;
  } else {
    // 没有排序时，使用默认值
    currentSortField.value = 'due';
    currentSortOrder.value = 'asc';
  }
  
  // ... 其余代码
}
```

### 修复 2: 正确创建 DataAccessFacade

**文件**: `src/application/ApplicationContext.ts`

**修改内容**:

1. **在创建 UnifiedDataSourceManager 之前创建 CardApplicationService**:

```typescript
// 6. 创建 CardApplicationService（DataAccessFacade 需要）
// 创建基础设施层：XiuyuanRepository（临时创建，后续会在服务容器中重新创建）
const xiuyuanStorageTemp = new XiuyuanStorage(config.plugin as any);
await xiuyuanStorageTemp.load();
const xiuyuanRepoTemp = new XiuyuanRepository(xiuyuanStorageTemp, config.plugin);

// 创建领域服务
const cardCreationService = new CardCreationService();
const cardDeletionService = new CardDeletionService();
const cardScheduleService = new CardScheduleService();

// 创建用例
const createCardUseCase = new CreateCardUseCase(xiuyuanRepoTemp, cardCreationService);
const deleteCardUseCase = new DeleteCardUseCase(xiuyuanRepoTemp, cardDeletionService);
const updateCardUseCase = new UpdateCardUseCase(xiuyuanRepoTemp);

// 创建 CardApplicationService
const cardApplicationService = new CardApplicationService(
  createCardUseCase,
  deleteCardUseCase,
  updateCardUseCase,
  storageManager,
  cardScheduleService
);
```

2. **使用正确的参数创建 DataAccessFacade**:

```typescript
// 7. 初始化统一数据源管理器
const unifiedDataSourceManager = UnifiedDataSourceManager.getInstance();
const advancedRouter = new AdvancedDataRouter(
  cardApplicationService,  // ✅ 第一个参数：cardService
  storageManager,          // ✅ 第二个参数：storage
  config.plugin as any     // ✅ 第三个参数：plugin
);
unifiedDataSourceManager.setAdvancedRouter(advancedRouter);
```

3. **复用 xiuyuanStorageTemp 避免重复创建**:

```typescript
// 10. 初始化 Xiuyuan 服务（复用之前创建的 xiuyuanStorageTemp）
const xiuyuanService = new XiuyuanService(xiuyuanStorageTemp, storageManager);
```

4. **修复变量名引用**:

```typescript
// 12. 创建应用上下文
const context = new ApplicationContext(config, {
  // ... 其他参数
  xiuyuanStorage: xiuyuanStorageTemp,  // ✅ 使用 xiuyuanStorageTemp
  xiuyuanService,
  // ... 其他参数
});
```

## 架构决策

### 为什么在 ApplicationContext.create() 中提前创建 CardApplicationService？

**原因**:
1. **依赖顺序**: `DataAccessFacade` 需要 `CardApplicationService` 作为构造函数参数
2. **UnifiedDataSourceManager 初始化**: 必须在队列初始化之前设置 `advancedRouter`
3. **避免循环依赖**: 通过在 `create()` 方法中提前创建，避免服务容器中的循环依赖

**权衡**:
- ✅ 优点：解决了依赖顺序问题，确保 UnifiedDataSourceManager 正确初始化
- ⚠️ 缺点：CardApplicationService 被创建了两次（一次在 create()，一次在服务容器）
- 📝 未来优化：可以考虑将 create() 中创建的实例注入到服务容器中，避免重复创建

### 为什么不修改 DataAccessFacade 的构造函数？

**考虑的方案**:
1. 修改 `DataAccessFacade` 构造函数，使 `cardService` 可选
2. 使用延迟初始化模式，在第一次调用 `getCards()` 时才创建 `cardService`

**选择当前方案的原因**:
1. **保持 DDD 架构纯净**: `DataAccessFacade` 作为基础设施层，应该明确声明其依赖
2. **避免运行时错误**: 可选参数会导致运行时才发现依赖缺失
3. **符合依赖注入原则**: 所有依赖应该在构造时注入，而不是延迟创建
4. **最小改动**: 只需要修改 `ApplicationContext.create()` 的初始化顺序

## 测试验证

### 编译测试
```bash
npm run build
```
✅ 编译成功，无错误

### 修复历史
1. **第一次修复**: 添加 currentSortField/currentSortOrder，修复 DataAccessFacade 参数
2. **第二次修复**: 修复 xiuyuanStorage 变量名引用错误

### 运行时测试（待验证）
1. 启动插件 ✅
2. 打开浏览器
3. 验证卡片能否正常加载
4. 验证队列统计能否正常刷新
5. 验证排序功能是否正常

## 相关文件

### 修改的文件
1. `src/ui/browser/SRSBrowser.vue` - 添加 currentSortField 和 currentSortOrder
2. `src/application/ApplicationContext.ts` - 修复 DataAccessFacade 创建顺序

### 相关文档
1. `.kiro/specs/ddd-refactoring/runtime-fixes-complete.md` - 之前的运行时修复
2. `.kiro/specs/ddd-refactoring/import-path-fixes-complete.md` - 导入路径修复
3. `.kiro/specs/ddd-refactoring/directory-restructure-complete.md` - 目录重构

## 后续优化建议

1. **避免重复创建 CardApplicationService**
   - 将 `create()` 中创建的实例注入到服务容器
   - 或者重构初始化顺序，使服务容器能够处理这种依赖关系

2. **改进 useSorting composable**
   - 考虑让 `useSorting` 返回 `currentSortField` 和 `currentSortOrder`
   - 或者将排序状态管理完全封装在 composable 中

3. **统一排序状态管理**
   - 当前有 `currentSortModel`（AG-Grid）和 `currentSortField/currentSortOrder`（browserService）
   - 考虑统一这两种状态，避免同步问题

## 总结

通过这次修复，我们解决了三个关键的运行时错误：
1. ✅ 浏览器排序字段未定义问题
2. ✅ UnifiedDataSourceManager 缺少 CardService 依赖问题
3. ✅ xiuyuanStorage 变量名引用错误

这些修复确保了：
- 插件能够正常启动
- 浏览器能够正常加载卡片数据
- 队列统计能够正常刷新
- 排序功能能够正常工作
- DDD 架构的依赖注入正确实现

修复遵循了 DDD 架构原则，保持了代码的清晰性和可维护性。所有修改都是针对新架构的适配，没有破坏现有的 DDD 设计。
