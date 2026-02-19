# 代码优化总结

## 优化内容

对 `BlockMenuHandler.ts` 进行了性能优化和代码清理，主要消除了重复代码。

## 优化前的问题

1. **代码重复**: `handleEditorTitleIconClick()` 和 `handleBreadcrumbMore()` 包含几乎完全相同的菜单生成逻辑（约100行重复代码）
2. **维护困难**: 修改菜单逻辑需要同时修改两个方法
3. **一致性风险**: 两个方法可能因为独立修改而产生不一致

## 优化措施

### 1. 提取公共方法

创建了 `generateReviewMenuForDoc()` 私有方法：

```typescript
private async generateReviewMenuForDoc(docId: string): Promise<any[]> {
  const submenu: any[] = [];
  const blockIds = await getCardBlockIds({ type: 'tree', value: docId });
  
  // 为每个复习入口生成菜单项
  for (let i = 0; i < this.reviewEntries.length; i++) {
    const entry = this.reviewEntries[i];
    
    // 收集和过滤卡片
    const cards: any[] = [];
    for (const blockId of blockIds) {
      const card = this.deps.storage.getCardByBlockId(blockId);
      if (card) cards.push(card);
    }
    
    const filteredCards = cards.filter(card => (entry as any).filterCard(card));
    const dueCount = (entry as any).countDueCards(filteredCards);
    const totalCount = filteredCards.length;
    
    // 生成菜单项...
  }
  
  return submenu;
}
```

### 2. 简化调用方法

两个方法现在只需要：
1. 提取 docId
2. 调用公共方法
3. 添加菜单项

```typescript
async handleEditorTitleIconClick(e: any): Promise<void> {
  const docId = e?.detail?.data?.rootID || e?.detail?.data?.id;
  if (!menu || !docId) return;
  
  try {
    const submenu = await this.generateReviewMenuForDoc(docId);
    menu.addItem({ icon: 'iconRiffCard', label: 'SiyuanMemo', submenu });
  } catch (err) {
    console.error('[SiyuanMemo] Failed to generate doc menu:', err);
    await pushErrMsg(this.deps.i18n?.drillFailed || '生成菜单失败');
  }
}
```

## 优化效果

### 代码量
- **删除**: ~100行重复代码
- **新增**: ~80行公共方法
- **净减少**: ~20行代码

### 代码质量
- ✅ **DRY原则**: 消除了重复代码
- ✅ **单一职责**: 菜单生成逻辑集中在一个方法
- ✅ **可维护性**: 修改菜单逻辑只需修改一处
- ✅ **一致性**: 两个菜单使用完全相同的逻辑

### 性能
- ✅ **无性能损失**: 优化前后性能完全相同
- ✅ **代码复用**: 减少了代码体积
- ✅ **编译优化**: 更少的代码意味着更快的编译

## 测试验证

所有测试通过：
```
✓ BlockMenuHandler - 菜单项生成 (22)
  ✓ 提取练习菜单项 (3)
  ✓ 渐进学习菜单项 (2)
  ✓ 刻意练习菜单项 (3)
  ✓ 分隔符位置 (3)
  ✓ 卡片数量显示 (9)
  ✓ 菜单结构完整性 (2)

Test Files  1 passed (1)
Tests  22 passed (22)
```

## 未来优化建议

### 1. 标记废弃方法

如果确认其他地方不再使用，可以标记为废弃：

```typescript
/**
 * @deprecated 使用新的复习入口系统代替
 * @see generateReviewMenuForDoc
 */
async getDrillCardsFromDocTree(docId: string): Promise<any[]> {
  // ...
}
```

### 2. 类型安全改进

移除 `(entry as any)` 类型断言，改为：

```typescript
// 在 ReviewEntryBase 中添加公共方法
abstract class ReviewEntryBase {
  public filterCard(card: FSRSCard): boolean { /* ... */ }
  public countDueCards(cards: FSRSCard[]): number { /* ... */ }
  public getConfig(): ReviewEntryConfig { return this.config; }
}

// 使用时
const filteredCards = cards.filter(card => entry.filterCard(card));
const dueCount = entry.countDueCards(filteredCards);
const config = entry.getConfig();
```

### 3. 性能优化

如果文档很大，可以考虑：
- 缓存卡片查询结果
- 使用批量查询减少存储访问
- 延迟计算卡片数量（只在需要时计算）

## 总结

通过提取公共方法，成功消除了约100行重复代码，提高了代码质量和可维护性，同时保持了所有功能的正确性。这是一次成功的重构，为未来的维护和扩展打下了良好基础。
