# 卡片类型检测服务集成完成

## 概述

创建了一个符合 DDD 架构的可复用卡片类型检测服务 `CardTypeDetectionService`，并成功集成到多个使用场景中。

## 实现内容

### 1. CardTypeDetectionService（领域服务）

**位置**: `src/core/xiuyuan/domain/services/CardTypeDetectionService.ts`

**设计原则**:
- ✅ 领域服务：封装不属于单个实体的业务逻辑
- ✅ 无状态：纯函数，使用静态方法
- ✅ 使用 Result 类型：统一错误处理
- ✅ 单一职责：只负责卡片类型检测

**核心方法**:

1. `detectMultiCloze(content: string)` - 检测多挖空
   - 返回：`Result<ClozeInfo[] | null>`
   - 如果有多个挖空，返回挖空列表

2. `detectSingleCloze(content: string)` - 检测单挖空
   - 返回：`Result<ClozeInfo[] | null>`
   - 如果只有一个挖空，返回挖空列表

3. `detectSymbol(content: string)` - 检测符号
   - 返回：`Result<SymbolDetectionResult | null>`
   - 检测 `>>`、`<<`、`<>` 及其中文版本
   - 返回符号类型和实际使用的符号

4. `detectConceptDefinition(content: string)` - 检测概念定义
   - 返回：`Result<ConceptDefinitionDetectionResult | null>`
   - 检测块引用 + `::` 的模式

5. `detect(content: string, options?)` - 综合检测
   - 返回：`Result<CardTypeDetectionResult>`
   - 按优先级依次检测：
     1. 块属性标记（concept/descriptor）
     2. 多挖空
     3. 单挖空
     4. 符号
     5. 概念定义
     6. 默认（builtin-riff-sync）
   - 返回推荐的模板 ID 和置信度

**辅助方法**:
- `cleanContent(content: string)` - 清理内容（移除 IAL 和代码块）
- `hasSymbol(content: string, symbols: string[])` - 检查是否包含符号
- `extractBlockRefs(content: string)` - 提取块引用 ID

### 2. 集成到 XiuyuanSyncService

**位置**: `src/application/services/XiuyuanSyncService.ts`

**修改内容**:

#### 2.1 修改了 `smartDetectCardType` 方法

```typescript
private async smartDetectCardType(riffBlock: RiffBlock): Promise<'topic' | 'item' | 'concept' | 'descriptor'> {
    // 1. 获取块内容
    const { kramdown } = await getBlockKramdown(riffBlock.id);
    
    // 2. 使用 CardTypeDetectionService 检测
    const detectionResult = CardTypeDetectionService.detect(kramdown);
    
    // 3. 根据模板 ID 推导 topic/item/concept/descriptor 类型
    switch (detection.templateId) {
        case 'builtin-concept-simple':
            return 'concept';
        case 'builtin-concept-descriptor':
            return 'descriptor';
        case 'builtin-multi-cloze':
        case 'builtin-cloze':
        case 'builtin-quick-card':
        case 'builtin-concept-definition':
            return 'item';
        default:
            // 回退到旧的检测逻辑
            return await detectCardType(riffBlock.id);
    }
}
```

#### 2.2 修改了 `convertRiffCardToFSRSCard` 方法（关键修复）

**问题**: Riff 制卡后没有自动识别多挖空

**原因**: `convertRiffCardToFSRSCard` 只创建一个 Xiuyuan，没有检测多挖空

**解决方案**: 在方法开头添加多挖空检测逻辑

```typescript
private async convertRiffCardToFSRSCard(riffBlock: RiffBlock): Promise<{
    xiuyuanEntity: Xiuyuan;
    isMultiCloze?: boolean;
    totalCards?: number;
}> {
    // 1. 获取块内容并检测多挖空
    const { kramdown } = await getBlockKramdown(riffBlock.id);
    
    if (kramdown) {
        // 使用 CardTypeDetectionService 检测多挖空
        const multiClozeResult = CardTypeDetectionService.detectMultiCloze(kramdown);
        
        if (multiClozeResult.ok && multiClozeResult.value && multiClozeResult.value.length > 1) {
            // 🎯 检测到多挖空！使用 XiuyuanApplicationService 创建多张卡片
            const xiuyuanAppService = await this.getXiuyuanApplicationService();
            if (xiuyuanAppService) {
                const result = await xiuyuanAppService.createFromBlocks({
                    blockIds: [riffBlock.id],
                    templateId: 'builtin-multi-cloze',
                    fieldMapping: { content: riffBlock.id },
                    deckId: BUILTIN_DECK_ID
                });
                
                if (result.ok && result.value.xiuyuans.length > 0) {
                    // 返回第一个 Xiuyuan（其他的已经保存到 Repository）
                    return {
                        xiuyuanEntity: result.value.xiuyuans[0],
                        isMultiCloze: true,
                        totalCards: result.value.xiuyuans.length
                    };
                }
            }
        }
    }
    
    // 2. 如果不是多挖空，继续使用原有逻辑创建单张卡片
    // ...
}
```

**效果**:
- ✅ Riff 制卡后自动检测多挖空
- ✅ 自动创建多张 Xiuyuan 卡片（每个挖空一个）
- ✅ 使用 `builtin-multi-cloze` 模板
- ✅ 保持向后兼容（非多挖空卡片仍使用原有逻辑）

**使用场景**: Riff 制卡后识别卡片类型

### 3. 集成到 AutoCardHandler

**位置**: `src/application/handlers/AutoCardHandler.ts`

**修改内容**:

重构了 `detectAllSymbols` 方法，使用 `CardTypeDetectionService` 进行统一检测：

```typescript
private detectAllSymbols(content: string, settings: any) {
    const symbols = [];
    
    // 1. 检测符号（>>、<<、<>）
    const symbolResult = CardTypeDetectionService.detectSymbol(content);
    if (symbolResult.ok && symbolResult.value) {
        // 根据符号类型添加到结果
    }
    
    // 2. 检测概念定义（块引用 + ::）
    const conceptDefResult = CardTypeDetectionService.detectConceptDefinition(content);
    
    // 3. 检测填空卡片
    const clozeResult = CardTypeDetectionService.detectMultiCloze(content);
    const singleClozeResult = CardTypeDetectionService.detectSingleCloze(content);
    
    return symbols;
}
```

**使用场景**: 符号监听制卡时检测符号类型

## 卡片模板清单（9种）

1. `builtin-basic-qa` - 基础问答
2. `builtin-bidirectional` - 双向卡片
3. `builtin-cloze` - 单填空
4. `builtin-multi-cloze` - 多填空
5. `builtin-list-item` - 列表项模板
6. `builtin-concept-descriptor` - 概念-描述符
7. `builtin-concept-definition` - 概念定义
8. `builtin-concept-simple` - 概念卡（简单）
9. `builtin-quick-card` - 快速卡片

## 检测优先级

### Riff 制卡后的检测优先级

1. **块属性标记**（最高优先级）
   - `custom-fsrs-card-type: concept` → `builtin-concept-simple`
   - `custom-fsrs-card-type: descriptor` → `builtin-concept-descriptor`

2. **多挖空检测**
   - 多个 `{{}}`、`==`、思源标记 → `builtin-multi-cloze`

3. **单挖空检测**
   - 单个 `{{}}`、`==`、思源标记 → `builtin-cloze`

4. **符号检测**
   - `>>`、`<<`、`<>` → `builtin-quick-card`

5. **概念定义检测**
   - 块引用 + `::` → `builtin-concept-definition`

6. **默认处理**
   - 使用旧的 `detectCardType` 逻辑（检查是否有答案块）
   - 返回 `topic` 或 `item`

### 符号监听制卡的检测顺序

1. 符号检测（`>>`、`<<`、`<>`）
2. 概念定义检测（块引用 + `::`）
3. 描述符检测（`;;`）
4. 填空检测（`{{}}`、`==`、思源标记）

## 设计决策

### 1. 为什么移除列表模板检测？

用户明确要求移除列表模板检测，原因：
- 列表模板卡触发太快，容易误触
- 打出 `>>>` 后会立即触发，但用户还没来得及输入子列表项
- 建议使用手动创建列表模板卡的方式（右键菜单）

### 2. 为什么使用 Result 类型？

- 符合 DDD 架构规范
- 强制显式错误处理
- 类型安全，编译时检查
- 避免异常抛出

### 3. 为什么使用静态方法？

- 领域服务必须无状态
- 纯函数，易于测试
- 不依赖实例状态
- 符合函数式编程原则

### 4. 为什么需要 cleanContent？

- 移除 IAL 属性块（`{:...}`），避免干扰正则匹配
- 移除代码块（`` `code` `` 和 ``` ```code``` ```），避免误触发
- 例如：`` `这里有个 :: 符号` `` 不应该触发概念卡片

## 复用场景

### 场景 1: Riff 制卡后识别

```typescript
// XiuyuanSyncService.convertRiffCardToFSRSCard()
const cardType = await this.smartDetectCardType(riffBlock);
```

### 场景 2: 符号监听制卡

```typescript
// AutoCardHandler.detectAllSymbols()
const symbols = this.detectAllSymbols(content, settings);
```

### 场景 3: 模板选择（未来）

```typescript
// 在模板选择逻辑中使用
const detectionResult = CardTypeDetectionService.detect(content);
const recommendedTemplate = detectionResult.value.templateId;
```

## 测试建议

### 单元测试

1. **detectMultiCloze**
   - 测试多个挖空
   - 测试单个挖空（应返回 null）
   - 测试无挖空（应返回 null）

2. **detectSingleCloze**
   - 测试单个挖空
   - 测试多个挖空（应返回 null）
   - 测试无挖空（应返回 null）

3. **detectSymbol**
   - 测试 `>>`、`<<`、`<>`
   - 测试中文版本 `》》`、`《《`、`《》`
   - 测试排除 `>>>`（列表模板）
   - 测试代码块中的符号（应忽略）

4. **detectConceptDefinition**
   - 测试块引用 + `::`
   - 测试块引用 + `：：`（中文）
   - 测试无块引用（应返回 null）
   - 测试无 `::`（应返回 null）

5. **detect**
   - 测试优先级顺序
   - 测试块属性标记
   - 测试默认情况

### 集成测试

1. **Riff 同步**
   - 创建不同类型的块
   - 触发 Riff 同步
   - 验证卡片类型是否正确

2. **符号监听**
   - 输入不同符号
   - 验证是否创建正确类型的卡片
   - 验证是否避免误触发

## 后续优化

1. **性能优化**
   - 缓存检测结果
   - 批量检测

2. **功能扩展**
   - 支持更多卡片类型
   - 支持自定义检测规则

3. **错误处理**
   - 更详细的错误信息
   - 错误恢复策略

## 相关文档

- [DDD 架构文档](../../core/xiuyuan/README.md)
- [卡片类型检测服务源码](../../core/xiuyuan/domain/services/CardTypeDetectionService.ts)
- [XiuyuanSyncService 源码](../services/XiuyuanSyncService.ts)
- [AutoCardHandler 源码](../handlers/AutoCardHandler.ts)
