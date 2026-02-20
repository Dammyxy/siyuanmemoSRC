# 迁移旧 Riff 卡片到 Xiuyuan 架构

## 问题描述

旧的 Riff 卡片没有 `xiuyuanID`，无法被 DDD 新架构删除。错误信息：
```
Card with ID xxx not found in any Xiuyuan
```

## 解决方案

创建数据迁移脚本，为每个旧 Riff 卡片创建对应的 Xiuyuan 聚合根。

## 迁移策略

### 方案 A：为每个旧卡片创建独立的 Xiuyuan（推荐）✅

**优点**：
- 简单直接
- 不会破坏现有数据
- 符合 DDD 架构

**缺点**：
- 会创建很多 Xiuyuan（每个卡片一个）

**实现**：
```javascript
// 为每个旧卡片创建一个 Xiuyuan
// 使用 builtin-legacy-riff 模板
```

### 方案 B：按 blockId 分组，合并到同一个 Xiuyuan

**优点**：
- 减少 Xiuyuan 数量
- 更符合语义（同一个块的卡片属于同一个 Xiuyuan）

**缺点**：
- 复杂度更高
- 需要处理多面卡片的情况

## 迁移脚本

在浏览器控制台执行以下脚本：

```javascript
// ========================================
// 旧 Riff 卡片迁移脚本
// ========================================

async function migrateRiffCardsToXiuyuan() {
  console.log('[Migration] 开始迁移旧 Riff 卡片...');
  
  // 1. 获取插件实例
  const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
  if (!plugin) {
    console.error('[Migration] 插件未找到');
    return;
  }
  
  const context = plugin.getContext();
  const unifiedStorage = context.getUnifiedStorage();
  const xiuyuanService = context.getXiuyuanService();
  
  // 2. 获取所有卡片
  const allCards = unifiedStorage.getAllCards();
  console.log(`[Migration] 总卡片数: ${allCards.length}`);
  
  // 3. 找出没有 xiuyuanID 的旧卡片
  const orphanCards = allCards.filter(card => !card.meta?.xiuyuanID);
  console.log(`[Migration] 找到 ${orphanCards.length} 张旧卡片（没有 xiuyuanID）`);
  
  if (orphanCards.length === 0) {
    console.log('[Migration] ✅ 没有需要迁移的卡片');
    return;
  }
  
  // 4. 为每个旧卡片创建 Xiuyuan
  let migratedCount = 0;
  let failedCount = 0;
  
  for (const card of orphanCards) {
    try {
      // 4.1 生成 Xiuyuan ID
      const xiuyuanId = `xy_legacy_${card.id}`;
      
      // 4.2 检查是否已存在
      const existing = unifiedStorage.getXiuYuan(xiuyuanId);
      if (existing) {
        console.log(`[Migration] ⚠️ Xiuyuan ${xiuyuanId} 已存在，跳过`);
        continue;
      }
      
      // 4.3 创建 Xiuyuan 数据结构
      const xiuyuan = {
        id: xiuyuanId,
        blockIDs: [card.blockId],
        templateID: 'builtin-legacy-riff',  // 使用特殊模板标记旧卡片
        fields: [{
          name: 'legacy-card',
          blockID: card.blockId,
          marker: 'question'
        }],
        meta: {
          priority: card.priority || 0,
          schedulerType: card.schedulerType || 'fsrs-v6',
          faces: [{
            question: card.meta?.content || '',
            answer: '',
            questionBlockId: card.blockId,
            answerBlockId: card.blockId
          }],
          cards: [{
            id: card.id,
            xiuyuanId: xiuyuanId,
            faceIndex: 0,
            scheduleInfo: {
              due: card.due,
              stability: card.stability,
              difficulty: card.difficulty,
              reps: card.reps,
              lapses: card.lapses,
              state: card.state,
              lastReview: card.last_review || card.lastReview || Date.now(),
              elapsedDays: card.elapsed_days || card.elapsedDays || 0,
              scheduledDays: card.scheduled_days || card.scheduledDays || 0,
              learning_step: card.learning_step || 0
            },
            createdAt: card.createdAt || Date.now(),
            updatedAt: card.updatedAt || Date.now()
          }]
        },
        createdAt: card.createdAt || Date.now(),
        updatedAt: card.updatedAt || Date.now()
      };
      
      // 4.4 保存 Xiuyuan 到 UnifiedStorage
      (unifiedStorage as any).xiuyuans.set(xiuyuanId, xiuyuan);
      
      // 4.5 更新卡片的 meta.xiuyuanID
      card.meta = card.meta || {};
      card.meta.xiuyuanID = xiuyuanId;
      
      // 4.6 更新卡片到 UnifiedStorage
      await unifiedStorage.updateCard(card);
      
      migratedCount++;
      console.log(`[Migration] ✅ 迁移卡片 ${card.id} -> Xiuyuan ${xiuyuanId}`);
      
    } catch (error) {
      failedCount++;
      console.error(`[Migration] ❌ 迁移卡片 ${card.id} 失败:`, error);
    }
  }
  
  // 5. 保存到磁盘
  console.log('[Migration] 保存数据到磁盘...');
  await unifiedStorage.save();
  
  // 6. 输出结果
  console.log('[Migration] ========================================');
  console.log(`[Migration] 迁移完成！`);
  console.log(`[Migration] 成功: ${migratedCount} 张`);
  console.log(`[Migration] 失败: ${failedCount} 张`);
  console.log('[Migration] ========================================');
  
  // 7. 验证
  const allXiuyuans = unifiedStorage.getAllXiuYuans();
  const allCardsAfter = unifiedStorage.getAllCards();
  const orphanCardsAfter = allCardsAfter.filter(card => !card.meta?.xiuyuanID);
  
  console.log('[Migration] 验证结果:');
  console.log(`[Migration] - Xiuyuan 总数: ${allXiuyuans.length}`);
  console.log(`[Migration] - 卡片总数: ${allCardsAfter.length}`);
  console.log(`[Migration] - 剩余旧卡片: ${orphanCardsAfter.length}`);
  
  if (orphanCardsAfter.length === 0) {
    console.log('[Migration] ✅ 所有卡片都已迁移！');
  } else {
    console.warn('[Migration] ⚠️ 还有卡片未迁移，请检查日志');
  }
}

// 执行迁移
migrateRiffCardsToXiuyuan();
```

## 执行步骤

1. 打开思源笔记
2. 打开浏览器控制台（F12）
3. 复制上面的脚本
4. 粘贴到控制台并回车执行
5. 等待迁移完成
6. 查看迁移结果

## 验证迁移结果

执行以下命令验证：

```javascript
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const unifiedStorage = plugin.getContext().getUnifiedStorage();

// 检查是否还有旧卡片
const allCards = unifiedStorage.getAllCards();
const orphanCards = allCards.filter(card => !card.meta?.xiuyuanID);

console.log('验证结果:');
console.log('- 总卡片数:', allCards.length);
console.log('- 旧卡片数:', orphanCards.length);
console.log('- Xiuyuan 数:', unifiedStorage.getAllXiuYuans().length);

if (orphanCards.length === 0) {
  console.log('✅ 所有卡片都有 xiuyuanID');
} else {
  console.log('❌ 还有', orphanCards.length, '张卡片没有 xiuyuanID');
  console.log('卡片 IDs:', orphanCards.map(c => c.id));
}
```

## 迁移后测试

1. 重启思源笔记
2. 打开卡片浏览器，确认能看到所有卡片
3. 尝试删除一张卡片，确认删除成功
4. 检查控制台，不应该有 "Card with ID xxx not found in any Xiuyuan" 错误

## 回滚方案

如果迁移出现问题，可以删除 `unified-cards.msgpack` 文件，重新从旧数据恢复：

1. 关闭思源笔记
2. 删除 `data/storage/petal/siyuan-plugin-siyuanmemo/unified-cards.msgpack`
3. 重新打开思源笔记
4. 插件会从旧的 `cards.msgpack` 重新加载数据

## 注意事项

1. **备份数据**：迁移前建议备份整个 `data/storage/petal/siyuan-plugin-siyuanmemo/` 目录
2. **关闭同步**：迁移期间建议关闭 Riff 同步，避免冲突
3. **一次性操作**：迁移脚本是幂等的，可以多次执行，已迁移的卡片会被跳过
4. **模板标记**：迁移后的卡片使用 `builtin-legacy-riff` 模板，可以在后续手动调整

## 后续优化

迁移完成后，可以考虑：

1. 将同一个 blockId 的多张卡片合并到同一个 Xiuyuan
2. 为迁移的卡片添加更详细的元数据
3. 清理不再使用的旧数据文件
