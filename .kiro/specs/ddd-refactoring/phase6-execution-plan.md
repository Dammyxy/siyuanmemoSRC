# Phase 6: 清理废弃代码 - 执行计划

**创建时间**: 2026-02-19
**预计完成**: 2-3 天

## 目标

移除所有标记为 @deprecated 的代码，确保代码库干净整洁。

## 审计结果

### 可以移除的废弃代码

#### 1. 废弃的 Adapter 类 ✅ 可移除
**文件**:
- `src/ui/review/v2/adapters/FinalDrillAdapter.ts`
- `src/ui/review/v2/adapters/RetrievalPracticeAdapter.ts`
- `src/ui/review/v2/adapters/LeechAdapter.ts`

**原因**: 已被 `UnifiedReviewAdapter` 替代

**影响**: 需要确认无调用方

#### 2. 废弃的 Provider 类 ✅ 可移除
**文件**:
- `src/ui/review/v2/providers/FinalDrillProvider.ts`
- `src/ui/review/v2/providers/IncrementalLearningProvider.ts`
- `src/ui/review/v2/providers/RetrievalPracticeProvider.ts`

**原因**: 已被直接使用 Queue 替代

**影响**: 需要确认无调用方

#### 3. 废弃的服务方法 ✅ 可移除
**文件**: `src/application/managers/MenuManager.ts`

**方法**: `getDueCount()`

**原因**: 应该使用 `CardApplicationService.getDueCount()`

**影响**: 需要确认无调用方

#### 4. 废弃的同步方法 ✅ 可移除
**文件**: `src/application/managers/ReviewSyncManager.ts`

**方法**: `onCardReviewed()`

**原因**: 已被观察者模式替代

**影响**: 需要确认无调用方

### 需要保留的废弃代码（向后兼容）

#### 1. 插件实例的 getter 方法 ⚠️ 保留
**文件**: `src/index.ts`

**代码**:
```typescript
/** @deprecated 使用 context.getStorage() 代替 */
public get storage() { return this.context.getStorage(); }
// ... 其他 getter
```

**原因**: 
- 向后兼容性
- 外部代码可能依赖这些 getter
- 计划在 v2.0 移除

**建议**: 保留但添加更明确的废弃警告

#### 2. 类型别名 ⚠️ 保留
**文件**: 
- `src/application/services/XiuyuanSyncService.ts`
- `src/application/queries/DataAccessFacade.ts`

**代码**:
```typescript
/** @deprecated 使用 XiuyuanSyncService 代替 */
export type HybridSyncService = XiuyuanSyncService;
```

**原因**: 
- 向后兼容性
- 外部代码可能使用旧名称
- 类型别名不占用运行时空间

**建议**: 保留

#### 3. 一次性迁移工具 ⚠️ 保留（短期）
**文件**:
- `src/application/services/MigrationService.ts`
- `src/application/services/MigrateQueueDataService.ts`
- `src/application/services/RiffCleanupService.ts`

**原因**: 
- 用户可能还需要迁移数据
- 可以在下一个版本中移除

**建议**: 保留但添加移除计划

#### 4. CardService ⚠️ 保留（短期）
**文件**: `src/services/CardService.ts`

**原因**: 
- 可能有外部依赖
- 需要逐步迁移

**建议**: 保留但添加迁移指南

#### 5. 设置字段 ⚠️ 保留
**文件**: `src/types/settings.ts`

**字段**: `schedulerEngine`

**原因**: 
- 向后兼容性
- 用户配置可能包含此字段

**建议**: 保留

#### 6. QueueHelpers ⚠️ 保留（短期）
**文件**: `src/application/helpers/QueueHelpers.ts`

**原因**: 
- 需要重构到合适的位置
- 可能有多处调用

**建议**: 保留但计划重构

#### 7. ts-fsrs 库的废弃字段 ⚠️ 保留
**文件**: `ts-fsrs/packages/fsrs/src/models.ts`

**原因**: 
- 第三方库的废弃标记
- 不应该修改第三方库代码

**建议**: 保留

## 执行步骤

### Step 1: 确认废弃 Adapter 无调用方

**命令**:
```bash
grep -r "FinalDrillAdapter" src/
grep -r "RetrievalPracticeAdapter" src/
grep -r "LeechAdapter" src/
```

**预期结果**: 只在定义文件中找到

### Step 2: 确认废弃 Provider 无调用方

**命令**:
```bash
grep -r "FinalDrillProvider" src/
grep -r "IncrementalLearningProvider" src/
grep -r "RetrievalPracticeProvider" src/
```

**预期结果**: 只在定义文件中找到

### Step 3: 确认 MenuManager.getDueCount 无调用方

**命令**:
```bash
grep -r "menuManager\.getDueCount" src/
```

**预期结果**: 无调用方

### Step 4: 确认 ReviewSyncManager.onCardReviewed 无调用方

**命令**:
```bash
grep -r "reviewSyncManager\.onCardReviewed" src/
grep -r "\.onCardReviewed\(\)" src/
```

**预期结果**: 无调用方

### Step 5: 移除确认无调用方的代码

如果上述检查都通过，则可以安全移除：
1. 删除废弃的 Adapter 文件
2. 删除废弃的 Provider 文件
3. 删除 MenuManager.getDueCount 方法
4. 删除 ReviewSyncManager.onCardReviewed 方法

### Step 6: 更新导出

检查并更新相关的 index.ts 文件，移除对已删除文件的导出。

### Step 7: 编译测试

```bash
npm run build
```

确保编译无错误。

### Step 8: 更新文档

更新相关文档，移除对废弃代码的引用。

## 保留代码的改进

### 1. 改进插件实例的废弃警告

**文件**: `src/index.ts`

**修改**:
```typescript
// 修改前
/** @deprecated 使用 context.getStorage() 代替 */
public get storage() { return this.context.getStorage(); }

// 修改后
/**
 * @deprecated 使用 context.getStorage() 代替
 * 
 * 此 getter 将在 v2.0 中移除。
 * 
 * 迁移指南：
 * ```typescript
 * // 旧代码
 * const storage = plugin.storage;
 * 
 * // 新代码
 * const storage = plugin.context.getStorage();
 * ```
 */
public get storage() { 
  console.warn('[SiYuanMemo] plugin.storage is deprecated, use context.getStorage() instead');
  return this.context.getStorage(); 
}
```

### 2. 添加迁移工具的移除计划

**文件**: `src/application/services/MigrationService.ts`

**修改**:
```typescript
/**
 * MigrationService - Xiuyuan 卡片迁移服务
 * 
 * @deprecated 此服务为一次性迁移工具，计划在 v1.5.0 中移除
 * 
 * 如果您还需要迁移数据，请在升级到 v1.5.0 之前完成迁移。
 * 
 * 负责将现有的 Xiuyuan 卡片迁移到新的 Riff 同步机制。
 */
```

## 风险评估

### 高风险
- **移除插件实例的 getter** - 可能破坏外部代码
  - 缓解措施：保留到 v2.0

### 中风险
- **移除 Adapter 和 Provider** - 可能有未发现的调用方
  - 缓解措施：彻底搜索调用方

### 低风险
- **移除私有方法** - 只在类内部使用
  - 缓解措施：编译测试

## 成功标准

- ✅ 移除所有确认无调用方的废弃代码
- ✅ 保留需要向后兼容的废弃代码
- ✅ 改进废弃警告信息
- ✅ 编译无错误
- ✅ 文档更新完整

## 下一步

完成 Phase 6 后，进入 Phase 7: 添加单元测试

---

**状态**: 🚀 准备开始
**优先级**: 中
**预计工作量**: 2-3 天
