# 快速卡片模板合并完成

## 概述

成功将三个功能重复的快速卡片模板合并为一个统一模板。

## 合并的模板

### 删除的模板

1. **builtin-symbol-qa** (符号问答卡)
   - 单块卡片，检测 `<>` 符号
   - cardType: 'qa'
   - 已删除文件：`src/core/xiuyuan/templates/builtin-symbol.ts`

2. **builtin-quick-bidirectional** (快速制卡双向)
   - 单块卡片，使用 `<>` 符号
   - 生成2张卡片（forward + reverse）
   - 已从 `builtin.ts` 中移除

### 保留的统一模板

**builtin-quick-card** (快速卡片 - 统一版)
- 支持单向和双向卡片
- 通过动态生成 cardRules 实现不同功能
- 文件：`src/core/xiuyuan/templates/builtin-quick.ts`

## 修改的文件

### 1. 模板定义

- ✅ `src/core/xiuyuan/templates/builtin-quick.ts`
  - 更新描述，说明支持单向和双向
  - 保留默认单向 cardRule
  - 双向卡片会在创建时动态添加 reverse 规则

- ✅ `src/core/xiuyuan/templates/builtin.ts`
  - 移除 `QUICK_BIDIRECTIONAL_TEMPLATE` 导出
  - 移除 `BUILTIN_SYMBOL_TEMPLATE` 导入
  - 更新 `BUILTIN_TEMPLATES` 数组

- ✅ 删除 `src/core/xiuyuan/templates/builtin-symbol.ts`

### 2. 业务逻辑

- ✅ `src/application/usecases/card/CreateCardUseCase.ts`
  - 更新 `selectTemplate()` 方法
  - 检测到 `<>` 符号时统一返回 `builtin-quick-card`
  - 移除单块/多块的区分逻辑

- ✅ `src/application/handlers/AutoCardHandler.ts`
  - 更新 `createBidirectionalCard()` 方法
  - 使用 `builtin-quick-card` 替代 `builtin-quick-bidirectional`
  - 添加 `isBidirectional: true` 标记

- ✅ `src/application/helpers/CardCreationHelper.ts`
  - 更新 `createSymbolCard()` 方法
  - 使用 `builtin-quick-card` 替代 `builtin-symbol-qa`

### 3. 测试文件（需要更新）

以下测试文件中的模板ID引用需要更新：

- `src/application/usecases/card/__tests__/CreateCardUseCase.template-selection.test.ts`
  - 将 `builtin-symbol-qa` 改为 `builtin-quick-card`
  - 将 `builtin-quick-bidirectional` 改为 `builtin-quick-card`

- `src/application/helpers/__tests__/CardCreationHelper.test.ts`
  - 更新 `createSymbolCard` 测试用例

- `src/core/xiuyuan/templates/__tests__/TemplateRegistry.test.ts`
  - 移除 `builtin-symbol-qa` 测试
  - 移除 `builtin-quick-bidirectional` 测试

## 实现机制

### 单向 vs 双向

**单向卡片**（默认）：
```typescript
cardRules: [
  {
    typeMarker: 'Q',
    frontFields: ['content'],
    backFields: ['content'],
    cardType: 'basic',
  },
]
// 生成 1 个 CardFace
```

**双向卡片**（动态生成）：
```typescript
// 在 CreateXiuyuanFromBlocksUseCase 中检测 isBidirectional 标记
// 动态生成 2 个 cardRules
cardRules: [
  {
    typeMarker: 'forward',
    frontFields: ['content'],
    backFields: ['content'],
  },
  {
    typeMarker: 'reverse',
    frontFields: ['content'],
    backFields: ['content'],
  },
]
// 生成 2 个 CardFace，都使用相同的块内容
// BasicCardStrategy 根据 typeMarker 决定渲染方向
```

### 双向卡片实现细节

1. **命令层**：`CreateXiuyuanFromBlocksCommand` 添加 `isBidirectional?: boolean` 字段
2. **用例层**：`CreateXiuyuanFromBlocksUseCase` 检测标记并动态生成 cardRules 和 faces
3. **渲染层**：`BasicCardStrategy` 根据 `typeMarker` 决定正向或反向渲染
   - `typeMarker === 'forward'`：概念 -> 定义
   - `typeMarker === 'reverse'`：定义 -> 概念

## 待完成任务

### 高优先级

1. ✅ 实现 `isBidirectional` 标记的处理逻辑
   - ✅ 在 `CreateXiuyuanFromBlocksCommand` 中添加 `isBidirectional` 字段
   - ✅ 在 `CreateXiuyuanFromBlocksUseCase` 中根据标记动态生成 cardRules
   - ✅ 为双向卡片生成两个 CardFace（forward + reverse）
2. ⚠️ 更新测试文件中的模板ID引用

### 中优先级

3. 更新文档和注释
4. 运行完整测试套件
5. 验证双向卡片创建功能

### 低优先级

6. 清理旧的测试数据中的模板ID引用
7. 更新用户文档

## 优势

1. **代码简化**：减少模板数量，降低维护成本
2. **逻辑统一**：所有快速卡片使用同一套渲染逻辑
3. **灵活性**：通过动态 cardRules 支持不同场景
4. **可扩展性**：未来添加新的卡片类型更容易

## 注意事项

1. 现有数据库中的卡片仍使用旧模板ID，需要兼容处理
2. 双向卡片的 `isBidirectional` 标记需要在 UseCase 层实现
3. 测试文件需要同步更新

## 构建状态

✅ 构建成功（2025-02-22）
- 无编译错误
- 无类型错误
- 打包成功
- 双向卡片逻辑已实现

## 实现的功能

### 1. 模板合并
- ✅ 删除 `builtin-symbol-qa` 模板
- ✅ 删除 `builtin-quick-bidirectional` 模板
- ✅ 统一使用 `builtin-quick-card` 模板

### 2. 双向卡片支持
- ✅ 添加 `isBidirectional` 标记到命令
- ✅ 动态生成 forward + reverse cardRules
- ✅ 生成两个 CardFace，使用相同块内容
- ✅ BasicCardStrategy 根据 typeMarker 渲染不同方向

### 3. 业务逻辑更新
- ✅ `CreateCardUseCase`：检测 `<>` 符号时返回 `builtin-quick-card`
- ✅ `AutoCardHandler`：双向卡片使用 `isBidirectional: true` 标记
- ✅ `CardCreationHelper`：符号卡使用 `builtin-quick-card`

## 下一步

1. 更新测试文件中的模板ID引用
2. 运行测试验证功能
3. 测试双向卡片创建和渲染
