# 快速制卡实现方案

**文档创建时间**：2026-02-14  
**目标**：结合 WebSocket 监听机制和 Xiuyuan 模版实现快速制卡

---

## 🎯 支持的卡片类型

### 1️⃣ Basic Cards（基础卡片）

**符号**：`>>` `<<` `<>`

**实现方式**：直接创建 FSRS Card（不使用 Xiuyuan）

**示例**：
```markdown
问题 >> 答案
答案 << 问题
问题 <> 答案（双向）
```

---

### 2️⃣ Concept Cards（概念卡片）

**符号**：`::`

**实现方式**：直接创建 FSRS Card（不使用 Xiuyuan）

**示例**：
```markdown
细胞 :: 生物体结构和功能的基本单位
```

---

### 3️⃣ Descriptor Cards（描述符卡片）

**符号**：`;;`

**实现方式**：使用 Xiuyuan 模版 `builtin-concept-descriptor`

**示例**：
```markdown
线粒体 :: 细胞的能量工厂
  ├─ 起源 ;; 被认为是通过内共生起源的
  └─ 功能 ;; 为细胞生成ATP
```

---

### 4️⃣ Cloze Cards（填空卡片）

**符号**：`{{}}`

**实现方式**：直接创建 FSRS Card（不使用 Xiuyuan）

**示例**：
```markdown
{{线粒体}}是细胞的{{能量工厂}}
```

---

### 5️⃣ Multi-Line Cards（多行卡片）

**符号**：`>>>`

**实现方式**：使用 Xiuyuan 模版 `builtin-list-item`（已实现）

**示例**：
```markdown
线粒体的主要功能有哪些？ >>>
  - 生成ATP
  - 调节细胞代谢
  - 控制细胞凋亡
```

---

### 6️⃣ Bidirectional Cards（双向卡片）

**符号**：`<>` 或使用 Xiuyuan 模版

**实现方式**：使用 Xiuyuan 模版 `builtin-bidirectional`

**示例**：
```markdown
Cell <> The basic structural unit of all living organisms
```

---

## 📊 实现方案总览

| 卡片类型 | 符号 | 使用 Xiuyuan？ | 模版 | 优先级 |
|---------|------|---------------|------|--------|
| Basic | `>>` `<<` | ❌ | - | P0 |
| Concept | `::` | ❌ | - | P0 |
| Cloze | `{{}}` | ❌ | - | P0 |
| Multi-Line | `>>>` | ✅ | `builtin-list-item` | P1 |
| Descriptor | `;;` | ✅ | `builtin-concept-descriptor` | P1 |
| Bidirectional | `<>` | ✅ | `builtin-bidirectional` | P2 |

---

## 🔧 核心架构

### 1. WebSocket 监听层

```typescript
/**
 * QuickCardWebSocketService
 * 
 * 职责：
 * - 监听思源的 transactions 事件
 * - 检测块内容变化
 * - 触发符号检测
 */
class QuickCardWebSocketService {
    private ws: WebSocket | null = null;
    private symbolDetector: SymbolDetector;
    private cardRouter: QuickCardRouter;
    
    constructor(plugin: FSRSPlugin) {
        this.symbolDetector = new SymbolDetector();
        this.cardRouter = new QuickCardRouter(plugin);
    }
    
    start(): void {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${location.host}/ws?app=siyuanmemo&type=main`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onmessage = (e: MessageEvent) => {
            const msg = JSON.parse(e.data);
            if (msg.cmd === 'transactions') {
                this.handleTransactions(msg.data);
            }
        };
    }
    
    private handleTransactions(transactions: any[]): void {
        // 防抖处理
        this.debounce(() => {
            transactions.forEach(tx => {
                tx.doOperations.forEach(op => {
                    if (op.action === 'insert' || op.action === 'update') {
                        this.processBlock(op.id);
                    }
                });
            });
        }, 300);
    }
    
    private async processBlock(blockId: string): Promise<void> {
        const { kramdown } = await getBlockKramdown(blockId);
        const symbolType = this.symbolDetector.detect(kramdown);
        
        if (symbolType) {
            await this.cardRouter.route(blockId, symbolType, kramdown);
        }
    }
}
```

---

### 2. 符号检测层

```typescript
/**
 * SymbolDetector
 * 
 * 职责：
 * - 检测块内容中的快速制卡符号
 * - 返回符号类型
 */
class SymbolDetector {
    private patterns = {
        multiLine: /(.+?)\s*>>>\s*$/,           // 问题 >>>
        concept: /^(.+?)\s*::\s*(.+)$/,         // 概念 :: 定义
        descriptor: /^(.+?)\s*;;\s*(.+)$/,      // 属性 ;; 描述
        basicBoth: /^(.+?)\s*<>\s*(.+)$/,       // 问题 <> 答案
        basicForward: /^(.+?)\s*>>\s*(.+)$/,    // 问题 >> 答案
        basicBackward: /^(.+?)\s*<<\s*(.+)$/,   // 答案 << 问题
        cloze: /\{\{(.+?)\}\}/g,                // {{填空}}
    };
    
    detect(content: string): SymbolType | null {
        // 按优先级检测（长符号优先）
        for (const [type, pattern] of Object.entries(this.patterns)) {
            if (pattern.test(content)) {
                return type as SymbolType;
            }
        }
        return null;
    }
    
    parse(content: string, type: SymbolType): ParsedSymbol {
        const pattern = this.patterns[type];
        const match = content.match(pattern);
        
        switch (type) {
            case 'basicForward':
            case 'basicBackward':
            case 'basicBoth':
                return {
                    type,
                    question: match[1].trim(),
                    answer: match[2].trim(),
                };
                
            case 'concept':
                return {
                    type,
                    concept: match[1].trim(),
                    definition: match[2].trim(),
                };
                
            case 'descriptor':
                return {
                    type,
                    attribute: match[1].trim(),
                    description: match[2].trim(),
                };
                
            case 'cloze':
                return {
                    type,
                    clozes: this.extractClozes(content),
                };
                
            case 'multiLine':
                return {
                    type,
                    question: match[1].trim(),
                };
        }
    }
}
```

---

### 3. 路由层

```typescript
/**
 * QuickCardRouter
 * 
 * 职责：
 * - 根据符号类型路由到不同的创建逻辑
 * - 决定是否使用 Xiuyuan
 */
class QuickCardRouter {
    constructor(private plugin: FSRSPlugin) {}
    
    async route(
        blockId: string, 
        symbolType: SymbolType, 
        content: string
    ): Promise<void> {
        switch (symbolType) {
            case 'basicForward':
            case 'basicBackward':
            case 'basicBoth':
                await this.createBasicCard(blockId, symbolType, content);
                break;
                
            case 'concept':
                await this.createConceptCard(blockId, content);
                break;
                
            case 'cloze':
                await this.createClozeCard(blockId, content);
                break;
                
            case 'descriptor':
                await this.createDescriptorCard(blockId, content);
                break;
                
            case 'multiLine':
                await this.createMultiLineCard(blockId, content);
                break;
        }
    }
    
    // ========== 简单卡片（不使用 Xiuyuan）==========
    
    private async createBasicCard(
        blockId: string, 
        type: SymbolType, 
        content: string
    ): Promise<void> {
        const card = createDefaultCard(blockId);
        card.type = 'item';
        
        // 设置方向
        if (type === 'basicBoth') {
            card.direction = 'both';
        } else if (type === 'basicBackward') {
            card.direction = 'backward';
        } else {
            card.direction = 'forward';
        }
        
        // 添加到 Riff
        await addRiffCards(BUILTIN_DECK_ID, [blockId]);
        
        // 标记 FSRS 属性
        await markBlockAsCard(blockId, card.id, card.priority, 'item');
        
        // 保存
        this.plugin.storage.setCard(card);
        
        console.log(`[QuickCard] ✅ Created Basic Card: ${blockId}`);
    }
    
    private async createConceptCard(
        blockId: string, 
        content: string
    ): Promise<void> {
        const card = createDefaultCard(blockId);
        card.type = 'topic'; // 概念卡通常是 topic
        card.direction = 'both'; // 默认双向
        
        // 添加到 Riff
        await addRiffCards(BUILTIN_DECK_ID, [blockId]);
        
        // 标记 FSRS 属性
        await markBlockAsCard(blockId, card.id, card.priority, 'topic');
        
        // 检测并标记卡片类型
        const cardType = await detectCardType(blockId);
        await setBlockAttrs(blockId, {
            'custom-fsrs-card-type': cardType,
        });
        
        // 保存
        this.plugin.storage.setCard(card);
        
        console.log(`[QuickCard] ✅ Created Concept Card: ${blockId}`);
    }
    
    private async createClozeCard(
        blockId: string, 
        content: string
    ): Promise<void> {
        const card = createDefaultCard(blockId);
        card.type = 'item';
        
        // 提取填空位置
        const clozes = this.extractClozes(content);
        card.meta.clozePositions = clozes;
        
        // 添加到 Riff
        await addRiffCards(BUILTIN_DECK_ID, [blockId]);
        
        // 标记 FSRS 属性
        await markBlockAsCard(blockId, card.id, card.priority, 'item');
        
        // 保存
        this.plugin.storage.setCard(card);
        
        console.log(`[QuickCard] ✅ Created Cloze Card: ${blockId} (${clozes.length} clozes)`);
    }
    
    // ========== Xiuyuan 卡片 ==========
    
    private async createDescriptorCard(
        blockId: string, 
        content: string
    ): Promise<void> {
        // 获取父块
        const parentBlock = await this.getParentBlock(blockId);
        
        // 检查父块是否为 Concept
        if (!parentBlock || !this.isConceptBlock(parentBlock.content)) {
            console.warn(`[QuickCard] ⚠️ Descriptor without Concept parent: ${blockId}`);
            // 降级为 Basic Card
            await this.createBasicCard(blockId, 'basicForward', content);
            return;
        }
        
        // 创建 Xiuyuan
        const result = await this.plugin.xiuyuanService.createFromBlocks(
            [parentBlock.id, blockId],
            'builtin-concept-descriptor',
            {
                concept: parentBlock.id,
                descriptor: blockId,
            },
            BUILTIN_DECK_ID
        );
        
        if (result.ok) {
            console.log(`[QuickCard] ✅ Created Descriptor Card (Xiuyuan): ${result.value.xiuyuan.id}`);
        } else {
            console.error(`[QuickCard] ❌ Failed to create Descriptor Card:`, result.error);
        }
    }
    
    private async createMultiLineCard(
        blockId: string, 
        content: string
    ): Promise<void> {
        // 获取子块
        const children = await this.getChildBlocks(blockId);
        
        if (children.length < 2) {
            console.warn(`[QuickCard] ⚠️ Multi-Line Card needs at least 2 children: ${blockId}`);
            return;
        }
        
        // 创建 Xiuyuan（使用已有的列表模版）
        const result = await this.plugin.xiuyuanService.createFromBlocks(
            [blockId, ...children.map(c => c.id)],
            'builtin-list-item',
            {
                question: blockId,
                answer: children[0].id,
            },
            BUILTIN_DECK_ID
        );
        
        if (result.ok) {
            console.log(`[QuickCard] ✅ Created Multi-Line Card (Xiuyuan): ${result.value.xiuyuan.id}`);
        } else {
            console.error(`[QuickCard] ❌ Failed to create Multi-Line Card:`, result.error);
        }
    }
}
```

---

### 4. Xiuyuan 模版定义

```typescript
/**
 * 内置模版注册
 */
class BuiltinTemplates {
    static register(service: XiuyuanService): void {
        // 1. 列表项模版（已实现）
        service.createTemplate({
            id: 'builtin-list-item',
            name: '列表项模版',
            description: '渐进式列表复习',
            fields: [
                { name: 'question', description: '问题块' },
                { name: 'answer', description: '答案块' },
            ],
            cardRules: [
                {
                    typeMarker: 'list-item',
                    frontFields: ['question'],
                    backFields: ['answer'],
                },
            ],
        });
        
        // 2. 概念-描述符模版（新增）
        service.createTemplate({
            id: 'builtin-concept-descriptor',
            name: '概念-描述符',
            description: '概念及其属性',
            fields: [
                { name: 'concept', description: '概念块' },
                { name: 'descriptor', description: '描述符块' },
            ],
            cardRules: [
                {
                    typeMarker: 'concept-descriptor',
                    frontFields: ['concept', 'descriptor'],
                    backFields: ['concept', 'descriptor'],
                },
            ],
        });
        
        // 3. 双向卡片模版（新增）
        service.createTemplate({
            id: 'builtin-bidirectional',
            name: '双向卡片',
            description: '自动生成正反两个方向',
            fields: [
                { name: 'front', description: '正面块' },
                { name: 'back', description: '反面块' },
            ],
            cardRules: [
                {
                    typeMarker: 'forward',
                    frontFields: ['front'],
                    backFields: ['back'],
                },
                {
                    typeMarker: 'backward',
                    frontFields: ['back'],
                    backFields: ['front'],
                },
            ],
        });
    }
}
```

---

## 🔄 与现有 TransactionObserver 的集成

### 方案 A：替换 TransactionObserver（推荐）

```typescript
// 在 index.ts 中
class FSRSPlugin {
    private quickCardService: QuickCardWebSocketService | null = null;
    
    async onload() {
        // ... 其他初始化 ...
        
        // 🆕 启动快速制卡服务（替换 TransactionObserver）
        if (settings.incremental?.autoCardEnabled) {
            this.quickCardService = new QuickCardWebSocketService(this);
            this.quickCardService.start();
        }
        
        // ❌ 移除旧的 TransactionObserver
        // this.transactionObserver = new TransactionObserver(this);
        // this.transactionObserver.init();
    }
    
    onunload() {
        // 停止快速制卡服务
        if (this.quickCardService) {
            this.quickCardService.stop();
            this.quickCardService = null;
        }
    }
}
```

### 方案 B：共存模式（过渡期）

```typescript
// 在 index.ts 中
class FSRSPlugin {
    private transactionObserver: TransactionObserver | null = null;
    private quickCardService: QuickCardWebSocketService | null = null;
    
    async onload() {
        // ... 其他初始化 ...
        
        const useQuickCard = settings.incremental?.useQuickCardSymbols || false;
        
        if (useQuickCard) {
            // 使用新的快速制卡服务
            this.quickCardService = new QuickCardWebSocketService(this);
            this.quickCardService.start();
        } else {
            // 使用旧的 TransactionObserver
            this.transactionObserver = new TransactionObserver(this);
            this.transactionObserver.init();
            this.transactionObserver.setEnabled(settings.incremental?.autoCardEnabled || false);
        }
    }
}
```

---

## 📝 配置选项

### 设置面板

```typescript
interface QuickCardSettings {
    // 启用快速制卡
    autoCardEnabled: boolean;
    
    // 使用符号快速制卡（新功能）
    useQuickCardSymbols: boolean;
    
    // 启用的符号类型
    enabledSymbols: {
        basic: boolean;        // >> << <>
        concept: boolean;      // ::
        descriptor: boolean;   // ;;
        cloze: boolean;        // {{}}
        multiLine: boolean;    // >>>
    };
    
    // 防抖时间（毫秒）
    debounceDelay: number;
    
    // 自动上下文
    autoContext: boolean;
}
```

### 设置界面

```vue
<template>
  <div class="quick-card-settings">
    <h3>快速制卡</h3>
    
    <!-- 启用快速制卡 -->
    <div class="form-item">
      <label>启用实时自动制卡</label>
      <input type="checkbox" v-model="settings.autoCardEnabled">
      <p class="hint">监听编辑操作，自动创建闪卡</p>
    </div>
    
    <!-- 使用符号快速制卡 -->
    <div class="form-item">
      <label>使用符号快速制卡（实验性）</label>
      <input type="checkbox" v-model="settings.useQuickCardSymbols">
      <p class="hint">使用 >> :: ;; 等符号快速创建卡片</p>
    </div>
    
    <!-- 启用的符号类型 -->
    <div class="form-item" v-if="settings.useQuickCardSymbols">
      <label>启用的符号类型</label>
      <div class="checkbox-group">
        <label><input type="checkbox" v-model="settings.enabledSymbols.basic"> 基础卡片 (>>)</label>
        <label><input type="checkbox" v-model="settings.enabledSymbols.concept"> 概念卡片 (::)</label>
        <label><input type="checkbox" v-model="settings.enabledSymbols.descriptor"> 描述符 (;;)</label>
        <label><input type="checkbox" v-model="settings.enabledSymbols.cloze"> 填空 ({{}})</label>
        <label><input type="checkbox" v-model="settings.enabledSymbols.multiLine"> 多行 (>>>)</label>
      </div>
    </div>
  </div>
</template>
```

---

## 🚀 实现步骤

### Phase 1：基础架构（1-2天）

- [ ] 创建 `QuickCardWebSocketService` 类
- [ ] 创建 `SymbolDetector` 类
- [ ] 创建 `QuickCardRouter` 类
- [ ] 实现 WebSocket 连接和监听
- [ ] 实现符号检测逻辑

### Phase 2：简单卡片（1-2天）

- [ ] 实现 Basic Cards（`>>` `<<` `<>`）
- [ ] 实现 Concept Cards（`::`）
- [ ] 实现 Cloze Cards（`{{}}`）
- [ ] 测试简单卡片创建

### Phase 3：Xiuyuan 集成（2-3天）

- [ ] 实现 `builtin-concept-descriptor` 模版
- [ ] 实现 Descriptor Cards（`;;`）
- [ ] 优化 Multi-Line Cards（`>>>`）
- [ ] 测试 Xiuyuan 卡片创建

### Phase 4：优化和测试（1-2天）

- [ ] 添加配置选项
- [ ] 添加设置界面
- [ ] 性能优化
- [ ] 完整测试
- [ ] 文档更新

---

## 🎯 成功标准

### 功能完整性

- ✅ 支持 5 种快速制卡符号
- ✅ WebSocket 实时监听
- ✅ 自动创建卡片
- ✅ Xiuyuan 模版集成

### 性能指标

- ✅ 防抖延迟 < 500ms
- ✅ 卡片创建 < 100ms
- ✅ 内存占用 < 10MB

### 用户体验

- ✅ 符号输入流畅
- ✅ 创建反馈及时
- ✅ 错误提示清晰
- ✅ 配置简单直观

---

## 📊 与旧实现的对比

| 特性 | TransactionObserver | QuickCardWebSocketService |
|------|-------------------|--------------------------|
| **连接方式** | eventBus | 直接 WebSocket |
| **符号支持** | ❌ 无 | ✅ 5种符号 |
| **Xiuyuan 集成** | ⚠️ 部分 | ✅ 完整 |
| **防抖时间** | 2000ms | 300ms |
| **重连机制** | ❌ 无 | ✅ 自动重连 |
| **配置选项** | ⚠️ 简单 | ✅ 丰富 |

---

## ✅ 总结

### 核心优势

1. ✅ **符号驱动**：使用简单符号快速创建卡片
2. ✅ **实时响应**：WebSocket 直连，300ms 防抖
3. ✅ **智能路由**：自动选择简单卡片或 Xiuyuan
4. ✅ **灵活配置**：用户可以选择启用的符号类型

### 技术亮点

1. ✅ **分层架构**：监听层 → 检测层 → 路由层
2. ✅ **按需使用**：只在需要时使用 Xiuyuan
3. ✅ **向后兼容**：可以与旧实现共存
4. ✅ **易于扩展**：新增符号只需添加检测规则

### 下一步

1. 开始实现 Phase 1：基础架构
2. 创建核心类和接口
3. 实现 WebSocket 监听
4. 实现符号检测

---

**文档创建时间**：2026-02-14  
**作者**：Kiro AI Assistant  
**状态**：设计完成，准备实现
