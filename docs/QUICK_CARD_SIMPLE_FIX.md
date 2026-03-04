# 快速制卡渲染问题 - 简单修复方案

**创建时间**：2026-02-15  
**状态**：推荐方案

---

## 最简单的解决方案：重新创建卡片

旧卡片的元数据已经保存了错误的数据（包含 IAL），最简单的方法就是删除旧卡片，重新创建。

---

## 步骤

### 1. 重新构建插件

```bash
cd siyuan-plugin-siyuanmemo
npm run build
```

### 2. 重启思源笔记

完全关闭思源，然后重新打开。

### 3. 删除旧卡片

在块菜单中选择"从 Riff 中移除"，或者在卡片浏览器中删除。

### 4. 重新输入符号

```
测试 >> 答案
```

等待 300ms，应该看到提示：
```
✅ 已创建正向卡片 (>>)
```

### 5. 测试复习界面

打开"提取练习"复习对话框。

**预期效果**：
- 正面：只显示"测试"
- 背面：显示"测试" + 分隔线 + "答案"
- 符号（>>）不显示

---

## 为什么重新创建就可以了？

### 问题原因

旧卡片创建时，代码还没有 `cleanIAL()` 方法，所以答案字段包含了 IAL：

```javascript
answer: "{: updated=\"20260215132130\" id=\"20260215132056-no2qm2b\"}"
```

### 新卡片的处理

现在的代码（`AutoCardHandler.ts`）已经添加了 `cleanIAL()` 方法：

```typescript
// 解析问题和答案
question = match[1].trim();
answer = match[2].trim();

// 🆕 清理 IAL
question = this.cleanIAL(question);
answer = this.cleanIAL(answer);
```

所以新创建的卡片会自动清理 IAL，元数据是干净的：

```javascript
question: "测试"
answer: "答案"
```

---

## 快速验证

创建新卡片后，在浏览器控制台运行：

```javascript
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const card = plugin.storage.getCardByBlockId('你的块ID');
console.log('question:', card?.meta?.question);
console.log('answer:', card?.meta?.answer);
```

**预期输出**：
```
question: 测试
answer: 答案
```

**不应该有 IAL**：
```
❌ answer: {: updated="..." id="..."}
✅ answer: 答案
```

---

## 如果还是不行

如果重新创建卡片后还是不行，可能是以下原因：

### 1. 插件没有重新构建

**解决**：
```bash
npm run build
```

### 2. 思源没有重启

**解决**：完全关闭思源，重新打开

### 3. 使用的不是统一队列

**症状**：仍然显示完整的块内容（包括符号）

**解决**：使用"提取练习"等统一队列，不要使用旧的复习对话框

### 4. 检查控制台日志

打开复习对话框时，应该看到：

```
[UnifiedReviewAdapter] Card check: {
  blockId: "...",
  isQuickCard: true,
  symbolType: ">>",
  cardSource: "quick-symbol"
}
[UnifiedReviewAdapter] Using quick card rendering
```

如果没有看到这些日志，说明代码没有正确执行。

---

## 总结

重新创建卡片是最简单、最可靠的方法：

1. ✅ 不需要运行清理脚本
2. ✅ 不需要手动修改数据
3. ✅ 新卡片自动清理 IAL
4. ✅ 元数据干净，渲染正常

只需要：
1. 重新构建插件
2. 重启思源
3. 删除旧卡片
4. 重新输入符号

就这么简单！

---

**祝使用愉快！** 🎉
