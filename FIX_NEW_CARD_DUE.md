# 修复新卡片 due 字段的临时脚本

## 问题描述

新创建的卡片（state=0, New）的 `due` 字段被设置为明天凌晨 4:17，而不是当前时间。
这导致这些卡片不满足"到期"条件，无法出现在提取练习队列中。

**根本原因**：当用户"重置闪卡"（取消 + 重新制作）时，HybridSyncService 从 Riff 同步了旧卡片数据，导致本地有重复卡片。

## 临时修复脚本

在浏览器控制台中运行以下代码：

```javascript
(async () => {
    // 获取插件实例
    const plugin = window.siyuan?.ws?.app?.plugins?.find(p => p.name === 'siyuan-plugin-fsrs');
    
    if (!plugin) {
        console.error('❌ 未找到 FSRS 插件');
        return;
    }
    
    console.log('✅ 找到 FSRS 插件');
    
    // 获取所有卡片
    const allCards = plugin.storage.getAllCards();
    console.log(`📊 总共 ${allCards.length} 张卡片`);
    
    // 按 blockId 分组，找出重复卡片
    const cardsByBlock = new Map();
    for (const card of allCards) {
        if (!cardsByBlock.has(card.blockId)) {
            cardsByBlock.set(card.blockId, []);
        }
        cardsByBlock.get(card.blockId).push(card);
    }
    
    // 找出重复的块
    const duplicates = [];
    for (const [blockId, cards] of cardsByBlock.entries()) {
        if (cards.length > 1) {
            duplicates.push({ blockId, cards });
        }
    }
    
    console.log(`🔍 找到 ${duplicates.length} 个重复的块`);
    
    if (duplicates.length === 0) {
        console.log('✅ 没有重复卡片');
        
        // 检查新卡片的 due 字段
        const now = Date.now();
        const newCards = allCards.filter(card => card.state === 0);
        console.log(`📊 找到 ${newCards.length} 张新卡片`);
        
        let fixedCount = 0;
        for (const card of newCards) {
            if (card.due > now) {
                console.log(`🔧 修复卡片 ${card.id}: due 从 ${new Date(card.due).toISOString()} 改为 ${new Date(now).toISOString()}`);
                card.due = now;
                plugin.storage.setCard(card);
                fixedCount++;
            }
        }
        
        if (fixedCount > 0) {
            await plugin.storage.saveCards();
            console.log(`✅ 已修复 ${fixedCount} 张卡片的 due 字段`);
        } else {
            console.log('✅ 所有新卡片的 due 字段都正常');
        }
        
        return;
    }
    
    // 对于每个重复的块，保留最新的卡片（createdAt 最大）
    let removedCount = 0;
    for (const { blockId, cards } of duplicates) {
        // 按 createdAt 排序，保留最新的
        cards.sort((a, b) => b.createdAt - a.createdAt);
        const keepCard = cards[0];
        const removeCards = cards.slice(1);
        
        console.log(`📦 块 ${blockId.substring(0, 8)}...:`);
        console.log(`  ✅ 保留: ${keepCard.id.substring(0, 12)}... (created: ${new Date(keepCard.createdAt).toLocaleString('zh-CN')})`);
        
        for (const card of removeCards) {
            console.log(`  ❌ 删除: ${card.id.substring(0, 12)}... (created: ${new Date(card.createdAt).toLocaleString('zh-CN')})`);
            plugin.storage.removeCard(card.id);
            removedCount++;
        }
    }
    
    // 保存
    if (removedCount > 0) {
        await plugin.storage.saveCards();
        console.log(`✅ 已删除 ${removedCount} 张重复卡片`);
        console.log('🔄 请刷新提取练习队列');
    }
})();
```

## 使用方法

1. 打开思源笔记
2. 按 F12 打开开发者工具
3. 切换到 Console 标签
4. 复制上面的代码并粘贴到控制台
5. 按 Enter 执行
6. 刷新提取练习队列

## 预期结果

- 删除重复的旧卡片
- 保留最新创建的卡片
- 这些卡片将出现在提取练习队列中

## 长期修复

代码已经修改，`HybridSyncService.incrementalSync()` 现在会检查 blockId 是否已有卡片，避免添加重复卡片。

下次插件更新后，这个问题将不会再出现。

