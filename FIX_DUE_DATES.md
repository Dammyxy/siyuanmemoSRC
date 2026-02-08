# 修复卡片到期时间

## 问题
所有 item 卡片的到期时间都是后天 (2026-02-08T20:17:xx),导致它们不会出现在今天的提取练习队列中。

## 解决方案
在浏览器控制台执行以下代码,将所有 item 卡片的到期时间重置为现在:

```javascript
// 1. 获取存储管理器
const storage = window.siyuan.plugins['siyuan-plugin-fsrs'].storage;

// 2. 获取所有 item 卡片
const allCards = storage.getAllCards();
const itemCards = allCards.filter(c => c.type === 'item');

console.log(`找到 ${itemCards.length} 张 item 卡片`);

// 3. 将到期时间设置为现在
const now = Date.now();
let updated = 0;

for (const card of itemCards) {
    if (card.due > now) {
        console.log(`更新卡片 ${card.id}: ${new Date(card.due).toISOString()} -> ${new Date(now).toISOString()}`);
        card.due = now;
        card.updatedAt = now;
        storage.setCard(card);
        updated++;
    }
}

// 4. 保存到磁盘
await storage.saveCards();

console.log(`✅ 已更新 ${updated} 张卡片的到期时间`);
```

## 执行步骤

1. 打开思源笔记
2. 按 F12 打开开发者工具
3. 切换到 Console 标签
4. 复制上面的代码
5. 粘贴到控制台
6. 按回车执行
7. 等待执行完成
8. 刷新提取练习队列

## 验证

执行后,再次打开提取练习队列,应该能看到所有 item 卡片了。
