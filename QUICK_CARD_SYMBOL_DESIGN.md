# 思源插件快速制卡符号设计方案

**文档创建时间**：2026-02-14  
**基于**：RemNote 快速制卡分析  
**目标**：为思源插件设计简洁高效的快速制卡系统

---

## 🎯 设计目标

1. ✅ **简洁**：符号简单易记，不打断写作流程
2. ✅ **灵活**：支持多种卡片类型和方向
3. ✅ **智能**：自动检测、自动上下文
4. ✅ **兼容**：与思源现有功能（块引用、双链）无缝集成

---

## 📋 支持的卡片类型

### 1️⃣ Basic Cards（基础卡片）

#### 触发符号

```
问题 >> 答案      # 正向卡片（默认）
答案 << 问题      # 反向卡片
问题 <> 答案      # 双向卡片
问题 =- 答案      # 不创建卡片（占位符）
```

#### 示例

```markdown
法国的首都是哪里？ >> 巴黎
Paris << What is the capital of France?
FSRS算法 <> 一种基于记忆曲线的间隔重复算法
临时笔记 =- 稍后整理
```

#### 特点

- ✅ 最常用的卡片类型
- ✅ 支持块引用作为答案：`问题 >> ((blockid))`
- ✅ 支持双链：`问题 >> [[文档名]]`
- ✅ 自动显示父级块作为上下文

---

### 2️⃣ Concept Cards（概念卡片）

#### 触发符号

```
概念名称 :: 定义
```

#### 示例

```markdown
细胞 :: 生物体结构和功能的基本单位
FSRS :: Free Spaced Repetition Scheduler，一种开源的间隔重复算法
WebSocket :: 一种在单个TCP连接上进行全双工通信的协议
```

#### 特点

- ✅ 概念名称自动加粗显示
- ✅ 默认生成双向卡片
- ✅ 适合定义术语、概念
- ✅ 复习时不显示父级概念的定义（避免泄露答案）

#### 命名约定

- 概念名称首字母大写（中文无此限制）
- 定义简洁明了

---

### 3️⃣ Descriptor Cards（描述符卡片）

#### 触发符号

```
属性名称 ;; 描述
```

#### 示例

```markdown
线粒体 :: 细胞的能量工厂
  ├─ 起源 ;; 被认为是通过内共生起源的
  ├─ 功能 ;; 为细胞生成ATP
  └─ 结构 ;; 具有双层膜结构
```

#### 特点

- ✅ 属性名称自动斜体显示
- ✅ 默认只生成正向卡片
- ✅ 必须作为 Concept 的子块
- ✅ 适合描述概念的具体属性

#### 命名约定

- 属性名称首字母小写（中文无此限制）
- 描述简洁具体

---

### 4️⃣ Cloze Cards（填空卡片）

#### 触发符号

```
文本{{填空1}}文本{{填空2}}文本
```

#### 示例

```markdown
{{线粒体}}是细胞的{{能量工厂}}，负责生成{{ATP}}。

FSRS算法的核心是{{记忆稳定性}}和{{记忆难度}}两个参数。

思源笔记支持{{块引用}}、{{双链}}和{{嵌入块}}等功能。
```

#### 特点

- ✅ 可以在同一块中创建多个填空
- ✅ 支持两种模式：
  - **全部隐藏**：所有填空同时隐藏（1张卡片）
  - **逐个隐藏**：每个填空单独隐藏（N张卡片）
- ✅ 可以与其他卡片类型组合使用

#### 组合使用

```markdown
细胞 :: {{生物体}}结构和功能的{{基本单位}}
```

这会生成：
- 1 张 Concept 卡片（细胞 ↔ 定义）
- 2 张 Cloze 卡片（填空"生物体"和"基本单位"）

---

### 5️⃣ List Template Cards（列表模版卡片）

#### 触发符号

```
问题 >>>
  - 答案项1
  - 答案项2
  - 答案项3
```

#### 示例

```markdown
线粒体的主要功能有哪些？ >>>
  - 生成ATP
  - 调节细胞代谢
  - 控制细胞凋亡

FSRS算法的优势 >>>
  - 基于大量真实数据训练
  - 自适应学习曲线
  - 开源免费
```

#### 特点

- ✅ 答案是一个列表
- ✅ 支持两种复习模式：
  - **一次显示全部**：所有答案一起显示
  - **逐个翻转**：答案逐个显示
- ✅ 适合有多个要点的答案

#### 实现方式

- 检测 `>>>` 符号
- 获取子级列表项作为答案
- 创建 Xiuyuan 列表模版卡片

---

### 6️⃣ Multiple-Choice Cards（选择题卡片）

#### 触发符号

```
问题 >>A)
  A) 正确答案
  B) 错误答案1
  C) 错误答案2
  D) 错误答案3
```

#### 示例

```markdown
FSRS算法的核心参数是？ >>A)
  A) 记忆稳定性和记忆难度
  B) 遗忘曲线和学习曲线
  C) 复习次数和正确率
  D) 学习时间和记忆强度
```

#### 特点

- ✅ 默认A选项为正确答案
- ✅ 可以点击切换正确/错误
- ✅ 可以有多个正确答案
- ✅ 答案顺序随机显示
- ✅ 自动评分

#### 扩展功能

- 使用 `/correct` 标记正确答案
- 使用 `/incorrect` 标记错误答案
- 使用 `/extra` 添加解释说明

---

## 🔄 符号检测优先级

### 检测顺序

```typescript
1. Multiple-Choice: >>A)
2. Multi-Line: >>>
3. Concept: ::
4. Descriptor: ;;
5. Basic (Both): <>
6. Basic (Forward): >>
7. Basic (Backward): <<
8. Basic (Disabled): =-
9. Cloze: {{...}}
```

### 原因

- 长符号优先（避免误匹配）
- 特殊符号优先（避免被通用符号覆盖）

---

## 🎨 视觉反馈

### 符号转换

输入符号后，自动转换为可视化标记：

```
>> → →  (右箭头)
<< → ←  (左箭头)
<> → ↔  (双向箭头)
=- → ⊘  (禁用符号)
:: → 【概念】(加粗)
;; → 【属性】(斜体)
{{}} → [填空]
>>> → ⇓  (多行箭头)
>>A) → [选择题]
```

### 颜色标记

- **Basic**: 蓝色箭头
- **Concept**: 绿色加粗
- **Descriptor**: 灰色斜体
- **Cloze**: 黄色高亮
- **Multi-Line**: 紫色箭头
- **Multiple-Choice**: 橙色标记

---

## 🔧 实现方案

### Phase 1：符号检测（WebSocket监听）

```typescript
class QuickCardSymbolDetector {
    private patterns = {
        multipleChoice: /(.+?)\s*>>A\)\s*$/,
        multiLine: /(.+?)\s*>>>\s*$/,
        concept: /(.+?)\s*::\s*(.+)/,
        descriptor: /(.+?)\s*;;\s*(.+)/,
        basicBoth: /(.+?)\s*<>\s*(.+)/,
        basicForward: /(.+?)\s*>>\s*(.+)/,
        basicBackward: /(.+?)\s*<<\s*(.+)/,
        basicDisabled: /(.+?)\s*=-\s*(.+)/,
        cloze: /\{\{(.+?)\}\}/g,
    };
    
    detect(content: string): CardType | null {
        // 按优先级检测
        for (const [type, pattern] of Object.entries(this.patterns)) {
            if (pattern.test(content)) {
                return type as CardType;
            }
        }
        return null;
    }
}
```

### Phase 2：卡片创建

```typescript
class QuickCardCreator {
    async createCard(blockId: string, type: CardType, content: string): Promise<void> {
        switch (type) {
            case 'basicForward':
                await this.createBasicCard(blockId, content, 'forward');
                break;
            case 'concept':
                await this.createConceptCard(blockId, content);
                break;
            case 'cloze':
                await this.createClozeCard(blockId, content);
                break;
            // ... 其他类型
        }
    }
    
    private async createBasicCard(
        blockId: string, 
        content: string, 
        direction: 'forward' | 'backward' | 'both'
    ): Promise<void> {
        const [question, answer] = this.parseBasicCard(content);
        
        // 创建卡片
        const card = createDefaultCard(blockId);
        card.type = 'item';
        card.direction = direction;
        
        // 添加到 Riff
        await addRiffCards(BUILTIN_DECK_ID, [blockId]);
        
        // 标记 FSRS 属性
        await markBlockAsCard(blockId, card.id, card.priority, 'item');
        
        // 保存到存储
        this.plugin.storage.setCard(card);
    }
}
```

### Phase 3：上下文显示

```typescript
class CardContextProvider {
    async getContext(blockId: string, cardType: CardType): Promise<string[]> {
        const parents = await this.getParentBlocks(blockId);
        
        // Concept 卡片不显示父级的定义
        if (cardType === 'concept') {
            return parents.map(p => this.extractConceptName(p.content));
        }
        
        // 其他卡片显示完整内容
        return parents.map(p => p.content);
    }
    
    private extractConceptName(content: string): string {
        const match = content.match(/(.+?)\s*::\s*(.+)/);
        return match ? match[1] : content;
    }
}
```

### Phase 4：方向切换

```typescript
class CardDirectionController {
    async toggleDirection(blockId: string): Promise<void> {
        const card = await this.getCard(blockId);
        
        // 切换方向：forward → backward → both → forward
        const directions = ['forward', 'backward', 'both'];
        const currentIndex = directions.indexOf(card.direction);
        const nextIndex = (currentIndex + 1) % directions.length;
        
        card.direction = directions[nextIndex];
        
        // 更新视觉标记
        await this.updateSymbol(blockId, card.direction);
        
        // 保存
        this.plugin.storage.setCard(card);
    }
    
    private async updateSymbol(blockId: string, direction: string): Promise<void> {
        const symbols = {
            forward: '>>',
            backward: '<<',
            both: '<>',
        };
        
        // 更新块内容中的符号
        // ...
    }
}
```

---

## 📊 与现有功能的集成

### 1. 与 TransactionObserver 集成

```typescript
// 在 TransactionObserver 中添加符号检测
private async checkAndCreateCard(blockId: string) {
    const { kramdown } = await getBlockKramdown(blockId);
    
    // 🆕 优先检测符号
    const symbolType = this.symbolDetector.detect(kramdown);
    if (symbolType) {
        await this.quickCardCreator.createCard(blockId, symbolType, kramdown);
        return;
    }
    
    // 原有的策略匹配逻辑
    const strategy = this.builder.matchStrategy(blockId, kramdown, true);
    // ...
}
```

### 2. 与 Xiuyuan 集成

```typescript
// 列表模版卡片使用 Xiuyuan
if (symbolType === 'multiLine') {
    const children = await getChildBlocks(blockId);
    await this.plugin.xiuyuanService.createFromBlocks(
        [blockId, ...children],
        'builtin-list-item',
        { question: blockId, answer: children[0] },
        BUILTIN_DECK_ID
    );
}
```

### 3. 与块引用集成

```typescript
// 支持块引用作为答案
const answer = '((20240214-blockid))';
if (this.isBlockRef(answer)) {
    const refContent = await this.getBlockContent(answer);
    // 使用引用的内容作为答案
}
```

---

## 🚀 实现优先级

### P0（必须实现）

1. ✅ Basic Cards（`>>`, `<<`, `<>`）
2. ✅ Concept Cards（`::`）
3. ✅ Cloze Cards（`{{}}`）
4. ✅ WebSocket 监听
5. ✅ 符号检测

### P1（重要功能）

6. ✅ Descriptor Cards（`;;`）
7. ✅ 上下文显示
8. ✅ 方向切换
9. ✅ 视觉反馈

### P2（增强功能）

10. ⭐ Multi-Line Cards（`>>>`）
11. ⭐ Multiple-Choice Cards（`>>A)`）
12. ⭐ 块引用支持
13. ⭐ 双链支持

---

## 🎯 用户体验

### 输入流程

```
1. 用户输入：问题 >>
2. 系统检测到 >> 符号
3. 自动转换为 → 箭头
4. 用户继续输入答案
5. 保存时自动创建卡片
6. 显示创建成功提示
```

### 修改流程

```
1. 用户点击箭头
2. 显示方向选择菜单
3. 用户选择新方向
4. 更新符号和卡片
5. 显示更新成功提示
```

### 预览流程

```
1. 用户点击预览按钮
2. 显示卡片预览
3. 显示上下文
4. 显示正反面
5. 可以直接复习
```

---

## 📝 配置选项

### 设置面板

```typescript
interface QuickCardSettings {
    // 启用快速制卡
    enabled: boolean;
    
    // 启用的卡片类型
    enabledTypes: {
        basic: boolean;
        concept: boolean;
        descriptor: boolean;
        cloze: boolean;
        multiLine: boolean;
        multipleChoice: boolean;
    };
    
    // 默认方向
    defaultDirection: 'forward' | 'backward' | 'both';
    
    // 自动上下文
    autoContext: boolean;
    
    // 视觉反馈
    visualFeedback: boolean;
    
    // 防抖时间（毫秒）
    debounceDelay: number;
}
```

---

## ✅ 总结

### 核心优势

1. ✅ **简洁**：符号简单易记（`>>`, `::`, `;;`, `{{}}`）
2. ✅ **灵活**：支持6种卡片类型
3. ✅ **智能**：自动检测、自动上下文
4. ✅ **高效**：不打断写作流程
5. ✅ **兼容**：与思源特色功能无缝集成

### 与 RemNote 的对比

| 特性 | RemNote | 思源插件 |
|------|---------|---------|
| Basic Cards | ✅ | ✅ |
| Concept Cards | ✅ | ✅ |
| Descriptor Cards | ✅ | ✅ |
| Cloze Cards | ✅ | ✅ |
| Multi-Line Cards | ✅ | ✅ |
| Multiple-Choice | ✅ | ✅ |
| 块引用支持 | ❌ | ✅ |
| 双链支持 | ✅ | ✅ |
| 嵌入块支持 | ❌ | ✅ |
| WebSocket 监听 | ✅ | ✅ |

### 下一步

1. 实现 Phase 1：符号检测和 WebSocket 监听
2. 实现 Phase 2：基础卡片创建（Basic, Concept, Cloze）
3. 实现 Phase 3：上下文显示和方向切换
4. 实现 Phase 4：高级功能（Multi-Line, Multiple-Choice）

---

**文档创建时间**：2026-02-14  
**作者**：Kiro AI Assistant  
**基于**：RemNote 快速制卡分析
