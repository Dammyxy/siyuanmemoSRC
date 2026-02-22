# 统一卡片创建架构分析

## 当前架构

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      用户交互层                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 符号监听制卡              2. 块菜单模板制卡              │
│     AutoCardHandler               DialogManager              │
│          │                             │                     │
│          │                             │                     │
│          └─────────────┬───────────────┘                     │
│                        │                                     │
│                        ▼                                     │
│              XiuyuanApplicationService                       │
│                        │                                     │
│                        ▼                                     │
│           CreateXiuyuanFromBlocksUseCase                     │
│                        │                                     │
│                        ▼                                     │
│                  XiuyuanRepository                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 已经复用的部分 ✅

### 1. 底层服务（完全复用）

两者都使用相同的底层服务：

```typescript
// AutoCardHandler
const xiuyuanAppService = await this.getXiuyuanApplicationService();
const result = await xiuyuanAppService.createFromBlocks({
  blockIds: [blockId],
  templateId: 'builtin-quick-card',
  fieldMapping: { content: blockId },
  deckId: BUILTIN_DECK_ID
});

// DialogManager
const xiuyuanAppService = await this.context.getXiuyuanApplicationService();
const result = await xiuyuanAppService.createFromBlocks({
  blockIds,
  templateId,
  fieldMapping,
  deckId: riff.BUILTIN_DECK_ID
});
```

**复用的服务**：
- `XiuyuanApplicationService`
- `CreateXiuyuanFromBlocksUseCase`
- `XiuyuanRepository`
- 所有的模板系统（`builtin-quick-card` 等）

### 2. 模板系统（完全复用）

两者使用相同的模板：
- `builtin-quick-card` - 快速卡片
- `builtin-basic-qa` - 基础问答
- `builtin-concept-simple` - 概念卡
- `builtin-list-item` - 列表模板
- 等等...

### 3. 数据存储（完全复用）

两者创建的卡片存储在同一个地方：
- Xiuyuan 聚合根
- Card 实体
- 统一的存储管理器

## 未复用的部分（需要优化）

### 1. 挖空检测逻辑 ❌

**当前状态**：
- `AutoCardHandler` 有自己的挖空检测
- `DialogManager` 需要重新实现挖空检测

**问题**：代码重复

**解决方案**：提取到共享工具类

```typescript
// 新建：src/utils/cloze-detector.ts
export class ClozeDetector {
  /**
   * 检测内容中的挖空符号
   */
  static extractClozes(content: string): Array<{
    text: string;
    start: number;
    end: number;
    type: 'brace' | 'equal' | 'mark';
  }> {
    // ... 挖空检测逻辑
  }
  
  /**
   * 检查内容是否包含挖空
   */
  static hasClozes(content: string): boolean {
    return this.extractClozes(content).length > 0;
  }
}

// AutoCardHandler 使用
const clozes = ClozeDetector.extractClozes(back);

// DialogManager 使用
const clozes = ClozeDetector.extractClozes(backContent);
```

### 2. 符号解析逻辑 ❌

**当前状态**：
- `AutoCardHandler` 有符号解析（`>>`、`<>`、`::`等）
- `DialogManager` 不需要符号解析（用户手动选择模板）

**问题**：不是真正的重复，但可以提取为工具

**解决方案**：提取符号解析工具

```typescript
// 新建：src/utils/symbol-parser.ts
export class SymbolParser {
  /**
   * 解析符号，分割正面和背面
   */
  static splitBySymbol(content: string, symbol: string): [string, string] {
    // ... 符号分割逻辑
  }
  
  /**
   * 检测内容中的符号类型
   */
  static detectSymbol(content: string): {
    type: 'basic-both' | 'basic-forward' | 'concept' | 'descriptor' | null;
    symbol: string;
  } {
    // ... 符号检测逻辑
  }
}
```

### 3. 背面挖空处理逻辑 ❌（即将添加）

**当前状态**：还未实现

**建议**：在 `CreateXiuyuanFromBlocksUseCase` 中统一处理

```typescript
// CreateXiuyuanFromBlocksUseCase.ts
if (command.backClozeInfo && command.backClozeInfo.clozes.length > 0) {
  // 统一的背面挖空处理逻辑
  // AutoCardHandler 和 DialogManager 都会走这里
}
```

## 优化建议

### 方案1：提取共享工具类（推荐）

创建共享工具类，避免代码重复：

```
src/utils/
  ├── cloze-detector.ts      # 挖空检测工具
  ├── symbol-parser.ts       # 符号解析工具
  └── card-helper.ts         # 卡片创建辅助工具
```

**优势**：
- 代码复用，减少维护成本
- 逻辑集中，易于测试
- 两个入口（AutoCardHandler 和 DialogManager）保持独立

### 方案2：统一入口（不推荐）

将 AutoCardHandler 和 DialogManager 合并为一个服务。

**缺点**：
- 职责混乱（自动检测 vs 手动选择）
- 代码耦合度高
- 不符合单一职责原则

## 最终架构（优化后）

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
│                        ├──────────────────┐                  │
│                        │                  │                  │
│                   ClozeDetector      SymbolParser            │
│                        │                  │                  │
│                        └─────────────┬────┘                  │
│                                      │                       │
│                                      ▼                       │
│                      XiuyuanApplicationService               │
│                                      │                       │
│                                      ▼                       │
│                 CreateXiuyuanFromBlocksUseCase               │
│                   （统一处理背面挖空）                        │
│                                      │                       │
│                                      ▼                       │
│                            XiuyuanRepository                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 实现计划

### 阶段1：提取共享工具类

1. 创建 `ClozeDetector` 工具类
2. 创建 `SymbolParser` 工具类
3. 重构 `AutoCardHandler` 使用新工具
4. 重构 `DialogManager` 使用新工具

### 阶段2：实现背面挖空

1. 在 `CreateXiuyuanFromBlocksCommand` 添加 `backClozeInfo`
2. 在 `CreateXiuyuanFromBlocksUseCase` 统一处理背面挖空
3. `AutoCardHandler` 和 `DialogManager` 都使用 `backClozeInfo`

### 阶段3：测试和优化

1. 单元测试工具类
2. 集成测试两个入口
3. 性能优化

## 总结

**当前复用情况**：
- ✅ 底层服务（100%复用）
- ✅ 模板系统（100%复用）
- ✅ 数据存储（100%复用）
- ❌ 挖空检测（0%复用，需要提取）
- ❌ 符号解析（0%复用，但DialogManager不需要）

**优化后复用情况**：
- ✅ 底层服务（100%复用）
- ✅ 模板系统（100%复用）
- ✅ 数据存储（100%复用）
- ✅ 挖空检测（100%复用，通过ClozeDetector）
- ✅ 背面挖空处理（100%复用，在UseCase层）
- ⚠️ 符号解析（仅AutoCardHandler使用，不需要复用）

**结论**：
- 两个系统已经在底层高度复用
- 只需要提取挖空检测工具类
- 背面挖空功能在UseCase层统一实现
- 不需要合并两个入口，保持职责分离
