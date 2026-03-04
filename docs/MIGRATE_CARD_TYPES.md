# 批量修复卡片类型 - 使用指南

## 问题说明

由于之前 `XiuyuanRepository` 将所有卡片类型硬编码为 `'item'`，导致数据库中的卡片类型不正确。虽然已经修复了代码，但已存在的卡片仍然是错误的类型。

## 解决方案

运行迁移脚本，重新检测所有卡片的类型并更新数据库。

## 使用方法

### 方法 1：在浏览器控制台运行（推荐）

1. 打开思源笔记
2. 按 `F12` 打开开发者工具
3. 切换到 "Console" 标签
4. 粘贴以下代码并按回车：

```javascript
(async function() {
    const storage = window.siyuan.storage.get('siyuanmemo-unified-storage');
    const allCards = storage.getAllCards();
    
    console.log(`总共 ${allCards.length} 张卡片`);
    
    // 统计类型分布
    const stats = {};
    allCards.forEach(card => {
        const type = card.type || 'undefined';
        stats[type] = (stats[type] || 0) + 1;
    });
    
    console.log('类型分布:', stats);
    
    // 如果所有卡片都是 item，说明需要迁移
    if (stats['item'] === allCards.length) {
        console.log('⚠️ 所有卡片都是 item 类型，需要运行迁移脚本');
        console.log('请运行: node migrate-card-types.js');
    }
})();
```

### 方法 2：使用 Node.js 脚本

1. 确保思源笔记已关闭（避免数据冲突）
2. 在插件目录下运行：

```bash
node migrate-card-types.js
```

3. 等待脚本完成
4. 重新打开思源笔记

## 预期结果

修复后，卡片类型分布应该类似：

```
修复前：
  - item: 56 张
  - undefined: 0 张

修复后：
  - item: 30 张
  - topic: 26 张
```

## 验证步骤

1. 打开卡片浏览器
2. 切换到"全部闪卡"视图
3. 检查"卡片类型"列，应该能看到 `item` 和 `topic` 两种类型
4. 切换到"提取练习队列"
5. 在类型筛选中选择 "topic-only"
6. 应该只显示 topic 类型的卡片

## 注意事项

1. **备份数据**：运行脚本前建议备份 `workspace/data/storage/siyuanmemo/` 目录
2. **关闭思源**：使用 Node.js 脚本时，确保思源笔记已关闭
3. **检查日志**：脚本会输出详细的日志，注意查看是否有错误

## 故障排除

### 问题：脚本运行失败

**解决方案**：
1. 检查是否已编译插件：`npm run build`
2. 检查 `dist/` 目录是否存在
3. 查看错误日志，确定具体问题

### 问题：类型仍然不正确

**解决方案**：
1. 检查 `CardTypeDetectionService` 的检测规则是否正确
2. 手动检查几个块的内容，确认应该是什么类型
3. 在控制台运行单个卡片的检测：

```javascript
const service = new CardTypeDetectionService();
const type = await service.detectCardType('20211020084142-v4m7d1n');
console.log('检测结果:', type);
```

## 相关文档

- [队列视图类型筛选失效修复](./kiro/specs/bugfix/queue-cardtype-filter-fix-complete.md)
- [CardTypeDetectionService 文档](./src/core/xiuyuan/domain/services/CardTypeDetectionService.ts)
