# 解决双重创建问题

## 问题总结

使用模板制卡时，`CreateXiuyuanFromBlocksUseCase` 和 `incrementalSync()` 可能创建重复的 Xiuyuan。

## 推荐解决方案：统一 ID 格式 + 防护增强

### 修改 1：CreateXiuyuanFromBlocksUseCase - 使用 Riff ID 格式

**文件**：`src/application/usecases/xiuyuan/CreateXiuyuanFromBlocksUseCase.ts`

**修改位置**：第 88-90 行

**原代码**：
```typescript
const xiuyuanIdResult = XiuyuanId.create(`xy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
```

**新代码**：
```typescript
// 🔧 使用 Riff ID 格式，与 incrementalSync 保持一致
const representativeBlockId = command.blockIds[0];
const xiuyuanIdResult = XiuyuanId.create(`xy_riff_${representativeBlockId}`);
```

**理由**：
- 统一 ID 格式，避免创建不同的 Xiuyuan
- 利用现有的 `findById()` 防护机制
- 与 `incrementalSync()` 的 ID 格式一致

### 修改 2：incrementalSync - 增强防护检查

**文件**：`src/application/services/XiuyuanSyncService.ts`

**修改位置**：第 265-275 行（在 `findById()` 之前）

**新增代码**：
```typescript
// 🔧 防护 1：检查块属性，避免重复创建
const { getBlockAttrs } = await import('@/core/siyuan/api');
try {
    const attrs = await getBlockAttrs(riffCard.id);
    if (attrs && (attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'])) {
        const existingXiuyuanId = attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'];
        console.log(`[HybridSync] Block ${riffCard.id} already has Xiuyuan: ${existingXiuyuanId}, skipping`);
        skippedCount++;
        continue;
    }
} catch (error) {
    console.warn(`[HybridSync] Failed to check block attrs for ${riffCard.id}:`, error);
    // 继续执行，不阻断流程
}

// 🔧 防护 2：检查 Repository（原有逻辑）
const xiuyuanIdStr = `xy_riff_${riffCard.id}`;
const xiuyuanIdResult = XiuyuanId.create(xiuyuanIdStr);
// ... 原有代码
```

**理由**：
- 双重防护：先检查块属性，再检查 Repository
- 块属性是同步写入的，更可靠
- 即使 Repository 查询有延迟，也能避免重复

### 修改 3：CreateXiuyuanFromBlocksUseCase - 增强日志

**文件**：`src/application/usecases/xiuyuan/CreateXiuyuanFromBlocksUseCase.ts`

**修改位置**：第 177-182 行

**新增代码**：
```typescript
try {
    await addRiffCards(deckId, [representativeBlockId]);
    console.log('[CreateXiuyuanFromBlocksUseCase] ✅ Created Xiuyuan and added to Riff:', {
        xiuyuanId: xiuyuan.getId().getValue(),
        blockId: representativeBlockId,
        source: 'template-creation'
    });
} catch (error) {
    console.warn('[CreateXiuyuanFromBlocksUseCase] Failed to add to Riff:', error);
    // 不阻断流程
}
```

**理由**：
- 记录创建来源，便于调试
- 区分模板创建和同步创建

### 修改 4：incrementalSync - 增强日志

**文件**：`src/application/services/XiuyuanSyncService.ts`

**修改位置**：第 280-285 行

**新增代码**：
```typescript
if (!existingXiuyuan) {
    console.log(`[HybridSync] ✅ Creating new Xiuyuan from Riff:`, {
        xiuyuanId: xiuyuanIdStr,
        blockId: riffCard.id,
        source: 'riff-sync'
    });
    
    const { xiuyuanEntity } = await this.convertRiffCardToFSRSCard(riffCard);
    // ... 原有代码
}
```

## 实施步骤

### 步骤 1：应用代码修改

按照上述修改，更新以下文件：
1. `CreateXiuyuanFromBlocksUseCase.ts`
2. `XiuyuanSyncService.ts`

### 步骤 2：测试验证

**测试场景 1：模板制卡**
```typescript
// 1. 创建模板卡片
await xiuyuanService.createFromBlocks({
    blockIds: ['20210529220522-test'],
    templateId: 'builtin-basic-qa',
    deckId: 'default-deck',
    priority: 50
});

// 2. 等待 1 秒，让 RiffSyncHandler 触发
await new Promise(resolve => setTimeout(resolve, 1000));

// 3. 检查是否有重复
const storage = context.getUnifiedStorage();
const xiuyuans = storage.getAllXiuYuans();
const duplicates = xiuyuans.filter(xy => 
    xy.blockIDs.includes('20210529220522-test')
);

console.log('Xiuyuans for block:', duplicates.length);
// 预期：1（不重复）
```

**测试场景 2：Riff 同步**
```typescript
// 1. 手动添加块到 Riff
await addRiffCards('default-deck', ['20210529220522-test2']);

// 2. 等待同步完成
await new Promise(resolve => setTimeout(resolve, 1000));

// 3. 检查是否创建
const xiuyuans = storage.getAllXiuYuans();
const created = xiuyuans.find(xy => 
    xy.id === 'xy_riff_20210529220522-test2'
);

console.log('Xiuyuan created:', !!created);
// 预期：true
```

**测试场景 3：重复创建防护**
```typescript
// 1. 创建模板卡片
await xiuyuanService.createFromBlocks({
    blockIds: ['20210529220522-test3'],
    templateId: 'builtin-basic-qa',
    deckId: 'default-deck',
    priority: 50
});

// 2. 立即手动触发同步（模拟竞态条件）
await syncService.incrementalSync();

// 3. 检查是否有重复
const xiuyuans = storage.getAllXiuYuans();
const duplicates = xiuyuans.filter(xy => 
    xy.blockIDs.includes('20210529220522-test3')
);

console.log('Xiuyuans for block:', duplicates.length);
// 预期：1（防护生效）
```

### 步骤 3：数据迁移（可选）

如果有旧数据使用了 `xy_{timestamp}_{random}` 格式，需要迁移：

```typescript
// 迁移脚本（在控制台运行）
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const storage = plugin?.context?.getUnifiedStorage?.();

if (storage) {
    const xiuyuans = storage.getAllXiuYuans();
    let migratedCount = 0;
    
    for (const xy of xiuyuans) {
        // 只迁移非 Riff 格式的 ID
        if (!xy.id.startsWith('xy_riff_') && xy.blockIDs.length > 0) {
            const oldId = xy.id;
            const newId = `xy_riff_${xy.blockIDs[0]}`;
            
            console.log(`Migrating: ${oldId} -> ${newId}`);
            
            // 更新 Xiuyuan ID
            xy.id = newId;
            
            // 更新关联的 Cards
            const cards = storage.getAllCards().filter(c => c.meta?.xiuyuanID === oldId);
            for (const card of cards) {
                card.meta.xiuyuanID = newId;
            }
            
            migratedCount++;
        }
    }
    
    // 保存
    await storage.save();
    console.log(`✅ Migrated ${migratedCount} Xiuyuans`);
}
```

## 预期效果

### 修改前

```
用户创建模板卡片
    ↓
CreateXiuyuanFromBlocksUseCase
    ├─ 创建 Xiuyuan (ID: xy_1234567890_abc)
    ├─ 调用 addRiffCards()
    └─ 保存
    ↓
RiffSyncHandler 检测到变化
    ↓
incrementalSync()
    ├─ 查询 xy_riff_20210529220522-test (找不到)
    └─ 再次创建 Xiuyuan (ID: xy_riff_20210529220522-test) ❌

结果：2 个 Xiuyuan，1 个块
```

### 修改后

```
用户创建模板卡片
    ↓
CreateXiuyuanFromBlocksUseCase
    ├─ 创建 Xiuyuan (ID: xy_riff_20210529220522-test)
    ├─ 调用 addRiffCards()
    ├─ 保存
    └─ 写入块属性 (custom-xiuyuan-id)
    ↓
RiffSyncHandler 检测到变化
    ↓
incrementalSync()
    ├─ 检查块属性 (custom-xiuyuan-id 存在) ✅
    └─ 跳过创建

结果：1 个 Xiuyuan，1 个块 ✅
```

## 回滚方案

如果修改后出现问题，可以回滚：

1. **恢复 ID 生成逻辑**：
   ```typescript
   const xiuyuanIdResult = XiuyuanId.create(`xy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
   ```

2. **移除块属性检查**：
   删除 `incrementalSync()` 中的块属性检查代码

3. **恢复数据**：
   从备份的 msgpack 文件恢复

## 监控和日志

修改后，关注以下日志：

### 正常日志

```
[CreateXiuyuanFromBlocksUseCase] ✅ Created Xiuyuan and added to Riff: {
  xiuyuanId: 'xy_riff_20210529220522-test',
  blockId: '20210529220522-test',
  source: 'template-creation'
}

[HybridSync] Block 20210529220522-test already has Xiuyuan: xy_riff_20210529220522-test, skipping
```

### 异常日志

```
[HybridSync] ✅ Creating new Xiuyuan from Riff: {
  xiuyuanId: 'xy_riff_20210529220522-test',
  blockId: '20210529220522-test',
  source: 'riff-sync'
}
```

如果看到这个日志，说明：
- 块属性检查失败（块属性未写入）
- Repository 查询失败（数据未保存）
- 需要进一步调查

## 总结

通过统一 ID 格式和增强防护检查，可以有效避免双重创建问题：

1. ✅ 统一 ID 格式：`xy_riff_{blockId}`
2. ✅ 双重防护：块属性 + Repository 查询
3. ✅ 增强日志：记录创建来源
4. ✅ 向后兼容：不影响现有功能

预期效果：
- 模板制卡不会触发重复创建
- Riff 同步正常工作
- 数据一致性得到保证
