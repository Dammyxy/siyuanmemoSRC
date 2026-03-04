# CDF 概念定义卡 - 缓存验证修复

## 问题

复习旧的概念定义卡时出现错误：
```
Error: Invalid xiuyuanId: undefined
```

## 原因分析

1. **旧卡片没有 xiuyuanID**：旧的概念定义卡是用旧方式创建的，没有 `xiuyuanID` 字段
2. **缓存验证不足**：卡片类型缓存中可能有错误数据，将旧卡片标记为概念定义卡
3. **检测逻辑已正确**：新的检测逻辑要求必须有 `xiuyuanID`，但缓存绕过了检测

## 修复方案

### 1. 添加缓存验证逻辑

在使用缓存前，验证概念定义卡必须有 `xiuyuanID`：

```typescript
// 验证缓存：如果缓存说是概念定义卡，但卡片没有 xiuyuanID，则忽略缓存
if (cachedType.isConcept) {
  const card = props.content.card;
  const xiuyuanID = card?.meta?.xiuyuanID;
  if (!xiuyuanID) {
    console.warn('[SiYuanMemo][ReviewContent] Cached as concept card but no xiuyuanID, ignoring cache');
    // 不使用缓存，继续检测
  } else {
    // 使用缓存
    isConceptDefinitionCard.value = true;
    return;
  }
}
```

### 2. 添加详细日志

帮助调试卡片检测问题：

```typescript
console.log('[SiYuanMemo][ReviewContent] Checking concept definition card:', {
  hasCard: !!card,
  xiuyuanID,
  typeMarker,
  hasXiuyuanID: !!xiuyuanID,
  hasTypeMarker: !!typeMarker
});
```

### 3. 添加旧卡片警告

如果检测到旧格式的概念定义卡（有 typeMarker 但没有 xiuyuanID）：

```typescript
if (typeMarker && typeMarker.includes('concept-definition')) {
  console.warn('[SiYuanMemo][ReviewContent] Found old concept definition card without xiuyuanID, will use normal render');
}
```

## 修改文件

`src/ui/review/v2/ReviewContent.vue`

## 效果

- ✅ 新的概念定义卡（有 xiuyuanID）：使用专用渲染器
- ✅ 旧的概念定义卡（无 xiuyuanID）：使用普通 Protyle 渲染器
- ✅ 缓存验证：防止错误的缓存数据导致渲染失败
- ✅ 详细日志：便于调试和问题排查

## 建议

对于旧的概念定义卡，有两个选择：

1. **保持现状**：使用普通渲染器复习，不影响学习
2. **重新创建**：删除旧卡片，用新的 `[[概念]]::定义` 格式重新创建

新格式的优势：
- 双向卡片（正向+反向）
- 更好的视觉呈现
- 支持挖空+双向组合
- 概念必须是文档块，更规范

## 相关文档

- [使用说明](./CDF-概念定义卡使用说明.md)
- [修复说明](./CDF-概念定义卡-修复说明.md)
- [CDF 调查报告](./RemNote-CDF-调查报告.md)
