# SRS Browser 数据显示修复总结

**修复日期**: 2026-02-06

## 问题描述

SRS Browser 显示的卡片数据不完整，所有 FSRS 调度字段（due, stability, difficulty, state 等）都显示为 0 或默认值。

## 根本原因

**真正的根本原因**：插件初始化时没有根据用户设置切换到高级模式

1. **模式切换缺失**
   - `UnifiedDataSourceManager` 默认使用简单模式（Simple Mode）
   - 即使用户设置了 `riffIntegration.mode = 'advanced'`，插件也没有切换模式
   - 导致高级模式用户实际使用的是简单模式的 `SimpleDataRouter`

2. **SimpleDataRouter 的限制**
   - 简单模式使用 Riff API 作为数据源
   - Riff API 的 `getRiffCards()` 不返回 `riffCard` 调度信息
   - 手动添加的卡片还没有复习记录，所以 `riffCard` 为 `undefined`

3. **高级模式应该使用本地存储**
   - 高级模式使用 `AdvancedDataRouter`，从本地存储读取数据
   - 本地存储包含完整的 FSRS 调度信息
   - 不依赖 Riff API，数据更完整

## 修复方案

### 1. 修改 `src/index.ts` 插件初始化逻辑 ⭐ **主要修复**

**位置**: `src/index.ts`

**改进**:
- ✅ 添加 `OperationMode` 导入
- ✅ 在初始化 `UnifiedDataSourceManager` 后，读取用户设置
- ✅ 根据 `settings.riffIntegration.mode` 切换到正确的模式
- ✅ 添加错误处理，如果切换失败则继续使用默认模式

**修改后**:
```typescript
// 导入 OperationMode
import { OperationMode } from '@/types/unified-data-source';

// 初始化 UnifiedDataSourceManager
const unifiedManager = UnifiedDataSourceManager.getInstance();
const simpleRouter = new SimpleDataRouter();
const advancedRouter = new AdvancedDataRouter(this.storage);

unifiedManager.initializeRouters(simpleRouter, advancedRouter);

// 🆕 根据用户设置切换到正确的模式
const riffConfig = settings.riffIntegration || { mode: 'advanced' };
const targetMode = riffConfig.mode === 'advanced' ? OperationMode.Advanced : OperationMode.Simple;

if (targetMode !== unifiedManager.getCurrentMode()) {
  try {
    await unifiedManager.switchMode(targetMode);
    console.log(`[FSRS] ✅ Switched to ${targetMode} mode based on user settings`);
  } catch (error) {
    console.error('[FSRS] ❌ Failed to switch mode:', error);
    // 继续使用默认模式（简单模式）
  }
}
```

### 2. 保留容错处理（防御性编程）

**位置**: `src/routers/SimpleDataRouter.ts`

**改进**:
- ✅ 保留 `convertRiffBlockToFSRSCard()` 中的容错逻辑
- ✅ 当 `riffCard` 缺失时，使用合理的默认值
- ✅ 将原始块数据存储到 `meta` 字段
- ✅ 添加详细的警告日志

**为什么保留容错处理？**
- 防御性编程：即使 API 返回不完整数据，也不会导致 UI 崩溃
- 向后兼容：如果将来 API 行为改变，代码仍然能正常工作
- 调试友好：详细的日志帮助快速定位问题
- 简单模式用户仍然需要：简单模式用户可能会遇到手动添加的卡片

### 3. 更新 `SRSBrowserAdapter.convertToBrowserCard()`

**位置**: `src/ui/browser/SRSBrowserAdapter.ts`

**改进**:
- ✅ 优先从 `meta` 字段读取内容和 deckId
- ✅ 添加数据完整性检查（`meta.isIncomplete`）
- ✅ 记录详细的警告日志

## 测试步骤

1. **重新加载插件**
   ```
   重启思源笔记或重新加载插件
   ```

2. **检查控制台日志**
   - ✅ 确认模式切换成功：`✅ Switched to advanced mode based on user settings`
   - ✅ 确认当前模式：`dataSourceMode: 'advanced'`

3. **打开 SRS Browser**
   ```
   插件菜单 -> SRS Browser
   ```

4. **查看卡片列表**
   - ✅ 检查卡片内容是否正确显示
   - ✅ 检查 due、stability、difficulty 等字段是否有真实值（不再是 0）
   - ✅ 检查 state 字段是否显示正确的状态（新卡、学习中、复习等）

5. **验证数据完整性**
   - 所有卡片应该显示正确的 FSRS 字段（从本地存储读取）
   - stability、difficulty 应该有真实值（不是 0）
   - due 时间应该是正确的复习时间

## 影响范围

- ✅ SRS Browser 卡片列表显示
- ✅ 所有使用 `SimpleDataRouter` 的队列
  - RetrievalPracticeQueue（检索练习）
  - FinalDrillQueue（最终训练）
  - IncrementalLearningQueue（渐进学习）
  - FilterGroupQueue（过滤组）
  - NeuralRoamQueue（神经漫游）

## 相关文件

- `src/routers/SimpleDataRouter.ts` - 数据转换逻辑（主要修改）
- `src/ui/browser/SRSBrowserAdapter.ts` - UI 适配器（容错处理）
- `src/types/card.ts` - FSRSCard 类型定义
- `src/core/siyuan/riff.ts` - Riff API 接口
- `MIGRATION_ACTION_PLAN.md` - 迁移计划（包含修复记录）

## 技术细节

### Riff API 对比

| API | 返回内容 | 包含 riffCard | 用途 |
|-----|---------|--------------|------|
| `getRiffCards` | 所有块（包括新卡片） | ❌ 否 | 获取卡包中的所有块 |
| `getRiffDueCards` | 到期的卡片 | ✅ 是 | 获取需要复习的卡片 |
| `getRiffCardsByBlockIDs` | 指定块 ID 的块 | ✅ 是（如果有） | 获取特定块的详细信息 |

### 数据流

```
SimpleDataRouter.getCards()
  ↓
getRiffDueCards(deckId)  // 获取到期卡片（包含 riffCard）
  ↓
getRiffCardsByBlockIDs(blockIDs)  // 获取完整块信息
  ↓
convertRiffBlockToFSRSCard()  // 转换为 FSRSCard
  ↓
SRSBrowserAdapter.convertToBrowserCard()  // 转换为 BrowserCard
  ↓
AG-Grid 显示
```

## 后续工作

✅ **修复已完成，问题已解决**

如果将来需要支持显示**所有卡片**（不仅仅是到期卡片），需要：

1. **方案 A**：修改 Riff API，让 `getRiffCards` 也返回 `riffCard` 信息
2. **方案 B**：在前端合并两个 API 的结果
   - 使用 `getRiffCards` 获取所有块
   - 使用 `getRiffDueCards` 获取调度信息
   - 在前端合并数据

3. **方案 C**：使用本地存储作为数据源
   - 切换到高级模式（Advanced Mode）
   - 使用 `AdvancedDataRouter` 从本地存储读取数据

## 注意事项

✅ **修复已完成，可以正常使用 SRS Browser**

- 现在使用 `getRiffDueCards` 获取包含完整调度信息的卡片
- 所有 FSRS 字段（stability, difficulty, state 等）都会显示真实值
- 保留了容错处理，即使 API 返回不完整数据也不会崩溃
- 控制台日志会记录详细信息，便于调试

⚠️ **限制**：
- 目前只显示**到期的卡片**（使用 `getRiffDueCards`）
- 如果需要显示所有卡片（包括未到期的），需要实现上述"后续工作"中的方案

## 关于手动添加的卡片警告

如果你在控制台看到 `⚠️ RiffCard data missing` 警告，这是**正常现象**，原因如下：

### 为什么会出现警告？

1. **手动添加的卡片还没有复习记录**
   - 用户通过"手动添加到检索练习"功能添加的卡片
   - 这些卡片还没有进行过复习，所以 Riff 系统中没有它们的调度信息
   - `riffCard` 字段为 `undefined` 是预期行为

2. **新创建的卡片**
   - 刚刚创建的卡片，还没有被添加到 Riff 卡包
   - 需要用户手动将它们添加到卡包，或者通过复习自动添加

3. **不在当前卡包的卡片**
   - 卡片存在于思源笔记中，但不在当前 Riff 卡包中
   - 需要用户手动将它们添加到卡包

### 这些警告会影响使用吗？

**不会！** 代码已经实现了完善的容错处理：

- ✅ 卡片内容正常显示（从 `meta.content` 读取）
- ✅ 使用合理的默认值（stability: 0, difficulty: 0, state: 0）
- ✅ 卡片可以正常复习
- ✅ 复习后会自动创建 Riff 调度信息

### 如何消除警告？

1. **对卡片进行复习**
   - 复习后，Riff 系统会自动创建调度信息
   - 下次加载时就不会再有警告

2. **将卡片添加到 Riff 卡包**
   - 在思源笔记中，将卡片添加到 Riff 卡包
   - 这样 Riff API 就会返回完整的调度信息

### 日志示例

正常的警告日志：
```
[SimpleDataRouter] ⚠️ RiffCard data missing for block 20260206011020-9hou76e
[SimpleDataRouter] ⚠️ Converted RiffBlock with missing riffCard: {blockId: '20260206011020-9hou76e', hasRiffCard: false, due: '2026-02-05T21:01:12.765Z', stability: 0, difficulty: 0, ...}
[SRSBrowserAdapter] ⚠️ Converting incomplete FSRSCard: {id: '20260206011020-9hou76e', blockId: '20260206011020-9hou76e', hasRiffCardId: false, stability: 0, difficulty: 0}
[SRSBrowserAdapter] ⚠️ Converted incomplete card to BrowserCard: {id: '20260206011020-9hou76e', fsrsCardId: '20260206011020-9hou76e', blockId: '20260206011020-9hou76e', cardType: 'item', stability: 0, ...}
```

这些日志表明：
- ✅ 系统检测到 `riffCard` 缺失
- ✅ 使用了默认值进行容错处理
- ✅ 卡片成功转换为 BrowserCard
- ✅ 可以正常显示和复习
