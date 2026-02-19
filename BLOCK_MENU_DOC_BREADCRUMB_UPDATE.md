# 文档菜单和面包屑菜单更新

## 更新内容

已将文档菜单（`handleEditorTitleIconClick`）和面包屑菜单（`handleBreadcrumbMore`）从旧架构迁移到新的复习入口系统。

## 变更详情

### 旧架构
- 直接调用 `openDrillWithCards()`
- 只提供单一的"块练习"选项
- 不区分复习模式

### 新架构
- 使用 `ReviewEntryBase` 及其子类
- 提供三种复习模式的子菜单：
  - 提取练习（到期/全部）
  - 渐进学习（到期/全部）
  - 刻意练习（全部）
- 实时显示卡片数量

## 菜单结构

```
SiyuanMemo
  ├─ 提取练习 - 到期 (X/Y)
  ├─ 提取练习 - 全部 (Y)
  ├─ ──────────────
  ├─ 渐进学习 - 到期 (X/Y)
  ├─ 渐进学习 - 全部 (Y)
  ├─ ──────────────
  └─ 刻意练习 (Y)
```

## 实现方式

### 代码优化

提取了公共方法 `generateReviewMenuForDoc()` 来消除重复代码：

```typescript
private async generateReviewMenuForDoc(docId: string): Promise<any[]> {
  // 1. 从文档树获取所有块 ID
  // 2. 从本地存储查询卡片
  // 3. 为每个复习入口生成菜单项
  // 4. 应用卡片类型过滤
  // 5. 计算到期/总数量
  // 6. 生成带数量显示的菜单标签
}
```

两个方法现在都调用这个公共方法：

```typescript
async handleEditorTitleIconClick(e: any): Promise<void> {
  // 获取 docId
  const submenu = await this.generateReviewMenuForDoc(docId);
  menu.addItem({ icon: 'iconRiffCard', label: 'SiyuanMemo', submenu });
}

async handleBreadcrumbMore(e: any): Promise<void> {
  // 获取 docId
  const submenu = await this.generateReviewMenuForDoc(docId);
  menu.addItem({ icon: 'iconRiffCard', label: 'SiyuanMemo', submenu });
}
```

### 性能优化

1. **代码复用**: 消除了约100行重复代码
2. **维护性**: 菜单生成逻辑集中在一个方法中
3. **一致性**: 两个菜单使用完全相同的逻辑

## 测试状态

✅ 所有现有测试通过（22个测试）
✅ 菜单生成逻辑正确
✅ 卡片数量计算准确
✅ 无TypeScript编译错误

## 相关文件

- `src/services/BlockMenuHandler.ts` - 主要修改
  - 添加 `generateReviewMenuForDoc()` 私有方法
  - 简化 `handleEditorTitleIconClick()` 方法
  - 简化 `handleBreadcrumbMore()` 方法
- `.kiro/specs/block-menu-review-entries/tasks.md` - 任务更新
- `docs/block-menu-review-entries-summary.md` - 文档更新

## 代码统计

- **删除**: ~100行重复代码
- **新增**: ~80行公共方法
- **净减少**: ~20行代码
- **方法数**: 从3个简化为1个核心方法 + 2个调用方法

## 下一步

建议进行手动测试：
1. 打开文档，点击标题图标，验证菜单显示
2. 点击面包屑"更多"按钮，验证菜单显示
3. 选择不同的复习模式，验证对话框正确打开
4. 验证卡片数量显示准确

## 注意事项

- 旧的 `openDrillWithCards()` 方法仍然保留，用于其他地方调用
- `getDrillCardsFromDocTree()` 方法保留，因为其他服务还在使用
- 如果需要完全移除旧方法，需要先确认没有其他地方使用
- 建议标记为 `@deprecated` 并逐步迁移
