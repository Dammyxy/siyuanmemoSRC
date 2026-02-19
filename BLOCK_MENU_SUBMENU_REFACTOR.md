# 块菜单子菜单重构说明

## 改动说明

参考 `siyuan-plugin-webview` 项目的实现方式，将所有插件的块菜单项统一放到一个 "SiyuanMemo" 子菜单下。

## 改动前后对比

### 改动前
块菜单中直接显示多个独立菜单项：
- 块练习 (10)
- 从此处开始神经漫游
- 编辑SRS数据
- 选中制卡
- 创建模板卡片
- 取消闪卡

### 改动后
块菜单中只显示一个主菜单项 "SiyuanMemo"，点击后展开子菜单：
```
SiyuanMemo
  ├─ 块练习 (10)
  ├─ 从此处开始神经漫游
  ├─ ──────────────
  ├─ 编辑SRS数据
  ├─ 选中制卡
  ├─ 创建模板卡片
  └─ 取消闪卡
```

## 核心实现

```typescript
// 构建子菜单项数组
const submenu: any[] = [];

// 添加各种菜单项到 submenu 数组
submenu.push({
    icon: 'iconRiffCard',
    label: drillLabel,
    click: async () => { /* ... */ },
});

// 使用分隔符
submenu.push({
    type: 'separator',
});

// 添加主菜单项，使用子菜单
menu.addItem({
    icon: 'iconRiffCard',
    label: 'SiyuanMemo',
    submenu,  // 关键：使用 submenu 属性
});
```

## 优势

1. **减少菜单污染**：块菜单不会被插件的多个菜单项占据
2. **更好的组织**：所有 SiyuanMemo 相关功能集中在一起，用户更容易找到
3. **易于扩展**：后续添加新功能只需在 submenu 数组中添加新项
4. **视觉清晰**：使用分隔符将不同类型的功能分组

## 参考项目

- `H:\project-F\flashcard\siyuan-plugin-webview\src\index.ts`
- 关键方法：`blockMenuEventListener` (第 920-930 行)
- 关键代码：
  ```typescript
  detail.menu.addItem({
      icon: "icon-webview-chromium",
      label: this.i18n.displayName,
      submenu: washMenuItems(submenu),
  });
  ```

## 修改的文件

- `siyuan-plugin-siyuanmemo/src/services/BlockMenuHandler.ts`
  - 修改了 `handleBlockIconClick` 方法
  - 将所有 `menu.addItem()` 调用改为先构建 `submenu` 数组，最后统一添加

## 重新编译和测试

修改完成后，需要：
1. 重新编译插件：`npm run build` 或 `pnpm build`
2. 在思源中重新加载插件
3. 点击块图标测试菜单是否正确显示为子菜单
