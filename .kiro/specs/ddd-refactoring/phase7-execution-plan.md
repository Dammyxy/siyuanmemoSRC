# Phase 7: 添加单元测试 - 执行计划

**创建时间**: 2026-02-19
**预计时间**: 5-7 天（本次执行关键组件测试）
**当前 DDD 符合度**: 94%

## 执行策略

由于 Phase 7 需要 5-7 天时间,我们采用分阶段策略:

### 本次执行范围（优先级 P0）
1. 修复现有测试文件中引用已删除类的问题
2. 为 Phase 3-6 新增的核心组件添加测试
3. 确保关键路径有测试覆盖

### 后续执行（v1.5.0）
- 逐步提高测试覆盖率到 80%+
- 添加集成测试
- 添加 E2E 测试

## 任务清单

### Task 7.1: 修复现有测试文件 ✅ 待执行

**问题**: 多个测试文件引用了已删除的类

**影响的文件**:
1. `src/__tests__/review-interface.integration.test.ts` - 引用 `RetrievalPracticeProvider`
2. `src/__tests__/phase3-review-interface.test.ts` - 引用 `RetrievalPracticeProvider`
3. `src/ui/review/v2/providers/__tests__/RetrievalPracticeProvider.test.ts` - 引用 `RetrievalPracticeProvider`
4. `src/ui/review/__tests__/e2e.review-ui.test.ts` - 引用 `RetrievalPracticeAdapter`, `FinalDrillAdapter`
5. `src/diagnostics/__tests__/queue-architecture.integration.test.ts` - mock 已删除的类

**解决方案**:
- 选项 A: 删除这些测试文件（如果功能已被新架构覆盖）
- 选项 B: 更新测试文件使用新架构（UnifiedReviewAdapter）
- 选项 C: 标记为 skip,留待后续重写

**决策**: 先分析每个测试文件的价值,然后决定处理方式

### Task 7.2: 测试新增的接口 ✅ 待执行

**目标**: 为 Phase 3 新增的接口添加测试

**文件**:
1. `src/application/interfaces/ISchedulerRouter.ts`
2. `src/application/interfaces/ICardStorage.ts`

**测试内容**:
- 接口契约测试
- Mock 实现测试
- 依赖注入测试

### Task 7.3: 测试 ApplicationContext ✅ 待执行

**目标**: 确保依赖注入容器正常工作

**文件**: `src/application/ApplicationContext.ts`

**测试内容**:
- 服务创建和缓存
- 依赖注入
- 循环依赖检测（如果实现了）
- 懒加载

**现有测试**: `src/application/__tests__/ApplicationContext.di.test.ts`

**行动**: 检查现有测试是否覆盖新功能

### Task 7.4: 测试 QuickCardRepository ✅ 待执行

**目标**: 测试 Phase 3 修改的 Repository

**文件**: `src/core/card/quick-card/infrastructure/QuickCardRepository.ts`

**测试内容**:
- 使用 ICardStorage 接口
- CRUD 操作
- 错误处理

### Task 7.5: 测试 UnifiedQueueStrategy ✅ 待执行

**目标**: 测试 Phase 3 修改的 Strategy

**文件**: `src/application/adapters/UnifiedQueueStrategy.ts`

**测试内容**:
- 使用 ISchedulerRouter 接口
- 队列操作
- 调度器路由

### Task 7.6: 测试 DialogManager ✅ 待执行

**目标**: 测试对话框管理器

**文件**: `src/application/managers/DialogManager.ts`

**测试内容**:
- 打开各种对话框
- 使用 UnifiedReviewAdapter
- EventBus 集成

### Task 7.7: 测试工厂函数 ✅ 待执行

**目标**: 测试工厂函数的依赖注入

**文件**: `src/application/factories/createUnifiedReviewDialog.ts`

**测试内容**:
- 创建对话框
- 依赖注入
- 配置传递

## 优先级排序

### P0 - 必须完成（本次执行）
1. Task 7.1: 修复现有测试文件
2. Task 7.3: 测试 ApplicationContext（检查现有测试）

### P1 - 高优先级（本次执行）
3. Task 7.2: 测试新增的接口
4. Task 7.4: 测试 QuickCardRepository
5. Task 7.5: 测试 UnifiedQueueStrategy

### P2 - 中优先级（可推迟）
6. Task 7.6: 测试 DialogManager
7. Task 7.7: 测试工厂函数

## 测试框架和工具

### 已有工具
- Vitest - 测试框架
- @testing-library/vue - Vue 组件测试
- vi.mock - Mock 功能

### 测试模式
```typescript
// 单元测试模板
describe('ComponentName', () => {
  let component: ComponentType;
  let mockDependency: MockType;
  
  beforeEach(() => {
    mockDependency = createMock();
    component = new ComponentType(mockDependency);
  });
  
  it('should do something', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = component.method(input);
    
    // Assert
    expect(result).toBe('expected');
  });
});
```

## 成功标准

### 本次执行
- ✅ 所有现有测试通过或被正确处理
- ✅ 新增接口有基本测试覆盖
- ✅ ApplicationContext 测试覆盖核心功能
- ✅ 关键 Repository 和 Strategy 有测试

### 长期目标（v1.5.0）
- ✅ 测试覆盖率 > 80%
- ✅ 所有应用服务有测试
- ✅ 所有领域服务有测试
- ✅ 关键用例有集成测试

## 风险评估

### 高风险
- ❌ 删除测试可能丢失重要的测试用例
- ❌ 新测试可能不够全面

### 中风险
- ⚠️ 测试编写时间可能超出预期
- ⚠️ Mock 设置可能复杂

### 低风险
- ✅ 测试不影响生产代码
- ✅ 可以逐步添加测试

## 下一步行动

1. **立即开始**: Task 7.1 - 分析现有测试文件
2. **准备工作**: 设置测试环境和 Mock 工具
3. **执行顺序**: 按优先级 P0 → P1 → P2 执行

---

**状态**: 📋 计划中
**预计完成**: 本次执行完成 P0 和 P1 任务
