# 右键菜单"删除卡片"改为"取消闪卡"

## 需求

将所有队列右键菜单中的"删除卡片"文本改为"取消闪卡"，更准确地描述操作的含义。

## 修改位置

### 1. 统一的菜单定义（基类）✅

**文件**：`src/ui/browser/datasource/MenuActions.ts`

这是所有队列共用的菜单动作定义文件，修改这里会影响所有使用 `BASE_ACTIONS.deleteCard` 的地方。

```typescript
// 修改前
deleteCard: {
  id: 'delete-card',
  label: '删除卡片',
  icon: 'iconTrashcan',
  danger: true,
}

// 修改后
deleteCard: {
  id: 'delete-card',
  label: '取消闪卡',
  icon: 'iconTrashcan',
  danger: true,
}
```

**影响范围**：
- RetrievalDataSource（检索练习）
- FinalDrillDataSource（最终训练）
- FilterGroupDataSource（过滤组）
- DeckDataSource（卡组浏览）

### 2. 渐进学习队列的独立定义

**文件**：`src/ui/browser/datasource/IncrementalLearningDataSource.ts`

渐进学习队列有自己的菜单定义（没有使用 `BASE_ACTIONS`），需要单独修改。

```typescript
// 修改前
{
  id: 'delete-card',
  label: '删除卡片',
  icon: 'iconTrashcan',
  danger: true,
}

// 修改后
{
  id: 'delete-card',
  label: '取消闪卡',
  icon: 'iconTrashcan',
  danger: true,
}
```

### 3. 卡片浏览器类型定义

**文件**：`src/ui/browser/types.ts`

这是卡片浏览器的快捷键定义，也需要修改。

```typescript
// 修改前
{ key: 'delete', label: '删除卡片', icon: 'iconTrashcan', shortcut: 'Del', danger: true }

// 修改后
{ key: 'delete', label: '取消闪卡', icon: 'iconTrashcan', shortcut: 'Del', danger: true }
```

### 4. 确认对话框

**文件**：`src/ui/browser/SRSBrowser.vue`

修改删除确认对话框的标题和内容。

```typescript
// 修改前
const ok = await confirmDialog({
  title: t('deleteCard', '删除卡片'),
  content: t('confirmDelete', `确定要删除 ${targetCards.length} 张卡片吗？此操作不可撤销。`),
  confirmText: t('confirm', '确认'),
});

// 修改后
const ok = await confirmDialog({
  title: t('deleteCard', '取消闪卡'),
  content: t('confirmDelete', `确定要取消 ${targetCards.length} 张闪卡吗？此操作不可撤销。`),
  confirmText: t('confirm', '确认'),
});
```

## 修改总结

| 文件 | 修改内容 | 影响范围 |
|------|---------|---------|
| `MenuActions.ts` | `BASE_ACTIONS.deleteCard.label` | 检索练习、最终训练、过滤组、卡组浏览 |
| `IncrementalLearningDataSource.ts` | 独立菜单定义 | 渐进学习 |
| `types.ts` | 快捷键定义 | 卡片浏览器 |
| `SRSBrowser.vue` | 确认对话框 | 所有队列 |

## 架构优势

### 有基类 ✅

是的，大部分队列使用了统一的 `MenuActions.ts` 中的 `BASE_ACTIONS` 定义，只需修改一处就能影响多个队列：

- ✅ 检索练习（RetrievalDataSource）
- ✅ 最终训练（FinalDrillDataSource）
- ✅ 过滤组（FilterGroupDataSource）
- ✅ 卡组浏览（DeckDataSource）

### 特殊情况

- ⚠️ 渐进学习（IncrementalLearningDataSource）：有自己的菜单定义，需要单独修改
- ⚠️ 确认对话框（SRSBrowser.vue）：需要单独修改

## 验证

### 编译测试

```bash
npm run build
```

✅ 编译成功，无错误

### 功能测试

需要验证以下场景：

1. **检索练习队列**：右键菜单显示"取消闪卡"
2. **渐进学习队列**：右键菜单显示"取消闪卡"
3. **最终训练队列**：右键菜单显示"取消闪卡"
4. **过滤组队列**：右键菜单显示"取消闪卡"
5. **卡组浏览**：右键菜单显示"取消闪卡"
6. **确认对话框**：标题和内容都使用"取消闪卡"

## 术语说明

### 为什么改为"取消闪卡"？

1. **更准确**：操作是取消块的闪卡标记，而不是删除块本身
2. **更清晰**：避免用户误以为会删除笔记内容
3. **更一致**：与"标记为闪卡"操作对应

### 操作的实际效果

- ✅ 移除块的闪卡标记（`custom-riff-decks` 属性）
- ✅ 从本地存储中删除卡片数据
- ✅ 如果启用了 Riff 同步，会同步删除 Riff 中的卡片
- ❌ 不会删除笔记块本身

## 总结

通过修改4个文件（主要是 `MenuActions.ts` 基类），成功将所有队列的右键菜单"删除卡片"改为"取消闪卡"，使操作描述更准确、更易理解。
