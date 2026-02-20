# 废弃 StorageManager 并迁移到 DDD 架构

## 问题描述

当前代码中存在两套存储系统：

1. **旧架构**：`StorageManager` (src/core/storage/manager.ts)
   - 直接操作数据
   - 缺少业务逻辑封装
   - 不符合 DDD 原则

2. **新架构**：`UnifiedStorageManager` + Repository 模式
   - 符合 DDD 分层架构
   - 使用仓储模式
   - 通过应用服务访问

## 当前问题

浏览器中的推迟功能失败，错误信息：
```
TypeError: this.storage.batchUpdateCards is not a function
```

根本原因：`RescheduleService` 依赖旧的 `StorageManager`，调用了不存在的 `batchUpdateCards` 方法。

## 迁移策略

### 直接重构方案（推荐）

不创建适配器，直接重构 `RescheduleService` 使用新的 DDD 架构。

### 阶段 1：标记废弃 ✅

1. ✅ 在 `StorageManager` 类上添加 `@deprecated` 标记
2. 在所有使用 `StorageManager` 的地方添加注释说明

### 阶段 2：识别依赖

查找所有使用 `StorageManager` 的地方：
- ✅ `RescheduleService` 构造函数
- `ApplicationContext` 初始化
- `MenuActions` 回退逻辑
- 其他服务和组件

### 阶段 3：重构 RescheduleService

直接依赖新架构：

```typescript
export class RescheduleService {
  constructor(
    private unifiedStorage: UnifiedStorageManager,
    private cardApplicationService: CardApplicationService
  ) {
    this.postponeEngine = new PostponeEngine(unifiedStorage, cardApplicationService);
    this.advanceEngine = new AdvanceEngine(unifiedStorage, cardApplicationService);
    this.spreadEngine = new SpreadEngine(unifiedStorage, cardApplicationService);
    this.configManager = new ConfigManager(unifiedStorage);
  }
  
  private async performBatchUpdate(...) {
    // 1. 解析 cardId
    const resolvedMap = await this.resolveCardIdsByBlockIds(missingBlockIds);
    
    // 2. 准备更新数据
    const cardsToUpdate = [];
    for (const row of rows) {
      const cards = this.unifiedStorage.getCardsByBlockId(row.blockId);
      for (const card of cards) {
        cardsToUpdate.push({
          ...card,
          due: newDue
        });
      }
    }
    
    // 3. 批量更新
    await this.cardApplicationService.batchUpdateCardsWithoutEvents(cardsToUpdate);
  }
}
```

### 阶段 4：更新 Engine 类

同样重构 `PostponeEngine`、`AdvanceEngine`、`SpreadEngine`：

```typescript
export class PostponeEngine {
  constructor(
    private unifiedStorage: UnifiedStorageManager,
    private cardApplicationService: CardApplicationService
  ) {}
  
  async execute(...) {
    // 使用 unifiedStorage 查询
    // 使用 cardApplicationService 更新
  }
}
```

### 阶段 5：更新 ApplicationContext

修改 `ApplicationContext` 中的服务初始化：

```typescript
// 之前
const rescheduleService = new RescheduleService(storageManager);

// 之后
const rescheduleService = new RescheduleService(
  unifiedStorage,
  cardApplicationService
);
```

### 阶段 6：清理旧代码

1. 移除所有 `StorageManager` 的使用
2. 删除 `StorageManager` 类（保留一段时间用于数据迁移）
3. 更新测试

## 实施计划

### 立即执行

1. ✅ 标记 `StorageManager` 为废弃
2. 🔄 重构 `RescheduleService` 构造函数
3. 🔄 重构 `performBatchUpdate` 方法
4. 🔄 重构 Engine 类
5. 🔄 更新 `ApplicationContext`
6. 🔄 测试推迟功能

## 风险评估

### 高风险区域

1. **RescheduleService**
   - 被多处使用（浏览器、菜单、快捷键）
   - 需要仔细测试所有调度功能

2. **ApplicationContext**
   - 核心初始化逻辑
   - 影响整个应用启动

3. **向后兼容性**
   - 需要保证现有功能不受影响
   - 可能需要保留一些兼容代码

### 缓解措施

1. 分阶段实施，先用适配器快速修复
2. 每个阶段都进行充分测试
3. 保留回滚能力
4. 详细的日志记录

## 测试计划

### 功能测试

1. ✅ 浏览器推迟功能
2. ✅ 浏览器提前功能
3. ✅ 浏览器分散功能
4. ✅ 批量重新调度
5. ✅ 卡片创建和删除

### 性能测试

1. 批量操作性能
2. 内存使用
3. 启动时间

## 下一步行动

1. 实施快速修复（适配器方案）
2. 验证推迟功能正常工作
3. 规划完整迁移的详细步骤
