# 验证 Xiuyuan 创建情况

## 问题根源：双重创建流程

### 问题描述

当使用模板制卡时，会触发两个创建流程：

1. **Xiuyuan 系统创建**：通过 `CardApplicationService.createCard()` 创建卡片
2. **Riff 系统创建**：调用 `addRiffCards()` 后，`RiffSyncHandler` 检测到变化，触发 `incrementalSync()`，可能再次创建卡片

### 详细流程分析

```
T0: CreateXiuyuanFromBlocksUseCase.execute() 开始
    ↓
T1: 创建 Xiuyuan 实体 + Card
    ↓
T2: 调用 addRiffCards(deckId, [blockId])
    ├─ 触发 Riff API
    └─ 触发 RiffSyncHandler.handle()
    ↓
T3: xiuyuanRepository.save(xiuyuan)
    ├─ UnifiedStorageManager.xiuyuans.set()
    ├─ UnifiedStorageManager.createCard()
    └─ scheduleSave() (异步保存)
    ↓
T4: (300ms 后) RiffSyncHandler 防抖结束
    ↓
T5: (再 500ms 后) incrementalSync() 开始
    ├─ getRiffNewCards() 获取 Riff 卡片
    ├─ xiuyuanRepository.findById(`xy_riff_${blockId}`)
    └─ 如果找不到 → 再次创建 Xiuyuan ❌
```

### 问题根源

**时间窗口竞态条件**：

1. `CreateXiuyuanFromBlocksUseCase` 在 T2 调用 `addRiffCards()`
2. `RiffSyncHandler` 在 T4-T5 (800ms 后) 触发 `incrementalSync()`
3. 如果 T3 的保存还未完成，或者查询缓存未更新，`incrementalSync()` 会认为卡片不存在
4. 导致重复创建

### 为什么防护机制失效？

代码中有三层防护：

1. **XiuyuanSyncService.incrementalSync()** - 检查 `xiuyuanRepository.findById()`
   - ❌ 如果保存未完成，查询返回 null
   
2. **Xiuyuan.addCard()** - 防止重复添加卡片
   - ❌ 这是新的 Xiuyuan 实例，不会触发
   
3. **UnifiedStorageManager.createCard()** - 防止重复创建
   - ❌ 如果 Xiuyuan ID 不同（如 `xy_123` vs `xy_riff_456`），不会触发

## 解决方案

### 方案 1：在 CreateXiuyuanFromBlocksUseCase 中使用 Riff ID（推荐）

**核心思路**：统一 Xiuyuan ID 格式，使用 `xy_riff_{blockId}`，这样两个流程创建的是同一个 Xiuyuan。

**优点**：
- ✅ 简单直接，修改最少
- ✅ 利用现有的防护机制
- ✅ 不需要额外的状态管理

**缺点**：
- ⚠️ Xiuyuan ID 格式变化，需要迁移旧数据

### 方案 2：在 incrementalSync 中添加时间窗口检查

**核心思路**：跳过最近创建的卡片（如 5 秒内）。

**优点**：
- ✅ 不改变 ID 格式
- ✅ 兼容现有数据

**缺点**：
- ❌ 依赖时间判断，不够可靠
- ❌ 如果用户手动触发同步，可能跳过真正的新卡片

### 方案 3：移除 CreateXiuyuanFromBlocksUseCase 中的 addRiffCards 调用

**核心思路**：不在创建时调用 `addRiffCards()`，让用户手动添加到 Riff。

**优点**：
- ✅ 完全避免双重创建
- ✅ 职责分离清晰

**缺点**：
- ❌ 用户体验变差，需要额外操作
- ❌ 不符合当前的使用习惯

### 推荐方案：方案 1 + 防护增强

结合方案 1 和额外的防护机制：

1. **统一 ID 格式**：在 `CreateXiuyuanFromBlocksUseCase` 中使用 `xy_riff_{blockId}`
2. **增强查询**：在 `incrementalSync()` 中先检查块属性 `custom-xiuyuan-id`
3. **添加日志**：记录创建来源，便于调试

---

## 验证方法

### 方法 1：检查日志（最简单）

在浏览器控制台中运行以下代码：

```javascript
// 获取插件和 UnifiedStorage
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const context = plugin?.context;

// ✅ 使用 getUnifiedStorage() 而不是 getStorage()
const storage = context?.getUnifiedStorage?.();

console.log('Plugin:', !!plugin);
console.log('Context:', !!context);
console.log('UnifiedStorage:', !!storage);
console.log('Storage type:', storage?.constructor?.name);

if (storage) {
  try {
    // 获取所有 Xiuyuan
    const xiuyuans = storage.getAllXiuYuans();
    console.log('✅ Total Xiuyuans:', xiuyuans.length);
    
    // 获取所有 Cards
    const cards = storage.getAllCards();
    console.log('✅ Total Cards:', cards.length);
    
    // 统计有 xiuyuanID 的卡片
    const xiuyuanCards = cards.filter(c => c.meta?.xiuyuanID);
    console.log('✅ Cards with xiuyuanID:', xiuyuanCards.length);
    
    // 统计没有 xiuyuanID 的卡片（旧卡片）
    const legacyCards = cards.filter(c => !c.meta?.xiuyuanID);
    console.log('⚠️ Legacy cards (no xiuyuanID):', legacyCards.length);
    
    // 显示详细信息
    console.log('\n=== Xiuyuan 详情 (前3个) ===');
    xiuyuans.slice(0, 3).forEach((xy, i) => {
      console.log(`${i + 1}. ID: ${xy.id}`);
      console.log(`   BlockIDs: ${xy.blockIDs.join(', ')}`);
      console.log(`   Template: ${xy.templateID}`);
      console.log(`   Cards in meta: ${xy.meta?.cards?.length || 0}`);
    });
    
    console.log('\n=== Card 详情 (前3个) ===');
    cards.slice(0, 3).forEach((card, i) => {
      console.log(`${i + 1}. ID: ${card.id}`);
      console.log(`   BlockID: ${card.blockId}`);
      console.log(`   XiuyuanID: ${card.meta?.xiuyuanID || 'NONE'}`);
      console.log(`   Type: ${card.type}`);
    });
    
    // 如果有旧卡片，显示它们
    if (legacyCards.length > 0) {
      console.log('\n⚠️ Legacy cards (前5个):');
      legacyCards.slice(0, 5).forEach((card, i) => {
        console.log(`${i + 1}. ${card.id} (${card.type})`);
      });
    }
    
    // 总结
    console.log('\n=== 总结 ===');
    console.log(`Xiuyuan 数量: ${xiuyuans.length}`);
    console.log(`Card 总数: ${cards.length}`);
    console.log(`新架构卡片 (有 xiuyuanID): ${xiuyuanCards.length}`);
    console.log(`旧架构卡片 (无 xiuyuanID): ${legacyCards.length}`);
    
    if (xiuyuanCards.length === cards.length) {
      console.log('✅ 所有卡片都已迁移到 Xiuyuan 架构！');
    } else if (xiuyuanCards.length > 0) {
      console.log('⚠️ 部分卡片还是旧架构，需要重新同步');
    } else {
      console.log('❌ 没有 Xiuyuan 卡片，同步可能失败了');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.log('Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(storage)));
  }
}
```

### 方法 2：检查 msgpack 文件

查看保存的 msgpack 文件内容：

```javascript
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const storage = plugin?.context?.getStorage?.();

if (storage) {
  // 触发保存
  await storage.save();
  
  console.log('Data saved to msgpack file');
  console.log('Check the file at: data/storage/siyuan-plugin-siyuanmemo/unified-storage.msgpack');
}
```

### 方法 3：检查同步日志

在同步时查看控制台日志，应该看到：

```
[SiYuanMemo][HybridSync] Adding new card 20210529220522-gpb0ib0
[XiuyuanRepository] Saving Xiuyuan: xy_riff_20210529220522-gpb0ib0
[UnifiedStorage] Saved to msgpack: {version: 1, xiuyuans: 62, cards: 62}
```

## 预期结果

### ✅ 正常情况

1. **Xiuyuan 数量 = Card 数量**
   - 每个 Riff 卡片对应一个 Xiuyuan
   - 例如：62 个 Xiuyuan，62 张 Card

2. **每个 Card 都有 xiuyuanID**
   ```javascript
   card.meta.xiuyuanID === 'xy_riff_20210529220522-gpb0ib0'
   ```

3. **每个 Xiuyuan 包含 1 张 Card**
   ```javascript
   xiuyuan.meta.cards.length === 1
   ```

4. **Xiuyuan ID 格式**
   ```
   xy_riff_{blockId}
   ```

### ❌ 异常情况

1. **Xiuyuan 数量 = 0**
   - 说明 Repository.save() 没有被调用
   - 或者保存失败

2. **Card 没有 xiuyuanID**
   - 说明是旧卡片
   - 或者同步时没有正确设置 meta

3. **Xiuyuan 的 meta.cards 为空**
   - 说明 Card 没有被正确添加到 Xiuyuan
   - 或者序列化时出错

## 调试步骤

### 步骤 1：检查同步是否执行

```javascript
// 手动触发增量同步
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const syncService = plugin?.context?.getXiuyuanSyncService?.();

if (syncService) {
  await syncService.incrementalSync();
  console.log('Sync completed');
}
```

### 步骤 2：检查 Repository 是否正常工作

```javascript
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const repo = plugin?.context?.getXiuyuanRepository?.();

if (repo) {
  // 查找所有 Xiuyuan
  const result = await repo.findAll();
  if (result.ok) {
    console.log('Found Xiuyuans:', result.value.length);
    
    // 检查第一个 Xiuyuan
    if (result.value.length > 0) {
      const xiuyuan = result.value[0];
      console.log('First Xiuyuan:', {
        id: xiuyuan.getId().getValue(),
        cardCount: xiuyuan.getCardCount(),
        cards: xiuyuan.getCards().map(c => c.getId().getValue())
      });
    }
  } else {
    console.error('Failed to find Xiuyuans:', result.error);
  }
}
```

### 步骤 3：检查 Card 是否正确关联

```javascript
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const storage = plugin?.context?.getStorage?.();

if (storage) {
  const cards = storage.getAllCards();
  
  // 检查每个 Card 的 xiuyuanID
  const cardsByXiuyuan = {};
  cards.forEach(card => {
    const xiuyuanID = card.meta?.xiuyuanID || 'no-xiuyuan';
    if (!cardsByXiuyuan[xiuyuanID]) {
      cardsByXiuyuan[xiuyuanID] = [];
    }
    cardsByXiuyuan[xiuyuanID].push(card.id);
  });
  
  console.log('Cards grouped by Xiuyuan:', cardsByXiuyuan);
  console.log('Xiuyuan count:', Object.keys(cardsByXiuyuan).length);
  console.log('Cards without Xiuyuan:', cardsByXiuyuan['no-xiuyuan']?.length || 0);
}
```

## 常见问题

### Q1: 为什么 Xiuyuan 数量是 0？

**可能原因**：
1. Repository.save() 没有被调用
2. 保存时出错（检查控制台错误日志）
3. UnifiedStorage 没有正确序列化 Xiuyuan

**解决方法**：
- 检查 `XiuyuanSyncService.incrementalSync()` 是否正确调用了 `xiuyuanRepository.save()`
- 检查 `XiuyuanRepository.save()` 是否返回成功
- 检查 `UnifiedStorageManager` 是否正确保存了 Xiuyuan

### Q2: 为什么 Card 没有 xiuyuanID？

**可能原因**：
1. 这是旧卡片（同步前就存在）
2. Repository 保存时没有正确设置 meta
3. Card 创建时没有关联 Xiuyuan

**解决方法**：
- 删除所有旧卡片，重新同步
- 检查 `XiuyuanRepository.cardToFSRSCard()` 是否正确设置了 `meta.xiuyuanID`

### Q3: 为什么删除卡片后又回来了？

**可能原因**：
1. 删除操作没有持久化
2. 删除的是 Card，但 Xiuyuan 还在
3. 下次同步时又从 Xiuyuan 重建了 Card

**解决方法**：
- 确保删除时同时删除 Xiuyuan（如果没有其他 Card）
- 检查 `UnifiedStorageManager.deleteCard()` 是否调用了 `scheduleSave()`

## 总结

通过以上验证方法，可以确认：

1. ✅ Riff 卡片同步时是否创建了 Xiuyuan
2. ✅ Xiuyuan 是否包含 Card
3. ✅ Card 是否正确关联到 Xiuyuan
4. ✅ 数据是否正确持久化

如果发现问题，按照调试步骤逐步排查。
