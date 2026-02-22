# Xiuyuan ID 统一修改记录

## 修改目标

统一所有 Xiuyuan ID 格式为：`xy_{blockId}`

## 修改内容

### 1. CreateXiuyuanFromBlocksUseCase.ts

**文件位置**：`src/application/usecases/xiuyuan/CreateXiuyuanFromBlocksUseCase.ts`

**修改 1**：ID 生成（第 89 行）
```typescript
// 修改前
const xiuyuanIdResult = XiuyuanId.create(`xy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

// 修改后
// 🔧 统一 ID 格式：使用代表块 ID（第一个块）
const representativeBlockId = command.blockIds[0];
const xiuyuanIdResult = XiuyuanId.create(`xy_${representativeBlockId}`);
```

**修改 2**：日志增强（第 177 行）
```typescript
// 修改前
console.log('[CreateXiuyuanFromBlocksUseCase] Added to Riff:', representativeBlockId);

// 修改后
console.log('[CreateXiuyuanFromBlocksUseCase] ✅ Created Xiuyuan and added to Riff:', {
  xiuyuanId: xiuyuan.getId().getValue(),
  blockId: representativeBlockId,
  source: 'template-creation'
});
```

### 2. CreateListTemplateCardsUseCase.ts

**文件位置**：`src/application/usecases/xiuyuan/CreateListTemplateCardsUseCase.ts`

**修改 1**：ID 生成（第 168 行）
```typescript
// 修改前
const xiuyuanIdResult = XiuyuanId.create(`xy_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`);

// 修改后
// 🔧 统一 ID 格式：使用代表块 ID（父列表项）
const representativeBlockId = command.parentBlockId;
const xiuyuanIdResult = XiuyuanId.create(`xy_${representativeBlockId}`);
```

**修改 2**：日志增强（第 250 行）
```typescript
// 修改前
console.log('[CreateListTemplateCardsUseCase] Added to Riff:', representativeBlockId);

// 修改后
console.log('[CreateListTemplateCardsUseCase] ✅ Created list template Xiuyuan and added to Riff:', {
  xiuyuanId: xiuyuan.getId().getValue(),
  blockId: representativeBlockId,
  source: 'list-template-creation'
});
```

### 3. XiuyuanSyncService.ts - incrementalSync

**文件位置**：`src/application/services/XiuyuanSyncService.ts`

**修改 1**：增强防护检查（第 260 行）
```typescript
// 新增：防护 1 - 检查块属性
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
```

**修改 2**：统一 ID 格式（第 263 行）
```typescript
// 修改前
const xiuyuanIdStr = `xy_riff_${riffCard.id}`;

// 修改后
// 🔧 防护 2：使用 Repository 查询（统一 ID 格式，去掉 riff_ 前缀）
const xiuyuanIdStr = `xy_${riffCard.id}`;
```

**修改 3**：日志增强（第 280 行）
```typescript
// 修改前
console.log(`[SiYuanMemo][HybridSync] Adding new card ${riffCard.id}`);

// 修改后
console.log(`[HybridSync] ✅ Creating new Xiuyuan from Riff:`, {
    xiuyuanId: xiuyuanIdStr,
    blockId: riffCard.id,
    source: 'riff-sync'
});
```

**修改 4**：删除检查逻辑（第 420 行）
```typescript
// 修改前
// 只删除 Riff 同步创建的 Xiuyuan（以 xy_riff_ 开头）
if (!xiuyuanId.startsWith('xy_riff_')) {
    return false;
}

// 修改后
// 🔧 检查是否为 Riff 同步创建的 Xiuyuan
// 新格式：xy_{blockId}，需要检查对应的块是否还在 Riff 中
// 旧格式：xy_riff_{blockId}，兼容处理
if (!xiuyuanId.startsWith('xy_riff_') && !xiuyuanId.startsWith('xy_')) {
    return false;
}

// 跳过迁移数据
if (xiuyuanId.startsWith('xy_migrated_')) {
    return false;
}
```

### 4. XiuyuanSyncService.ts - fullSync

**文件位置**：`src/application/services/XiuyuanSyncService.ts`

**修改 1**：统一 ID 格式（第 570 行）
```typescript
// 修改前
const xiuyuanIdStr = `xy_riff_${riffCard.id}`;

// 修改后
const xiuyuanIdStr = `xy_${riffCard.id}`;
```

**修改 2**：删除检查逻辑（第 620 行）
```typescript
// 修改前
// 只删除 Riff 同步创建的 Xiuyuan（以 xy_riff_ 开头）
if (!xiuyuanId.startsWith('xy_riff_')) {
    return false;
}

// 修改后
// 🔧 检查是否为 Riff 同步创建的 Xiuyuan
// 新格式：xy_{blockId}，需要检查对应的块是否还在 Riff 中
// 旧格式：xy_riff_{blockId}，兼容处理
if (!xiuyuanId.startsWith('xy_riff_') && !xiuyuanId.startsWith('xy_')) {
    return false;
}

// 跳过迁移数据
if (xiuyuanId.startsWith('xy_migrated_')) {
    return false;
}
```

**修改 3**：卡片类型检测（第 660 行）
```typescript
// 修改前
const xiuyuanIdStr = `xy_riff_${riffCard.id}`;

// 修改后
const xiuyuanIdStr = `xy_${riffCard.id}`;
```

### 5. XiuyuanSyncService.ts - convertRiffCardToFSRSCard

**文件位置**：`src/application/services/XiuyuanSyncService.ts`

**修改**：ID 生成（第 1050 行）
```typescript
// 修改前
const xiuyuanIdStr = `xy_riff_${riffCard.id}`;

// 修改后
// 1. 创建 Xiuyuan ID（统一格式）
const xiuyuanIdStr = `xy_${riffCard.id}`;
```

## 修改总结

### 修改的文件（3 个）
1. `src/application/usecases/xiuyuan/CreateXiuyuanFromBlocksUseCase.ts`
2. `src/application/usecases/xiuyuan/CreateListTemplateCardsUseCase.ts`
3. `src/application/services/XiuyuanSyncService.ts`

### 修改的位置（11 处）
1. CreateXiuyuanFromBlocksUseCase - ID 生成
2. CreateXiuyuanFromBlocksUseCase - 日志增强
3. CreateListTemplateCardsUseCase - ID 生成
4. CreateListTemplateCardsUseCase - 日志增强
5. XiuyuanSyncService.incrementalSync - 增强防护检查
6. XiuyuanSyncService.incrementalSync - 统一 ID 格式
7. XiuyuanSyncService.incrementalSync - 日志增强
8. XiuyuanSyncService.incrementalSync - 删除检查逻辑
9. XiuyuanSyncService.fullSync - 统一 ID 格式（3 处）
10. XiuyuanSyncService.fullSync - 删除检查逻辑
11. XiuyuanSyncService.convertRiffCardToFSRSCard - 统一 ID 格式

### 核心变化

**ID 格式统一**：
```
修改前：
- 模板制卡：xy_{timestamp}_{random}
- Riff 同步：xy_riff_{blockId}

修改后：
- 所有场景：xy_{blockId}
```

**防护增强**：
```
1. 块属性检查（新增）
2. Repository 查询（原有）
3. Storage 检查（原有）
```

**兼容性处理**：
```
删除检查时兼容旧格式：
- xy_riff_{blockId}（旧格式）
- xy_{blockId}（新格式）
- xy_migrated_{cardId}（迁移数据，不删除）
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

结果：2 个 Xiuyuan，1 个块 ❌
```

### 修改后
```
用户创建模板卡片
    ↓
CreateXiuyuanFromBlocksUseCase
    ├─ 创建 Xiuyuan (ID: xy_20210529220522-test)
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

## 下一步

1. **测试验证**：
   - 模板制卡
   - Riff 同步
   - 列表模板
   - 填空卡片

2. **数据迁移**：
   - 运行迁移脚本
   - 验证迁移结果

3. **监控日志**：
   - 确认没有重复创建
   - 确认 ID 格式正确

## 注意事项

1. **兼容性**：代码兼容旧格式 `xy_riff_{blockId}`，不会误删旧数据
2. **迁移数据**：`xy_migrated_{cardId}` 格式的数据不会被删除
3. **防护机制**：三层防护确保不会重复创建
4. **日志增强**：便于调试和追踪问题
