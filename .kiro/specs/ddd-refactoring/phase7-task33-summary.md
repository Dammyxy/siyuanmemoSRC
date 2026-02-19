# Phase 7 - Task 33 完成总结

## 任务概述

**任务 33**: 标记旧 XiuyuanService 为 @deprecated

**目标**: 在 XiuyuanService 的类和主要方法上添加 @deprecated 注释，提供清晰的迁移指南。

## 完成的工作

### 1. 标记 XiuyuanService 类为废弃

**文件**: `src/core/xiuyuan/service.ts`

**修改内容**:
- 在类文档注释顶部添加 @deprecated 标记
- 添加 @see 链接指向 XiuyuanApplicationService
- 提供迁移指南和示例代码

```typescript
/**
 * Xiuyuan Service
 * 
 * @deprecated 请使用 XiuyuanApplicationService 代替
 * @see {@link XiuyuanApplicationService} - 新的应用服务层入口
 * 
 * **迁移指南**：
 * - 旧代码：`xiuyuanService.createFromBlocks(blockIds, templateId, fieldMapping, deckId)`
 * - 新代码：`xiuyuanApplicationService.createFromBlocks({ blockIds, templateId, fieldMapping, deckId })`
 * 
 * @example
 * ```typescript
 * // ❌ 旧方式（已废弃）
 * const service = new XiuyuanService(storage, storageManager);
 * const result = await service.createFromBlocks(...);
 * 
 * // ✅ 新方式（推荐）
 * const appService = context.getXiuyuanApplicationService();
 * const result = await appService.createFromBlocks({ ... });
 * ```
 */
export class XiuyuanService {
  // ...
}
```

### 2. 标记 createFromBlocks() 方法为废弃

**修改内容**:
- 添加 @deprecated 标记
- 添加 @see 链接
- 提供详细的迁移指南
- 对比旧方式和新方式的代码示例

```typescript
/**
 * 从选中的块创建 Xiuyuan 和卡片
 * 
 * @deprecated 请使用 XiuyuanApplicationService.createFromBlocks() 代替
 * @see {@link XiuyuanApplicationService.createFromBlocks}
 * 
 * @description
 * **迁移指南**：
 * ```typescript
 * // ❌ 旧方式（已废弃）
 * await xiuyuanService.createFromBlocks(
 *   ['block-1', 'block-2'],
 *   'basic',
 *   { question: 'block-1', answer: 'block-2' },
 *   deckId
 * );
 * 
 * // ✅ 新方式（推荐）
 * await xiuyuanApplicationService.createFromBlocks({
 *   blockIds: ['block-1', 'block-2'],
 *   templateId: 'basic',
 *   fieldMapping: { question: 'block-1', answer: 'block-2' },
 *   deckId: deckId
 * });
 * ```
 */
async createFromBlocks(...) { ... }
```

### 3. 标记 deleteXiuyuan() 方法为废弃

**修改内容**:
- 添加 @deprecated 标记
- 添加 @see 链接
- 提供迁移指南

```typescript
/**
 * 删除 Xiuyuan 及其所有关联卡片
 * 
 * @deprecated 请使用 XiuyuanApplicationService.deleteXiuyuan() 代替
 * @see {@link XiuyuanApplicationService.deleteXiuyuan}
 * 
 * @description
 * **迁移指南**：
 * ```typescript
 * // ❌ 旧方式（已废弃）
 * await xiuyuanService.deleteXiuyuan('xy_123');
 * 
 * // ✅ 新方式（推荐）
 * await xiuyuanApplicationService.deleteXiuyuan('xy_123');
 * ```
 */
async deleteXiuyuan(id: string): Promise<Result<boolean>> { ... }
```

## 废弃标记的好处

### 1. IDE 支持

现代 IDE（如 VS Code）会：
- 在使用废弃 API 时显示删除线
- 显示警告提示
- 提供快速修复建议
- 显示迁移指南

### 2. 渐进式迁移

- 旧代码仍然可以工作
- 开发者可以按自己的节奏迁移
- 降低破坏性变更的风险

### 3. 清晰的迁移路径

- @see 链接指向新 API
- 示例代码展示如何迁移
- 对比旧方式和新方式

## 未标记废弃的方法

以下方法暂时保留，因为它们仍在使用且没有对应的应用服务方法：

1. **查询方法**（仍在使用）:
   - `getXiuyuan(id)` - 获取单个 Xiuyuan
   - `getAllXiuyuans()` - 获取所有 Xiuyuan
   - `getTemplate(id)` - 获取模板
   - `getAllTemplates()` - 获取所有模板
   - `getMappingsByXiuyuanID(id)` - 获取映射关系

2. **内部方法**:
   - `selectRepresentativeBlock()` - 选择代表块
   - `buildFieldMappingFromXiuyuan()` - 构建字段映射

**未来计划**:
- 在 XiuyuanApplicationService 中实现这些查询方法
- 然后标记 XiuyuanService 中的对应方法为废弃

## 编译结果

✅ 编译成功
- 无类型错误
- 无导入错误
- 构建产物正常生成

```
dist/index.css     73.59 kB │ gzip:  10.42 kB
dist/index.js   1,951.10 kB │ gzip: 542.05 kB
✓ built in 10.70s
```

## 下一步计划

### Phase 7 剩余任务

1. **Task 34**: 创建独立的 UseCase 类（可选）
   - `CreateXiuyuanFromBlocksUseCase`
   - `GetXiuyuanQueryHandler`
   - `DeleteXiuyuanUseCase`
   - 这是可选任务，可以推迟到后续 Phase

### Phase 8 计划

完成 Phase 5 和 Phase 6 的剩余任务：
- 重构 `DataAccessFacade` 使用 `CardApplicationService`
- 创建 `UpdateFSRSCardCommand` 和 `DeleteFSRSCardCommand`
- 写单元测试

## 最佳实践

### 如何标记 API 为废弃

1. **添加 @deprecated 标记**:
   ```typescript
   /**
    * @deprecated 请使用 NewAPI 代替
    * @see {@link NewAPI}
    */
   ```

2. **提供迁移指南**:
   - 说明为什么废弃
   - 提供替代方案
   - 展示迁移示例

3. **保持向后兼容**:
   - 不要立即删除旧 API
   - 给开发者时间迁移
   - 在下一个主版本中删除

4. **使用 @see 链接**:
   - 指向新 API 的文档
   - 方便开发者查找

## 总结

Task 33 成功完成：
- ✅ 标记 XiuyuanService 类为废弃
- ✅ 标记 createFromBlocks() 方法为废弃
- ✅ 标记 deleteXiuyuan() 方法为废弃
- ✅ 提供清晰的迁移指南
- ✅ 编译成功

开发者现在可以看到废弃警告，并按照迁移指南逐步迁移到新的 XiuyuanApplicationService。
