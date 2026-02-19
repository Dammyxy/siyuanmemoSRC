# 快速制卡字段映射修复

## 问题根源

`UnifiedQueueStrategy.addNextDues()` 方法使用了对象展开语法 `{ ...card, nextDues }`，这会创建一个新对象。虽然第一层属性会被复制，但这种方式可能导致某些字段丢失或引用问题。

## 修复方案

**直接在原对象上添加 `nextDues` 字段，避免创建新对象：**

```typescript
// ❌ 旧代码（可能丢失字段）
return {
    ...card,
    nextDues,
};

// ✅ 新代码（保留所有字段）
(card as any).nextDues = nextDues;
return card;
```

## 修改文件

- `siyuan-plugin-siyuanmemo/src/strategies/UnifiedQueueStrategy.ts` (line ~540)

## 数据流

1. **RetrievalPracticeQueue.getCards()** 
   - 从 `UnifiedDataSourceManager` 获取卡片
   - 卡片包含 `meta.cardSource`, `meta.symbolType` 等字段

2. **UnifiedQueueStrategy.next()**
   - 调用 `addNextDues(card)` 添加下次复习时间
   - ✅ 现在直接修改原对象，保留所有字段
   - 添加兼容字段 `cardID`, `blockID`

3. **ReviewContent.vue**
   - 接收 `props.content.card`
   - 检查 `card.meta.cardSource === 'quick-symbol'`
   - 快速制卡：只隐藏符号（`card__block--hidemark`）
   - 普通卡片：隐藏所有内容（标准行为）

## 测试步骤

1. **刷新思源笔记**（F5 或重启）
2. **运行测试脚本**：
   ```javascript
   // 在浏览器控制台粘贴并运行
   // 文件: FINAL_TEST.js
   ```
3. **打开复习对话框**
4. **验证快速制卡**：
   - 符号（`>>`, `::`, `;;`, `{{}}`）应该被隐藏
   - 其他内容（问题、答案）应该正常显示
5. **验证普通卡片**：
   - 所有内容应该按标准行为隐藏

## 预期结果

### 快速制卡（cardSource === 'quick-symbol'）
- ✅ `card.meta.cardSource` 存在且为 `'quick-symbol'`
- ✅ 只应用 `card__block--hidemark` 类
- ✅ 符号被隐藏，其他内容可见

### 普通卡片
- ✅ `card.meta.cardSource` 为 `undefined` 或其他值
- ✅ 应用所有隐藏类（标准行为）

## 相关文件

- `src/strategies/UnifiedQueueStrategy.ts` - 队列策略（修复点）
- `src/ui/review/v2/ReviewContent.vue` - 复习界面（检测快速制卡）
- `src/queues/RetrievalPracticeQueue.ts` - 检索练习队列
- `src/services/handlers/AutoCardHandler.ts` - 设置 cardSource 元数据
