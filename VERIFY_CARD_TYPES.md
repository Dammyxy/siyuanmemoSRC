# 验证卡片类型修复

## 问题诊断

根据日志 `Card type distribution: {undefined: 45}`，所有卡片的 `type` 字段都是 `undefined`。

这说明：
1. **思源笔记还在运行旧代码**（没有重启）
2. 旧代码硬编码 `type: 'item'`，但是没有正确保存到本地存储

## 修复步骤

### 1. 重启思源笔记（必须！）

**重要**：必须完全关闭思源笔记，然后重新启动。只有这样才能加载新编译的代码。

### 2. 验证块属性中的类型信息

在浏览器控制台运行以下脚本，检查块属性中是否有正确的类型信息：

```javascript
// 查询所有闪卡块的类型属性
const result = await fetch('/api/query/sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        stmt: `
            SELECT 
                b.id,
                b.content,
                a1.value as card_id,
                a2.value as card_type
            FROM blocks b
            LEFT JOIN attributes a1 ON b.id = a1.block_id AND a1.name = 'custom-fsrs-card-id'
            LEFT JOIN attributes a2 ON b.id = a2.block_id AND a2.name = 'custom-fsrs-card-type'
            WHERE a1.value IS NOT NULL AND a1.value != ''
            LIMIT 50
        `
    })
});

const data = await result.json();
console.log('闪卡块属性：', data.data);

// 统计类型分布
const typeStats = data.data.reduce((acc, row) => {
    const type = row.card_type || 'undefined';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
}, {});
console.log('类型分布（块属性）：', typeStats);
```

**预期结果**：
- 如果块属性中有 `card_type`（topic/item），说明块属性是正确的
- 如果块属性中没有 `card_type`（undefined），说明需要重新制作闪卡

### 3. 删除所有卡片并重新制作

如果块属性中没有 `card_type`，需要：

1. **取消所有闪卡标记**（右键 → 取消闪卡）
2. **重新制作闪卡**（右键 → 选中制卡）

新代码会自动检测类型并设置块属性。

### 4. 验证本地存储中的类型信息

在浏览器控制台运行以下脚本，检查本地存储中的卡片类型：

```javascript
// 获取所有卡片
const cards = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs')
    .storage.getAllCards();

console.log(`总卡片数：${cards.length}`);

// 统计类型分布
const typeStats = cards.reduce((acc, card) => {
    const type = card.type || 'undefined';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
}, {});
console.log('类型分布（本地存储）：', typeStats);

// 显示前5张卡片的详细信息
console.log('前5张卡片：', cards.slice(0, 5).map(c => ({
    id: c.id.substring(0, 8),
    blockId: c.blockId.substring(0, 8),
    type: c.type,
    priority: c.priority,
    state: c.state
})));
```

**预期结果**：
- 类型分布应该显示 `{topic: X, item: Y}`，而不是 `{undefined: 45}`

### 5. 验证队列过滤

在浏览器控制台运行以下脚本，测试队列过滤：

```javascript
// 获取提取练习队列
const queue = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs')
    .retrievalQueue;

// 获取队列中的卡片
const cards = await queue.getCards();

console.log(`提取练习队列卡片数：${cards.length}`);

// 统计类型分布
const typeStats = cards.reduce((acc, card) => {
    const type = card.type || 'undefined';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
}, {});
console.log('类型分布（提取练习队列）：', typeStats);
```

**预期结果**：
- 提取练习队列应该只包含 `item` 类型的卡片
- 类型分布应该显示 `{item: X}`

## 常见问题

### Q1: 为什么重新制作闪卡后，类型还是 undefined？

**A**: 可能是因为没有重启思源笔记。必须完全关闭思源笔记，然后重新启动。

### Q2: 块属性中有 card_type，但本地存储中没有？

**A**: 这说明本地存储没有从块属性同步类型信息。需要运行以下脚本手动同步：

```javascript
// 手动同步块属性到本地存储
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs');
const cards = plugin.storage.getAllCards();

let updated = 0;

for (const card of cards) {
    // 查询块属性
    const result = await fetch('/api/attr/getBlockAttrs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: card.blockId })
    });
    
    const attrs = await result.json();
    const cardType = attrs.data?.['custom-fsrs-card-type'];
    
    if (cardType && (cardType === 'topic' || cardType === 'item')) {
        // 更新本地存储
        card.type = cardType;
        plugin.storage.setCard(card);
        updated++;
    }
}

if (updated > 0) {
    await plugin.storage.saveCards();
    console.log(`✅ 已更新 ${updated} 张卡片的类型`);
} else {
    console.log('⚠️ 没有找到需要更新的卡片');
}
```

### Q3: 如何批量设置块属性？

**A**: 如果块属性中没有 `card_type`，可以运行以下脚本批量检测并设置：

```javascript
// 批量检测并设置卡片类型
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs');
const cards = plugin.storage.getAllCards();

console.log(`开始检测 ${cards.length} 张卡片的类型...`);

let updated = 0;

for (const card of cards) {
    try {
        // 动态导入 detectCardType
        const { detectCardType } = await import('/plugins/siyuan-plugin-fsrs/index.js');
        const cardType = await detectCardType(card.blockId);
        
        // 设置块属性
        await fetch('/api/attr/setBlockAttrs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: card.blockId,
                attrs: {
                    'custom-fsrs-card-type': cardType
                }
            })
        });
        
        // 更新本地存储
        card.type = cardType;
        plugin.storage.setCard(card);
        updated++;
        
        if (updated % 10 === 0) {
            console.log(`已处理 ${updated}/${cards.length} 张卡片...`);
        }
    } catch (err) {
        console.error(`处理卡片 ${card.id} 失败:`, err);
    }
}

if (updated > 0) {
    await plugin.storage.saveCards();
    console.log(`✅ 已更新 ${updated} 张卡片的类型`);
} else {
    console.log('⚠️ 没有找到需要更新的卡片');
}
```

## 总结

修复步骤：
1. ✅ 编译插件（已完成）
2. ⏳ **重启思源笔记**（必须！）
3. ⏳ 删除所有卡片并重新制作
4. ⏳ 验证卡片类型是否正确
5. ⏳ 验证队列过滤是否正确
