# 调试卡片类型问题

## 问题现象

日志显示：
```
[AdvancedDataRouter] 🔍 Card type distribution: {item: 45}
```

**所有 45 张卡片都被设置为 `item` 类型**，没有 `topic` 类型。

## 诊断步骤

### 1. 检查块属性中的类型信息

在浏览器控制台运行：

```javascript
// 查询所有闪卡块的类型属性
const result = await fetch('/api/query/sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        stmt: `
            SELECT 
                b.id,
                b.type as block_type,
                b.content,
                a1.value as card_id,
                a2.value as card_type
            FROM blocks b
            LEFT JOIN attributes a1 ON b.id = a1.block_id AND a1.name = 'custom-fsrs-card-id'
            LEFT JOIN attributes a2 ON b.id = a2.block_id AND a2.name = 'custom-fsrs-card-type'
            WHERE a1.value IS NOT NULL AND a1.value != ''
            ORDER BY b.id
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

// 统计块类型分布
const blockTypeStats = data.data.reduce((acc, row) => {
    const type = row.block_type || 'undefined';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
}, {});
console.log('块类型分布：', blockTypeStats);

// 显示前10张卡片的详细信息
console.table(data.data.slice(0, 10).map(row => ({
    id: row.id.substring(0, 12),
    block_type: row.block_type,
    card_type: row.card_type || 'undefined',
    content: row.content.substring(0, 30)
})));
```

**预期结果**：
- 如果块属性中 `card_type` 全是 `item`，说明 `detectCardType()` 函数有问题
- 如果块属性中 `card_type` 有 `topic` 和 `item`，说明本地存储同步有问题

### 2. 手动测试 detectCardType 函数

选择一个应该是 `topic` 的块（例如纯段落块），在浏览器控制台运行：

```javascript
// 测试 detectCardType 函数
const blockId = '20231109231904-93zm15d'; // 替换为实际的块 ID

// 查询块信息
const blockResult = await fetch('/api/query/sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        stmt: `
            SELECT id, type, content, markdown
            FROM blocks
            WHERE id = '${blockId}'
        `
    })
});

const blockData = await blockResult.json();
console.log('块信息：', blockData.data[0]);

// 检查是否有子级
const childResult = await fetch('/api/query/sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        stmt: `
            SELECT id, type, content
            FROM blocks
            WHERE parent_id = '${blockId}'
            AND type != 'd'
            LIMIT 10
        `
    })
});

const childData = await childResult.json();
console.log('子级块：', childData.data);

// 检查是否包含 :: 分隔符或 == 标记
const content = blockData.data[0].content;
const markdown = blockData.data[0].markdown;
const hasDoubleSeparator = /::/.test(content);
const hasMarkSyntax = /==([^=]+)==/.test(markdown) || /==([^=]+)==/.test(content);

console.log('检测结果：', {
    blockType: blockData.data[0].type,
    hasDoubleSeparator,
    hasMarkSyntax,
    hasChildren: childData.data.length > 0,
    expectedType: hasDoubleSeparator || hasMarkSyntax || childData.data.length > 0 ? 'item' : 'topic'
});
```

### 3. 检查 detectCardType 的日志

在浏览器控制台查看 `detectCardType()` 的日志输出：

```javascript
// 过滤 FSRS 相关的日志
// 在控制台中输入：custom-fsrs
// 然后重新制作一张闪卡，观察日志
```

查找类似这样的日志：
```
[FSRS] Block 20231109: Item (:: separator found)
[FSRS] Block 20231109: Topic (type: p, no answer blocks)
```

### 4. 批量检查卡片类型检测逻辑

```javascript
// 获取所有卡片的块 ID
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs');
const cards = plugin.storage.getAllCards();
const blockIds = cards.map(c => c.blockId);

console.log(`开始检查 ${blockIds.length} 张卡片的检测逻辑...`);

// 批量查询块信息
const result = await fetch('/api/query/sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        stmt: `
            SELECT 
                b.id,
                b.type,
                b.content,
                b.markdown,
                (SELECT COUNT(*) FROM blocks WHERE parent_id = b.id AND type != 'd') as child_count
            FROM blocks b
            WHERE b.id IN (${blockIds.map(id => `'${id}'`).join(',')})
        `
    })
});

const data = await result.json();

// 分析每张卡片的检测逻辑
const analysis = data.data.map(row => {
    const hasDoubleSeparator = /::/.test(row.content);
    const hasMarkSyntax = /==([^=]+)==/.test(row.markdown) || /==([^=]+)==/.test(row.content);
    const hasChildren = row.child_count > 0;
    const isHeading = row.type === 'h';
    
    let reason = '';
    let expectedType = 'topic';
    
    if (hasMarkSyntax) {
        reason = 'mark syntax (==)';
        expectedType = 'item';
    } else if (hasDoubleSeparator) {
        reason = ':: separator';
        expectedType = 'item';
    } else if (isHeading) {
        reason = 'heading block';
        expectedType = 'item';
    } else if (row.type === 'i' && hasChildren) {
        reason = 'list item with children';
        expectedType = 'item';
    } else if (row.type === 's' && hasChildren) {
        reason = 'super block with children';
        expectedType = 'item';
    } else {
        reason = `no answer blocks (type: ${row.type})`;
        expectedType = 'topic';
    }
    
    return {
        id: row.id.substring(0, 12),
        type: row.type,
        child_count: row.child_count,
        expectedType,
        reason,
        content: row.content.substring(0, 30)
    };
});

// 统计预期类型分布
const expectedTypeStats = analysis.reduce((acc, item) => {
    acc[item.expectedType] = (acc[item.expectedType] || 0) + 1;
    return acc;
}, {});

console.log('预期类型分布：', expectedTypeStats);
console.table(analysis.slice(0, 20));

// 找出所有应该是 topic 的卡片
const topicCards = analysis.filter(item => item.expectedType === 'topic');
console.log(`应该是 topic 的卡片：${topicCards.length} 张`);
console.table(topicCards.slice(0, 10));
```

## 可能的问题

### 问题 1: detectCardType 函数逻辑错误

如果所有卡片都被检测为 `item`，可能是因为：

1. **标题块（'h'）被硬编码为 item**
   - 检查：是否所有卡片都是标题块？
   - 解决：修改 `detectCardType.ts` 中的逻辑

2. **列表项块（'i'）的子级检测有问题**
   - 检查：列表项块是否错误地检测到了子级？
   - 解决：修改子级检测逻辑，只检查列表类型的子级

3. **段落块（'p'）被错误地检测为 item**
   - 检查：段落块是否有 `::` 分隔符或 `==` 标记？
   - 解决：检查正则表达式是否正确

### 问题 2: 块属性设置错误

如果块属性中的 `card_type` 全是 `item`，但实际应该有 `topic`，说明：

1. **markBlockAsCard 函数没有正确设置块属性**
   - 检查：`markBlockAsCard()` 是否正确接收了 `cardType` 参数？
   - 解决：检查 `BlockMenu.ts` 中的调用

2. **detectCardType 返回值有问题**
   - 检查：`detectCardType()` 是否总是返回 `'item'`？
   - 解决：添加日志输出，查看返回值

### 问题 3: 本地存储同步错误

如果块属性中有正确的 `topic` 和 `item`，但本地存储中全是 `item`，说明：

1. **storage.setCard 没有正确保存 type 字段**
   - 检查：`card.type` 是否被正确设置？
   - 解决：检查 `BlockMenu.ts` 中的 `card.type = cardType` 语句

2. **storage.saveCards 没有正确持久化**
   - 检查：`saveCards()` 是否被调用？
   - 解决：添加日志输出，确认保存操作

## 下一步

根据上面的诊断结果，确定问题所在：

1. **如果块属性中 card_type 全是 item**：
   - 问题在 `detectCardType()` 函数
   - 需要修复检测逻辑

2. **如果块属性中有 topic 和 item，但本地存储全是 item**：
   - 问题在本地存储同步
   - 需要运行同步脚本

3. **如果预期类型分布显示应该有 topic**：
   - 说明检测逻辑有问题
   - 需要修复 `detectCardType.ts`
