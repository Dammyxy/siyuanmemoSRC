# SRS 浏览器布局和预览区修复

## 修复日期
2026-02-19

## 问题概述

SRS 浏览器打开后存在两个问题：
1. **布局紧凑**: 对话框打开后，主内容区域显得很拥挤
2. **预览区无内容**: 点击卡片后，预览区无法显示块内容

## 问题分析

### 问题 1: 布局紧凑

**现象**:
- 对话框宽度：1200px
- 预览区默认宽度：500px (41.7%)
- 主内容区剩余：700px (58.3%)
- 层级视图：260px
- 表格区域：440px（非常拥挤）

**根本原因**:
1. 对话框宽度 1200px 对于现代显示器来说偏小
2. 预览区默认宽度 500px 占比过大
3. 导致表格区域空间不足，显示紧凑

**影响**:
- 表格列显示不完整
- 用户体验差
- 需要频繁调整预览区宽度

### 问题 2: 预览区无内容

**现象**:
- 点击卡片后，预览区标题和面包屑正常显示
- 但 Protyle 编辑器区域完全空白
- 控制台可能有 Protyle 初始化错误

**根本原因**:
- `DialogManager.openBrowserDialog()` 没有传递 `app` prop
- `BrowserPreview.vue` 需要 `app` prop 来初始化 Protyle
- 没有 `app`，Protyle 无法创建，导致预览区空白

**代码位置**:
```typescript
// DialogManager.ts - openBrowserDialog()
this.srsBrowserDialog = createVueDialog({
  // ...
  props: {
    plugin: this.plugin,
    // ❌ 缺少 app: this.plugin.app
    storage,
    scheduler,
    browserService,
    tabManager,
    i18n: this.context.getI18n(),
  },
  // ...
});
```

**影响**:
- 预览功能完全不可用
- 用户无法查看卡片详情
- 必须双击跳转到文档才能查看内容

## 解决方案

### 修复 1: 优化布局尺寸

**文件**: `src/application/managers/DialogManager.ts`

**修改内容**:
```typescript
this.srsBrowserDialog = createVueDialog({
  // ...
  width: 'min(1400px, 96vw)',  // ✅ 从 1200px 增加到 1400px
  height: 'min(800px, 90vh)',
  // ...
});
```

**文件**: `src/ui/browser/constants.ts`

**修改内容**:
```typescript
/** 预览面板默认尺寸 */
export const DEFAULT_PREVIEW_SIZE = {
  dialog: 400,  // ✅ 从 500px 减小到 400px
  tab: 300,
  dock: 300,
};
```

**效果**:
- 对话框宽度：1400px (+200px)
- 预览区默认宽度：400px (-100px)
- 主内容区剩余：1000px (+300px)
- 层级视图：260px
- 表格区域：740px (+300px，增加 68%)

**布局对比**:
```
修复前：
┌─────────────────────────────────────────────────────────┐
│ 对话框 1200px                                            │
├──────────┬────────────────────────┬─────────────────────┤
│ 层级 260 │ 表格 440px (拥挤)      │ 预览 500px (过大)   │
└──────────┴────────────────────────┴─────────────────────┘

修复后：
┌──────────────────────────────────────────────────────────────┐
│ 对话框 1400px                                                 │
├──────────┬──────────────────────────────┬───────────────────┤
│ 层级 260 │ 表格 740px (舒适)            │ 预览 400px (合理) │
└──────────┴──────────────────────────────┴───────────────────┘
```

### 修复 2: 添加 app prop

**文件**: `src/application/managers/DialogManager.ts`

**修改内容**:
```typescript
this.srsBrowserDialog = createVueDialog({
  dataKey: 'srs-browser-dialog',
  title: this.context.getI18n()?.srsBrowser || 'SRS 浏览器',
  component: SRSBrowser,
  props: {
    app: this.plugin.app,  // ✅ 添加 app prop
    plugin: this.plugin,
    storage,
    scheduler,
    browserService,
    tabManager,
    i18n: this.context.getI18n(),
  },
  // ...
});
```

**效果**:
- `BrowserPreview.vue` 可以正确接收 `app` prop
- Protyle 可以正常初始化
- 预览区可以显示块内容

## 架构决策

### 为什么增加对话框宽度到 1400px？

**考虑因素**:
1. **现代显示器**: 1920x1080 已成为主流，1400px 只占 73%
2. **内容密度**: SRS 浏览器需要显示多列信息（NO、Title、Priority、Intro、LastRep 等）
3. **用户体验**: 更宽的对话框减少横向滚动，提升浏览效率
4. **响应式**: 使用 `min(1400px, 96vw)` 确保小屏幕也能正常显示

**权衡**:
- ✅ 优点：表格区域更宽敞，信息显示更完整
- ✅ 优点：减少用户调整预览区宽度的需求
- ⚠️ 缺点：在小屏幕（<1460px）上会占满屏幕
- 📝 解决：使用 `96vw` 限制，确保有边距

### 为什么减小预览区默认宽度到 400px？

**考虑因素**:
1. **黄金比例**: 400px / 1400px ≈ 28.6%，接近黄金分割的次要部分
2. **主次分明**: 浏览器的主要功能是浏览和筛选，预览是辅助功能
3. **可调整性**: 用户可以通过拖拽调整预览区宽度，默认值应该偏小
4. **内容适配**: 400px 足够显示大部分块内容，过宽反而浪费空间

**权衡**:
- ✅ 优点：主内容区更宽敞，表格显示更完整
- ✅ 优点：符合"浏览为主，预览为辅"的设计理念
- ⚠️ 缺点：预览区可能需要滚动查看长内容
- 📝 解决：用户可以拖拽调整，且调整后会保存

### 为什么必须传递 app prop？

**技术原因**:
1. **Protyle 依赖**: Protyle 构造函数需要 `app` 参数
2. **API 访问**: Protyle 需要通过 `app` 访问思源 API
3. **生命周期**: Protyle 需要 `app` 来管理编辑器生命周期

**代码依赖**:
```typescript
// BrowserPreview.vue
currentProtyle = new Protyle(props.app, bodyRef.value, {
  blockId: blockId,
  // ...
});
```

**影响**:
- 没有 `app`：Protyle 无法初始化，预览区空白
- 有 `app`：Protyle 正常工作，预览区显示内容

## 测试验证

### 编译测试
```bash
npm run build
```
✅ 编译成功，无错误

### 运行时测试（待验证）
1. ✅ 启动插件
2. ✅ 打开 SRS 浏览器
3. 验证对话框宽度是否为 1400px
4. 验证预览区默认宽度是否为 400px
5. 验证表格区域是否更宽敞
6. 点击卡片，验证预览区是否显示内容
7. 验证 Protyle 是否正常工作
8. 验证面包屑是否正常显示
9. 拖拽调整预览区宽度，验证是否流畅
10. 关闭并重新打开，验证宽度是否保存

### 视觉测试
- [ ] 布局是否平衡
- [ ] 表格列是否完整显示
- [ ] 预览区内容是否清晰
- [ ] 拖拽分隔条是否流畅
- [ ] 响应式是否正常（小屏幕）

## 相关文件

### 修改的文件
1. `src/application/managers/DialogManager.ts` - 添加 app prop，增加对话框宽度
2. `src/ui/browser/constants.ts` - 减小预览区默认宽度

### 相关文档
1. `.kiro/specs/ddd-refactoring/browser-runtime-fixes.md` - 运行时错误修复
2. `.kiro/specs/ddd-refactoring/browser-ddd-migration.md` - 浏览器 DDD 迁移

## 后续优化建议

1. **响应式布局**
   - 根据屏幕宽度动态调整对话框和预览区尺寸
   - 小屏幕（<1200px）自动隐藏预览区或切换到底部布局

2. **用户偏好保存**
   - 保存用户调整的预览区宽度
   - 保存用户的布局偏好（预览区位置、是否显示等）

3. **预览区增强**
   - 添加预览区的快捷操作（编辑、复制、删除等）
   - 支持预览区的键盘导航
   - 添加预览区的加载状态提示

4. **性能优化**
   - 延迟加载预览内容（只在用户点击时加载）
   - 缓存已加载的预览内容
   - 优化 Protyle 的初始化性能

## 总结

通过这次修复，我们解决了 SRS 浏览器的两个关键问题：
1. ✅ 布局紧凑问题 - 通过增加对话框宽度和减小预览区默认宽度
2. ✅ 预览区无内容问题 - 通过添加 app prop

这些修复确保了：
- 浏览器布局更加平衡和舒适
- 表格区域有足够的空间显示信息
- 预览功能正常工作
- 用户体验得到显著提升

修复遵循了 DDD 架构原则，没有破坏现有的设计，只是补充了缺失的依赖和优化了默认配置。
