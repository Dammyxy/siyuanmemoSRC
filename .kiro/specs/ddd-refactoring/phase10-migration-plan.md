# Phase 10：彻底清理遗留代码 - 激进重构

生成时间：2026-02-19
状态：🔥 进行中 - 激进模式

## 🎯 目标

**彻底清理所有遗留代码，达到 95%+ DDD 合规度**

- 🗑️ 完全删除 src/services/ 目录（23 个文件）
- 🗑️ 删除所有服务定位器反模式
- 🗑️ 移除所有跨层调用
- ✅ 所有功能迁移到 DDD 架构
- ✅ 达到 95%+ DDD 合规度

## 迁移策略

### 原则
1. 保持向后兼容
2. 逐步迁移，每次迁移一个服务
3. 迁移后立即测试
4. 更新所有引用
5. 最后删除旧代码

### 迁移顺序
1. CardService → CardApplicationService + BlockMenuHandler
2. BlockMenuHandler → 重构为使用 CardApplicationService
3. AutoCardHandler → 重构为使用 CardApplicationService
4. PluginService → 移除，使用 ApplicationContext
5. 其他服务按需迁移

## Task 10.1：CardService 迁移

### 当前状态分析

**CardService.ts 的方法**：
1. `handleBlockIconClick(e)` - 处理块图标点击，添加闪卡菜单
2. `getDrillBlockElements(blockElements)` - 获取可练习的块元素
3. `buildDrillCardsFromElements(elements)` - 从元素构建练习卡片
4. `getDrillCardsFromDocTree(docId)` - 从文档树获取练习卡片
5. `handleEditorTitleIconClick(e)` - 处理编辑器标题图标点击
6. `handleBreadcrumbMore(e)` - 处理面包屑菜单
7. `buildDrillCardsFromBlockIds(blockIds)` - 从块 ID 构建练习卡片

**问题**：
- 所有方法都混合了 UI 逻辑和业务逻辑
- 直接访问 Storage
- 跳过应用层

### 迁移方案

#### 方案 A：将所有方法移到 BlockMenuHandler
- ✅ 优点：BlockMenuHandler 已经存在，职责明确
- ✅ 优点：减少重复代码
- ❌ 缺点：BlockMenuHandler 会变得很大

#### 方案 B：拆分到多个类
- ✅ 优点：职责更清晰
- ❌ 缺点：需要创建更多类
- ❌ 缺点：可能过度设计

**决定：采用方案 A**

### 迁移步骤

#### Step 1：检查 BlockMenuHandler 是否已有相同方法
- [x] `handleBlockIconClick` - ✅ 已存在
- [x] `getDrillBlockElements` - ❌ 不存在
- [x] `buildDrillCardsFromElements` - ❌ 不存在
- [x] `getDrillCardsFromDocTree` - ❌ 不存在
- [x] `handleEditorTitleIconClick` - ✅ 已存在
- [x] `handleBreadcrumbMore` - ✅ 已存在
- [x] `buildDrillCardsFromBlockIds` - ✅ 已存在

#### Step 2：将缺失的方法添加到 BlockMenuHandler
- [ ] 添加 `getDrillBlockElements`
- [ ] 添加 `buildDrillCardsFromElements`
- [ ] 添加 `getDrillCardsFromDocTree`

#### Step 3：更新 PluginService 的引用
- [ ] 将 `cardService.handleBlockIconClick` 改为 `blockMenuHandler.handleBlockIconClick`
- [ ] 将 `cardService.getDrillBlockElements` 改为 `blockMenuHandler.getDrillBlockElements`
- [ ] 将 `cardService.buildDrillCardsFromElements` 改为 `blockMenuHandler.buildDrillCardsFromElements`
- [ ] 将 `cardService.getDrillCardsFromDocTree` 改为 `blockMenuHandler.getDrillCardsFromDocTree`
- [ ] 将 `cardService.buildDrillCardsFromBlockIds` 改为 `blockMenuHandler.buildDrillCardsFromBlockIds`

#### Step 4：删除 CardService
- [ ] 删除 src/services/CardService.ts
- [ ] 从 PluginService 中移除 CardService 引用

#### Step 5：测试
- [ ] 测试块图标点击菜单
- [ ] 测试编辑器标题图标菜单
- [ ] 测试面包屑菜单
- [ ] 测试练习功能

## Task 10.2：BlockMenuHandler 重构

### 当前问题
- 直接访问 Storage
- 部分方法跳过应用层

### 重构方案
- 注入 CardApplicationService
- 使用 CardApplicationService 的方法替代直接 Storage 访问
- 保持向后兼容

### 重构步骤
- [ ] 在构造函数中注入 CardApplicationService
- [ ] 更新 `handleBlockIconClick` 中的卡片创建逻辑
- [ ] 更新 `handleBlockIconClick` 中的卡片删除逻辑
- [ ] 测试所有功能

## Task 10.3：AutoCardHandler 重构

### 当前问题
- 直接访问 Storage
- 跳过应用层

### 重构方案
- 注入 CardApplicationService 和 XiuyuanApplicationService
- 使用应用服务替代直接 Storage 访问
- 移除 `getCardService()` 方法

### 重构步骤
- [ ] 在构造函数中注入 CardApplicationService
- [ ] 在构造函数中注入 XiuyuanApplicationService
- [ ] 更新所有使用 `getCardService()` 的地方
- [ ] 移除 `getCardService()` 方法
- [ ] 移除 `storage` getter
- [ ] 测试自动制卡功能

## Task 10.4：PluginService 移除

### 当前问题
- 服务定位器反模式
- 隐藏依赖关系
- 难以测试

### 移除方案
- 将所有服务注册到 ApplicationContext
- 更新所有引用 PluginService 的地方
- 删除 PluginService.ts

### 移除步骤
- [ ] 检查所有引用 PluginService 的地方
- [ ] 更新为使用 ApplicationContext
- [ ] 删除 PluginService.ts
- [ ] 测试所有功能

## 进度跟踪

| Task | 状态 | 开始时间 | 完成时间 | 备注 |
|------|------|---------|---------|------|
| 10.1 | 🔄 进行中 | 2026-02-19 | - | CardService 迁移 |
| 10.2 | ⏳ 待开始 | - | - | BlockMenuHandler 重构 |
| 10.3 | ⏳ 待开始 | - | - | AutoCardHandler 重构 |
| 10.4 | ⏳ 待开始 | - | - | PluginService 移除 |

## 风险和注意事项

### 风险
1. 可能影响现有功能
2. 测试覆盖不足
3. 向后兼容性问题

### 缓解措施
1. 保持向后兼容
2. 逐步迁移
3. 充分测试
4. 保留旧代码作为备份

## 成功标准

- [ ] 所有 CardService 的功能已迁移
- [ ] 所有测试通过
- [ ] 没有引入新的 bug
- [ ] 代码质量提升
- [ ] DDD 合规度提升

---

**最后更新**：2026-02-19
**下一步**：开始 Task 10.1 Step 2
