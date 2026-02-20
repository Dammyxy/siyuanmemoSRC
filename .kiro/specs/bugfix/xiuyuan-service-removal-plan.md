# XiuyuanService 移除计划

## 当前状态

### ✅ 已完成的重构 (8/8 UseCases)

所有 UseCase 都已重构完成,不再依赖 `XiuyuanService`:

1. **CreateXiuyuanFromBlocksUseCase** ✅
   - 直接使用 `IXiuyuanRepository`
   - 包含完整的业务逻辑

2. **DeleteXiuyuanUseCase** ✅
   - 直接使用 `IXiuyuanRepository.findById()` 和 `delete()`

3. **GetXiuyuanQueryHandler** ✅
   - 直接使用 `IXiuyuanRepository.findById()`

4. **GetAllXiuyuansQueryHandler** ✅
   - 直接使用 `IXiuyuanRepository.findAll()`

5. **GetTemplateQueryHandler** ✅
   - 直接使用 `templateRegistry.get()`

6. **GetAllTemplatesQueryHandler** ✅
   - 直接使用 `templateRegistry.values()`

7. **CreateTemplateUseCase** ✅
   - 直接使用 `templateRegistry.set()`
   - 包含验证逻辑

8. **CreateListTemplateCardsUseCase** ✅
   - 完全重构,不再依赖旧的 `listTemplate.ts`
   - 直接使用 `IXiuyuanRepository`
   - 包含列表模板的完整业务逻辑

### ✅ XiuyuanApplicationService 已完全独立

- 构造函数参数: `(xiuyuanRepository, templateRegistry)`
- 不再依赖 `XiuyuanService`
- 所有 UseCase 都使用正确的依赖注入

## 剩余的 XiuyuanService 使用

### 1. ApplicationContext.ts

**位置**: `src/application/ApplicationContext.ts:743-747`

**用途**: 初始化内置模板

```typescript
const { BUILTIN_TEMPLATES } = await import('@/core/xiuyuan');
for (const template of BUILTIN_TEMPLATES) {
  const existing = xiuyuanService.getTemplate(template.id);
  if (!existing) {
    xiuyuanService.createTemplate(template);
  }
}
```

**迁移方案**:
- 直接操作 `XiuyuanStorage` 的模板注册表
- 或者使用 `TemplateRegistry` 类

### 2. DialogManager.ts

**位置**: `src/application/managers/DialogManager.ts:942-963`

**用途**: 创建模板卡片对话框

```typescript
const template = xiuyuanService.getTemplate(templateId);
// ...
const result = await xiuyuanService.createFromBlocks(
  blockIds,
  templateId,
  fieldMapping,
  deckId
);
```

**迁移方案**:
- 使用 `XiuyuanApplicationService.getTemplate()`
- 使用 `XiuyuanApplicationService.createFromBlocks()`

### 3. AutoCardHandler.ts

**位置**: `src/application/handlers/AutoCardHandler.ts:1406-1408`

**用途**: 动态创建模板

```typescript
if (xiuyuanService) {
    xiuyuanService.createTemplate(tempTemplate);
}
```

**迁移方案**:
- 使用 `XiuyuanApplicationService.createTemplate()`

### 4. BlockMenuHandler.ts

**位置**: `src/application/managers/BlockMenuHandler.ts:27`

**用途**: 仅类型定义,未实际使用

```typescript
xiuyuanService: XiuyuanService;
```

**迁移方案**:
- 直接删除此字段

## 迁移步骤

### Step 1: 更新 ApplicationContext 初始化

```typescript
// 旧代码
const xiuyuanService = new XiuyuanService(xiuyuanStorageTemp, storageManager);
const { BUILTIN_TEMPLATES } = await import('@/core/xiuyuan');
for (const template of BUILTIN_TEMPLATES) {
  const existing = xiuyuanService.getTemplate(template.id);
  if (!existing) {
    xiuyuanService.createTemplate(template);
  }
}

// 新代码
const xiuyuanStorage = new XiuyuanStorage(config.plugin as any);
await xiuyuanStorage.load();

// 初始化内置模板
const { BUILTIN_TEMPLATES } = await import('@/core/xiuyuan');
for (const template of BUILTIN_TEMPLATES) {
  const existing = xiuyuanStorage.getTemplate(template.id);
  if (!existing) {
    xiuyuanStorage.createTemplate(template);
  }
}
await xiuyuanStorage.save();
```

### Step 2: 更新 DialogManager

```typescript
// 旧代码
const template = xiuyuanService.getTemplate(templateId);
const result = await xiuyuanService.createFromBlocks(...);

// 新代码
const xiuyuanAppService = context.getXiuyuanApplicationService();
const template = await xiuyuanAppService.getTemplate(templateId);
const result = await xiuyuanAppService.createFromBlocks({
  blockIds,
  templateId,
  fieldMapping,
  deckId
});
```

### Step 3: 更新 AutoCardHandler

```typescript
// 旧代码
if (xiuyuanService) {
    xiuyuanService.createTemplate(tempTemplate);
}

// 新代码
const xiuyuanAppService = context.getXiuyuanApplicationService();
await xiuyuanAppService.createTemplate(tempTemplate);
```

### Step 4: 更新 BlockMenuHandler

```typescript
// 删除未使用的字段
export interface BlockMenuHandlerDeps {
  // ... 其他字段
  // xiuyuanService: XiuyuanService;  // ❌ 删除
}
```

### Step 5: 删除 XiuyuanService

完成上述迁移后:

1. 删除 `src/core/xiuyuan/service.ts`
2. 从 `src/core/xiuyuan/index.ts` 中移除 `XiuyuanService` 导出
3. 删除 `ApplicationContext` 中的 `xiuyuanService` 字段
4. 删除 `getXiuyuanService()` 方法

## 预期收益

### 架构改进

✅ **完全符合 DDD 原则**:
- 应用层通过 Repository 访问领域层
- 没有中间的 Service 包装层
- 清晰的依赖方向

✅ **代码简化**:
- 减少一层抽象
- 更直接的数据访问
- 更容易理解和维护

✅ **可测试性**:
- UseCase 可以独立测试
- 依赖更少,mock 更简单

### 性能改进

- 减少函数调用层级
- 更直接的数据访问路径

## 风险评估

### 低风险

- 所有 UseCase 已经重构完成
- 编译通过,类型检查正确
- 剩余使用点很少且集中

### 测试建议

1. 运行现有测试套件
2. 手动测试模板创建功能
3. 手动测试卡片创建对话框
4. 验证内置模板初始化

## 时间估算

- Step 1-4: 30 分钟
- Step 5: 10 分钟
- 测试: 20 分钟
- **总计**: 约 1 小时
