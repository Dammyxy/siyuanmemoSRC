# 模板制卡功能恢复说明

## 问题

在 DDD 重构过程中，模板制卡功能被注释隐藏了（BlockMenuHandler.ts 第 256-264 行）。

## 解决方案

### 1. 恢复菜单项

在 `BlockMenuHandler.ts` 中取消注释模板制卡菜单项：

```typescript
// 创建模板卡片
submenu.push({
  icon: 'iconAdd',
  label: this.deps.i18n?.createTemplateCard || '创建模板卡片',
  click: async () => {
    await this.deps.openCreateTemplateCardDialog(blockIds);
  },
});
```

### 2. 连接 DialogManager

在 `ApplicationContext.ts` 中更新 `openCreateTemplateCardDialog` 的实现：

```typescript
// 创建一个临时变量来存储 context 引用（用于闭包）
let contextRef: ApplicationContext | null = null;

const blockMenuHandler = new BlockMenuHandler({
  // ... 其他配置
  openCreateTemplateCardDialog: async (blockIds) => {
    // 使用闭包延迟获取 DialogManager
    if (contextRef) {
      const dialogManager = contextRef.getDialogManager();
      if (dialogManager) {
        await dialogManager.openCreateTemplateCardDialog(blockIds);
      }
    }
  },
  // ...
});

// 在创建 context 后设置引用
const context = new ApplicationContext(config, { /* ... */ });
contextRef = context;
```

## 功能说明

### 模板制卡流程

1. 用户选中一个或多个块
2. 右键点击块图标 → 选择 "创建模板卡片"
3. 弹出模板选择对话框（`TemplateSelectDialog.vue`）
4. 用户选择一个模板（如 "基础问答"、"填空题" 等）
5. 系统自动将块映射到模板字段
6. 根据模板规则生成一张或多张卡片

### 内置模板

- 基础问答（Basic Q&A）
- 填空题（Cloze）
- 双向卡片（Bidirectional）
- 多选题（Multiple Choice）

### 技术细节

- **对话框组件**：`src/ui/xiuyuan/TemplateSelectDialog.vue`
- **对话框管理**：`DialogManager.openCreateTemplateCardDialog()`
- **卡片创建**：使用 `XiuyuanService.createFromBlocks()`
- **TODO**：未来需要迁移到 `CardApplicationService`（Phase 4 Task 14.3）

## 测试

参考 `testing-guide.md` 中的 "测试场景 1：通过块菜单创建模板卡片"。

## 注意事项

1. **当前实现**：使用 `XiuyuanService.createFromBlocks()` 创建卡片
2. **未来计划**：迁移到 `CardApplicationService`，需要先扩展 `CreateCardCommand` 和 `CreateCardUseCase` 以支持模板功能
3. **字段映射**：当前使用自动映射（按顺序将块映射到字段）
4. **多卡片生成**：一个模板可能生成多张卡片（根据 `cardRules` 配置）

## 相关文件

- `src/services/BlockMenuHandler.ts` - 菜单处理
- `src/application/ApplicationContext.ts` - 依赖注入
- `src/application/managers/DialogManager.ts` - 对话框管理
- `src/ui/xiuyuan/TemplateSelectDialog.vue` - 模板选择界面
- `src/core/xiuyuan/service.ts` - XiuyuanService（卡片创建逻辑）

## 状态

✅ 已恢复
✅ 已连接到 DialogManager
✅ 已更新测试指南
⏳ 待测试
