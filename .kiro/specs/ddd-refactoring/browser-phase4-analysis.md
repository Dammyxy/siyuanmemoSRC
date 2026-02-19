# 浏览器 DDD 化 - Phase 4 分析

## 📋 当前状况分析

### DialogManager 状态
**文件**：`src/application/managers/DialogManager.ts`

**当前实现**：
```typescript
openBrowserDialog(): void {
  const storage = this.context.getStorage();
  const scheduler = this.context.getScheduler();
  
  this.srsBrowserDialog = createVueDialog({
    props: {
      plugin: this.plugin,
      storage,
      scheduler,
      i18n: this.context.getI18n(),
    },
  });
}
```

**问题**：
- ❌ 传递了 `storage` 和 `scheduler`（基础设施层）
- ❌ 传递了 `plugin`（包含所有服务的引用）

### SRSBrowser.vue 状态
**文件**：`src/ui/browser/SRSBrowser.vue`

**当前 props**：
```typescript
const props = defineProps<{
  app?: App;
  i18n?: Record<string, string>;
  currentDocId?: string;
  mode?: 'dialog' | 'tab' | 'dock';
  plugin?: any;  // ❌ 包含所有服务
}>();
```

**plugin 的使用情况**：
1. `props.plugin.unifiedDataSourceManager` - 统一数据源管理器（多处使用）
2. `props.plugin.storage` - 存储管理器（用于 ConfigManager）
3. `props.plugin.hybridSyncService` - 同步服务
4. `props.plugin.finalDrillQueue` - 最终演练队列
5. `props.plugin` - 传递给各种工具函数和数据源

**使用统计**：
- `props.plugin` 出现约 30+ 次
- 主要用于：
  - 创建数据源（createQueueDataSource, createDeckDataSource 等）
  - 加载卡片（loadCards, loadQueueCards）
  - 配置管理（ConfigManager）
  - 队列操作（finalDrillQueue, unifiedDataSourceManager）
  - 同步服务（hybridSyncService）

## 🎯 迁移策略

### 策略 1：渐进式迁移（推荐）

由于 SRSBrowser.vue 是一个大型复杂组件，直接全部迁移风险较高。建议采用渐进式迁移：

#### 阶段 1：添加 browserService prop（向后兼容）
```typescript
const props = defineProps<{
  app?: App;
  i18n?: Record<string, string>;
  currentDocId?: string;
  mode?: 'dialog' | 'tab' | 'dock';
  plugin?: any;  // 保留，向后兼容
  browserService?: BrowserApplicationService;  // 新增
}>();
```

#### 阶段 2：优先使用 browserService
```typescript
// 优先使用 browserService，如果不存在则回退到 plugin
const getBrowserCards = async (query) => {
  if (props.browserService) {
    // ✅ 使用新的 DDD 架构
    return await props.browserService.getBrowserCards(query);
  } else {
    // ⚠️ 回退到旧的实现
    return await loadCards(...);
  }
};
```

#### 阶段 3：逐步移除 plugin 依赖
- 将所有数据加载逻辑迁移到 browserService
- 将配置管理逻辑迁移到应用服务
- 将队列操作逻辑迁移到应用服务

#### 阶段 4：完全移除 plugin prop
- 所有功能都通过 browserService 访问
- 移除 plugin prop
- 清理旧代码

### 策略 2：一次性迁移（不推荐）

直接移除 plugin prop，全部改为使用 browserService。

**风险**：
- 可能破坏现有功能
- 需要大量测试
- 回滚困难

## 📝 Phase 4 实施方案（渐进式）

### 4.1 修改 DialogManager ✅

**已完成**：
```typescript
openBrowserDialog(): void {
  // ✅ DDD 架构：只传递应用服务
  const browserService = this.context.getBrowserService();
  
  this.srsBrowserDialog = createVueDialog({
    props: {
      browserService,  // ✅ 新增
      i18n: this.context.getI18n(),
    },
  });
}
```

### 4.2 修改 SRSBrowser.vue props

**添加 browserService prop**：
```typescript
const props = defineProps<{
  app?: App;
  i18n?: Record<string, string>;
  currentDocId?: string;
  mode?: 'dialog' | 'tab' | 'dock';
  plugin?: any;  // 保留，向后兼容
  browserService?: BrowserApplicationService;  // 新增
}>();
```

### 4.3 创建数据加载适配器

**目标**：封装数据加载逻辑，优先使用 browserService

```typescript
// 在 SRSBrowser.vue 中
const loadCardsAdapter = async (
  preset: string,
  forceRefresh: boolean = false
) => {
  if (props.browserService) {
    // ✅ 使用新的 DDD 架构
    const result = await props.browserService.getBrowserCards({
      preset: preset as PresetFilter,
      searchText: searchQuery.value,
      sortBy: currentSortField.value,
      sortOrder: currentSortOrder.value,
      forceRefresh,
    });
    return result.cards;
  } else {
    // ⚠️ 回退到旧的实现
    return await loadCards(preset, undefined, searchQuery.value, forceRefresh, 'all', props.plugin);
  }
};
```

### 4.4 逐步迁移功能

**优先级排序**：
1. **高优先级**：核心数据加载（loadCards, loadQueueCards）
2. **中优先级**：过滤和排序
3. **低优先级**：配置管理、队列操作

## 🚧 当前限制

### BrowserApplicationService 当前功能
- ✅ `getBrowserCards()` - 获取浏览器卡片
- ✅ `getDueCount()` - 获取到期卡片数量
- ✅ `getStats()` - 获取统计信息

### SRSBrowser.vue 需要的功能
- ✅ 加载卡片列表
- ✅ 过滤卡片
- ✅ 排序卡片
- ✅ 分页
- ❌ 队列操作（需要扩展）
- ❌ 配置管理（需要扩展）
- ❌ 批量操作（需要扩展）

## 📊 工作量评估

| 任务 | 复杂度 | 预计时间 |
|------|--------|---------|
| 修改 DialogManager | 简单 | ✅ 已完成 |
| 添加 browserService prop | 简单 | 10 分钟 |
| 创建数据加载适配器 | 中等 | 30 分钟 |
| 迁移核心数据加载 | 中等 | 1 小时 |
| 测试和验证 | 中等 | 1 小时 |
| **总计** | | **约 2.5 小时** |

## 🎯 Phase 4 最小可行方案（MVP）

为了快速验证 DDD 架构，我们采用最小可行方案：

### MVP 范围
1. ✅ 修改 DialogManager（已完成）
2. ✅ 添加 browserService prop
3. ✅ 创建数据加载适配器
4. ✅ 迁移核心数据加载（loadCards）
5. ✅ 保留 plugin prop（向后兼容）
6. ✅ 测试基本功能

### MVP 不包含
- ❌ 完全移除 plugin prop
- ❌ 迁移所有功能
- ❌ 重构所有数据源

### MVP 验收标准
- [x] DialogManager 传递 browserService
- [ ] SRSBrowser.vue 接收 browserService
- [ ] 使用 browserService 加载卡片
- [ ] 基本功能正常（加载、过滤、排序）
- [ ] 向后兼容（plugin prop 仍然工作）

## 🔄 后续迁移计划

### Phase 4.1：核心功能迁移（当前）
- 数据加载
- 过滤和排序
- 基本统计

### Phase 4.2：扩展功能迁移（未来）
- 队列操作
- 配置管理
- 批量操作

### Phase 4.3：完全移除 plugin（未来）
- 移除 plugin prop
- 清理旧代码
- 完整测试

## 📝 实施建议

1. **先完成 MVP**：验证 DDD 架构可行性
2. **逐步迁移**：每次迁移一个功能模块
3. **保持向后兼容**：确保旧代码仍然工作
4. **充分测试**：每次迁移后都要测试
5. **文档更新**：及时更新文档

## ✅ 下一步行动

1. 添加 browserService prop 到 SRSBrowser.vue
2. 创建数据加载适配器函数
3. 迁移 loadCards 调用
4. 测试基本功能
5. 创建 Phase 4 完成总结
