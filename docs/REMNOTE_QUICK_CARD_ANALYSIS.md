# RemNote 快速制卡方式分析

**文档创建时间**：2026-02-14  
**目的**：分析 RemNote 的快速制卡方式，为思源插件提供参考

---

## 📋 RemNote 的快速制卡方式总览

RemNote 提供了 **6 种主要**快速制卡方式，通过简单的符号触发：

---

## 1️⃣ Basic Cards（基础卡片）

### 触发符号

- `>>` 或 `==` - 正向卡片（问题 → 答案）
- `<<` - 反向卡片（答案 → 问题）
- `<>` - 双向卡片
- `=-` - 不创建卡片（占位符）

### 格式

```
问题 >> 答案
```

### 特点

- ✅ 最简单的卡片类型
- ✅ 可选择方向（正向/反向/双向）
- ✅ 适合简单问答
- ✅ 自动显示上下文（父级内容）

### 示例

```
What is the capital of France? >> Paris
```

### 上下文显示

RemNote 会自动显示卡片的父级内容作为上下文：

```
Cell
  ├─ Mitochondria :: Organelles that generate energy
  └─ How are they thought to have originated? >> Endosymbiosis
```

复习时会显示：
```
[上下文]
Cell
  Mitochondria

[问题]
How are they thought to have originated?

[答案]
Endosymbiosis
```

---

## 2️⃣ Concept Cards（概念卡片）

### 触发符号

`::` (两个冒号)

### 格式

```
概念名称 :: 定义
```

### 特点

- ✅ 概念名称显示为**粗体**
- ✅ 默认生成双向卡片
- ✅ 概念名称首字母大写（约定）
- ✅ 适合定义概念
- ✅ 不显示父级概念的定义（避免泄露答案）

### 示例

```
Cell :: The basic structural and functional unit of all living organisms
```

### 与 Basic Card 的区别

- **Basic Card**：显示父级的完整内容（包括答案）
- **Concept Card**：只显示父级的概念名称（不显示定义）

---

## 3️⃣ Descriptor Cards（描述符卡片）

### 触发符号

`;;` (两个分号)

### 格式

```
属性名称 ;; 描述
```

### 特点

- ✅ 属性名称显示为*斜体*
- ✅ 默认只生成正向卡片
- ✅ 属性名称首字母小写（约定）
- ✅ 适合描述概念的特定属性
- ✅ 必须作为 Concept 的子项

### 示例

```
Mitochondria :: Organelles that generate energy
  ├─ origin ;; Thought to have originated through endosymbiosis
  └─ function ;; Generate ATP for the cell
```

### 命名约定

- **Concept**：首字母大写（Cell, Mitochondria）
- **Descriptor**：首字母小写（origin, function）

---

## 4️⃣ Cloze Cards（填空卡片）

### 触发方式

- **方式 1**：选中文本 → 点击工具栏的填空按钮（虚线框图标）
- **方式 2**：选中文本 → 按 `{` 键
- **方式 3**：输入时按 `{{` 开始，`}}` 结束

### 格式

```
The {{mitochondria}} generate {{ATP}} for the cell.
```

### 特点

- ✅ 可以在同一句话中创建多个填空
- ✅ 可以选择"全部隐藏"或"逐个隐藏"
- ✅ 可以与其他卡片类型组合使用
- ✅ 创建速度快

### 多填空选项

点击填空旁的下拉箭头可以选择：
- **All at once**：所有填空同时隐藏（1 张卡片）
- **One by one**：每个填空单独隐藏（多张卡片）

### 组合使用

可以同时创建 Basic/Concept 卡片和 Cloze 卡片：

```
Cell :: The {{basic}} structural and {{functional}} unit of all living organisms
```

这会生成：
- 1 张 Concept 卡片（Cell ↔ 定义）
- 2 张 Cloze 卡片（填空 basic 和 functional）

### 使用建议

⚠️ **注意事项**：
- Cloze 卡片容易因为固定的句子结构而降低记忆效果
- 在真实场景中，你不会总是看到相同的句子提示
- 建议作为辅助手段，而非主要制卡方式
- 适合记忆引用、公式等需要精确记忆的内容

✅ **适用场景**：
- 记忆引用原文
- 记忆公式
- 快速创建大量卡片
- 强化复杂定义的记忆

---

## 5️⃣ Multi-Line Cards（多行卡片）

### 触发方式

- **方式 1**：输入触发符号 3 次（如 `>>>` 而非 `>>`）
- **方式 2**：输入触发符号 2 次后按 Enter

### 格式

```
问题 >>>
  - 答案项 1
  - 答案项 2
  - 答案项 3
```

### 特点

- ✅ 答案是一个列表
- ✅ 可以选择"一次显示全部"或"逐个翻转"
- ✅ 适合有多个要点的答案

### 示例

```
What are the main functions of mitochondria? >>>
  - Generate ATP
  - Regulate cell metabolism
  - Control cell death (apoptosis)
```

---

## 6️⃣ Multiple-Choice Cards（选择题卡片）

### 触发符号

`>>A)` (两个右箭头 + A + 右括号)

### 格式

```
问题 >>A)
  A) 正确答案
  B) 错误答案 1
  C) 错误答案 2
  D) 错误答案 3
```

### 特点

- ✅ 默认 A 选项为正确答案
- ✅ 可以点击字母切换正确/错误
- ✅ 可以有多个正确答案
- ✅ 答案顺序随机显示（避免记住字母）
- ✅ 自动评分（选对 → "Recalled with effort"，选错 → "Forgot"）

### 修改正确答案

- 点击选项字母切换正确/错误状态
- 使用命令 `/mcr` 或 `/correct` 标记为正确
- 使用命令 `/mcw` 或 `/incorrect` 标记为错误

### AI 解释功能

开启 AI 后，RemNote 会自动解释：
- 为什么你的选择是正确的
- 为什么你的选择是错误的

### 额外说明

使用 `/extra` 或 `/ecd` 命令可以为选项添加额外说明：

```
问题 >>A)
  A) 正确答案
    /extra 这是正确答案的详细解释
  B) 错误答案
    /extra 这是为什么这个答案错误的解释
```

---

## 📊 快速制卡方式对比

| 类型 | 触发符号 | 方向 | 格式 | 适用场景 |
|------|---------|------|------|---------|
| **Basic** | `>>` `<<` `<>` | 可选 | 问题 >> 答案 | 简单问答 |
| **Concept** | `::` | 双向 | 概念 :: 定义 | 定义概念 |
| **Descriptor** | `;;` | 正向 | 属性 ;; 描述 | 描述属性 |
| **Cloze** | `{{}}` | - | 文本{{填空}} | 填空记忆 |
| **Multi-Line** | `>>>` | 可选 | 问题 >>> 列表 | 多要点答案 |
| **Multiple-Choice** | `>>A)` | 正向 | 问题 >>A) 选项 | 选择题练习 |

---

## 🎯 设计原则

### 1. 简洁性

- ✅ 使用简单的符号触发（`>>`, `::`, `;;`）
- ✅ 符号直观易记
- ✅ 不打断写作流程

### 2. 层次性

- ✅ Concept（概念）→ Descriptor（属性）
- ✅ 自动显示上下文
- ✅ 避免重复信息

### 3. 灵活性

- ✅ 可选择卡片方向
- ✅ 可组合使用
- ✅ 可临时禁用

### 4. 智能性

- ✅ 自动识别卡片类型
- ✅ 智能显示上下文
- ✅ AI 辅助解释

---

## 💡 对思源插件的启示

### 1. 可以借鉴的设计

#### ✅ 符号触发机制

```
问题 >> 答案          # Basic Card
概念 :: 定义          # Concept Card
属性 ;; 描述          # Descriptor Card
文本{{填空}}文本      # Cloze Card
```

#### ✅ 方向选择

- 正向：`>>`
- 反向：`<<`
- 双向：`<>`
- 禁用：`=-`

#### ✅ 上下文显示

- 自动显示父级块内容
- Concept 卡片不显示父级定义

#### ✅ 多行卡片

- `>>>` 触发多行模式
- 支持列表答案

### 2. 思源特有的优势

#### ✅ 块引用

```
问题 >> ((20240214-blockid))  # 答案可以是块引用
```

#### ✅ 双链

```
概念 :: [[相关概念]]的定义  # 支持双链
```

#### ✅ 嵌入块

```
问题 >> 
  {{select * from blocks where ...}}  # 嵌入查询结果
```

#### ✅ 文档树结构

- 利用思源的文档树结构
- 自动继承父级上下文
- 支持面包屑导航

### 3. 实现建议

#### Phase 1：基础符号触发

```typescript
// 检测符号模式
const patterns = {
    basicForward: /(.+?)\s*>>\s*(.+)/,      // 问题 >> 答案
    basicBackward: /(.+?)\s*<<\s*(.+)/,     // 答案 << 问题
    basicBoth: /(.+?)\s*<>\s*(.+)/,         // 双向
    concept: /(.+?)\s*::\s*(.+)/,           // 概念 :: 定义
    descriptor: /(.+?)\s*;;\s*(.+)/,        // 属性 ;; 描述
    cloze: /\{\{(.+?)\}\}/g,                // {{填空}}
};
```

#### Phase 2：方向控制

```typescript
interface CardDirection {
    forward: boolean;   // 正向
    backward: boolean;  // 反向
}

// 点击箭头切换方向
function toggleDirection(card: Card): void {
    // 切换逻辑
}
```

#### Phase 3：上下文显示

```typescript
// 获取父级块作为上下文
async function getContext(blockId: string): Promise<string[]> {
    const parents = await getParentBlocks(blockId);
    return parents.map(p => p.content);
}
```

#### Phase 4：多行支持

```typescript
// 检测多行模式
if (content.includes('>>>')) {
    // 创建多行卡片
    const children = await getChildBlocks(blockId);
    createMultiLineCard(question, children);
}
```

---

## 🚀 实现优先级

### P0（必须）

1. ✅ Basic Cards（`>>`, `<<`, `<>`）
2. ✅ Concept Cards（`::`）
3. ✅ Cloze Cards（`{{}}`）

### P1（重要）

4. ✅ Descriptor Cards（`;;`）
5. ✅ 上下文显示
6. ✅ 方向切换

### P2（可选）

7. ⭐ Multi-Line Cards（`>>>`）
8. ⭐ Multiple-Choice Cards（`>>A)`）
9. ⭐ AI 解释功能

---

## 📝 总结

RemNote 的快速制卡系统设计精妙：

1. **简洁**：符号简单易记
2. **灵活**：支持多种卡片类型
3. **智能**：自动上下文、AI 辅助
4. **高效**：不打断写作流程

思源插件可以借鉴这些设计，结合思源的特色功能（块引用、双链、嵌入块），打造更强大的快速制卡系统。

---

**参考资料**：
- [Creating Flashcards - RemNote Help Center](https://help.remnote.com/en/articles/8663109-flashcard-basics)
- RemNote 官方文档