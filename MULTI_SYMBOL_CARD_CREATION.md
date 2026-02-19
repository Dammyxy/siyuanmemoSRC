# 多符号制卡功能说明

## 问题背景

在快速制卡功能中，用户希望在一个块里使用多个符号（如 `::` 或 `??`）制作多张卡片，但原有的监听器在输入第一个符号组合完成时就自动触发制卡，导致无法继续输入后续符号。

## 解决方案

采用 **方案 5（智能检测块编辑完成）+ 方案 3（批量检测模式）** 的组合方案。

### 方案 5：智能检测块编辑完成

**核心思路**：监听块的"失焦"事件，而不是每次编辑都立即触发。

**实现机制**：

1. **记录当前编辑的块**
   - 使用 `currentEditingBlock` 记录用户当前正在编辑的块
   - 每次 `update` 或 `insert` 操作时更新这个值

2. **检测块失焦**
   - 当用户切换到其他块时（`currentEditingBlock` 发生变化）
   - 自动触发前一个块的制卡处理

3. **延长防抖时间**
   - 将快速符号的防抖时间从 300ms 延长到 1000ms
   - 给用户更多时间输入多个符号

**触发条件**：
- 用户停止输入超过 1 秒（防抖）
- 或者用户切换到其他块（失焦）

### 方案 3：批量检测模式

**核心思路**：一次扫描找出块内所有符号，批量创建多张卡片。

**实现机制**：

1. **批量检测所有符号**
   ```typescript
   private detectAllSymbols(content: string, settings: any): Array<{
       type: 'basic-both' | 'basic-forward' | 'basic-backward' | 'concept' | 'descriptor' | 'cloze';
       match: RegExpMatchArray;
   }>
   ```
   - 按优先级顺序检测所有符号类型
   - 返回所有匹配的符号列表

2. **批量创建卡片**
   ```typescript
   for (const symbol of detectedSymbols) {
       await this.createCardBySymbol(blockId, symbol, kramdown);
   }
   ```
   - 遍历所有检测到的符号
   - 逐个创建对应类型的卡片

**符号检测优先级**：
1. 双向卡片 `<>`
2. 正向卡片 `>>` (排除 `>>>`)
3. 反向卡片 `<<`
4. 概念卡片 `::`
5. 描述符卡片 `;;`
6. 填空卡片 `{{}}` 或 `==`

## 使用示例

### 示例 1：在一个块里创建多个概念卡片

```markdown
细胞 :: 生物体结构和功能的基本单位
线粒体 :: 细胞的能量工厂
细胞核 :: 包含遗传物质的细胞器
```

**行为**：
1. 用户输入第一个概念 `细胞 :: 生物体结构和功能的基本单位`
2. 继续输入第二个概念 `线粒体 :: 细胞的能量工厂`
3. 继续输入第三个概念 `细胞核 :: 包含遗传物质的细胞器`
4. 用户切换到其他块或停止输入 1 秒
5. 系统自动检测到 3 个概念符号，批量创建 3 张卡片

### 示例 2：混合使用不同符号

```markdown
FSRS :: Free Spaced Repetition Scheduler
算法优势 >> 基于记忆曲线，自动调整复习间隔
使用场景 <> 适合长期记忆和知识积累
```

**行为**：
1. 用户输入多个不同类型的符号
2. 切换到其他块或停止输入 1 秒
3. 系统检测到：
   - 1 个概念符号 `::`
   - 1 个正向符号 `>>`
   - 1 个双向符号 `<>`
4. 批量创建 3 张不同类型的卡片

## 技术实现

### 核心代码变更

1. **添加状态跟踪**
   ```typescript
   // 记录最后编辑时间（用于智能防抖）
   private lastEditTime: Map<string, number> = new Map();
   
   // 记录当前正在编辑的块（用于检测失焦）
   private currentEditingBlock: string | null = null;
   ```

2. **检测块失焦**
   ```typescript
   handle(transactions: Transaction[]): void {
       for (const op of tx.doOperations) {
           if (op.action === 'update' || op.action === 'insert') {
               // 检测失焦
               if (this.currentEditingBlock && this.currentEditingBlock !== blockId) {
                   this.processBlockImmediately(this.currentEditingBlock);
               }
               this.currentEditingBlock = blockId;
           }
       }
   }
   ```

3. **立即处理块**
   ```typescript
   private async processBlockImmediately(blockId: string): Promise<void> {
       // 从队列中移除（避免重复处理）
       this.quickQueue.delete(blockId);
       
       // 检测快速符号
       await this.checkQuickSymbols(blockId);
   }
   ```

4. **批量检测符号**
   ```typescript
   private detectAllSymbols(content: string, settings: any) {
       const symbols = [];
       
       // 按优先级检测所有符号
       if (settings.enabledSymbols.basic && this.patterns.basicBoth.test(content)) {
           symbols.push({ type: 'basic-both', match });
       }
       // ... 其他符号类型
       
       return symbols;
   }
   ```

### 配置变更

```typescript
private readonly QUICK_DEBOUNCE = 1000;   // 从 300ms 延长到 1000ms
```

## 优势

✅ **支持多符号输入**：用户可以在一个块里输入多个符号，不会被中途打断

✅ **响应及时**：块失焦时立即触发，不需要等待防抖时间

✅ **不会误触发**：编辑过程中不会触发，只在失焦或停止输入时触发

✅ **用户体验好**：符合自然的编辑习惯，不打断写作流程

✅ **批量创建**：一次性创建所有卡片，效率更高

## 注意事项

1. **防抖时间**：默认 1000ms，可以在设置中调整

2. **失焦检测**：依赖于 WebSocket 的 `update` 事件，如果 WebSocket 断开可能无法检测

3. **符号优先级**：如果一个块同时包含多种符号，会按优先级创建对应类型的卡片

4. **列表模版**：`>>>` 符号仍然使用独立的队列和更长的防抖时间（2000ms）

## 测试

运行测试：
```bash
npm run test -- AutoCardHandler-multi-symbol.test.ts
```

测试覆盖：
- ✅ 批量检测所有符号类型
- ✅ 符号优先级检测
- ✅ 排除 `>>>` 符号
- ✅ 记录当前编辑的块
- ✅ 切换块时触发失焦处理
- ✅ 延长防抖时间

## 未来改进

1. **手动触发**：添加快捷键（如 `Ctrl+Shift+C`）手动触发制卡

2. **可视化反馈**：显示检测到的符号数量和类型

3. **撤销功能**：支持撤销批量创建的卡片

4. **智能分组**：自动识别相关的符号，分组创建卡片

---

**文档版本**：v1.0  
**最后更新**：2026-02-15  
**作者**：Kiro AI Assistant
