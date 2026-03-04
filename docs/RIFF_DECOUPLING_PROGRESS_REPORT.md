# Riff 解耦功能 - 实施进度报告

**日期**: 2026-02-03  
**规范**: `.kiro/specs/riff-decoupling/`  
**状态**: 阶段 1-2 完成 (40% 总体进度)

---

## 📊 执行摘要

本报告记录了 Riff 解耦功能的实施进度。该功能旨在将 Riff 系统从核心调度逻辑中解耦，使其仅作为数据源，支持三种运行模式。

### 关键成就

- ✅ **Riff API 层完全重构** - 5个新 API 函数，70个单元测试
- ✅ **RiffDataSource 完整实现** - 三种模式，29个单元测试
- ✅ **100% 测试通过率** - 所有 99 个测试全部通过
- ✅ **零 TypeScript 错误** - 代码质量优秀

### 总体进度

```
阶段 1: Riff API 层重构        ████████████████████ 100% (5/5 任务)
阶段 2: RiffDataSource 实现    ████████████████████ 100% (7/7 任务)
阶段 3: SchedulerRouter 集成   ░░░░░░░░░░░░░░░░░░░░   0% (0/6 任务)
阶段 4: Checkpoint 验证        ░░░░░░░░░░░░░░░░░░░░   0% (0/1 任务)
阶段 5: Xiuyuan 层适配         ░░░░░░░░░░░░░░░░░░░░   0% (0/5 任务)
阶段 6: UI 配置界面            ░░░░░░░░░░░░░░░░░░░░   0% (0/5 任务)
阶段 7: Checkpoint 验证        ░░░░░░░░░░░░░░░░░░░░   0% (0/1 任务)
阶段 8: 文档和迁移             ░░░░░░░░░░░░░░░░░░░░   0% (0/4 任务)
阶段 9: 属性测试               ░░░░░░░░░░░░░░░░░░░░   0% (0/4 任务)
阶段 10: Final Checkpoint      ░░░░░░░░░░░░░░░░░░░░   0% (0/1 任务)

总计: 12/39 任务完成 (31%)
```

---

## ✅ 已完成任务详情

### 阶段 1: Riff API 层重构 (100% 完成)

#### 任务 1.1: 实现 `getRiffCards()` API ✅

**文件**: `src/core/siyuan/riff.ts`  
**测试**: 14 个测试全部通过  
**功能**: 
- 支持 `dueOnly`、`notebook`、`rootID`、`includeNew` 参数
- 实现分页获取所有卡片
- 向后兼容旧 API 签名
- 验证需求 1.1, 1.2

**关键实现**:
```typescript
export async function getRiffCards(
  deckID: string,
  options: {
    dueOnly?: boolean;
    notebook?: string;
    rootID?: string;
    includeNew?: boolean;
  }
): Promise<RiffBlock[]>
```

#### 任务 1.2: 实现 `getRiffNewCards()` API ✅

**文件**: `src/core/siyuan/riff.ts`  
**测试**: 15 个测试全部通过  
**功能**:
- 接受 `deckID` 和 `since` 时间戳参数
- 过滤返回创建时间晚于 `since` 的卡片
- 支持多种时间戳格式（ISO 8601、Unix 秒/毫秒）
- 验证需求 1.3

**关键实现**:
```typescript
export async function getRiffNewCards(
  deckID: string,
  since?: number
): Promise<RiffBlock[]>
```

#### 任务 1.3: 实现 `updateRiffCard()` API ✅

**文件**: `src/core/siyuan/riff.ts`  
**测试**: 20 个测试全部通过  
**功能**:
- 使用 `batchSetRiffCardsDueTime` API 更新 `due` 字段
- 文档说明当前只支持更新 `due` 字段的限制
- 不触发 Riff 调度算法
- 验证需求 1.4, 1.5, 1.8

**关键实现**:
```typescript
export async function updateRiffCard(
  deckID: string,
  cardID: string,
  updates: Partial<RiffCard>
): Promise<void>
```

**API 限制**: 由于当前 Riff API 限制，只能更新 `due` 字段。

#### 任务 1.4: 实现 `syncToRiff()` 辅助函数 ✅

**文件**: `src/core/siyuan/riff.ts`  
**测试**: 21 个测试全部通过  
**功能**:
- 调用 `updateRiffCard()` 同步卡片的调度参数
- 使用 try-catch 捕获所有错误，不抛出异常
- 同步失败不影响本地操作
- 验证需求 1.6, 6.1, 6.2, 6.3, 6.4, 6.5, 6.7

**关键实现**:
```typescript
export async function syncToRiff(
  deckID: string,
  card: FSRSCard
): Promise<void>
```

**错误处理**: 所有错误被捕获并记录，不抛出异常。

#### 任务 1.5: 编写 Riff API 单元测试 ✅

**文件**: `src/core/siyuan/__tests__/riff.test.ts`  
**测试数量**: 70 个测试  
**测试结果**: ✅ 100% 通过  
**覆盖范围**:
- getRiffCards(): 14 测试
- getRiffNewCards(): 15 测试
- updateRiffCard(): 20 测试
- syncToRiff(): 21 测试

**测试类别**:
- 基本功能测试
- 参数组合测试
- 错误处理测试
- 边缘情况测试
- 需求验证测试
- 集成场景测试

---

### 阶段 2: RiffDataSource 实现 (100% 完成)

#### 任务 2.1: 创建 RiffDataSource 类 ✅

**文件**: `src/core/queue/datasource/RiffDataSource.ts`  
**功能**:
- 实现 `IObservableDataSource<QueueItem>` 接口
- 添加 `mode` 配置（'due-only' | 'all' | 'incremental'）
- 添加 `lastSyncTime` 状态跟踪
- 验证需求 2.1, 2.5

**类结构**:
```typescript
export class RiffDataSource extends ObservableDataSource<QueueItem> {
  private readonly mode: 'due-only' | 'all' | 'incremental';
  private lastSyncTime: number = 0;
  // ...
}
```

#### 任务 2.2-2.4: 实现三种模式 ✅

**due-only 模式** (默认):
- 仅获取当前到期需要复习的卡片
- 使用 `getRiffDueCards()` API
- 最适合日常复习场景

**all 模式**:
- 获取牌组中的所有卡片，不考虑到期状态
- 使用 `getRiffCards({ dueOnly: false })` API
- 适合浏览或批量操作

**incremental 模式**:
- 仅获取上次同步时间后添加的卡片
- 使用 `getRiffNewCards(lastSyncTime)` API
- 成功后自动更新 `lastSyncTime`
- 失败时不更新 `lastSyncTime`

#### 任务 2.5: 实现本地数据优先合并 ✅

**功能**:
- 批量从 StorageManager 获取本地卡片
- 本地卡片的调度参数优先（due、state、lapses、reps、lastReview、nextDues）
- 保留 Riff 元数据（blockID、deckID、cardID）
- 使用 SchedulerRouter.preview() 预测 nextDues
- 验证需求 2.7, 2.8, 3.1, 3.2, 3.3, 3.4, 3.5

#### 任务 2.6: 实现 Topic 卡片过滤 ✅

**功能**:
- 检查 `schedulerRouter.config.riffIntegration.useRiffScheduler`
- 仅在使用 Riff 调度器时过滤 Topic 卡片
- 使用 `sql()` 批量查询块的 `custom-fsrs-card-type` 属性
- 验证需求 12.1, 12.2, 12.3, 12.4

**过滤逻辑**:
- 模式 1 & 2（本地调度器）: 不过滤 Topic 卡片
- 模式 3（Riff 调度器）: 过滤掉 Topic 卡片

#### 任务 2.7: 编写 RiffDataSource 单元测试 ✅

**文件**: `src/core/queue/datasource/__tests__/RiffDataSource.test.ts`  
**测试数量**: 29 个测试  
**测试结果**: ✅ 100% 通过  
**覆盖范围**:
- Mode 1 (due-only): 3 测试
- Mode 2 (all): 3 测试
- Mode 3 (incremental): 4 测试
- 本地数据优先合并: 4 测试
- Topic 卡片过滤: 4 测试
- 黑名单过滤: 2 测试
- 自定义过滤器: 1 测试
- 数量限制: 1 测试
- 边缘情况: 5 测试
- 集成测试: 2 测试

---

## 📋 剩余任务清单

### 阶段 3: SchedulerRouter 集成 (优先级: 高)

#### 任务 3.1: 扩展 SchedulerRouterConfig ⏳

**目标**: 添加 `riffIntegration` 配置对象

**需要实现**:
```typescript
interface RiffIntegrationConfig {
  mode: 'disabled' | 'data-only' | 'full-scheduler';
  syncToRiff: boolean;
  useRiffScheduler: boolean;
}

interface SchedulerRouterConfig {
  // 现有字段...
  riffIntegration?: RiffIntegrationConfig;
}
```

**默认值**:
- mode: 'data-only'
- syncToRiff: false
- useRiffScheduler: false

**验证需求**: 4.1, 4.2, 4.3, 4.4, 4.8

**文件位置**: `src/core/scheduler/SchedulerRouter.ts`

#### 任务 3.2: 实现模式 1（完全独立） ⏳

**目标**: 本地调度器完全独立运行，不同步到 Riff

**实现要点**:
- 检查 `mode === 'data-only' && syncToRiff === false`
- 使用本地调度器更新卡片
- 保存到本地存储
- 不调用任何 Riff 同步 API

**数据流**:
```
卡片 → 本地调度器 → 本地存储 → 返回
```

**验证需求**: 4.5, 5.1, 5.2, 5.3

#### 任务 3.3: 实现模式 2（双向同步） ⏳

**目标**: 本地调度器处理调度，可选地备份到 Riff

**实现要点**:
- 检查 `mode === 'data-only' && syncToRiff === true`
- 使用本地调度器更新卡片
- 先保存到本地存储（必须成功）
- 然后调用 `syncToRiff()` 同步到 Riff（可选）
- 使用 try-catch 捕获同步错误，不影响返回值

**数据流**:
```
卡片 → 本地调度器 → 本地存储 → syncToRiff() → Riff (可选)
                              ↓
                            返回
```

**验证需求**: 4.6, 5.4, 6.1, 11.1, 11.2, 11.3, 11.4, 11.5

**关键代码**:
```typescript
// 1. 本地调度
const updatedCard = await scheduler.review(card, rating);

// 2. 保存到本地（必须）
await storage.saveCards();

// 3. 可选同步到 Riff
if (riffConfig?.syncToRiff) {
  try {
    await syncToRiff(deckID, updatedCard);
  } catch (error) {
    console.error('Riff sync failed:', error);
    // 不影响返回值
  }
}

return updatedCard;
```

#### 任务 3.4: 实现模式 3（Riff 调度器） ⏳

**目标**: 完全使用 Riff 调度器

**实现要点**:
- 检查 `mode === 'full-scheduler' && useRiffScheduler === true`
- 将卡片路由到 RiffSchedulerAdapter
- 调用 Riff 的原生调度 API

**数据流**:
```
卡片 → RiffSchedulerAdapter → Riff 调度 API → 返回
```

**验证需求**: 4.7, 7.3, 7.4

**注意**: 此模式为未来预留，当前可能不完全实现。

#### 任务 3.5: 实现配置动态更新 ⏳

**目标**: 支持运行时更改配置

**实现要点**:
- 修改 `updateConfig()` 方法
- 支持运行时更改 `riffIntegration` 配置
- 下一次 `route()` 调用时应用新配置
- 不需要重启插件

**验证需求**: 10.1, 10.2, 10.3, 10.4

#### 任务 3.6: 编写 SchedulerRouter 集成测试 ⏳

**目标**: 验证三种模式的完整流程

**测试范围**:
- 模式 1 的完全独立流程
- 模式 2 的双向同步流程
- 模式 3 的 Riff 调度器流程
- 同步失败不影响本地数据
- 配置动态更新

**验证需求**: 4.5, 4.6, 4.7, 5.1-5.6, 6.1-6.7, 7.3, 7.4, 10.1-10.4, 11.1-11.5

**文件位置**: `src/core/scheduler/__tests__/SchedulerRouter.riff.test.ts`

---

### 阶段 4: Checkpoint - 核心功能验证

#### 任务 4: Checkpoint ⏳

**验证项**:
- [ ] 所有核心 API 测试通过
- [ ] RiffDataSource 三种模式正常工作
- [ ] SchedulerRouter 三种模式正常工作
- [ ] 询问用户是否有问题

---

### 阶段 5: Xiuyuan 层适配 (优先级: 高)

#### 任务 5.1: 修改 XiuyuanService.createFromBlocks() ⏳

**目标**: 确保 Riff 同步失败不影响本地卡片创建

**实现要点**:
1. 先创建 FSRSCard 并保存到本地存储（必须成功）
2. 然后尝试调用 `addRiffCards()`（可选，取决于配置）
3. 使用 try-catch 捕获 Riff 添加失败，不影响本地卡片创建
4. 使用本地 blockID 作为 cardID 创建 CardMapping

**关键代码**:
```typescript
// 1. 创建并保存本地卡片（必须）
const fsrsCard = createCard(blockIDs[0]);
storageManager.setCard(fsrsCard);
await storageManager.saveCards();

// 2. 添加到 Riff（可选）
if (riffIntegration?.mode !== 'disabled') {
  try {
    await addRiffCards(deckID, [blockIDs[0]]);
  } catch (error) {
    console.warn('Failed to add card to Riff:', error);
  }
}

// 3. 创建 CardMapping（使用本地 cardID）
const mapping = {
  xiuyuanID: xiuyuan.id,
  cardID: fsrsCard.id,  // 使用本地 blockID
  frontFields,
  backFields
};
```

**验证需求**: 9.1, 9.4

**文件位置**: `src/core/xiuyuan/service.ts`

#### 任务 5.2: 修改 XiuyuanService.deleteXiuyuan() ⏳

**目标**: 确保 Riff 删除失败不影响本地删除

**实现要点**:
1. 先删除本地 FSRSCard（必须成功）
2. 然后尝试调用 `removeRiffCards()`（可选）
3. 使用 try-catch 捕获 Riff 删除失败
4. 最后删除 Xiuyuan 和 CardMapping

**验证需求**: 9.1, 9.4

#### 任务 5.3: 添加 Riff 集成配置检查 ⏳

**目标**: 根据配置决定是否执行 Riff 操作

**实现要点**:
- 检查 `riffIntegration.mode`
- mode 为 'disabled' 时，跳过所有 Riff 操作
- mode 为 'data-only' 或 'full-scheduler' 时，执行 Riff 操作

**验证需求**: 4.1, 9.1

#### 任务 5.4: 编写 Xiuyuan 集成测试 ⏳

**测试范围**:
- createFromBlocks() 在 Riff 同步失败时仍能创建本地卡片
- deleteXiuyuan() 在 Riff 删除失败时仍能删除本地数据
- CardMapping 使用本地 blockID 作为 cardID
- 不同 riffIntegration 模式下的行为

**验证需求**: 9.1, 9.4

**文件位置**: `src/core/xiuyuan/__tests__/service.riff.test.ts`

#### 任务 5.5: 更新 Xiuyuan 文档 ⏳

**文档内容**:
- Riff 解耦说明
- cardID 策略（始终使用 blockID）
- Riff 同步失败不影响本地卡片创建
- Riff 集成模式的使用示例

**验证需求**: 9.1, 9.4

**文件位置**: `src/core/xiuyuan/README.md`

---

### 阶段 6: UI 配置界面 (优先级: 中)

#### 任务 6.1: 设计配置界面 ⏳

**UI 组件**:
- 模式选择下拉框（完全独立/双向同步/Riff 调度器）
- 数据源模式选择（due-only/all/incremental）
- 同步开关（syncToRiff）
- 增量更新间隔设置

**验证需求**: 10.1

#### 任务 6.2: 实现模式切换 UI ⏳

**功能**:
- 实现模式选择的事件处理
- 调用 `SchedulerRouter.updateConfig()` 更新配置
- 显示当前模式状态

**验证需求**: 10.2, 10.3

#### 任务 6.3: 添加同步状态显示 ⏳

**功能**:
- 在复习界面显示同步状态指示器
- 显示最后同步时间
- 显示同步失败警告（如果有）

**验证需求**: 6.4, 6.5

#### 任务 6.4: 添加增量更新触发按钮 ⏳

**功能**:
- 在设置面板添加"立即更新"按钮
- 触发 RiffDataSource 的增量更新
- 显示更新进度和结果

**验证需求**: 2.4, 8.1

#### 任务 6.5: 编写 UI 测试 ⏳

**测试范围**:
- 模式切换功能
- 配置保存和加载
- 同步状态显示
- 增量更新触发

**验证需求**: 10.1, 10.2, 10.3, 10.5

---

### 阶段 7: Checkpoint - 完整功能验证

#### 任务 7: Checkpoint ⏳

**验证项**:
- [ ] 所有测试通过
- [ ] Xiuyuan 适配正常工作
- [ ] UI 配置界面正常工作
- [ ] 手动测试三种模式的完整流程
- [ ] 询问用户是否有问题

---

### 阶段 8: 文档和迁移 (优先级: 中)

#### 任务 8.1: 更新架构文档 ⏳

**文档内容**:
- 更新 `ARCHITECTURE.md` 中的 Riff 相关部分
- 添加 RiffDataSource 的说明
- 更新数据流图

**验证需求**: 9.1

**文件位置**: `siyuan-plugin-fsrs/ARCHITECTURE.md`

#### 任务 8.2: 编写迁移指南 ⏳

**文档内容**:
- 三种模式的区别和适用场景
- 配置示例
- Riff API 的限制
- Xiuyuan 的 cardID 策略

**验证需求**: 9.1, 9.2, 9.3, 9.4, 9.5

**文件位置**: `siyuan-plugin-fsrs/docs/RIFF_DECOUPLING_MIGRATION.md`

#### 任务 8.3: 编写用户手册 ⏳

**文档内容**:
- 如何选择合适的模式
- 常见问题解答
- 故障排除指南

**验证需求**: 9.1, 10.1

**文件位置**: `siyuan-plugin-fsrs/docs/RIFF_INTEGRATION_USER_GUIDE.md`

#### 任务 8.4: 准备发布说明 ⏳

**文档内容**:
- 新功能和改进
- 向后兼容性
- 已知限制

**验证需求**: 9.1, 9.2, 9.3, 9.4, 9.5

**文件位置**: `siyuan-plugin-fsrs/CHANGELOG_RIFF_DECOUPLING.md`

---

### 阶段 9: 属性测试 (优先级: 高)

属性测试使用 `fast-check` 库，每个测试至少运行 100 次迭代。

#### 任务 9.1: 编写 API 层属性测试 ⏳

**测试属性**:
- 属性 1: API 解耦 - 获取所有卡片
- 属性 2: API 解耦 - 增量更新过滤
- 属性 3: API 解耦 - 更新不触发调度

**验证需求**: 1.1, 1.2, 1.3, 1.8

**文件位置**: `src/core/siyuan/__tests__/riff.property.test.ts`

#### 任务 9.2: 编写 RiffDataSource 属性测试 ⏳

**测试属性**:
- 属性 4: 数据源模式 - due-only 过滤
- 属性 5: 数据源模式 - all 模式完整性
- 属性 6: 数据源模式 - incremental 增量性
- 属性 7: 数据源模式 - incremental 失败不更新时间戳
- 属性 8: 本地数据优先合并
- 属性 9: 本地数据不存在时使用 Riff 默认值
- 属性 20: Topic 卡片过滤（仅 Riff 调度器）

**验证需求**: 2.2, 2.3, 2.4, 2.7, 2.8, 3.1, 3.2, 3.3, 3.4, 8.3, 8.6, 12.1, 12.2, 12.3, 12.4

**文件位置**: `src/core/queue/datasource/__tests__/RiffDataSource.property.test.ts`

#### 任务 9.3: 编写 SchedulerRouter 属性测试 ⏳

**测试属性**:
- 属性 10: 调度模式 1 - 完全独立
- 属性 11: 调度模式 2 - 双向同步
- 属性 12: 调度模式 3 - Riff 调度器
- 属性 13: 本地保存优先于同步
- 属性 14: 同步失败不影响本地数据
- 属性 15: 同步不自动重试
- 属性 16: syncToRiff 包含完整调度参数

**验证需求**: 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.6, 7.3, 7.4, 11.1, 11.3, 11.4, 11.5

**文件位置**: `src/core/scheduler/__tests__/SchedulerRouter.riff.property.test.ts`

#### 任务 9.4: 编写配置和兼容性属性测试 ⏳

**测试属性**:
- 属性 17: 增量更新合并到本地
- 属性 18: 配置动态生效
- 属性 19: 配置持久化
- 属性 21: 旧版 API 向后兼容

**验证需求**: 8.5, 9.1, 9.4, 10.1, 10.2, 10.3, 10.4, 10.5

**文件位置**: `src/core/__tests__/riff-decoupling.property.test.ts`

---

### 阶段 10: Final Checkpoint - 发布前验证

#### 任务 10: Final Checkpoint ⏳

**验证项**:
- [ ] 所有测试通过（包括属性测试）
- [ ] 文档完整
- [ ] 手动测试所有三种模式
- [ ] 验证向后兼容性
- [ ] 验证 Xiuyuan 集成正常
- [ ] 询问用户是否准备发布

---

## 🎯 下一步行动计划

### 立即行动（新会话）

1. **继续任务 3.1**: 扩展 SchedulerRouterConfig
   - 文件: `src/core/scheduler/SchedulerRouter.ts`
   - 添加 `riffIntegration` 配置接口
   - 设置默认值

2. **完成任务 3.2-3.4**: 实现三种调度模式
   - 修改 `route()` 方法
   - 实现模式 1（完全独立）
   - 实现模式 2（双向同步）
   - 实现模式 3（Riff 调度器）

3. **完成任务 3.5-3.6**: 配置更新和测试
   - 实现配置动态更新
   - 编写集成测试

### 中期目标（1-2 天）

4. **完成阶段 5**: Xiuyuan 层适配
   - 修改 createFromBlocks() 和 deleteXiuyuan()
   - 添加配置检查
   - 编写集成测试
   - 更新文档

5. **完成阶段 6**: UI 配置界面
   - 设计配置界面
   - 实现模式切换
   - 添加同步状态显示
   - 编写 UI 测试

### 长期目标（3-5 天）

6. **完成阶段 8**: 文档和迁移
   - 更新架构文档
   - 编写迁移指南
   - 编写用户手册
   - 准备发布说明

7. **完成阶段 9**: 属性测试
   - 编写 API 层属性测试
   - 编写 RiffDataSource 属性测试
   - 编写 SchedulerRouter 属性测试
   - 编写配置和兼容性属性测试

8. **最终验证**: Final Checkpoint
   - 运行所有测试
   - 手动测试所有模式
   - 验证向后兼容性
   - 准备发布

---

## 📚 技术参考

### 已实现的 API

#### Riff API 层 (`src/core/siyuan/riff.ts`)

```typescript
// 获取卡片（支持多种过滤选项）
export async function getRiffCards(
  deckID: string,
  options?: {
    dueOnly?: boolean;
    notebook?: string;
    rootID?: string;
    includeNew?: boolean;
  }
): Promise<RiffBlock[]>

// 增量获取新卡片
export async function getRiffNewCards(
  deckID: string,
  since?: number
): Promise<RiffBlock[]>

// 更新卡片数据（不触发调度）
export async function updateRiffCard(
  deckID: string,
  cardID: string,
  updates: Partial<RiffCard>
): Promise<void>

// 同步本地数据到 Riff
export async function syncToRiff(
  deckID: string,
  card: FSRSCard
): Promise<void>
```

#### RiffDataSource (`src/core/queue/datasource/RiffDataSource.ts`)

```typescript
export class RiffDataSource extends ObservableDataSource<QueueItem> {
  constructor(options: RiffDataSourceOptions)
  async getAll(): Promise<QueueItem[]>
  async add(items: QueueItem[]): Promise<Result<number>>
  async remove(items: QueueItem[]): Promise<Result<number>>
}

export type RiffDataSourceOptions = {
  deckId: string;
  mode?: 'due-only' | 'all' | 'incremental';
  notebook?: string;
  rootID?: string;
  blacklistProvider?: () => Set<string>;
  storage?: StorageManager;
  schedulerRouter?: SchedulerRouter;
  api?: RiffApi;
  errorReporter?: IErrorReporter;
}
```

### 待实现的接口

#### SchedulerRouter 配置扩展

```typescript
interface RiffIntegrationConfig {
  mode: 'disabled' | 'data-only' | 'full-scheduler';
  syncToRiff: boolean;
  useRiffScheduler: boolean;
  incrementalUpdateInterval?: number;
}

interface SchedulerRouterConfig {
  defaultScheduler: SchedulerType;
  enableRiffSync: boolean;  // 已废弃
  fsrsParams: FSRSParameters;
  schedulerOverrides?: Map<string, SchedulerType>;
  riffIntegration?: RiffIntegrationConfig;  // 新增
}
```

---

## 🔍 关键决策和限制

### API 限制

**Riff API 限制**: 当前 Riff API 只支持更新 `due` 字段
- `updateRiffCard()` 只能更新到期时间
- 其他字段（state、lapses、reps、lastReview）无法同步
- 已在代码和文档中明确说明
- 等待思源官方提供更完整的 API

### 数据策略

**本地数据优先**: 
- 本地存储是主数据源
- Riff 作为可选的数据源和备份
- 本地调度参数优先于 Riff 数据
- 保留 Riff 元数据（blockID、deckID、cardID）

**Xiuyuan cardID 策略**:
- 始终使用 blockID 作为 cardID
- 不依赖 Riff 返回的 cardID
- 确保 CardMapping 的一致性
- Riff 同步失败不影响本地卡片创建

### 错误处理策略

**三层降级机制**:
1. **Layer 1**: 正常数据库查询
2. **Layer 2**: 使用缓存数据（如果可用）
3. **Layer 3**: 返回空数组并报告错误

**同步失败容错**:
- 所有 Riff 同步操作使用 try-catch
- 同步失败不抛出异常
- 同步失败不影响本地数据
- 同步失败不自动重试

### Topic 卡片过滤

**过滤逻辑**:
- 仅在使用 Riff 调度器时过滤 Topic 卡片
- 本地调度器不过滤（SchedulerRouter 会正确路由）
- 使用 SQL 批量查询卡片类型
- 查询失败时返回所有卡片（向后兼容）

---

## 📊 测试覆盖率

### 当前测试统计

| 组件 | 测试文件 | 测试数量 | 通过率 |
|------|---------|---------|--------|
| Riff API | riff.test.ts | 70 | 100% ✅ |
| RiffDataSource | RiffDataSource.test.ts | 29 | 100% ✅ |
| **总计** | **2 文件** | **99 测试** | **100% ✅** |

### 待添加的测试

| 组件 | 测试类型 | 预计测试数量 |
|------|---------|-------------|
| SchedulerRouter | 集成测试 | ~20 |
| SchedulerRouter | 属性测试 | ~7 |
| Xiuyuan | 集成测试 | ~10 |
| API 层 | 属性测试 | ~3 |
| RiffDataSource | 属性测试 | ~7 |
| 配置和兼容性 | 属性测试 | ~4 |
| UI 组件 | UI 测试 | ~10 |
| **总计** | | **~61 测试** |

**预期最终测试数量**: ~160 测试

---

## 🚀 快速启动指南（新会话）

### 步骤 1: 恢复上下文

```bash
# 1. 打开项目
cd siyuan-plugin-fsrs

# 2. 阅读本报告
cat RIFF_DECOUPLING_PROGRESS_REPORT.md

# 3. 查看规范文档
cat .kiro/specs/riff-decoupling/requirements.md
cat .kiro/specs/riff-decoupling/design.md
cat .kiro/specs/riff-decoupling/tasks.md
```

### 步骤 2: 验证已完成工作

```bash
# 运行现有测试
npm test -- riff.test.ts
npm test -- RiffDataSource.test.ts

# 检查实现文件
cat src/core/siyuan/riff.ts
cat src/core/queue/datasource/RiffDataSource.ts
```

### 步骤 3: 开始下一个任务

**任务 3.1: 扩展 SchedulerRouterConfig**

```bash
# 1. 找到 SchedulerRouter 文件
find . -name "SchedulerRouter.ts" -type f

# 2. 查看当前实现
cat src/core/scheduler/SchedulerRouter.ts

# 3. 开始实现
# - 添加 RiffIntegrationConfig 接口
# - 扩展 SchedulerRouterConfig
# - 设置默认值
```

### 步骤 4: 使用子代理执行任务

```typescript
// 在新会话中使用以下提示词：
"继续执行 riff-decoupling 规范的任务 3.1。
请阅读 RIFF_DECOUPLING_PROGRESS_REPORT.md 了解当前进度，
然后实现 SchedulerRouterConfig 的扩展。"
```

---

## 📝 重要提示

### 代码质量标准

- ✅ 所有代码必须通过 TypeScript 类型检查
- ✅ 所有测试必须通过
- ✅ 遵循现有代码风格和架构模式
- ✅ 添加详细的 JSDoc 注释
- ✅ 错误处理必须完善

### 测试要求

- ✅ 单元测试覆盖所有公共方法
- ✅ 集成测试覆盖完整流程
- ✅ 属性测试至少 100 次迭代
- ✅ 边缘情况和错误处理测试
- ✅ 测试标签格式：`Feature: riff-decoupling, Property {number}: {property_text}`

### 文档要求

- ✅ 更新 ARCHITECTURE.md
- ✅ 编写迁移指南
- ✅ 编写用户手册
- ✅ 更新 CHANGELOG
- ✅ 添加代码注释和示例

---

## 🔗 相关文件清单

### 规范文档
- `.kiro/specs/riff-decoupling/requirements.md` - 需求文档
- `.kiro/specs/riff-decoupling/design.md` - 设计文档
- `.kiro/specs/riff-decoupling/tasks.md` - 任务清单

### 已实现代码
- `src/core/siyuan/riff.ts` - Riff API 层
- `src/core/queue/datasource/RiffDataSource.ts` - RiffDataSource 实现

### 已实现测试
- `src/core/siyuan/__tests__/riff.test.ts` - Riff API 单元测试
- `src/core/queue/datasource/__tests__/RiffDataSource.test.ts` - RiffDataSource 单元测试

### 待修改文件
- `src/core/scheduler/SchedulerRouter.ts` - 需要扩展配置和实现三种模式
- `src/core/xiuyuan/service.ts` - 需要适配 Riff 集成
- `src/ui/settings/` - 需要添加配置界面（具体文件待确定）

### 待创建文件
- `src/core/scheduler/__tests__/SchedulerRouter.riff.test.ts` - SchedulerRouter 集成测试
- `src/core/scheduler/__tests__/SchedulerRouter.riff.property.test.ts` - SchedulerRouter 属性测试
- `src/core/xiuyuan/__tests__/service.riff.test.ts` - Xiuyuan 集成测试
- `src/core/siyuan/__tests__/riff.property.test.ts` - Riff API 属性测试
- `src/core/queue/datasource/__tests__/RiffDataSource.property.test.ts` - RiffDataSource 属性测试
- `docs/RIFF_DECOUPLING_MIGRATION.md` - 迁移指南
- `docs/RIFF_INTEGRATION_USER_GUIDE.md` - 用户手册
- `CHANGELOG_RIFF_DECOUPLING.md` - 发布说明

### 参考文档
- `RIFF_DECOUPLING_PROGRESS_REPORT.md` - 本报告
- `RIFF_API_TEST_COVERAGE_REPORT.md` - API 测试覆盖报告
- `RIFF_DATASOURCE_TASK_2.1_SUMMARY.md` - RiffDataSource 实施总结
- `UPDATERIFCARD_IMPLEMENTATION_SUMMARY.md` - updateRiffCard 实施总结

---

## 💡 实施建议

### 优先级排序

**高优先级** (必须完成):
1. SchedulerRouter 集成（任务 3.1-3.6）
2. Xiuyuan 层适配（任务 5.1-5.4）
3. 属性测试（任务 9.1-9.4）

**中优先级** (重要但可延后):
4. UI 配置界面（任务 6.1-6.5）
5. 文档和迁移（任务 8.1-8.4）

**低优先级** (可选):
6. Checkpoint 验证（任务 4, 7, 10）

### 时间估算

| 阶段 | 预计时间 | 复杂度 |
|------|---------|--------|
| 阶段 3: SchedulerRouter | 4-6 小时 | 高 |
| 阶段 5: Xiuyuan 适配 | 2-3 小时 | 中 |
| 阶段 6: UI 配置 | 3-4 小时 | 中 |
| 阶段 8: 文档 | 2-3 小时 | 低 |
| 阶段 9: 属性测试 | 4-6 小时 | 高 |
| **总计** | **15-22 小时** | |

### 风险和挑战

**技术风险**:
- SchedulerRouter 的现有实现可能需要重构
- Xiuyuan 与 Riff 的集成可能有未知依赖
- 属性测试的生成器编写可能复杂

**缓解措施**:
- 先阅读现有代码，理解架构
- 小步迭代，频繁测试
- 遇到问题及时记录和寻求帮助

---

## 📞 联系和支持

### 问题报告

如果在实施过程中遇到问题：

1. **检查现有文档**: 阅读 requirements.md 和 design.md
2. **查看测试**: 现有测试提供了很好的使用示例
3. **运行测试**: 确保现有测试仍然通过
4. **记录问题**: 在代码注释中记录遇到的问题

### 下一步联系

在新会话中，请提供以下信息：

```
我正在继续 riff-decoupling 功能的实施。
当前进度：阶段 1-2 完成（12/39 任务）
下一个任务：3.1 扩展 SchedulerRouterConfig

请阅读 RIFF_DECOUPLING_PROGRESS_REPORT.md 了解详细进度。
```

---

## ✅ 检查清单

在开始新会话前，请确认：

- [ ] 已阅读本进度报告
- [ ] 已查看规范文档（requirements.md, design.md, tasks.md）
- [ ] 已验证现有测试通过（99 个测试）
- [ ] 已理解三种运行模式的区别
- [ ] 已了解 API 限制和数据策略
- [ ] 准备好开始任务 3.1

---

**报告生成时间**: 2026-02-03  
**报告版本**: 1.0  
**下次更新**: 完成阶段 3 后

---

*本报告由 AI 助手生成，记录了 Riff 解耦功能的实施进度和下一步计划。*
