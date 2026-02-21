# 列表模版制卡 Bug 修复

## 问题 1：没有创建 Card 实体

### 问题描述

列表模版制卡功能执行后，虽然创建了 Xiuyuan 聚合根，但没有创建任何 Card 实体。

### 日志证据

```
[SiYuanMemo] 🎉 List template cards creation complete: {xiuyuan: {…}, cards: Array(0)}
```

`cards: Array(0)` 表明没有创建任何卡片。

### 根本原因

在 `CreateListTemplateCardsUseCase.execute()` 中：

1. ✅ 创建了 Xiuyuan 聚合根（包含多个 CardFace）
2. ❌ 但没有调用 `xiuyuan.createCard(faceIndex)` 来创建 Card 实体
3. ❌ 导致 `xiuyuan.getCards()` 返回空数组

### 修复方案

在创建 Xiuyuan 后，显式为每个 face 创建 Card 实体：

```typescript
const xiuyuan = xiuyuanResult.value;

// 7. 为每个 face 创建 Card 实体
for (let i = 0; i < faces.length; i++) {
  const cardResult = xiuyuan.createCard(i);
  if (!cardResult.ok) {
    console.error(`[CreateListTemplateCardsUseCase] Failed to create card for face ${i}:`, cardResult.error);
    return cardResult as Result<any>;
  }
}
```

### 修复位置

文件：`src/application/usecases/xiuyuan/CreateListTemplateCardsUseCase.ts`

在第 226 行（`const xiuyuan = xiuyuanResult.value;` 之后）添加 Card 创建逻辑。

---

## 问题 2：使用错误的渲染界面

### 问题描述

列表模版卡在复习时使用了错误的渲染器，导致无法正确显示提示、答案和渐进式学习功能。

### 根本原因

`XiuyuanRepository.cardToFSRSCard()` 方法在将 Card 实体转换为 FSRSCard 时，没有提取列表模版卡所需的特殊字段：

- `cue` - 当前卡片的提示文本
- `answer` - 当前卡片的答案文本
- `allChildren` - 所有子列表项信息
- `currentIndex` - 当前卡片在所有子列表项中的索引

这些字段存储在 `Xiuyuan.meta.listTemplate.childrenData` 中，但没有被提取到 FSRSCard.meta 中。

### 修复方案

在 `cardToFSRSCard` 方法中，检测列表模版卡并提取相关字段：

```typescript
// 🆕 列表模版卡：提取当前卡片的 cue、answer 和 allChildren
const listTemplateMeta: any = {};
if (meta.listTemplate && Array.isArray(meta.listTemplate.childrenData)) {
  const childrenData = meta.listTemplate.childrenData;
  const currentChild = childrenData[faceIndex];
  
  if (currentChild) {
    listTemplateMeta.cue = currentChild.cue;
    listTemplateMeta.answer = currentChild.answer;
    listTemplateMeta.currentIndex = faceIndex;
    listTemplateMeta.allChildren = childrenData.map((child: any) => ({
      id: child.id,
      cue: child.cue,
      answer: child.answer,
      index: child.index
    }));
  }
}

// 在 meta 中合并列表模版字段
meta: {
  // ... 其他字段
  // 🆕 列表模版卡专用字段
  ...listTemplateMeta,
}
```

### 修复位置

文件：`src/core/xiuyuan/infrastructure/XiuyuanRepository.ts`

在 `cardToFSRSCard` 方法中（第 324 行附近）添加列表模版字段提取逻辑。

---

## 验证方法

1. 重新构建插件
2. 在思源笔记中创建一个有序列表（至少 2 个子项，使用 `提示 → 答案` 格式）
3. 右键父列表项 → 选择"创建列表模版卡"
4. 查看控制台日志，应该看到：
   ```
   [SiYuanMemo] 🎉 List template cards creation complete: {xiuyuan: {…}, cards: Array(4)}
   ```
   其中 `cards` 数组长度应该等于子列表项数量
5. 进入复习界面，验证：
   - ✅ 正面显示问题和当前提示
   - ✅ 背面显示问题、已学过的答案和当前答案
   - ✅ 渐进式显示功能正常

## 影响范围

- ✅ 修复后，列表模版卡将正确创建多张卡片
- ✅ 每张卡片对应一个子列表项
- ✅ 复习时使用正确的渲染器（XiuyuanListTemplateCard）
- ✅ 支持渐进式学习功能
- ✅ 符合 DDD 架构设计

## 相关文件

- `src/application/usecases/xiuyuan/CreateListTemplateCardsUseCase.ts` - 修复位置 1
- `src/core/xiuyuan/infrastructure/XiuyuanRepository.ts` - 修复位置 2
- `src/core/xiuyuan/domain/Xiuyuan.ts` - Xiuyuan 聚合根定义
- `src/ui/review/v2/components/XiuyuanListTemplateCard.vue` - 列表模版卡渲染器
- `src/application/managers/BlockMenuHandler.ts` - 调用入口
