# Xiuyuan 架构改进方案

## 当前问题

### 1. DDD 架构不一致

**问题：**
- `XiuyuanService`（旧架构）直接调用 `setBlockAttrs()` 操作块属性
- `listTemplate.ts` 辅助函数直接操作块属性
- 违反了 DDD 原则：应用服务不应该直接操作基础设施

**影响：**
- 块属性操作逻辑分散在多个地方
- 难以维护和测试
- 不符合 DDD 分层架构

### 2. Xiuyuan ID 命名规则不清晰

**问题：**
- 用户手动创建：`xy_{timestamp}_{random}`
- Riff 同步创建：`xy_riff_{blockId}`
- 缺少文档说明

**影响：**
- 开发者不清楚为什么有两种格式
- 可能导致误解和错误使用

## 改进方案

### 方案 1：完全迁移到新架构（推荐）

#### 1.1 废弃 `XiuyuanService`

```typescript
// ❌ 旧方式（已废弃）
const service = new XiuyuanService(storage, storageManager);
await service.createFromBlocks(blockIds, templateId, fieldMapping);

// ✅ 新方式（推荐）
const appService = context.getXiuyuanApplicationService();
await appService.createFromBlocks({
  blockIds,
  templateId,
  fieldMapping,
  deckId
});
```

#### 1.2 重构 `listTemplate.ts`

将 `createListTemplateCards` 迁移到 `XiuyuanApplicationService`：

```typescript
// src/application/services/XiuyuanApplicationService.ts

/**
 * 创建列表模板卡片
 * 
 * @param params 创建参数
 * @returns Result<{ xiuyuan: Xiuyuan; cards: Card[] }>
 */
async createListTemplateCards(params: {
  parentBlockId: string;
  childBlockIds: string[];
  templateId: string;
}): Promise<Result<{ xiuyuan: Xiuyuan; cards: Card[] }>> {
  // 1. 构建 Xiuyuan 领域实体
  // 2. 通过 Repository 保存（自动处理块属性）
  // 3. 返回结果
}
```

#### 1.3 统一块属性操作

所有块属性操作都通过 `XiuyuanRepository.save()` 完成：

```typescript
// XiuyuanRepository.save() 已经正确实现
async save(xiuyuan: Xiuyuan): Promise<Result<void>> {
  // ... 保存逻辑 ...
  
  // 5. 写入块属性（使用第一个块作为代表块）
  const blockIDs = xiuyuan.getBlockIDs();
  if (blockIDs.length > 0) {
    const representativeBlockId = blockIDs[0].getValue();
    try {
      await setBlockAttrs(representativeBlockId, {
        'custom-xiuyuan-id': xiuyuan.getId().getValue(),
        'custom-xiuyuan-template': xiuyuan.getTemplateID().getValue(),
      });
    } catch (error) {
      // 错误处理...
    }
  }
}
```

### 方案 2：保持现状，添加文档（临时方案）

如果暂时无法完全迁移，至少要：

#### 2.1 添加 Xiuyuan ID 命名规范文档

```typescript
/**
 * Xiuyuan ID 命名规范
 * 
 * @description
 * Xiuyuan ID 用于唯一标识一个 Xiuyuan 实体，不同来源使用不同的命名规则：
 * 
 * **1. 用户手动创建（通过模板）**
 * - 格式：`xy_{timestamp}_{random}`
 * - 示例：`xy_1234567890_abc123`
 * - 生成位置：`XiuyuanStorage.generateID()`
 * - 特点：时间戳 + 随机字符串，保证全局唯一
 * 
 * **2. Riff 同步创建**
 * - 格式：`xy_riff_{blockId}`
 * - 示例：`xy_riff_20230101120000-abc123`
 * - 生成位置：`XiuyuanSyncService.convertRiffCardToFSRSCard()`
 * - 特点：使用块 ID 作为后缀，保证幂等性（同一个块多次同步生成相同 ID）
 * 
 * **设计目的：**
 * - 可追溯性：通过 ID 前缀可以知道 Xiuyuan 的来源
 * - 幂等性：Riff 同步使用块 ID，避免重复创建
 * - 防止冲突：两种格式不会产生 ID 冲突
 * 
 * @see XiuyuanStorage.generateID() - 用户手动创建的 ID 生成
 * @see XiuyuanSyncService.convertRiffCardToFSRSCard() - Riff 同步的 ID 生成
 */
```

#### 2.2 在代码中添加注释

```typescript
// XiuyuanSyncService.ts
private async convertRiffCardToFSRSCard(riffBlock: RiffBlock): Promise<{
    xiuyuanEntity: Xiuyuan;
}> {
    const riffCard = riffBlock.riffCard;
    const now = Date.now();
    
    // 1. 生成 Xiuyuan ID（使用 blockId 作为唯一标识）
    // 格式：xy_riff_{blockId}
    // 目的：
    // - 幂等性：同一个块多次同步生成相同 ID
    // - 可追溯性：通过前缀 "riff" 可以识别来源
    // - 防止冲突：与手动创建的 ID（xy_{timestamp}_{random}）不冲突
    const xiuyuanIdStr = `xy_riff_${riffBlock.id}`;
    
    // ...
}
```

## 实施计划

### Phase 1：文档和注释（✅ 已完成）
- [x] 添加 Xiuyuan ID 命名规范文档
- [x] 在关键代码位置添加注释
- [x] 更新架构改进方案文档

### Phase 2：重构 listTemplate.ts（✅ 已完成）
- [x] 创建 `CreateListTemplateCardsCommand`
- [x] 在 `XiuyuanApplicationService` 中添加 `createListTemplateCards` 方法
- [x] 在 `ApplicationContext` 中添加 `getXiuyuanApplicationService()` 方法
- [x] 标记 `listTemplate.ts` 为 `@deprecated`

### Phase 3：迁移调用方（✅ 已完成）
- [x] `src/application/managers/BlockMenuHandler.ts` - 已迁移到 `XiuyuanApplicationService`
- [x] `src/core/box/TransactionObserver.ts` - 使用不同逻辑（为每个子项创建单独 Xiuyuan），无需迁移
- [x] `src/application/handlers/AutoCardHandler.ts` - 使用 `createFromBlocks`，无需迁移

**说明**：
- `TransactionObserver` 和 `AutoCardHandler` 使用的是不同的创建逻辑，不是调用 `createListTemplateCards` 函数
- 只有 `BlockMenuHandler` 真正使用了 `createListTemplateCards` 函数，已成功迁移

### Phase 4：完全废弃 XiuyuanService（✅ 完全完成）

#### 4.1 XiuyuanSyncService DDD 重构 ✅
- [x] 移除 `UnifiedStorageManager` 依赖（完全移除）
- [x] 移除 `CardApplicationService` 依赖（完全移除）
- [x] 移除直接的块属性操作
- [x] 统一使用 `XiuyuanRepository` 进行数据访问

#### 4.2 Xiuyuan 聚合根更新方法 ✅
- [x] 添加 `updateCardTypeMarker()` 方法
- [x] 添加 `updateCardType()` 方法
- [x] 添加 `updateAFactor()` 方法
- [x] `updatePriority()` 方法已存在

#### 4.3 XiuyuanSyncService 更新逻辑 ✅
- [x] 恢复 `incrementalSync()` 的更新逻辑
- [x] 使用聚合根的更新方法
- [x] 通过 Repository 保存更新
- [x] 完整的错误处理和日志记录

#### 4.4 重构黑名单和卡片类型检测 ✅
- [x] 创建 `RiffBlacklistService`
- [x] 创建 `CardTypeDetectionService`
- [x] 完全移除 `unifiedStorage` 依赖
- [x] 更新所有黑名单相关代码
- [x] 更新所有卡片类型检测代码

#### 4.5 迁移 XiuyuanService 使用 ✅
- [x] 迁移 TransactionObserver 中的调用
- [x] 迁移 DialogManager 中的调用
- [x] 迁移 AutoCardHandler 中的调用
- [x] 在 XiuyuanApplicationService 中添加 `createTemplate()` 方法
- [x] 移除 `xiuyuanService` getter

#### 4.6 创建专门的 UseCase 类 ✅
- [x] 创建 `CreateXiuyuanFromBlocksUseCase`
- [x] 创建 `DeleteXiuyuanUseCase`
- [x] 创建 `GetXiuyuanQueryHandler`
- [x] 创建 `GetAllXiuyuansQueryHandler`
- [x] 创建 `CreateListTemplateCardsUseCase`
- [x] 创建 `CreateTemplateUseCase`
- [x] 更新 `XiuyuanApplicationService` 使用 UseCase
- [x] 将 XiuyuanApplicationService 改为纯粹的协调器

## 总结

**当前状态：**
- ✅ `XiuyuanRepository` 符合 DDD 架构
- ✅ 块属性命名已统一（`custom-xiuyuan-id`）
- ✅ 防止重复创建 Xiuyuan（通过块属性检查）
- ✅ `XiuyuanSyncService` 完全符合 DDD 架构
- ✅ 完全移除了 `CardApplicationService` 依赖
- ✅ 完全移除了 `UnifiedStorageManager` 依赖
- ✅ 所有数据访问通过 `XiuyuanRepository`
- ✅ Xiuyuan 聚合根包含完整的更新方法
- ✅ 黑名单功能已重构到 `RiffBlacklistService`
- ✅ 卡片类型检测已重构到 `CardTypeDetectionService`
- ✅ 所有 `XiuyuanService` 的直接使用已迁移到 `XiuyuanApplicationService`
- ✅ `xiuyuanService` getter 已移除
- ✅ `XiuyuanService` 已标记为 `@deprecated`（作为 XiuyuanApplicationService 的内部依赖保留）
- ✅ 已创建专门的 UseCase 类
- ✅ XiuyuanApplicationService 已改为纯粹的协调器

**推荐做法：**
1. ✅ 已完成文档和注释（Phase 1）
2. ✅ 已完成迁移到新架构（Phase 2-3）
3. ✅ 已完成 XiuyuanSyncService 完全 DDD 化（Phase 4.1-4.4）
4. ✅ 已完成 XiuyuanService 使用迁移（Phase 4.5）
5. ✅ 已完成创建专门的 UseCase 类（Phase 4.6）
6. 新功能只使用 `XiuyuanApplicationService`

**Phase 4 完成报告：**
- Phase 4.1-4.3: `.kiro/specs/bugfix/phase4-sync-service-ddd-complete-final.md`
- Phase 4.4: `.kiro/specs/bugfix/phase4-complete-all.md`
- Phase 4.5: `.kiro/specs/bugfix/phase4-5-xiuyuan-service-migration.md`
- Phase 4.6: 创建专门的 UseCase 类（本次完成）
- Phase 4 总结: `.kiro/specs/bugfix/PHASE4-SUMMARY.md`

**架构改进效果：**
- ✅ 完全符合 DDD 分层架构
- ✅ 依赖关系清晰简单
- ✅ 代码质量显著提升
- ✅ 更容易测试和维护
- ✅ 更好的封装和职责划分
- ✅ 所有应用层代码通过应用服务访问领域层
- ✅ 应用服务作为纯粹的协调器，委托给专门的 UseCase
- ✅ 符合单一职责原则和开闭原则

**🎉 Phase 4 完全完成！所有架构改进任务已全部完成！**
