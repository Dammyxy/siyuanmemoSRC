# 快速制卡符号系统 - Spec 总结

**功能名称**：快速制卡符号系统  
**创建时间**：2026-02-15  
**优先级**：P1（重要功能增强）  
**预估工期**：9-13天

---

## 📋 Spec 文档结构

```
.kiro/specs/quick-card-symbols/
├── requirements.md  # 需求文档
├── design.md        # 设计文档
└── tasks.md         # 任务列表
```

---

## 🎯 功能概述

实现一个基于符号的快速制卡系统，让用户可以通过简单的符号（如 `>>`, `::`, `;;` 等）快速创建不同类型的闪卡，同时优化 WebSocket 连接机制。

### 核心价值

- **提升效率**：通过符号快速创建卡片，不打断写作流程
- **降低门槛**：符号简单易记，新手也能快速上手
- **增强灵活性**：支持多种卡片类型，满足不同学习场景
- **提高稳定性**：直接 WebSocket 连接，自动重连机制

---

## 🔤 支持的符号类型

| 符号 | 卡片类型 | 使用 Xiuyuan？ | 示例 | 优先级 |
|------|---------|---------------|------|--------|
| `>>` | 正向卡片 | ❌ | `问题 >> 答案` | P0 |
| `<<` | 反向卡片 | ❌ | `答案 << 问题` | P0 |
| `<>` | 双向卡片 | ❌ | `问题 <> 答案` | P0 |
| `::` | 概念卡片 | ❌ | `概念 :: 定义` | P0 |
| `{{}}` | 填空卡片 | ❌ | `文本{{填空}}` | P0 |
| `;;` | 描述符卡片 | ✅ | `属性 ;; 描述` | P1 |
| `>>>` | 列表模版 | ✅ | `问题 >>>` | P1 |

---

## 🏗️ 架构设计

### 三层架构

```
┌─────────────────────────────────────┐
│  WebSocket 连接层                   │
│  - 连接管理                         │
│  - 自动重连                         │
│  - 事件监听                         │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  符号检测层                         │
│  - 符号识别                         │
│  - 优先级匹配                       │
│  - 内容解析                         │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  路由层                             │
│  - 类型路由                         │
│  - 创建策略                         │
│  - 错误处理                         │
└─────────────────────────────────────┘
```

### 核心类

1. **QuickCardWebSocketService**：WebSocket 服务，负责连接和事件监听
2. **SymbolDetector**：符号检测器，负责识别和解析符号
3. **QuickCardRouter**：路由器，负责根据符号类型创建卡片

---

## 🆕 新增 Xiuyuan 模版

### builtin-concept-descriptor（概念-描述符）

**用途**：管理概念和描述符的关系

**字段**：
- `concept`：概念块 ID
- `descriptor`：描述符块 ID

**示例**：
```markdown
线粒体 :: 细胞的能量工厂  ← concept
  ├─ 起源 ;; 被认为是通过内共生起源的  ← descriptor
  └─ 功能 ;; 为细胞生成ATP  ← descriptor
```

**复习时显示**：
- 正面：概念名称 + 属性名称
- 反面：概念定义 + 属性描述

---

## 🔄 实现流程

### 1. WebSocket 连接流程

```
启动服务 → 创建连接 → 监听事件 → 接收 transactions → 处理事务
```

### 2. 符号检测流程

```
接收事件 → 提取操作 → 加入队列 → 防抖 → 批量处理 → 符号检测 → 路由创建
```

### 3. 卡片创建流程

```
检查已制卡 → 判断类型 → 简单卡片/Xiuyuan → 添加到 Riff → 保存 → 提示
```

---

## 📊 实施计划

### Phase 1：基础架构（2-3天）

- [ ] 创建核心类（QuickCardWebSocketService, SymbolDetector, QuickCardRouter）
- [ ] 实现 WebSocket 连接和事件监听
- [ ] 实现自动重连机制
- [ ] 实现防抖机制

### Phase 2：简单卡片（2-3天）

- [ ] 实现符号检测和内容解析
- [ ] 实现 Basic Cards（`>>`, `<<`, `<>`）
- [ ] 实现 Concept Cards（`::`）
- [ ] 实现 Cloze Cards（`{{}}`）

### Phase 3：Xiuyuan 集成（3-4天）

- [ ] 实现 `builtin-concept-descriptor` 模版
- [ ] 实现 Descriptor Cards（`;;`）
- [ ] 优化 Multi-Line Cards（`>>>`）
- [ ] 注册内置模版

### Phase 4：优化和测试（2-3天）

- [ ] 添加配置选项和界面
- [ ] 集成到插件主类
- [ ] 添加单元测试和集成测试
- [ ] 性能优化
- [ ] 更新文档

---

## ✅ 成功标准

### 功能完整性

- ✅ 支持 5 种快速制卡符号
- ✅ WebSocket 实时监听
- ✅ 自动创建卡片
- ✅ Xiuyuan 模版集成
- ✅ 自动重连机制

### 性能指标

- ✅ 符号检测 < 100ms
- ✅ 防抖延迟 ≤ 500ms（默认 300ms）
- ✅ 卡片创建 < 200ms
- ✅ WebSocket 重连 < 5秒
- ✅ 内存占用 < 10MB

### 用户体验

- ✅ 符号输入流畅
- ✅ 创建反馈及时
- ✅ 错误提示清晰
- ✅ 配置简单直观

### 质量标准

- ✅ 单元测试覆盖率 > 80%
- ✅ 集成测试通过
- ✅ 无严重 Bug
- ✅ 文档完整

---

## 🎨 配置界面

```vue
<template>
  <div class="quick-card-settings">
    <h3>快速制卡</h3>
    
    <!-- 启用快速制卡 -->
    <div class="form-item">
      <label>启用快速制卡</label>
      <input type="checkbox" v-model="settings.enabled">
    </div>
    
    <!-- 启用的符号类型 -->
    <div class="form-item">
      <label>启用的符号类型</label>
      <div class="checkbox-group">
        <label><input type="checkbox" v-model="settings.enabledSymbols.basic"> 基础卡片 (>>)</label>
        <label><input type="checkbox" v-model="settings.enabledSymbols.concept"> 概念卡片 (::)</label>
        <label><input type="checkbox" v-model="settings.enabledSymbols.descriptor"> 描述符 (;;)</label>
        <label><input type="checkbox" v-model="settings.enabledSymbols.cloze"> 填空 ({{}})</label>
        <label><input type="checkbox" v-model="settings.enabledSymbols.multiLine"> 多行 (>>>)</label>
      </div>
    </div>
    
    <!-- 防抖时间 -->
    <div class="form-item">
      <label>防抖时间（毫秒）</label>
      <input type="number" v-model.number="settings.debounceDelay" min="100" max="2000">
      <p class="hint">推荐 300ms</p>
    </div>
  </div>
</template>
```

---

## 📚 参考文档

### 现有文档

- [快速制卡实现方案](./QUICK_CARD_IMPLEMENTATION_PLAN.md)
- [快速制卡符号设计](./QUICK_CARD_SYMBOL_DESIGN.md)
- [快速制卡功能总览](./QUICK_CARD_FEATURE_OVERVIEW.md)
- [Xiuyuan 快速制卡集成](./XIUYUAN_QUICK_CARD_INTEGRATION.md)
- [RemNote 快速制卡分析](./REMNOTE_QUICK_CARD_ANALYSIS.md)

### Spec 文档

- [需求文档](../.kiro/specs/quick-card-symbols/requirements.md)
- [设计文档](../.kiro/specs/quick-card-symbols/design.md)
- [任务列表](../.kiro/specs/quick-card-symbols/tasks.md)

---

## 🚀 下一步

1. **评审 Spec**：与团队评审需求、设计和任务
2. **开始 Phase 1**：创建基础架构
3. **迭代开发**：按 Phase 逐步实现
4. **测试验证**：确保质量和性能
5. **发布上线**：更新文档，发布新版本

---

## 💡 关键决策

### 1. 为什么不全部使用 Xiuyuan？

**决策**：简单卡片（Basic, Concept, Cloze）不使用 Xiuyuan

**原因**：
- 这些卡片只需要单个块，不需要多块映射
- 使用 Xiuyuan 会增加复杂度和性能开销
- 直接创建 FSRS Card 更简单高效

### 2. 为什么 Descriptor 可选使用 Xiuyuan？

**决策**：Descriptor 在有父概念时使用 Xiuyuan，否则降级

**原因**：
- Descriptor 的价值在于与 Concept 的关系
- 有父概念时，使用 Xiuyuan 可以更好地管理关系
- 没有父概念时，降级为普通卡片避免创建失败

### 3. 为什么使用直接 WebSocket 而不是 eventBus？

**决策**：直接创建 WebSocket 连接

**原因**：
- 更稳定：不依赖插件 API
- 更快速：减少中间层
- 更可控：可以实现自动重连
- 更独立：不受其他插件影响

---

## ⚠️ 风险和缓解

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| WebSocket 连接不稳定 | 高 | 中 | 实现自动重连机制 |
| 符号误检测 | 中 | 中 | 优化检测优先级和正则表达式 |
| 性能问题 | 中 | 低 | 防抖、批量处理、去重 |
| 与现有功能冲突 | 高 | 低 | 提供配置开关，支持共存模式 |

### 用户风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 学习成本高 | 中 | 中 | 提供详细文档和示例 |
| 误创建卡片 | 中 | 中 | 提供撤销功能，显示创建提示 |
| 配置复杂 | 低 | 低 | 提供合理的默认配置 |

---

**文档版本**：v1.0  
**最后更新**：2026-02-15  
**状态**：Spec 已完成，待开始实施 🚀
