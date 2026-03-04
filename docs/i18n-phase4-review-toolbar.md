# i18n Phase 4: 复习界面顶部按钮翻译

## 问题描述

用户报告复习界面顶部的按钮文本需要翻译：
1. "全屏" 按钮
2. "编辑SRS数据" 按钮
3. "打开为" 按钮
4. "使用新窗口打开" 选项需要隐藏

## 修复内容

### 1. 修复 UnifiedReviewAdapter.ts 中的 toolbar 按钮

**文件**: `siyuan-plugin-siyuanmemo/src/strategies/UnifiedReviewAdapter.ts`

将硬编码的中文 ariaLabel 改为使用 i18n 函数：

```typescript
// 空状态的 toolbar
toolbar: [
    { icon: '#iconFullscreen', type: 'fullscreen', ariaLabel: t(this.i18n, 'fullscreen', 'Fullscreen') },
    { icon: '#iconEdit', type: 'edit-srs', ariaLabel: t(this.i18n, 'editSrsData', 'Edit SRS Data') },
],

// 正常状态的 toolbar
const toolbar = [
    { icon: '#iconFullscreen', type: 'fullscreen', ariaLabel: t(this.i18n, 'fullscreen', 'Fullscreen') },
    { icon: '#iconEdit', type: 'edit-srs', ariaLabel: t(this.i18n, 'editSrsData', 'Edit SRS Data') },
    { icon: '#iconOpen', type: 'sticktab', ariaLabel: t(this.i18n, 'openBy', 'Open By') },
];

// 神经漫游队列的额外按钮
if (isNeuralRoam) {
    toolbar.push(
        { icon: '#iconLock', type: 'lock-seed', ariaLabel: t(this.i18n, 'lockAsSeed', 'Lock as Seed 🌱') },
        { icon: '#iconMenu', type: 'neural-menu', ariaLabel: t(this.i18n, 'neuralRoamMenu', 'Neural Roam Menu') }
    );
}
```

### 2. 修复 ReviewView.vue 中的"打开"子菜单

**文件**: `siyuan-plugin-siyuanmemo/src/ui/review/v2/ReviewView.vue`

1. 将菜单项的 label 改为使用 i18n 函数
2. 注释掉"使用新窗口打开"选项

```vue
menu.addItem({
  icon: 'iconOpen',
  label: t('openCard', 'Open'),
  submenu: [
    {
      icon: 'iconTab',
      label: t('openInNewTab', 'New Tab'),
      click: () => openCardInTab(currentCard.blockId, false),
    },
    {
      icon: 'iconLayoutRight',
      label: t('openInRight', 'Right Side'),
      click: () => openCardInTab(currentCard.blockId, true),
    },
    // 注释掉"使用新窗口打开"选项
    // {
    //   icon: 'iconExport',
    //   label: t('openInNewWindow', 'New Window'),
    //   click: () => openCardInNewWindow(currentCard.blockId),
    // },
  ],
});
```

### 3. 添加新的 i18n 键

**文件**: `siyuan-plugin-siyuanmemo/src/i18n/zh_CN.json`

添加了：
```json
"openBy": "打开为",
"openCard": "打开",
"openInRight": "右侧",
"lockAsSeed": "锁定为种子块 🌱",
"neuralRoamMenu": "神经漫游菜单"
```

**文件**: `siyuan-plugin-siyuanmemo/src/i18n/en_US.json`

添加了：
```json
"openBy": "Open By",
"openCard": "Open",
"openInRight": "Right Side",
"lockAsSeed": "Lock as Seed 🌱",
"neuralRoamMenu": "Neural Roam Menu"
```

## 已存在的 i18n 键

以下键已经在 i18n 文件中存在，无需添加：

### 中文 (zh_CN.json)
- `fullscreen`: "全屏"
- `editSrsData`: "编辑SRS数据"
- `openInNewTab`: "在新页签中打开"
- `openInNewWindow`: "使用新窗口打开"

### 英文 (en_US.json)
- `fullscreen`: "Fullscreen"
- `editSrsData`: "Edit SRS Data"
- `openInNewTab`: "Open in New Tab"
- `openInNewWindow`: "Open in New Window"

## 测试步骤

1. 重新构建插件：
   ```bash
   cd siyuan-plugin-siyuanmemo
   pnpm run build
   ```

2. 在 SiYuan Notes 中重新加载插件

3. 打开复习界面，验证：
   - 顶部工具栏按钮的 tooltip 显示为正确的语言：
     - Fullscreen（全屏）
     - Edit SRS Data（编辑SRS数据）
     - Open By（打开为）
   - 点击"Open By"按钮，验证子菜单：
     - New Tab（新标签页）
     - Right Side（右侧）
     - "New Window"选项已被隐藏
   - 神经漫游队列中的额外按钮：
     - Lock as Seed 🌱（锁定为种子块 🌱）
     - Neural Roam Menu（神经漫游菜单）

## 修改的文件

1. `siyuan-plugin-siyuanmemo/src/strategies/UnifiedReviewAdapter.ts` - 修复 toolbar 按钮的 ariaLabel
2. `siyuan-plugin-siyuanmemo/src/ui/review/v2/ReviewView.vue` - 修复"打开"子菜单并隐藏"新窗口"选项
3. `siyuan-plugin-siyuanmemo/src/i18n/zh_CN.json` - 添加 5 个新键
4. `siyuan-plugin-siyuanmemo/src/i18n/en_US.json` - 添加 5 个新键

## 注意事项

- UnifiedReviewAdapter 已经有 i18n 支持，通过构造函数传入
- 所有 fallback 值使用英文，确保在没有翻译的情况下也能显示英文
- "使用新窗口打开"选项被注释掉而不是删除，方便将来需要时恢复
- 神经漫游队列的按钮只在神经漫游模式下显示
