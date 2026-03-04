# 卡片类型标记菜单集成完成

## 完成时间
2026-02-15

## 功能说明

在卡片浏览器的右键菜单中，【卡片类型】子菜单新增了两个选项：

### 新增菜单项

1. **标记为概念卡** 🧠
   - 将选中的卡片标记为概念卡（Concept Card）
   - 自动设置 `cardTypeMarker = 'concept'`
   - 自动设置 `type = 'topic'`（使用 A-Factor 调度器）
   - 同步块属性 `custom-fsrs-card-type = 'concept'`

2. **标记为描述符卡** 🏷️
   - 将选中的卡片标记为描述符卡（Descriptor Card）
   - 自动设置 `cardTypeMarker = 'descriptor'`
   - 自动设置 `type = 'item'`（使用 FSRS 调度器）
   - 同步块属性 `custom-fsrs-card-type = 'descriptor'`

### 菜单结构

```
卡片类型
├── 标记为 Topic
├── 标记为 Item
├── ──────────── (分隔线)
├── 标记为概念卡 🧠
└── 标记为描述符卡 🏷️
```

## 实现细节

### 1. 核心服务集成

使用 `CardTypeMarkerService` 进行批量标记：

```typescript
// 标记为概念卡
await cardTypeMarkerService.batchSetMarker(cardIds, 'concept');

// 标记为描述符卡
await cardTypeMarkerService.batchSetMarker(cardIds, 'descriptor');
```

### 2. 文件修改

#### `src/ui/browser/composables/useCardActions.ts`

- 导入 `CardTypeMarkerService` 和 `StorageManager`
- 添加 `storage` 参数到 `UseCardActionsOptions` 接口
- 实现 `markCardsAsConcept()` 函数
- 实现 `markCardsAsDescriptor()` 函数
- 更新 `buildCardTypeSubmenu()` 添加新菜单项
- 导出新函数

#### `src/ui/browser/SRSBrowser.vue`

- 更新 `useCardActions` 调用，传入 `storage` 参数
- 解构新函数：`markCardsAsConcept`, `markCardsAsDescriptor`
- 更新右键菜单的 `cardTypeMenu` 数组，添加新菜单项

### 3. 功能特性

✅ **批量操作支持**
- 可以同时标记多张卡片
- 使用 `batchSetMarker` 提高性能

✅ **自动同步**
- 自动更新卡片的技术类型（type）
- 自动同步思源块属性
- 自动刷新浏览器显示

✅ **错误处理**
- 捕获并显示错误信息
- 失败时不影响其他卡片

✅ **用户反馈**
- 操作成功后显示提示消息
- 显示处理的卡片数量

## 使用方法

1. 在卡片浏览器中选中一张或多张卡片
2. 右键点击打开上下文菜单
3. 选择【卡片类型】→【标记为概念卡】或【标记为描述符卡】
4. 系统自动完成标记并刷新显示

## 技术优势

### 统一管理
- 所有卡片类型标记逻辑集中在 `CardTypeMarkerService`
- 菜单构建逻辑集中在 `useCardActions`
- 修改一处，全局生效

### 类型安全
- 使用 TypeScript 类型定义
- 编译时检查类型错误
- 完整的类型推导

### 可扩展性
- 新增卡片类型只需修改 `buildCardTypeSubmenu`
- 支持添加更多菜单项
- 支持自定义图标和标签

## 测试建议

### 手动测试

1. **单卡片标记**
   - 选中一张卡片
   - 标记为概念卡
   - 验证卡片类型和块属性

2. **批量标记**
   - 选中多张卡片
   - 批量标记为描述符卡
   - 验证所有卡片都被正确标记

3. **错误处理**
   - 尝试标记不存在的卡片
   - 验证错误提示

### 自动化测试

建议添加以下测试：

```typescript
describe('卡片类型标记菜单', () => {
  it('应该显示概念卡和描述符卡菜单项', () => {
    const submenu = buildCardTypeSubmenu([]);
    expect(submenu).toHaveLength(5); // 包含分隔线
    expect(submenu[2].type).toBe('separator');
    expect(submenu[3].label).toBe('标记为概念卡');
    expect(submenu[4].label).toBe('标记为描述符卡');
  });

  it('应该正确标记概念卡', async () => {
    const cards = [createTestCard('card-1')];
    await markCardsAsConcept(cards);
    
    const card = storage.getCard('card-1');
    expect(card.cardTypeMarker).toBe('concept');
    expect(card.type).toBe('topic');
  });

  it('应该正确标记描述符卡', async () => {
    const cards = [createTestCard('card-2')];
    await markCardsAsDescriptor(cards);
    
    const card = storage.getCard('card-2');
    expect(card.cardTypeMarker).toBe('descriptor');
    expect(card.type).toBe('item');
  });
});
```

## 后续工作

### 可选增强

1. **显示当前标记**
   - 在菜单中显示当前卡片的类型标记
   - 已标记的选项显示勾选标记

2. **批量清除标记**
   - 添加【清除类型标记】选项
   - 将 `cardTypeMarker` 设置为 `undefined`

3. **快捷键支持**
   - 为常用操作添加快捷键
   - 例如：Ctrl+Shift+C 标记为概念卡

4. **图标优化**
   - 使用思源内置图标替代 emoji
   - 统一视觉风格

## 相关文档

- [卡片类型系统增强 - 需求文档](.kiro/specs/card-type-system-enhancement/requirements.md)
- [卡片类型系统增强 - 设计文档](.kiro/specs/card-type-system-enhancement/design.md)
- [CardTypeMarkerService 实现](src/core/card-type/CardTypeMarkerService.ts)
- [类型映射工具](src/core/card-type/type-mapping.ts)

## 总结

✅ 成功在卡片浏览器右键菜单中集成了概念卡和描述符卡的标记功能
✅ 使用统一的 `CardTypeMarkerService` 管理类型标记
✅ 支持批量操作和错误处理
✅ 代码结构清晰，易于维护和扩展

用户现在可以方便地在浏览器中标记卡片类型，为后续的神经漫游和快速制卡功能打下基础。
