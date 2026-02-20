# 移除旧 Riff 系统兼容代码

## 背景

之前为了兼容旧的 Riff 卡片（没有 xiuyuanID），在代码中添加了一些兼容逻辑。但由于：
1. 只有一个用户（开发者本人）
2. 可以通过数据迁移解决
3. 兼容代码会破坏 DDD 架构的纯粹性

因此决定移除所有兼容代码，只保留纯粹的 DDD 新架构。

## 移除的兼容代码

### 1. UnifiedStorageManager.setCard() 方法

**位置**：`src/core/storage/UnifiedStorageManager.ts` (第 1001 行)

**移除前**：
```typescript
setCard(card: FSRSCard): void {
  const existing = this.cards.get(card.id);
  if (existing) {
    this.updateCard(card);
  } else {
    const xiuyuanId = (card.meta as any)?.xiuyuanID;
    if (xiuyuanId) {
      // Xiuyuan 卡片
      const xiuyuan = this.xiuyuans.get(xiuyuanId);
      if (xiuyuan) {
        this.createCard(xiuyuan, card);
      } else {
        console.warn('[UnifiedStorageManager] setCard: xiuyuan not found:', xiuyuanId);
      }
    } else {
      // ❌ 兼容逻辑：旧格式卡片（Riff 同步）
      console.log('[UnifiedStorageManager] setCard: adding legacy card without xiuyuanID:', card.id);
      this.cards.set(card.id, card);
      this.updateIndexesForCard(card, 'add');
      this.dirty = true;
      this.scheduleSave();
    }
  }
}
```

**移除后**：
```typescript
setCard(card: FSRSCard): void {
  const existing = this.cards.get(card.id);
  if (existing) {
    this.updateCard(card);
  } else {
    // ✅ DDD 架构要求：所有卡片必须有 xiuyuanID
    const xiuyuanId = (card.meta as any)?.xiuyuanID;
    if (!xiuyuanId) {
      throw new Error(`Cannot create card without xiuyuanID: ${card.id}`);
    }
    
    const xiuyuan = this.xiuyuans.get(xiuyuanId);
    if (!xiuyuan) {
      throw new Error(`Xiuyuan not found: ${xiuyuanId}`);
    }
    
    this.createCard(xiuyuan, card);
  }
}
```

**改进**：
- 移除了旧卡片的兼容逻辑
- 明确要求所有卡片必须有 xiuyuanID
- 如果违反规则，直接抛出错误（Fail Fast 原则）

## 架构优势

### 1. 保持 DDD 架构纯粹性

**聚合根原则**：
- 所有卡片必须属于 Xiuyuan 聚合根
- 不允许孤儿卡片存在
- 符合 DDD 的聚合根边界

### 2. 简化代码逻辑

**移除前**：
- 需要判断卡片是否有 xiuyuanID
- 需要处理两种不同的创建路径
- 增加了代码复杂度

**移除后**：
- 只有一种创建路径
- 代码更简洁
- 更容易维护

### 3. 更好的错误提示

**移除前**：
- 静默失败（只打印 warn 日志）
- 可能导致数据不一致

**移除后**：
- Fail Fast（立即抛出错误）
- 强制开发者修复数据问题

## 数据迁移方案

由于移除了兼容代码，旧的 Riff 卡片无法被系统处理。需要执行数据迁移：

**迁移脚本**：参见 `migrate-riff-cards-to-xiuyuan.md`

**迁移步骤**：
1. 备份数据
2. 执行迁移脚本
3. 验证迁移结果
4. 测试删除功能

## 影响范围

### 受影响的功能

1. **卡片创建**：
   - 必须通过 Xiuyuan 聚合根创建
   - 不能直接调用 `setCard()` 创建孤儿卡片

2. **Riff 同步**：
   - 如果 Riff 同步尝试创建没有 xiuyuanID 的卡片，会抛出错误
   - 需要确保 Riff 同步逻辑也创建 Xiuyuan

3. **数据导入**：
   - 导入旧数据时必须先迁移
   - 不能直接导入没有 xiuyuanID 的卡片

### 不受影响的功能

1. **卡片查询**：不受影响
2. **卡片更新**：不受影响（已有卡片可以更新）
3. **卡片删除**：不受影响（通过 Xiuyuan 删除）

## 测试验证

### 1. 编译测试
```bash
npm run build
```
✅ 编译成功

### 2. 功能测试

**测试用例**：
1. 创建新卡片（通过 Xiuyuan）- 应该成功
2. 尝试创建没有 xiuyuanID 的卡片 - 应该抛出错误
3. 更新现有卡片 - 应该成功
4. 删除卡片 - 应该成功

### 3. 迁移测试

**测试步骤**：
1. 执行迁移脚本
2. 验证所有卡片都有 xiuyuanID
3. 测试删除功能
4. 检查控制台无错误

## 后续工作

1. **完成数据迁移**：执行迁移脚本，将所有旧卡片迁移到新架构
2. **更新文档**：更新 API 文档，说明所有卡片必须有 xiuyuanID
3. **监控错误**：观察是否有其他地方尝试创建孤儿卡片

## 总结

通过移除兼容代码：
- ✅ 保持了 DDD 架构的纯粹性
- ✅ 简化了代码逻辑
- ✅ 提供了更好的错误提示
- ✅ 强制执行数据一致性规则

这是正确的架构决策，符合"只测新架构"的原则。
