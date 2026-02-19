# 快速制卡清理和调试完整指南

**创建时间**：2026-02-15  
**状态**：调试中

---

## 问题：清理脚本运行后仍然不工作

可能的原因：

1. **清理脚本没有正确保存数据**
2. **插件没有重新构建**
3. **思源没有重启**
4. **使用的不是统一队列**
5. **卡片元数据仍然有问题**

---

## 完整解决方案

### 步骤 1：完整的清理脚本（带保存）

在浏览器控制台中运行以下脚本：

```javascript
(async function cleanQuickCardIAL() {
  console.log('=== 开始清理快速制卡 IAL ===\n');
  
  // 1. 获取插件
  const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
  if (!plugin) {
    console.error('❌ 插件未找到');
    return;
  }
  
  // 2. 获取所有快速制卡
  const cards = plugin.storage.getAllCards();
  const quickCards = cards.filter(c => c.meta?.cardSource === 'quick-symbol');
  
  console.log('📊 找到快速制卡:', quickCards.length);
  
  if (quickCards.length === 0) {
    console.log('⚠️ 没有找到快速制卡');
    return;
  }
  
  // 3. IAL 清理函数
  function cleanIAL(text) {
    if (!text || typeof text !== 'string') return text;
    return text.replace(/\s*\{:.*?\}\s*/g, ' ').trim();
  }
  
  // 4. 清理每张卡片
  let cleanedCount = 0;
  for (const card of quickCards) {
    let needsUpdate = false;
    
    // 清理 question
    if (card.meta.question) {
      const cleaned = cleanIAL(card.meta.question);
      if (cleaned !== card.meta.question) {
        console.log(`清理 question: "${card.meta.question}" -> "${cleaned}"`);
        card.meta.question = cleaned;
        needsUpdate = true;
      }
    }
    
    // 清理 answer
    if (card.meta.answer) {
      const cleaned = cleanIAL(card.meta.answer);
      if (cleaned !== card.meta.answer) {
        console.log(`清理 answer: "${card.meta.answer}" -> "${cleaned}"`);
        card.meta.answer = cleaned;
        needsUpdate = true;
      }
    }
    
    // 清理 concept
    if (card.meta.concept) {
      const cleaned = cleanIAL(card.meta.concept);
      if (cleaned !== card.meta.concept) {
        console.log(`清理 concept: "${card.meta.concept}" -> "${cleaned}"`);
        card.meta.concept = cleaned;
        needsUpdate = true;
      }
    }
    
    // 清理 definition
    if (card.meta.definition) {
      const cleaned = cleanIAL(card.meta.definition);
      if (cleaned !== card.meta.definition) {
        console.log(`清理 definition: "${card.meta.definition}" -> "${cleaned}"`);
        card.meta.definition = cleaned;
        needsUpdate = true;
      }
    }
    
    if (needsUpdate) {
      plugin.storage.setCard(card);
      cleanedCount++;
    }
  }
  
  // 5. 保存到存储
  if (cleanedCount > 0) {
    await plugin.storage.saveCards();
    console.log(`\n✅ 已清理 ${cleanedCount} 张卡片`);
    console.log('💾 数据已保存');
  } else {
    console.log('\n✅ 所有卡片都是干净的，无需清理');
  }
  
  console.log('\n=== 清理完成 ===');
})();
```

### 步骤 2：验证清理结果

运行以下脚本验证：

```javascript
(function verifyCleanup() {
  console.log('=== 验证清理结果 ===\n');
  
  const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
  const cards = plugin.storage.getAllCards();
  const quickCards = cards.filter(c => c.meta?.cardSource === 'quick-symbol');
  
  console.log('快速制卡数量:', quickCards.length);
  
  let hasIAL = false;
  for (const card of quickCards) {
    const fields = ['question', 'answer', 'concept', 'definition'];
    for (const field of fields) {
      const value = card.meta[field];
      if (value && typeof value === 'string' && value.includes('{:')) {
        console.error(`❌ 卡片 ${card.blockId} 的 ${field} 仍包含 IAL:`, value);
        hasIAL = true;
      }
    }
  }
  
  if (!hasIAL) {
    console.log('✅ 所有卡片都已清理干净');
  }
  
  console.log('\n=== 验证完成 ===');
})();
```

### 步骤 3：重新构建插件

```bash
cd siyuan-plugin-siyuanmemo
npm run build
```

### 步骤 4：重启思源

完全关闭思源笔记，然后重新打开。

### 步骤 5：测试渲染

打开"提取练习"复习对话框，检查快速制卡的渲染。

---

## 深度诊断脚本

如果上述步骤完成后仍然不工作，运行以下完整诊断：

```javascript
(async function deepDiagnose() {
  console.log('=== 深度诊断 ===\n');
  
  // 1. 检查插件
  const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
  if (!plugin) {
    console.error('❌ 插件未找到');
    return;
  }
  console.log('✅ 插件已加载');
  
  // 2. 检查快速制卡
  const cards = plugin.storage.getAllCards();
  const quickCards = cards.filter(c => c.meta?.cardSource === 'quick-symbol');
  
  console.log('\n📊 卡片统计:');
  console.log('   总卡片数:', cards.length);
  console.log('   快速制卡数:', quickCards.length);
  
  if (quickCards.length === 0) {
    console.log('\n⚠️ 没有快速制卡');
    console.log('💡 请创建一张测试卡片: 测试 >> 答案');
    return;
  }
  
  // 3. 检查第一张快速制卡
  const testCard = quickCards[0];
  console.log('\n📋 测试卡片:', testCard.blockId);
  console.log('   符号类型:', testCard.meta.symbolType);
  console.log('   cardSource:', testCard.meta.cardSource);
  console.log('   question:', testCard.meta.question);
  console.log('   answer:', testCard.meta.answer);
  
  // 检查是否有 IAL
  const hasIAL = (text) => text && typeof text === 'string' && text.includes('{:');
  if (hasIAL(testCard.meta.question) || hasIAL(testCard.meta.answer)) {
    console.error('\n❌ 卡片仍包含 IAL！');
    console.log('💡 请重新运行清理脚本');
    return;
  }
  console.log('✅ 卡片元数据干净');
  
  // 4. 检查 UnifiedReviewAdapter
  console.log('\n🔍 检查 UnifiedReviewAdapter...');
  try {
    // 模拟 adapter 检查
    const isQuickCard = testCard.meta?.cardSource === 'quick-symbol';
    const symbolType = testCard.meta?.symbolType;
    
    console.log('   isQuickCard:', isQuickCard);
    console.log('   symbolType:', symbolType);
    
    if (isQuickCard && symbolType) {
      console.log('✅ 应该使用快速制卡渲染');
    } else {
      console.error('❌ 不会使用快速制卡渲染');
    }
  } catch (error) {
    console.error('❌ 检查失败:', error);
  }
  
  // 5. 检查复习对话框
  console.log('\n🔍 检查复习对话框...');
  if (plugin.reviewDialog) {
    console.log('✅ 复习对话框已打开');
    console.log('   队列类型:', plugin.reviewDialog.queue?.getType?.() || '(未知)');
    console.log('   适配器:', plugin.reviewDialog.adapter?.constructor?.name || '(未知)');
    
    if (plugin.reviewDialog.adapter?.constructor?.name !== 'UnifiedReviewAdapter') {
      console.error('❌ 不是 UnifiedReviewAdapter！');
      console.log('💡 请使用"提取练习"等统一队列');
    }
  } else {
    console.log('⚠️ 复习对话框未打开');
    console.log('💡 请打开"提取练习"复习对话框测试');
  }
  
  // 6. 检查构建版本
  console.log('\n🔍 检查构建版本...');
  console.log('💡 请确认已运行: npm run build');
  console.log('💡 请确认已重启思源笔记');
  
  console.log('\n=== 诊断完成 ===');
  console.log('\n📝 下一步:');
  console.log('1. 如果卡片仍包含 IAL，运行清理脚本');
  console.log('2. 如果不是 UnifiedReviewAdapter，使用"提取练习"队列');
  console.log('3. 如果都正常但仍不工作，检查控制台是否有错误');
})();
```

---

## 常见问题排查

### 问题 1：清理脚本运行后，数据没有保存

**症状**：运行清理脚本后，刷新页面，IAL 又回来了

**原因**：没有调用 `saveCards()`

**解决**：使用上面的完整清理脚本（包含 `await plugin.storage.saveCards()`）

### 问题 2：控制台显示正常，但复习界面不正常

**症状**：
- 控制台显示 `isQuickCard: true`
- 控制台显示 `Using quick card rendering`
- 但复习界面仍显示完整块内容

**可能原因**：
1. 使用的不是统一队列（检查 adapter 类型）
2. CSS 样式没有加载（检查 ReviewContent.vue）
3. HTML 渲染有问题（检查 content.type 是否为 'html'）

**解决**：
1. 确认使用"提取练习"等统一队列
2. 重新构建插件：`npm run build`
3. 重启思源笔记

### 问题 3：符号仍然显示

**症状**：复习界面显示 `>>` 或 `::` 等符号

**原因**：使用的是旧版渲染逻辑（protyle 类型）

**解决**：
1. 检查 `UnifiedReviewAdapter.ts` 中的 `renderQuickCard()` 方法
2. 确认返回的 content.type 是 'html'，不是 'protyle'
3. 重新构建插件

### 问题 4：答案字段为空或显示 IAL

**症状**：
- `answer: ""`
- 或 `answer: "{: updated=\"...\" id=\"...\"}"`

**原因**：
1. 卡片创建时没有清理 IAL
2. 或者是旧卡片，需要清理

**解决**：
1. 删除旧卡片
2. 重新创建新卡片
3. 或运行清理脚本

---

## 最终检查清单

在确认问题已解决前，请完成以下检查：

- [ ] 运行清理脚本，确认数据已保存
- [ ] 运行验证脚本，确认没有 IAL
- [ ] 重新构建插件：`npm run build`
- [ ] 重启思源笔记
- [ ] 打开"提取练习"复习对话框
- [ ] 检查控制台日志：`[UnifiedReviewAdapter] Using quick card rendering`
- [ ] 检查复习界面：正面只显示问题，背面显示问题+答案
- [ ] 检查符号是否隐藏：分隔线中不显示符号

---

## 如果仍然不工作

如果完成所有步骤后仍然不工作，请提供以下信息：

1. 清理脚本的输出
2. 验证脚本的输出
3. 深度诊断脚本的输出
4. 控制台的完整日志（包括错误）
5. 复习界面的截图

这样我可以更准确地定位问题。

---

**祝调试顺利！** 🔧
