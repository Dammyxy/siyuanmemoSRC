# 删除卡片的向后兼容性修复

## 问题描述

在实施 Xiuyuan DDD 架构后，删除旧的 Riff 卡片时出现错误：

```
Error: Card with ID 20210529220522-gpb0ib0 not found in any Xiuyuan
```

### 错误日志

```
[SiYuanMemo][DeckDataSource] Failed to delete card 20210529220522-gpb0ib0: 
Error: Card with ID 20210529220522-gpb0ib0 not found in any Xiuyuan
```

## 根本原因

### 架构变更

新的 DDD 架构要求：
- 所有卡片必须属于某个 Xiuyuan 聚合根
- 删除操作通过 `DeleteCardUseCase` 执行
- `DeleteCardUseCase` 会查找包含该卡片的 Xiuyuan

### 旧数据问题

但是：
1. **旧的 Riff 卡片**：在 DDD 架构实施之前就已经存在
2. **没有 Xiuyuan**：这些卡片没有关联到任何 Xiuyuan
3. **删除失败**：`DeleteCardUseCase` 找不到 Xiuyuan，拒绝删除

## 解决方案：向后兼容处理

### 修改 DeleteCardUseCase

**文件**：`src/application/usecases/card/DeleteCardUseCase.ts`

```typescript
async execute(command: DeleteCardCommand): Promise<Result<void>> {
  // ... 前面的验证逻辑 ...

  // 3. 查找包含该卡片的 Xiuyuan
  const searchResult = await this.findXiuyuanAndCardId(cardId);
  if (!searchResult.ok) {
    return searchResult as Result<void>;
  }

  const { xiuyuan, actualCardId } = searchResult.value;
  
  // ⚠️ 兼容性处理：如果卡片不属于任何 Xiuyuan（旧的 Riff 卡片）
  if (!xiuyuan || !actualCardId) {
    console.warn(`[DeleteCardUseCase] Card ${cardId.getValue()} not found in any Xiuyuan, attempting legacy deletion`);
    
    // 尝试通过 UnifiedStorage 直接删除（向后兼容）
    try {
      const storage = (this.xiuyuanRepo as any).storage;
      if (storage && typeof storage.deleteCard === 'function') {
        const card = storage.getCard(cardId.getValue());
        if (card) {
          await storage.deleteCard(card);
          console.log(`[DeleteCardUseCase] Successfully deleted legacy card ${cardId.getValue()}`);
          return ok(undefined);
        }
      }
    } catch (error) {
      console.error(`[DeleteCardUseCase] Failed to delete legacy card:`, error);
    }
    
    return err(new Error(`Card with ID ${cardId.getValue()} not found in any Xiuyuan`));
  }

  // 4-7. 正常的 DDD 删除流程
  // ...
}
```

## 实现细节

### 1. 检测旧卡片

```typescript
if (!xiuyuan || !actualCardId) {
  // 卡片不属于任何 Xiuyuan，可能是旧卡片
}
```

### 2. 降级到 UnifiedStorage

```typescript
const storage = (this.xiuyuanRepo as any).storage;
if (storage && typeof storage.deleteCard === 'function') {
  const card = storage.getCard(cardId.getValue());
  if (card) {
    await storage.deleteCard(card);
  }
}
```

### 3. 记录日志

```typescript
console.warn(`[DeleteCardUseCase] Card ${cardId.getValue()} not found in any Xiuyuan, attempting legacy deletion`);
console.log(`[DeleteCardUseCase] Successfully deleted legacy card ${cardId.getValue()}`);
```

## 优势

### ✅ 向后兼容

- 旧的 Riff 卡片可以正常删除
- 不需要强制迁移所有旧数据
- 用户体验不受影响

### ✅ 渐进式迁移

- 新卡片使用 DDD 架构
- 旧卡片通过兼容层处理
- 随着时间推移，旧卡片会逐渐被新卡片替代

### ✅ 清晰的日志

- 记录兼容性处理的情况
- 便于调试和监控
- 了解系统中旧数据的比例

## 长期计划

### 阶段 1：兼容运行（当前）

- 新旧卡片共存
- 删除操作支持两种路径
- 记录兼容性处理的日志

### 阶段 2：数据迁移（未来）

创建迁移工具：
1. 扫描所有没有 Xiuyuan 的卡片
2. 为每个卡片创建对应的 Xiuyuan
3. 将卡片关联到 Xiuyuan
4. 验证迁移结果

### 阶段 3：移除兼容层（远期）

当所有旧卡片都迁移完成后：
1. 移除 `DeleteCardUseCase` 中的兼容代码
2. 强制要求所有卡片属于 Xiuyuan
3. 简化代码逻辑

## 测试验证

### 测试场景

1. **删除新卡片**（属于 Xiuyuan）
   - 应该通过 DDD 路径删除
   - 应该更新 Xiuyuan
   - 应该发布领域事件

2. **删除旧卡片**（不属于 Xiuyuan）
   - 应该通过兼容路径删除
   - 应该记录警告日志
   - 应该成功删除

3. **删除不存在的卡片**
   - 应该返回错误
   - 不应该崩溃

### 验证步骤

1. 重新构建插件
2. 刷新思源笔记
3. 打开卡片浏览器
4. 尝试删除旧卡片
5. 检查控制台日志
6. 确认卡片被成功删除

## 总结

通过在 `DeleteCardUseCase` 中添加向后兼容处理，我们实现了：

1. **平滑过渡**：新旧架构共存，不影响用户使用
2. **渐进式迁移**：不需要一次性迁移所有数据
3. **清晰的日志**：便于监控和调试
4. **长期规划**：为未来的完全迁移做好准备

这是一个**务实的解决方案**，在保持架构纯粹性的同时，也考虑了现实的兼容性需求。
