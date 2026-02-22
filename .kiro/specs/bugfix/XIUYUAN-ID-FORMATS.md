# Xiuyuan ID 格式汇总

## 当前使用的 ID 格式

根据代码搜索结果，项目中使用了以下几种 Xiuyuan ID 格式：

### 1. Riff 同步格式（最常用）

**格式**：`xy_riff_{blockId}`

**使用位置**：
- `XiuyuanSyncService.incrementalSync()` (第 263 行)
- `XiuyuanSyncService.fullSync()` (第 546 行)
- `XiuyuanSyncService.syncDeletedCards()` (第 644 行)
- `XiuyuanSyncService.convertRiffCardToFSRSCard()` (第 1050 行)

**示例**：
```typescript
const xiuyuanIdStr = `xy_riff_${riffCard.id}`;
// 例如：xy_riff_20210529220522-gpb0ib0
```

**用途**：
- Riff 系统同步时创建的 Xiuyuan
- 一个 Riff 卡片对应一个 Xiuyuan
- 通过块 ID 可以唯一标识

### 2. 模板制卡格式（时间戳 + 随机数）

**格式**：`xy_{timestamp}_{random}`

**使用位置**：
- `CreateXiuyuanFromBlocksUseCase.execute()` (第 89 行)
- `CreateListTemplateCardsUseCase.execute()` (第 168 行)

**示例**：
```typescript
const xiuyuanIdResult = XiuyuanId.create(`xy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
// 例如：xy_1704067200000_abc123def
```

**用途**：
- 用户通过模板手动创建卡片
- 包含时间戳，便于排序和调试
- 包含随机数，避免冲突

### 3. 迁移格式（孤儿卡片）

**格式**：`xy_migrated_{cardId}`

**使用位置**：
- `ApplicationContext.ts` (第 578 行)

**示例**：
```typescript
const xiuyuanIdStr = `xy_migrated_${orphanCard.id}`;
// 例如：xy_migrated_card-123
```

**用途**：
- 数据迁移时为孤儿卡片创建 Xiuyuan
- 标记为迁移数据，便于识别

### 4. 默认格式（很少使用）

**格式**：`xiuyuan-{timestamp}-{random}`

**使用位置**：
- `Xiuyuan.create()` (第 87 行) - 当没有提供 ID 时的默认值

**示例**：
```typescript
const idResult = XiuyuanId.create(`xiuyuan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
// 例如：xiuyuan-1704067200000-abc123def
```

**用途**：
- 领域模型的默认 ID 生成
- 实际很少使用（通常会显式提供 ID）

### 5. 测试格式

**格式**：各种测试用的 ID

**示例**：
```typescript
'xy_test_123'
'xy_1', 'xy_2'
'xy_nonexistent'
'xy_orphan'
'custom-xiuyuan-id'
```

**用途**：
- 单元测试和集成测试
- 不影响生产代码

## ID 格式对比

| 格式 | 前缀 | 中间部分 | 后缀 | 唯一性 | 可读性 | 用途 |
|------|------|---------|------|--------|--------|------|
| Riff 同步 | `xy_riff_` | 块 ID | - | ✅ 高（基于块 ID） | ✅ 高（可追溯到块） | Riff 同步 |
| 模板制卡 | `xy_` | 时间戳 | 随机数 | ✅ 高（时间+随机） | ⚠️ 中（需要解析） | 手动创建 |
| 迁移 | `xy_migrated_` | 卡片 ID | - | ✅ 高（基于卡片 ID） | ✅ 高（标记迁移） | 数据迁移 |
| 默认 | `xiuyuan-` | 时间戳 | 随机数 | ✅ 高（时间+随机） | ⚠️ 中（需要解析） | 默认值 |

## 问题分析

### 当前问题

1. **格式不统一**：
   - Riff 同步使用 `xy_riff_{blockId}`
   - 模板制卡使用 `xy_{timestamp}_{random}`
   - 导致同一个块可能有两个不同的 Xiuyuan

2. **无法关联**：
   - 从 `xy_1704067200000_abc123def` 无法知道对应的块 ID
   - 从 `xy_riff_20210529220522-gpb0ib0` 可以直接知道块 ID

3. **重复创建风险**：
   - 模板制卡创建 `xy_123_abc`
   - Riff 同步创建 `xy_riff_20210529220522-gpb0ib0`
   - 两个 Xiuyuan 指向同一个块

## 推荐方案

### 方案 A：统一使用 Riff 格式（推荐）

**修改**：
- `CreateXiuyuanFromBlocksUseCase`：使用 `xy_riff_{blockId}`
- `CreateListTemplateCardsUseCase`：使用 `xy_riff_{blockId}`

**优点**：
- ✅ 格式统一，易于管理
- ✅ 可以直接从 ID 获取块 ID
- ✅ 避免重复创建
- ✅ 与 Riff 同步保持一致

**缺点**：
- ⚠️ 需要迁移旧数据
- ⚠️ 如果一个块有多个 Xiuyuan（如列表模板），需要额外处理

### 方案 B：使用混合格式

**规则**：
- Riff 同步：`xy_riff_{blockId}`
- 模板制卡（单块）：`xy_riff_{blockId}`
- 模板制卡（多块）：`xy_{timestamp}_{random}`
- 列表模板：`xy_list_{parentBlockId}_{timestamp}`

**优点**：
- ✅ 灵活，适应不同场景
- ✅ 可以区分不同类型的 Xiuyuan

**缺点**：
- ❌ 格式复杂，难以维护
- ❌ 需要额外的逻辑判断

### 方案 C：使用块属性作为主键

**规则**：
- 所有 Xiuyuan 使用 `xy_{timestamp}_{random}`
- 通过块属性 `custom-xiuyuan-id` 关联
- 查询时先查块属性，再查 Repository

**优点**：
- ✅ ID 格式统一
- ✅ 不依赖块 ID

**缺点**：
- ❌ 需要额外的块属性查询
- ❌ 性能开销较大

## 推荐实施方案 A

### 修改点 1：CreateXiuyuanFromBlocksUseCase

```typescript
// 原代码（第 89 行）
const xiuyuanIdResult = XiuyuanId.create(`xy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

// 新代码
const representativeBlockId = command.blockIds[0];
const xiuyuanIdResult = XiuyuanId.create(`xy_riff_${representativeBlockId}`);
```

### 修改点 2：CreateListTemplateCardsUseCase

```typescript
// 原代码（第 168 行）
const xiuyuanIdResult = XiuyuanId.create(`xy_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`);

// 新代码
const parentBlockId = command.parentBlockId;
const xiuyuanIdResult = XiuyuanId.create(`xy_riff_${parentBlockId}`);
```

### 修改点 3：Xiuyuan.create() 默认值（可选）

```typescript
// 原代码（第 87 行）
const idResult = XiuyuanId.create(`xiuyuan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

// 新代码（如果有 blockIDs）
if (props.blockIDs && props.blockIDs.length > 0) {
    const firstBlockId = props.blockIDs[0].getValue();
    const idResult = XiuyuanId.create(`xy_riff_${firstBlockId}`);
} else {
    // 保持原有逻辑
    const idResult = XiuyuanId.create(`xiuyuan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
}
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
        // 只迁移非 Riff 格式的 ID
        if (!xy.id.startsWith('xy_riff_') && !xy.id.startsWith('xy_migrated_') && xy.blockIDs.length > 0) {
            const oldId = xy.id;
            const newId = `xy_riff_${xy.blockIDs[0]}`;
            
            migrations.push({ oldId, newId, blockId: xy.blockIDs[0] });
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
                // 更新 Xiuyuan ID
                xy.id = newId;
                
                // 更新关联的 Cards
                const cards = storage.getAllCards().filter(c => c.meta?.xiuyuanID === oldId);
                for (const card of cards) {
                    card.meta.xiuyuanID = newId;
                }
            }
        }
        
        // 保存
        await storage.save();
        console.log(`✅ Migrated ${migratedCount} Xiuyuans`);
    }
}
```

## 总结

当前项目使用了 4 种主要的 ID 格式：

1. **Riff 同步**：`xy_riff_{blockId}` - 最常用，推荐统一使用
2. **模板制卡**：`xy_{timestamp}_{random}` - 需要改为 Riff 格式
3. **迁移**：`xy_migrated_{cardId}` - 保持不变
4. **默认**：`xiuyuan-{timestamp}-{random}` - 很少使用

推荐统一使用 Riff 格式（方案 A），可以：
- ✅ 避免重复创建
- ✅ 简化代码逻辑
- ✅ 提高可维护性
- ✅ 便于调试和追踪
