# Deliberate → Final Drill 重命名总结

## 重命名完成情况

### ✅ 已完成的重命名

#### 1. 代码内部实现
- **MenuActions.ts**
  - `hasQueues.deliberate` → `hasQueues.finalDrill`
  - `'add-to-deliberate-queue'` → `'add-to-final-drill-queue'` (action ID)
  - `queueType: 'deliberate'` → `queueType: 'final-drill'`

- **DeckDataSource.ts**
  - 类型定义：`deliberateQueue` 改为向后兼容别名，`finalDrillQueue` 为主属性
  - 移除调试日志中的 `hasDeliberate` 检查
  - 简化队列检测逻辑，只使用 `finalDrillQueue`
  - 支持新旧两种 action ID：`add-to-deliberate-queue` 和 `add-to-final-drill-queue`

- **BlockMenu.ts**
  - 内部实现改用 `finalDrillQueue`
  - 移除 `@ts-ignore` 注释

- **StorageManager.ts**
  - 添加注释说明迁移逻辑
  - 自动将 `'deliberate'` 迁移为 `'final-drill'`

#### 2. 向后兼容性保证
- **index.ts**
  - 保留 `deliberateQueue` getter，指向 `finalDrillQueue`
  - 确保旧代码仍可通过 `plugin.deliberateQueue` 访问

- **DeckDataSource.ts**
  - 支持新旧两种 action ID
  - 类型定义中保留 `deliberateQueue` 作为可选属性

- **StorageManager.ts**
  - 自动迁移用户设置中的 `'deliberate'` → `'final-drill'`

### 🔄 保持不变（向后兼容）

#### 1. i18n Keys（不改）
这些是面向用户的 API，保持不变以确保兼容性：

**zh_CN.json**
- `startDeliberatePractice`: "开始刻意练习"
- `queueDeliberate`: "刻意练习"
- `addToDeliberateQueue`: "加入刻意队列"
- `deliberateAdded`: "已加入 {n} 张闪卡到刻意队列"

**en_US.json**
- `startDeliberatePractice`: "Start Deliberate Practice"
- `practiceDeliberate`: "Deliberate Practice"
- `queueDeliberate`: "Deliberate Practice"

#### 2. UI 显示文本
- TopBar 菜单：仍使用 `i18n.startDeliberatePractice`
- BlockMenu：仍使用 `i18n.addToDeliberateQueue`
- SRSBrowser：仍使用 `t('practiceDeliberate')`
- SettingsPanel：仍使用 `t('queueDeliberate')`

#### 3. 命令注册
- `langKey: 'startDrill'` 保持不变
- 快捷键 `Alt+D` 保持不变

## 重命名策略

### 核心原则
1. **代码内部全部使用 `final-drill`**
2. **用户界面保持原有 i18n keys**
3. **提供向后兼容的别名和迁移**

### 为什么这样做？

#### 优点
1. **代码一致性**：内部统一使用 `final-drill`，与 SuperMemo 术语对齐
2. **用户体验**：不破坏现有用户的习惯和配置
3. **平滑迁移**：自动迁移旧配置，无需用户手动操作
4. **API 稳定性**：i18n keys 作为公共 API 保持稳定

#### 风险控制
1. **数据兼容**：自动迁移 `settings.json` 中的 `'deliberate'` → `'final-drill'`
2. **代码兼容**：保留 `deliberateQueue` getter 作为别名
3. **UI 兼容**：支持新旧两种 action ID
4. **i18n 兼容**：保持所有 i18n keys 不变

## 测试清单

### 功能测试
- [ ] 从浏览器添加卡片到刻意练习队列
- [ ] 从块菜单添加卡片到刻意练习队列
- [ ] 从顶栏菜单启动刻意练习
- [ ] 快捷键 Alt+D 启动刻意练习
- [ ] 设置面板中选择刻意练习作为默认队列

### 兼容性测试
- [ ] 旧版本用户升级后，`defaultQueue: 'deliberate'` 自动迁移
- [ ] 旧代码通过 `plugin.deliberateQueue` 访问队列仍然有效
- [ ] 旧 action ID `add-to-deliberate-queue` 仍然有效

### 数据完整性测试
- [ ] 刻意练习队列中的卡片数据完整
- [ ] 队列持久化存储正常
- [ ] 复习记录正常保存

## 未来计划

### 可选的进一步清理（低优先级）
如果未来需要完全移除 `deliberate` 相关代码：

1. **发布公告**：提前通知用户 i18n keys 将变更
2. **提供迁移工具**：自动更新用户的自定义配置
3. **保留兼容期**：至少保留 2-3 个大版本的兼容性
4. **文档更新**：更新所有文档和示例代码

### 建议
目前的重命名策略已经足够好，不建议进一步清理。保持 i18n keys 稳定是良好的 API 设计实践。

## 相关文件

### 已修改的文件
- `src/ui/browser/datasource/MenuActions.ts`
- `src/ui/browser/datasource/DeckDataSource.ts`
- `src/ui/menu/BlockMenu.ts`
- `src/core/storage/manager.ts`
- `src/core/queue/datasource/GroupDataSource.ts`

### 保持不变的文件
- `src/i18n/zh_CN.json`
- `src/i18n/en_US.json`
- `src/index.ts` (保留 getter)
- `src/ui/menu/TopBar.ts`
- `src/ui/browser/SRSBrowser.vue`
- `src/ui/settings/SettingsPanel.vue`

## 总结

这次重命名采用了**渐进式、向后兼容**的策略：
- ✅ 代码内部统一使用 `final-drill`
- ✅ 保持用户界面稳定（i18n keys 不变）
- ✅ 提供完整的向后兼容支持
- ✅ 自动迁移用户数据

这种方式既实现了代码的一致性，又保证了用户体验的连续性，是最佳的重命名策略。
