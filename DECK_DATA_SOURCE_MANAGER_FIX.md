# DeckDataSource Manager 修复

## 问题描述

队列视图右键菜单缺少"从队列移除"功能，根本原因是 `DeckDataSource` 的 `manager` 是 `undefined`。

## 根本原因

在旧的实现中：
1. `dataSourceFactory.ts` 中的 `createDeckDataSource()` 接收 `plugin` 参数
2. `DeckDataSource` 构造函数通过 `plugin?.unifiedDataSourceManager` 获取 manager
3. 但在 `SRSBrowser.vue` 中调用时传递的是 `props.plugin.unifiedDataSourceManager`，导致类型不匹配
4. 最终 `DeckDataSource` 中的 `this.manager` 为 `undefined`

## 解决方案

### 1. 修改 `DeckDataSource` 构造函数

**修改前：**
```typescript
constructor(plugin: FsrsPluginLike | undefined, options: DeckDataSourceOptions) {
  this.plugin = plugin;
  this.manager = plugin?.unifiedDataSourceManager;
  this.options = options;
}
```

**修改后：**
```typescript
constructor(manager: UnifiedDataSourceManager, options: DeckDataSourceOptions, plugin?: FsrsPluginLike) {
  this.manager = manager;  // 直接接收 manager
  this.plugin = plugin;    // 可选的 plugin 对象（用于特殊功能）
  this.options = options;
}
```

### 2. 修改 `dataSourceFactory.ts`

**修改前：**
```typescript
export function createDeckDataSource(
  plugin: any,
  options: DataSourceOptionsWithDoc,
  currentDocId?: string | null
): ICardDataSource {
  return new DeckDataSource(plugin, {
    preset,
    currentDocId: docId || currentDocId,
    queryText,
    cardType,
  });
}
```

**修改后：**
```typescript
export function createDeckDataSource(
  manager: any,
  options: DataSourceOptionsWithDoc,
  currentDocId?: string | null,
  plugin?: any
): ICardDataSource {
  return new DeckDataSource(manager, {
    preset,
    currentDocId: docId || currentDocId,
    queryText,
    cardType,
  }, plugin);
}
```

### 3. 修改 `SRSBrowser.vue` 调用

**修改前：**
```typescript
currentDataSource.value = createDeckDataSource(
  props.plugin.unifiedDataSourceManager, 
  options, 
  props.currentDocId
);
```

**修改后：**
```typescript
currentDataSource.value = createDeckDataSource(
  props.plugin.unifiedDataSourceManager, 
  options, 
  props.currentDocId,
  props.plugin  // 添加 plugin 参数
);
```

## 架构改进

### 新架构优势

1. **明确依赖关系**：`DeckDataSource` 直接依赖 `UnifiedDataSourceManager`，不再通过 `plugin` 间接获取
2. **类型安全**：避免了 `plugin?.unifiedDataSourceManager` 可能为 `undefined` 的问题
3. **职责分离**：
   - `manager`：负责队列管理和数据访问
   - `plugin`：仅用于特殊功能（Review Subset、神经漫游、时间调整）

### Plugin 保留原因

`DeckDataSource` 仍然需要可选的 `plugin` 参数，用于以下功能：
1. **Review Subset**：`openSubsetReviewDialog()` 方法
2. **神经漫游队列**：`neuralQueue` 属性（暂时保留旧架构）
3. **时间调整**：`adjustTime()` 函数需要 `plugin.rescheduleService`

## 测试验证

编译成功，无错误：
```
✓ 250 modules transformed.
dist/index.js   1,668.17 kB │ gzip: 474.99 kB
✓ built in 6.80s
```

## 影响范围

### 修改的文件
1. `siyuan-plugin-fsrs/src/ui/browser/datasource/DeckDataSource.ts`
2. `siyuan-plugin-fsrs/src/ui/browser/utils/dataSourceFactory.ts`
3. `siyuan-plugin-fsrs/src/ui/browser/SRSBrowser.vue`

### 不受影响的功能
- 所有队列操作（提取练习、渐进学习、刻意练习、筛选复习）
- 卡片删除、重置、暂停
- 优先级设置
- 时间调整（推迟、提前、分散）
- Review Subset
- 神经漫游队列

## 下一步

现在 `DeckDataSource` 的 `manager` 已正确初始化，队列检测应该能正常工作，右键菜单应该会显示"加入队列"和"从队列移除"选项。

需要在实际环境中测试验证：
1. 打开队列视图
2. 右键点击卡片
3. 确认菜单中显示"从队列移除"选项
4. 测试移除功能是否正常工作
