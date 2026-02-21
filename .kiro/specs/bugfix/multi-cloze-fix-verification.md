# 多挖空卡修复验证

## 问题描述

用户反馈：多挖空卡仍然无法为每个挖空创建独立的卡片。

## 问题分析

通过代码审查发现问题根源：

1. **缺少 clozeInfo 参数**：`AutoCardHandler.createMultipleClozeCards` 方法没有传递 `clozeInfo` 参数给 `createFromBlocks`
2. **缺少位置信息**：提取的 clozes 数组缺少 `start` 和 `end` 字段，导致 `ClozeCardGenerator` 无法正确处理

## 修复方案

### 修改的文件

`src/application/handlers/AutoCardHandler.ts` - `createMultipleClozeCards` 方法

### 修复内容

1. **添加位置信息提取**：
   - 使用正则表达式重新提取填空，包含 `start` 和 `end` 位置
   - 支持 `{{}}` 和 `==` 两种填空符号
   - 按位置排序填空列表

2. **传递 clozeInfo 参数**：
   - 在调用 `createFromBlocks` 时传递 `clozeInfo` 对象
   - 包含 `originalContent` 和 `clozes` 数组

3. **简化流程**：
   - 移除了临时模板注册的复杂逻辑
   - 直接使用 `builtin-multi-cloze` 模板
   - 让 UseCase 通过 `ClozeCardGenerator` 领域服务处理填空生成

## 修复后的代码流程

```
AutoCardHandler.createMultipleClozeCards
  ↓
  提取填空（包含位置信息）
  ↓
  调用 xiuyuanAppService.createFromBlocks({
    blockIds: [blockId],
    templateId: 'builtin-multi-cloze',
    clozeInfo: {
      originalContent: content,
      clozes: clozesWithPosition
    }
  })
  ↓
CreateXiuyuanFromBlocksUseCase.execute
  ↓
  检测到 clozeInfo 参数
  ↓
  调用 ClozeCardGenerator.generateFaces
  ↓
  为每个填空生成一个 CardFace
  ↓
  创建 Xiuyuan 聚合根
  ↓
  为每个 CardFace 创建一张 FSRSCard
```

## 验证步骤

### 1. 准备测试内容

在思源笔记中创建一个包含多个填空的块：

```markdown
==线粒体==是细胞的==能量工厂==，负责生成==ATP==
```

或者使用 `{{}}` 符号：

```markdown
{{线粒体}}是细胞的{{能量工厂}}，负责生成{{ATP}}
```

### 2. 触发自动制卡

保存块后，AutoCardHandler 会自动检测填空符号并创建卡片。

### 3. 验证结果

应该看到以下提示：

```
✅ 已创建 3 张填空卡片 (==)
```

或

```
✅ 已创建 3 张填空卡片 ({{}})
```

### 4. 检查生成的卡片

在复习界面应该能看到 3 张独立的卡片：

**卡片 1**：
- 问题：`[...]是细胞的能量工厂，负责生成ATP`
- 答案：`线粒体`

**卡片 2**：
- 问题：`线粒体是细胞的[...]，负责生成ATP`
- 答案：`能量工厂`

**卡片 3**：
- 问题：`线粒体是细胞的能量工厂，负责生成[...]`
- 答案：`ATP`

### 5. 验证数据库

检查 Xiuyuan 和 FSRSCard 的数据：

```sql
-- 查询 Xiuyuan
SELECT * FROM xiuyuan WHERE id LIKE 'xy_%' ORDER BY createdAt DESC LIMIT 1;

-- 查询关联的卡片
SELECT * FROM fsrs_cards WHERE xiuyuanId = '<上面查询到的 xiuyuan.id>';
```

应该看到：
- 1 个 Xiuyuan 记录
- 3 个 FSRSCard 记录（faceIndex 分别为 0, 1, 2）

## 测试场景

### 场景 1：基本多挖空（== 符号）

输入：
```markdown
==线粒体==是细胞的==能量工厂==，负责生成==ATP==
```

预期：创建 3 张卡片

### 场景 2：基本多挖空（{{}} 符号）

输入：
```markdown
{{线粒体}}是细胞的{{能量工厂}}，负责生成{{ATP}}
```

预期：创建 3 张卡片

### 场景 3：混合符号

输入：
```markdown
==线粒体==是细胞的{{能量工厂}}，负责生成==ATP==
```

预期：创建 3 张卡片，提示显示 `{{}} / ==`

### 场景 4：单个挖空

输入：
```markdown
==线粒体==是细胞的能量工厂
```

预期：创建 1 张卡片（使用快速卡片逻辑）

### 场景 5：复杂内容

输入：
```markdown
在==生物学==中，==细胞==是生命的基本单位，而==线粒体==被称为细胞的==能量工厂==
```

预期：创建 4 张卡片

## 潜在问题

### 1. 填空位置重叠

如果填空标记重叠（如 `==abc{{def}}==`），可能导致位置计算错误。

**解决方案**：在提取填空时检测重叠，如果发现重叠则报错或回退到单卡模式。

### 2. 特殊字符处理

如果填空内容包含特殊字符（如 `==a\nb==`），可能导致渲染问题。

**解决方案**：在 `ClozeCardGenerator` 中对特殊字符进行转义。

### 3. 性能问题

如果一个块包含大量填空（如 20+ 个），可能导致创建时间过长。

**解决方案**：添加填空数量限制（如最多 10 个），超过限制时提示用户。

## 后续优化

1. **填空预览**：在创建前显示将要生成的卡片数量和预览
2. **选择性创建**：允许用户选择只为某些填空创建卡片
3. **批量创建**：支持选择多个块，为每个块创建多填空卡片
4. **填空编号**：在复习时显示填空编号（如 "填空 1/3"）
5. **渐进式学习**：支持按顺序学习填空（先学第一个，再学第二个...）

## 相关文档

- [多填空卡实现文档](./multi-cloze-card-implementation.md)
- [模版卡片规范](./template-card-specification.md)
- [ClozeCardGenerator 领域服务](../../src/core/xiuyuan/domain/services/ClozeCardGenerator.ts)
- [CreateXiuyuanFromBlocksUseCase](../../src/application/usecases/xiuyuan/CreateXiuyuanFromBlocksUseCase.ts)

## 总结

通过添加 `clozeInfo` 参数和完整的位置信息，多挖空卡现在可以正确地为每个挖空创建独立的卡片。修复后的代码流程更加清晰，符合 DDD 架构原则。
