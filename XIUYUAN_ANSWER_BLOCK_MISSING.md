# Xiuyuan 模板卡答案块缺失问题

## 问题描述

用户反馈 Xiuyuan 模板卡看不到背面答案块。

## 日志分析

```
[SubsetPracticeAdapter] toUIState - answerBlockID: {
  itemBlockID: '20260206114026-xgfrmu8',
  itemCardID: '20260206114036-688y066',
  hasMeta: true,
  meta: Proxy(Object),
  answerBlockID: ''  // ❌ 空字符串
}
```

## 根本原因

### 1. 数据流程

```
XiuyuanService.createFromBlocks()
  ↓ 创建 FSRSCard，设置 meta.answerBlockID
StorageManager.setCard()
  ↓ 保存到内存
StorageManager.saveCards()
  ↓ 持久化到文件
SubsetPracticeStrategy.next()
  ↓ 从 storage 加载卡片
  ↓ 提取 meta.answerBlockID
SubsetPracticeAdapter.toUIState()
  ↓ 传递给 UI
ReviewContent.vue
  ↓ 渲染答案块
```

### 2. 可能的原因

#### 原因 A: 旧卡片没有 answerBlockID

在修复之前创建的 Xiuyuan 卡片可能没有 `meta.answerBlockID` 字段。

**验证方法**：
1. 打开浏览器控制台
2. 查看日志：`[SubsetPracticeStrategy] ✅ Loaded card meta from storage`
3. 检查 `meta` 对象是否包含 `answerBlockID`

#### 原因 B: blockID 匹配失败

`SubsetPracticeStrategy.next()` 尝试通过 `blockID` 查找卡片，但可能因为字段名不匹配（`blockID` vs `blockId`）导致查找失败。

**代码**：
```typescript
const card = allCards.find(c => 
  c.blockID === head.blockID || 
  (c as any).blockId === head.blockID ||  // ✅ 已添加降级方案
  c.cardID === head.blockID
);
```

#### 原因 C: meta 未正确保存

`XiuyuanService.createFromBlocks()` 创建了 FSRSCard 并设置了 `meta.answerBlockID`，但可能在保存时丢失。

**检查点**：
- `StorageManager.setCard()` 是否正确保存 meta
- `StorageManager.saveCards()` 是否正确序列化 meta
- 文件中的 JSON 数据是否包含 meta

## 诊断步骤

### 步骤 1: 检查现有卡片的 meta

在浏览器控制台运行：

```javascript
// 获取 storage manager
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs');
const storage = plugin?.storageManager;

// 查找问题卡片
const card = storage?.getCard('20260206114036-688y066');
console.log('Card meta:', card?.meta);
console.log('Has answerBlockID:', !!card?.meta?.answerBlockID);
```

### 步骤 2: 检查所有 Xiuyuan 卡片

```javascript
const allCards = storage?.getAllCards() || [];
const xiuyuanCards = allCards.filter(c => c.meta?.xiuyuanID);

console.log('Total Xiuyuan cards:', xiuyuanCards.length);
console.log('Cards with answerBlockID:', xiuyuanCards.filter(c => c.meta?.answerBlockID).length);
console.log('Cards without answerBlockID:', xiuyuanCards.filter(c => !c.meta?.answerBlockID).length);

// 打印前3张没有 answerBlockID 的卡片
const cardsWithoutAnswer = xiuyuanCards.filter(c => !c.meta?.answerBlockID).slice(0, 3);
console.log('Sample cards without answerBlockID:', cardsWithoutAnswer.map(c => ({
  cardID: c.id,
  blockID: c.blockId,
  meta: c.meta,
})));
```

### 步骤 3: 检查文件中的数据

1. 打开 `data/storage/petal/siyuan-plugin-fsrs/cards.json`
2. 搜索 `20260206114036-688y066`
3. 检查该卡片的 `meta` 字段

## 修复方案

### 方案 1: 数据迁移脚本（推荐）

为旧的 Xiuyuan 卡片补充 `answerBlockID` 字段。

```typescript
/**
 * 迁移脚本：为 Xiuyuan 卡片补充 answerBlockID
 */
async function migrateXiuyuanAnswerBlocks(
  storageManager: StorageManager,
  xiuyuanService: XiuyuanService
): Promise<{ updated: number; skipped: number; errors: number }> {
  const allCards = storageManager.getAllCards();
  const xiuyuanCards = allCards.filter(c => c.meta?.xiuyuanID && !c.meta?.answerBlockID);
  
  console.log(`[Migration] Found ${xiuyuanCards.length} Xiuyuan cards without answerBlockID`);
  
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const card of xiuyuanCards) {
    try {
      // 从 Xiuyuan 数据中获取答案块 ID
      const xiuyuan = xiuyuanService.getXiuyuan(card.meta.xiuyuanID);
      if (!xiuyuan) {
        console.warn(`[Migration] Xiuyuan not found: ${card.meta.xiuyuanID}`);
        skipped++;
        continue;
      }
      
      // Xiuyuan 的第二个块是答案块
      const answerBlockID = xiuyuan.blockIDs.length > 1 ? xiuyuan.blockIDs[1] : undefined;
      if (!answerBlockID) {
        console.warn(`[Migration] No answer block for card: ${card.id}`);
        skipped++;
        continue;
      }
      
      // 更新 meta
      card.meta.answerBlockID = answerBlockID;
      storageManager.setCard(card);
      updated++;
      
      console.log(`[Migration] Updated card ${card.id} with answerBlockID: ${answerBlockID}`);
    } catch (error) {
      console.error(`[Migration] Failed to update card ${card.id}:`, error);
      errors++;
    }
  }
  
  // 保存
  await storageManager.saveCards();
  
  console.log(`[Migration] Complete: updated=${updated}, skipped=${skipped}, errors=${errors}`);
  return { updated, skipped, errors };
}
```

### 方案 2: 运行时降级方案

如果 `meta.answerBlockID` 不存在，从 Xiuyuan 数据中动态获取。

```typescript
// 在 SubsetPracticeAdapter.toUIState() 中
answerBlockID: (() => {
  let answerBlockID = String((item as any)?.meta?.answerBlockID || '');
  
  // 🆕 降级方案：如果没有 answerBlockID，从 Xiuyuan 数据中获取
  if (!answerBlockID && (item as any)?.meta?.xiuyuanID) {
    try {
      const xiuyuan = this.xiuyuanService?.getXiuyuan((item as any).meta.xiuyuanID);
      if (xiuyuan && xiuyuan.blockIDs.length > 1) {
        answerBlockID = xiuyuan.blockIDs[1];
        console.log('[SubsetPracticeAdapter] Fallback: got answerBlockID from Xiuyuan:', answerBlockID);
      }
    } catch (error) {
      console.error('[SubsetPracticeAdapter] Failed to get answerBlockID from Xiuyuan:', error);
    }
  }
  
  console.log('[SubsetPracticeAdapter] toUIState - answerBlockID:', {
    itemBlockID: (item as any)?.blockID,
    itemCardID: (item as any)?.cardID,
    hasMeta: !!(item as any)?.meta,
    meta: (item as any)?.meta,
    answerBlockID,
  });
  
  return answerBlockID;
})(),
```

### 方案 3: 手动修复（临时）

用户可以手动重新创建 Xiuyuan 卡片：
1. 删除旧的 Xiuyuan 卡片
2. 重新使用 Xiuyuan 模板创建卡片
3. 新卡片会自动包含 `answerBlockID`

## 实施建议

1. **立即实施方案 2**（运行时降级方案）- 快速修复，不需要数据迁移
2. **后续实施方案 1**（数据迁移脚本）- 彻底解决问题，清理数据
3. **提供方案 3**（手动修复）- 作为用户的临时解决方案

## 测试步骤

1. 实施方案 2（运行时降级方案）
2. 重新编译插件
3. 打开 Xiuyuan 模板卡进行复习
4. 检查是否能看到答案块
5. 查看控制台日志，确认降级方案是否生效

## 相关文件

- `siyuan-plugin-fsrs/src/ui/review/v2/adapters/SubsetPracticeAdapter.ts` - UI 适配器
- `siyuan-plugin-fsrs/src/core/queue/strategies/SubsetPracticeStrategy.ts` - 队列策略
- `siyuan-plugin-fsrs/src/core/xiuyuan/service.ts` - Xiuyuan 服务
- `siyuan-plugin-fsrs/src/core/storage/manager.ts` - 存储管理器
