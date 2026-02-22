# 简化的 Xiuyuan ID 方案

## 问题分析

### 当前架构

根据代码分析，Xiuyuan 和 Card 的关系是：

```
1 个 Xiuyuan → N 张 Card (N ≥ 1)
```

**一个块多张卡的场景**：

1. **列表模板**：
   - 1 个父列表项 → 1 个 Xiuyuan → N 张 Card（N = 子列表项数量）
   - 例如：父列表项"什么是 FSRS？" + 3 个子列表项 → 3 张卡片

2. **填空卡片**：
   - 1 个块 → 1 个 Xiuyuan → N 张 Card（N = 填空数量）
   - 例如：`{{c1::FSRS}} 是一种 {{c2::间隔重复}} 算法` → 2 张卡片

3. **双向卡片**：
   - 2 个块 → 1 个 Xiuyuan → 2 张 Card（正向 + 反向）
   - 例如：块1"DDD" + 块2"领域驱动设计" → 2 张卡片

4. **普通卡片**：
   - 1-N 个块 → 1 个 Xiuyuan → 1 张 Card
   - 例如：块1"问题" + 块2"答案" → 1 张卡片

### 核心问题

**你的建议**：`xy_{blockId}`

**问题**：
- ✅ 简单直观
- ✅ 可以直接从 ID 获取块 ID
- ❌ 但是：**一个 Xiuyuan 可能关联多个块**（如双向卡片、列表模板）

**例如**：
- 列表模板：父块 + 3 个子块 = 4 个块，用哪个块的 ID？
- 双向卡片：块1 + 块2 = 2 个块，用哪个块的 ID？

## 推荐方案：直接使用块 ID

### 核心思路

**Xiuyuan ID 格式**：直接使用块 ID，不加前缀

**思源块 ID 格式**：`20260218213806-lleihjw`
- 前14位：时间戳（YYYYMMDDHHmmss）
- 后7位：随机字符

**Xiuyuan ID 示例**：`20260218213806-lleihjw`（与块 ID 完全相同）

**代表块（Representative Block）规则**：
- 普通卡片：第一个块
- 列表模板：父列表项块
- 填空卡片：包含填空的块
- 双向卡片：第一个块

### 优点

1. ✅ **最简单**：直接使用块 ID，不需要任何转换
2. ✅ **唯一性**：思源保证块 ID 唯一
3. ✅ **可追溯**：Xiuyuan ID = 块 ID，直接对应
4. ✅ **兼容性**：与思源生态完全一致
5. ✅ **防重复**：通过块属性 `custom-xiuyuan-id` 检查
6. ✅ **无歧义**：不会与其他 ID 格式混淆

### 为什么不需要 `xy_` 前缀？

**原因**：
1. 思源块 ID 格式已经很独特（时间戳+随机字符）
2. 在代码中，Xiuyuan ID 和块 ID 的使用场景不同，不会混淆
3. 块属性 `custom-xiuyuan-id` 已经标明了这是 Xiuyuan ID
4. 更简洁，减少字符串操作

### 实现细节

#### 1. ID 生成规则

```typescript
// 所有场景统一使用代表块 ID（不加前缀）
const representativeBlockId = getRepresentativeBlockId(command);
const xiuyuanIdResult = XiuyuanId.create(representativeBlockId);
```

#### 2. 代表块选择规则

| 场景 | 代表块 | 示例 |
|------|--------|------|
| 普通卡片 | 第一个块 | `blockIds[0]` |
| 列表模板 | 父列表项 | `parentBlockId` |
| 填空卡片 | 包含填空的块 | `blockIds[0]` |
| 双向卡片 | 第一个块 | `blockIds[0]` |
| Riff 同步 | Riff 卡片的块 | `riffCard.id` |

#### 3. 防重复机制

**三层防护**：

1. **块属性检查**（最快）：
   ```typescript
   const attrs = await getBlockAttrs(representativeBlockId);
   if (attrs['custom-xiuyuan-id']) {
       return err(new Error('此块已经创建过卡片'));
   }
   ```

2. **Repository 查询**（次快）：
   ```typescript
   const xiuyuanId = XiuyuanId.create(`xy_${representativeBlockId}`);
   const existing = await xiuyuanRepository.findById(xiuyuanId);
   if (existing) {
       return err(new Error('Xiuyuan 已存在'));
   }
   ```

3. **Storage 检查**（最后防线）：
   ```typescript
   if (storage.getXiuYuan(`xy_${representativeBlockId}`)) {
       return err(new Error('Xiuyuan 已存在'));
   }
   ```

## 代码修改

### 修改 1：CreateXiuyuanFromBlocksUseCase

**文件**：`src/application/usecases/xiuyuan/CreateXiuyuanFromBlocksUseCase.ts`

**原代码**（第 89 行）：
```typescript
const xiuyuanIdResult = XiuyuanId.create(`xy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
```

**新代码**：
```typescript
// 直接使用代表块 ID（第一个块）
const representativeBlockId = command.blockIds[0];
const xiuyuanIdResult = XiuyuanId.create(representativeBlockId);
```

### 修改 2：CreateListTemplateCardsUseCase

**文件**：`src/application/usecases/xiuyuan/CreateListTemplateCardsUseCase.ts`

**原代码**（第 168 行）：
```typescript
const xiuyuanIdResult = XiuyuanId.create(`xy_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`);
```

**新代码**：
```typescript
// 直接使用代表块 ID（父列表项）
const representativeBlockId = command.parentBlockId;
const xiuyuanIdResult = XiuyuanId.create(representativeBlockId);
```

### 修改 3：XiuyuanSyncService.incrementalSync

**文件**：`src/application/services/XiuyuanSyncService.ts`

**原代码**（第 263 行）：
```typescript
const xiuyuanIdStr = `xy_riff_${riffCard.id}`;
```

**新代码**：
```typescript
// 统一格式，去掉 riff_ 前缀
const xiuyuanIdStr = `xy_${riffCard.id}`;
```

### 修改 4：XiuyuanSyncService.fullSync

**文件**：`src/application/services/XiuyuanSyncService.ts`

**原代码**（第 546 行）：
```typescript
const xiuyuanIdStr = `xy_riff_${riffCard.id}`;
```

**新代码**：
```typescript
// 统一格式
const xiuyuanIdStr = `xy_${riffCard.id}`;
```

### 修改 5：XiuyuanSyncService.syncDeletedCards

**文件**：`src/application/services/XiuyuanSyncService.ts`

**原代码**（第 644 行）：
```typescript
const xiuyuanIdStr = `xy_riff_${riffCard.id}`;
```

**新代码**：
```typescript
// 统一格式
const xiuyuanIdStr = `xy_${riffCard.id}`;
```

### 修改 6：XiuyuanSyncService.convertRiffCardToFSRSCard

**文件**：`src/application/services/XiuyuanSyncService.ts`

**原代码**（第 1050 行）：
```typescript
const xiuyuanIdStr = `xy_riff_${riffCard.id}`;
```

**新代码**：
```typescript
// 统一格式
const xiuyuanIdStr = `xy_${riffCard.id}`;
```

### 修改 7：ApplicationContext 迁移逻辑（可选）

**文件**：`src/application/ApplicationContext.ts`

**原代码**（第 578 行）：
```typescript
const xiuyuanIdStr = `xy_migrated_${orphanCard.id}`;
```

**新代码**（保持不变，迁移数据使用特殊前缀）：
```typescript
// 迁移数据保持 xy_migrated_ 前缀，便于识别
const xiuyuanIdStr = `xy_migrated_${orphanCard.id}`;
```

## 数据迁移

### 迁移脚本

```typescript
// 在控制台运行
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const storage = plugin?.context?.getUnifiedStorage?.();

if (storage) {
    const xiuyuans = storage.getAllXiuYuans();
    let migratedCount = 0;
    const migrations = [];
    
    for (const xy of xiuyuans) {
        let newId = null;
        
        // 1. xy_riff_{blockId} → xy_{blockId}
        if (xy.id.startsWith('xy_riff_')) {
            newId = xy.id.replace('xy_riff_', 'xy_');
        }
        // 2. xy_{timestamp}_{random} → xy_{blockId}
        else if (xy.id.match(/^xy_\d+_[a-z0-9]+$/) && xy.blockIDs.length > 0) {
            newId = `xy_${xy.blockIDs[0]}`;
        }
        
        if (newId && newId !== xy.id) {
            migrations.push({ 
                oldId: xy.id, 
                newId, 
                blockId: xy.blockIDs[0],
                type: xy.id.startsWith('xy_riff_') ? 'riff' : 'template'
            });
            migratedCount++;
        }
    }
    
    console.log(`Found ${migratedCount} Xiuyuans to migrate:`);
    console.table(migrations);
    
    // 确认后执行迁移
    if (confirm(`Migrate ${migratedCount} Xiuyuans?`)) {
        for (const { oldId, newId } of migrations) {
            const xy = storage.getXiuYuan(oldId);
            if (xy) {
                // 检查新 ID 是否已存在
                if (storage.getXiuYuan(newId)) {
                    console.warn(`⚠️ Xiuyuan ${newId} already exists, skipping ${oldId}`);
                    continue;
                }
                
                // 更新 Xiuyuan ID
                xy.id = newId;
                
                // 更新关联的 Cards
                const cards = storage.getAllCards().filter(c => c.meta?.xiuyuanID === oldId);
                for (const card of cards) {
                    card.meta.xiuyuanID = newId;
                }
                
                // 更新块属性
                if (xy.blockIDs.length > 0) {
                    try {
                        await setBlockAttrs(xy.blockIDs[0], {
                            'custom-xiuyuan-id': newId
                        });
                    } catch (error) {
                        console.warn(`Failed to update block attrs for ${xy.blockIDs[0]}:`, error);
                    }
                }
            }
        }
        
        // 保存
        await storage.save();
        console.log(`✅ Migrated ${migratedCount} Xiuyuans`);
        
        // 重新加载验证
        await storage.load();
        const newXiuyuans = storage.getAllXiuYuans();
        console.log(`Total Xiuyuans after migration: ${newXiuyuans.length}`);
    }
}
```

## 特殊场景处理

### 场景 1：一个块有多个 Xiuyuan（不允许）

**规则**：一个代表块只能有一个 Xiuyuan

**检查**：
```typescript
const attrs = await getBlockAttrs(representativeBlockId);
if (attrs['custom-xiuyuan-id']) {
    return err(new Error('此块已经创建过卡片，请勿重复创建'));
}
```

### 场景 2：列表模板的子块

**规则**：子块不单独创建 Xiuyuan，只有父块创建

**检查**：
```typescript
// 在 TransactionObserver 中检查
const isListTemplateChild = await this.isListTemplateChild(blockId);
if (isListTemplateChild) {
    console.log('Block is a child of list template, skipping');
    return;
}
```

### 场景 3：Riff 同步的卡片

**规则**：使用块 ID 作为代表块

**实现**：
```typescript
const xiuyuanIdStr = `xy_${riffCard.id}`;
```

### 场景 4：迁移的孤儿卡片

**规则**：保持 `xy_migrated_` 前缀，便于识别

**实现**：
```typescript
const xiuyuanIdStr = `xy_migrated_${orphanCard.id}`;
```

## ID 格式总结

### 统一后的格式

| 场景 | ID 格式 | 示例 | 说明 |
|------|---------|------|------|
| 普通卡片 | `xy_{blockId}` | `xy_20210529220522-gpb0ib0` | 使用第一个块 |
| 列表模板 | `xy_{parentBlockId}` | `xy_20210529220522-parent` | 使用父列表项 |
| 填空卡片 | `xy_{blockId}` | `xy_20210529220522-cloze` | 使用包含填空的块 |
| 双向卡片 | `xy_{blockId}` | `xy_20210529220522-term` | 使用第一个块 |
| Riff 同步 | `xy_{blockId}` | `xy_20210529220522-riff` | 使用 Riff 卡片的块 |
| 迁移数据 | `xy_migrated_{cardId}` | `xy_migrated_card-123` | 特殊前缀 |

### 优点总结

1. ✅ **格式统一**：所有场景使用 `xy_{blockId}`
2. ✅ **简单直观**：从 ID 可以直接获取块 ID
3. ✅ **防重复**：通过块属性和 Repository 双重检查
4. ✅ **易于调试**：ID 可读性强
5. ✅ **兼容性好**：与现有代码改动最小

## 实施步骤

1. **应用代码修改**（6 个文件）
2. **运行数据迁移脚本**
3. **测试验证**：
   - 模板制卡
   - Riff 同步
   - 列表模板
   - 填空卡片
4. **监控日志**：确认没有重复创建

## 预期效果

### 修改前

```
模板制卡: xy_1704067200000_abc123def
Riff 同步: xy_riff_20210529220522-gpb0ib0
结果: 2 个 Xiuyuan ❌
```

### 修改后

```
模板制卡: xy_20210529220522-gpb0ib0
Riff 同步: xy_20210529220522-gpb0ib0
结果: 1 个 Xiuyuan ✅（防护机制阻止重复）
```

## 总结

使用 `xy_{blockId}` 格式：
- ✅ 简单、直观、易于理解
- ✅ 完全满足你的需求
- ✅ 解决了双重创建问题
- ✅ 支持所有场景（包括一个块多张卡）

关键点：
- **代表块**：每个 Xiuyuan 有一个代表块
- **唯一性**：一个代表块只能有一个 Xiuyuan
- **防护**：通过块属性和 Repository 双重检查
