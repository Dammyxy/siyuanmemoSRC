# 快速制卡答案渲染 - 调试指南

**创建时间**：2026-02-15  
**状态**：调试中

---

## 问题：答案渲染没有起作用

### 可能的原因

1. **卡片还没有重新加载**
   - 旧的卡片没有 `cardSource: 'quick-symbol'` 元数据
   - 需要删除旧卡片，重新创建

2. **插件没有重新构建**
   - 代码修改后需要重新构建
   - 需要重启思源或重新加载插件

3. **卡片在不同的队列中**
   - 快速制卡渲染只在统一队列中生效
   - 需要确认使用的是哪个队列

---

## 调试步骤

### 步骤 1：检查卡片元数据

在浏览器控制台中运行：

```javascript
// 获取插件实例
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');

// 获取卡片
const card = plugin.storage.getCardByBlockId('20260215132056-no2qm2b');

// 检查元数据
console.log('Card meta:', card?.meta);
console.log('cardSource:', card?.meta?.cardSource);
console.log('symbolType:', card?.meta?.symbolType);
console.log('question:', card?.meta?.question);
console.log('answer:', card?.meta?.answer);
```

**预期输出**：
```javascript
{
  cardSource: 'quick-symbol',
  symbolType: '>>',  // 或 '<<', '<>', '::', ';;', '{{}}'
  question: '测试',
  answer: '答案'
}
```

**如果没有这些字段**：
- 卡片是旧版本创建的
- 需要删除卡片，重新输入符号创建

### 步骤 2：检查 Adapter 日志

在浏览器控制台中查找以下日志：

```
[UnifiedReviewAdapter] Card check: {
  blockId: "...",
  isQuickCard: true,
  symbolType: ">>",
  cardSource: "quick-symbol",
  meta: {...}
}
```

**如果看到 `isQuickCard: false`**：
- 卡片元数据不正确
- 需要重新创建卡片

**如果看到 `isQuickCard: true`**：
- 应该会看到下一行日志：`[UnifiedReviewAdapter] Using quick card rendering`
- 如果没有看到，检查代码是否正确

### 步骤 3：重新创建卡片

1. 删除旧卡片
   - 在块菜单中选择"从 Riff 中移除"
   - 或者在卡片浏览器中删除

2. 重新输入符号
   ```
   测试 >> 答案
   ```

3. 等待 300ms（防抖时间）

4. 检查是否创建成功
   - 应该看到提示：`✅ 已创建正向卡片 (>>)`

5. 打开复习对话框测试

### 步骤 4：重新构建插件

如果修改了代码：

```bash
cd siyuan-plugin-siyuanmemo
npm run build
```

然后重启思源或重新加载插件。

### 步骤 5：检查队列类型

快速制卡渲染只在使用 `UnifiedReviewAdapter` 的队列中生效。

检查当前使用的队列：

```javascript
// 在复习对话框打开时运行
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const dialog = plugin.reviewDialog;

console.log('Queue type:', dialog?.queue?.getType?.());
console.log('Adapter:', dialog?.adapter?.constructor?.name);
```

**预期输出**：
```
Queue type: "retrieval-practice" (或其他统一队列类型)
Adapter: "UnifiedReviewAdapter"
```

---

## 完整诊断脚本

将以下脚本复制到浏览器控制台中运行：

```javascript
(async function diagnoseQuickCard() {
  console.log('=== 快速制卡答案渲染诊断 ===\n');
  
  // 1. 检查插件
  const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
  if (!plugin) {
    console.error('❌ 插件未找到');
    return;
  }
  console.log('✅ 插件已加载');
  
  // 2. 检查 UnifiedReviewAdapter
  try {
    const { UnifiedReviewAdapter } = await import('./src/strategies/UnifiedReviewAdapter.ts');
    console.log('✅ UnifiedReviewAdapter 已加载');
  } catch (error) {
    console.error('❌ UnifiedReviewAdapter 加载失败:', error);
  }
  
  // 3. 检查快速制卡
  const cards = plugin.storage.getAllCards();
  const quickCards = cards.filter(c => c.meta?.cardSource === 'quick-symbol');
  
  console.log('\n📊 卡片统计:');
  console.log('   总卡片数:', cards.length);
  console.log('   快速制卡数:', quickCards.length);
  
  if (quickCards.length > 0) {
    console.log('\n📋 快速制卡列表:');
    quickCards.forEach((card, index) => {
      console.log(`   ${index + 1}. ${card.blockId}`);
      console.log(`      符号: ${card.meta.symbolType}`);
      console.log(`      问题: ${card.meta.question || card.meta.concept || '(无)'}`);
      console.log(`      答案: ${card.meta.answer || card.meta.definition || '(无)'}`);
    });
  } else {
    console.log('\n⚠️ 没有找到快速制卡');
    console.log('💡 请尝试:');
    console.log('   1. 输入: 测试 >> 答案');
    console.log('   2. 等待 300ms');
    console.log('   3. 检查是否创建成功');
  }
  
  // 4. 检查复习对话框
  if (plugin.reviewDialog) {
    console.log('\n✅ 复习对话框已打开');
    console.log('   队列类型:', plugin.reviewDialog.queue?.getType?.() || '(未知)');
    console.log('   适配器:', plugin.reviewDialog.adapter?.constructor?.name || '(未知)');
  } else {
    console.log('\n⚠️ 复习对话框未打开');
    console.log('💡 请打开复习对话框测试');
  }
  
  console.log('\n=== 诊断完成 ===');
})();
```

---

## 常见问题

### Q1: 为什么我的卡片还是显示完整的块内容？

**A**: 可能是以下原因：

1. 卡片是旧版本创建的，没有 `cardSource: 'quick-symbol'` 元数据
   - 解决方法：删除旧卡片，重新创建

2. 使用的不是统一队列
   - 解决方法：确认使用的是"提取练习"等统一队列

3. 代码没有重新构建
   - 解决方法：运行 `npm run build` 并重启思源

### Q2: 如何确认卡片是快速制卡？

**A**: 在浏览器控制台中运行：

```javascript
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const card = plugin.storage.getCardByBlockId('你的块ID');
console.log('是否为快速制卡:', card?.meta?.cardSource === 'quick-symbol');
```

### Q3: 符号能隐藏吗？

**A**: 可以！已经修改代码，符号不会显示在复习界面中。只显示：
- 正面：问题
- 背面：问题 + 分隔线 + 答案

分隔线中不再显示符号（`>>`, `::` 等）。

### Q4: 如何批量更新旧卡片？

**A**: 目前没有自动迁移功能，需要手动操作：

1. 导出卡片数据（如果需要保留复习记录）
2. 删除旧卡片
3. 重新输入符号创建新卡片
4. 导入复习记录（如果需要）

或者等待后续版本的自动迁移功能。

---

## 下一步

如果完成所有诊断步骤后问题仍然存在：

1. 收集调试信息（使用上面的诊断脚本）
2. 查看完整的控制台日志
3. 检查是否有 JavaScript 错误
4. 尝试重启思源笔记
5. 尝试重新构建插件: `npm run build`

---

**祝调试顺利!** 🔧
