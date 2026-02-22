# 背面多挖空支持（修订版）

## 实现状态

✅ **已完成** - 2024年实现

## 功能概述

让所有快速制卡符号和块菜单模板制卡支持背面多挖空，当背面包含挖空符号时，自动生成多张卡片。

## 需求澄清

### 1. 支持范围
- ✅ 快速制卡符号（`>>`, `<<`, `<>`, `::`, `;;`）
- ✅ 块菜单模板制卡（通过对话框选择模板）
- ❌ 列表模板卡片（`>>>`）- 不需要支持

### 2. 正反向卡片的挖空规则
- **正向卡片**（`>>`）：只在背面支持挖空
  - 输入：`问题 >> ==答====案==`
  - 生成：2张卡片，正面都是"问题"，背面分别挖空
  
- **反向卡片**（`<<`）：只在背面支持挖空
  - 输入：`==答====案== << 问题`
  - 生成：2张卡片，正面都是"问题"，背面分别挖空
  
- **双向卡片**（`<>`）：**只在原始背面支持挖空**
  - 输入：`A <> ==B====C==`
  - 正向：A → [...]C 和 A → B[...]（2张）
  - 反向：BC → A（1张，不挖空）
  - 总共：3张卡片
  
  **关键点**：双向卡片的反向不支持挖空，因为：
  - 原始正面（A）变成反向的背面时，不应该被挖空
  - 只有原始背面（B、C）在正向卡片中被挖空

## 已实现的功能

### 1. 共享工具类 - ClozeDetector ✅

**文件**: `src/utils/cloze-detector.ts`

提供统一的挖空符号检测功能：
- `extractClozes(content)` - 提取所有挖空
- `hasClozes(content)` - 检查是否包含挖空
- `getClozeCount(content)` - 获取挖空数量

支持三种挖空符号：
- `{{text}}` - 大括号挖空
- `==text==` - 等号挖空
- `<span data-type="mark">text</span>` - 思源标记挖空

### 2. 命令扩展 ✅

**文件**: `src/application/commands/xiuyuan/CreateXiuyuanFromBlocksCommand.ts`

添加了 `backClozeInfo` 字段：
```typescript
backClozeInfo?: {
  originalContent: string;
  front: string;
  back: string;
  clozes: Array<{...}>;
  direction: 'forward' | 'backward' | 'both';
  symbol?: string;
}
```

### 3. UseCase 层处理 ✅

**文件**: `src/application/usecases/xiuyuan/CreateXiuyuanFromBlocksUseCase.ts`

在 CardFace 生成部分添加了背面挖空处理逻辑：
- 正向卡片：为每个挖空生成一个 face (clozeIndex: 0, 1, 2...)
- 反向卡片：只生成一个 face (clozeIndex: -1 表示不挖空)
- 双向卡片：正向N张 + 反向1张
- 将挖空信息存储到 CardFace 的 metadata 中

### 4. AutoCardHandler 修改 ✅

**文件**: `src/application/handlers/AutoCardHandler.ts`

修改了以下方法来支持背面挖空：

#### createBasicCard() ✅
- 使用 `ClozeDetector` 检测背面挖空
- 如果有挖空，调用 `xiuyuanAppService.createFromBlocks()` 并传入 `backClozeInfo`
- 否则使用原有逻辑创建单张卡片

#### createBidirectionalCard() ✅
- 使用 `ClozeDetector` 检测背面挖空
- 如果有挖空，设置 `direction: 'both'` 并传入 `backClozeInfo`
- 否则使用原有逻辑创建双向卡片

### 5. DialogManager 修改 ✅

**文件**: `src/application/managers/DialogManager.ts`

修改了 `openCreateTemplateCardDialog()` 方法：
- 在 confirm 事件处理中使用 `ClozeDetector`
- 检测背面块（最后一个块）的挖空
- 如果有挖空，添加 `backClozeInfo` 到 `createFromBlocks()` 调用

### 6. 渲染层支持 ✅

**文件**: 
- `src/core/card/quick-card/domain/types.ts` - 扩展 QuickCardMetadata
- `src/core/card/quick-card/infrastructure/QuickCardRepository.ts` - 提取挖空信息
- `src/core/card/quick-card/domain/strategies/BasicCardStrategy.ts` - 渲染挖空

#### 类型扩展 ✅
在 `QuickCardMetadata` 中添加了：
- `clozeIndex?: number` - 当前挖空索引
- `totalClozes?: number` - 总挖空数量
- `direction?: 'forward' | 'reverse'` - 卡片方向

#### Repository 修改 ✅
从 FSRSCard 的 metadata 中提取：
- `clozeIndex` - 挖空索引
- `totalClozes` - 总挖空数
- `direction` - 方向

#### 策略修改 ✅
`BasicCardStrategy.parse()` 方法：
- 检查 metadata 中的 `clozeIndex` 和 `totalClozes`
- 如果存在，使用 `ClozeDetector` 提取挖空
- 隐藏当前索引的挖空，显示为 `[...]`
- 其他挖空保持原样显示

## 技术实现

### 架构设计（统一复用）

```
┌─────────────────────────────────────────────────────────────┐
│                      用户交互层                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 符号监听制卡              2. 块菜单模板制卡              │
│     AutoCardHandler               DialogManager              │
│          │                             │                     │
│          └─────────────┬───────────────┘                     │
│                        │                                     │
│                        │  使用共享工具                        │
│                   ClozeDetector                              │
│                        │                                     │
│                        ▼                                     │
│              XiuyuanApplicationService                       │
│                        │                                     │
│                        ▼                                     │
│           CreateXiuyuanFromBlocksUseCase                     │
│              （统一处理背面挖空）                             │
│                        │                                     │
│                        ▼                                     │
│                  XiuyuanRepository                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**关键点**：
- ✅ 底层服务完全复用（XiuyuanApplicationService）
- ✅ 挖空检测提取为共享工具类（ClozeDetector）
- ✅ 背面挖空在 UseCase 层统一处理
- ✅ 两个入口保持独立，符合单一职责原则

### 双向卡片的特殊处理

**问题**：双向卡片如何只在原始背面挖空？

**解决方案**：在生成 CardFace 时添加方向标记

```typescript
// 正向卡片：支持背面挖空
for (let i = 0; i < clozes.length; i++) {
  faces.push({
    question: front,  // 原始正面
    answer: back,     // 原始背面（有挖空）
    direction: 'forward',
    clozeIndex: i
  });
}

// 反向卡片：不挖空
faces.push({
  question: back,   // 原始背面（完整显示，不挖空）
  answer: front,    // 原始正面
  direction: 'reverse',
  clozeIndex: -1    // -1 表示不挖空
});
```

## 支持的符号

- ✅ `>>` / `》》` - 正向卡片（支持背面挖空）
- ✅ `<<` / `《《` - 反向卡片（支持背面挖空）
- ✅ `<>` / `《》` - 双向卡片（支持背面挖空）
- ✅ `::` / `：：` - 概念卡片（已有挖空支持）
- ✅ `;;` / `；；` - 描述符卡片（可扩展）

## 不支持的场景

- ❌ 列表模板卡片（`>>>`）- 不需要支持
- ❌ 纯挖空卡片（`{{}}`）- 已有独立逻辑

## 优势

1. **统一体验** - 所有快速制卡符号都支持背面挖空
2. **灵活性强** - 用户可以自由组合符号和挖空
3. **代码复用** - 复用现有的多挖空逻辑
4. **易于维护** - 集中在 UseCase 层统一处理
5. **架构清晰** - 符号监听和模板制卡复用同一套底层系统

## 测试用例

### 测试1：基础卡片 + 单个挖空
- 输入：`问题 >> ==答案==`
- 预期：生成 1 张卡片

### 测试2：基础卡片 + 多个挖空
- 输入：`问题 >> ==答====案==`
- 预期：生成 2 张卡片

### 测试3：双向卡片 + 多个挖空
- 输入：`A <> ==B====C==`
- 预期：生成 3 张卡片（正向2张 + 反向1张）

### 测试4：混合符号
- 输入：`问题 >> {{答案1}}和==答案2==`
- 预期：生成 2 张卡片

### 测试5：无挖空
- 输入：`问题 >> 答案`
- 预期：生成 1 张卡片（原有逻辑）

### 测试6：模板制卡 + 背面挖空
- 操作：选中两个块，右键选择模板
- 块1：`什么是 DDD？`
- 块2：`==领域====驱动====设计==`
- 预期：生成 3 张卡片

## 实现文件清单

### 核心文件
1. ✅ `src/utils/cloze-detector.ts` - 共享挖空检测工具类
2. ✅ `src/application/commands/xiuyuan/CreateXiuyuanFromBlocksCommand.ts` - 命令扩展
3. ✅ `src/application/usecases/xiuyuan/CreateXiuyuanFromBlocksUseCase.ts` - UseCase 层处理
4. ✅ `src/application/handlers/AutoCardHandler.ts` - 符号监听制卡
5. ✅ `src/application/managers/DialogManager.ts` - 模板制卡

### 渲染层文件
6. ✅ `src/core/card/quick-card/domain/types.ts` - 类型扩展（QuickCardMetadata）
7. ✅ `src/core/card/quick-card/infrastructure/QuickCardRepository.ts` - 提取挖空信息
8. ✅ `src/core/card/quick-card/domain/strategies/BasicCardStrategy.ts` - 渲染挖空

### 设计文档
1. ✅ `.kiro/specs/features/BACK-CLOZE-SUPPORT.md` - 本文档
2. ✅ `.kiro/specs/features/UNIFIED-CARD-CREATION.md` - 架构分析
3. ✅ `.kiro/specs/features/BACK-CLOZE-IMPLEMENTATION-SUMMARY.md` - 实现总结

## 后续优化

1. ~~**渲染层支持**~~ ✅ 已完成 - 更新卡片渲染逻辑以正确显示挖空
2. **概念卡和描述符卡** - 可以进一步优化这两种卡片的挖空支持
3. **用户文档** - 添加用户使用指南和示例
4. **单元测试** - 为 ClozeDetector 和 UseCase 添加测试用例
5. **CSS 样式** - 为挖空占位符添加样式

## 注意事项

1. 背面挖空只在背面生效，正面不受影响
2. 双向卡片的反向不挖空（原始正面不应该被挖空）
3. 挖空符号优先级：`{{}}` > `==` > 思源标记
4. ✅ 渲染逻辑已支持背面挖空的显示
5. ✅ 构建成功，无编译错误
6. 挖空占位符显示为 `[...]`，可通过 CSS 自定义样式
