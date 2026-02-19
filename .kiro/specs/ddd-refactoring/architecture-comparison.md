# 架构对比：当前 vs 目标

## 当前混合架构

```
用户操作
   │
   ├─────────────────────────────────────────────────────────┐
   │                                                          │
   ▼                                                          ▼
┌──────────────────────┐                          ┌──────────────────────┐
│  模板卡片创建         │                          │  普通卡片创建         │
│  (DDD 架构) ✅       │                          │  (旧架构) ⚠️         │
└──────────────────────┘                          └──────────────────────┘
   │                                                          │
   ▼                                                          ▼
┌──────────────────────┐                          ┌──────────────────────┐
│ CardApplicationService│                          │  createDefaultCard   │
│  • CreateCardUseCase │                          │  • 直接创建 FSRS 卡片│
│  • DeleteCardUseCase │                          │  • 无业务规则        │
│  • UpdateCardUseCase │                          │  • 无领域事件        │
└──────────────────────┘                          └──────────────────────┘
   │                                                          │
   ▼                                                          ▼
┌──────────────────────┐                          ┌──────────────────────┐
│ CardCreationService  │                          │  StorageManager      │
│ CardDeletionService  │                          │  • setCard()         │
│  • 业务规则验证      │                          │  • removeCard()      │
│  • 领域事件发布      │                          │  • 直接操作          │
└──────────────────────┘                          └──────────────────────┘
   │                                                          │
   ▼                                                          ▼
┌──────────────────────┐                          ┌──────────────────────┐
│ XiuyuanRepository    │                          │  cards.msgpack       │
│  • 聚合根持久化      │                          │  • 扁平存储          │
│  • 数据转换          │                          │  • 无关系            │
└──────────────────────┘                          └──────────────────────┘
   │                                                          │
   ▼                                                          ▼
┌──────────────────────┐                          ┌──────────────────────┐
│ xiuyuan.msgpack      │                          │  cards.msgpack       │
│  • Xiuyuan 聚合根    │                          │  • FSRS 卡片         │
│  • 模板、字段映射    │                          │  • 复习数据          │
└──────────────────────┘                          └──────────────────────┘
```

## 使用场景分布

### ✅ 已使用 DDD 架构的场景

1. **模板卡片创建**
   - 通过块菜单 → "创建模板卡片"
   - 选择模板 → 生成多张卡片
   - 使用 CardApplicationService

2. **列表模版卡创建**
   - 通过块菜单 → "创建列表模版卡"
   - 为有序列表项批量创建卡片
   - 使用 XiuyuanService（待迁移到 CardApplicationService）

3. **卡片删除**（部分）
   - 通过块菜单 → "取消闪卡"
   - 通过浏览器删除
   - 使用 CardApplicationService

### ⚠️ 仍使用旧架构的场景

1. **概念卡创建**（5+ 处）
   - 自动检测引用创建概念卡
   - 手动制作概念卡
   - 使用 `createDefaultCard` + `card.type = 'concept'`

2. **符号检测自动制卡**
   - 检测 `<>` 符号自动创建卡片
   - 使用 `createDefaultCard`

3. **双向卡片创建**
   - 自动创建正向和反向卡片
   - 使用 `createDefaultCard`（降级方案）

4. **快速制卡**
   - 通过 CardService 快速创建
   - 使用 `createDefaultCard`

5. **Card Builder Strategies**
   - DefaultStrategy
   - QAStrategy
   - ClozeStrategy
   - 都使用 `createDefaultCard`

## 代码统计

### 使用 `createDefaultCard` 的位置

| 文件 | 使用次数 | 场景 |
|------|---------|------|
| AutoCardHandler.ts | 7 | 概念卡、符号检测、引用卡 |
| BlockMenuHandler.ts | 1 | 概念卡 |
| CardService.ts | 1 | 快速制卡 |
| DefaultStrategy.ts | 1 | 默认卡片构建 |
| QAStrategy.ts | 1 | 问答卡片构建 |
| ClozeStrategy.ts | 1 | 挖空卡片构建 |
| **总计** | **12** | |

### 直接操作 StorageManager 的位置

| 操作 | 使用次数 | 主要文件 |
|------|---------|---------|
| `setCard()` | 10+ | AutoCardHandler, CardService, BlockMenuHandler |
| `removeCard()` | 5+ | BlockMenuHandler, HybridSyncService |
| `deleteCards()` | 3+ | BrowserService, DataSource |

## 数据流对比

### 当前：模板卡片创建（DDD）

```
用户选择模板
    ↓
DialogManager.openCreateTemplateCardDialog()
    ↓
CardApplicationService.createCard(CreateCardCommand)
    ↓
CreateCardUseCase.execute()
    ↓
CardCreationService.createCard()
    ↓
Xiuyuan.addCard() [领域事件: CardCreated]
    ↓
XiuyuanRepository.save()
    ↓
xiuyuan.msgpack + cards.msgpack
```

### 当前：概念卡创建（旧架构）

```
检测到引用
    ↓
AutoCardHandler.createConceptCard()
    ↓
createDefaultCard(blockId)
    ↓
card.type = 'concept'
    ↓
StorageManager.setCard(card)
    ↓
cards.msgpack
```

### 目标：统一的卡片创建（完全 DDD）

```
任何卡片创建
    ↓
CardApplicationService.createCard(CreateCardCommand)
    ↓
CreateCardUseCase.execute()
    ↓
CardCreationService.createCard()
    ↓
Xiuyuan.addCard() [领域事件: CardCreated]
    ↓
XiuyuanRepository.save()
    ↓
统一存储
```

## 迁移进度

### Phase 1: 核心 DDD 架构 ✅ (100%)
- [x] 领域模型
- [x] 仓储实现
- [x] 应用服务
- [x] 用例实现

### Phase 2: 模板卡片 ✅ (100%)
- [x] 模板卡片创建
- [x] 模板卡片删除
- [x] 模板选择对话框

### Phase 3: 普通卡片 ⚠️ (20%)
- [x] 卡片删除（部分）
- [ ] 概念卡创建（0/6）
- [ ] 符号检测制卡（0/1）
- [ ] 双向卡片创建（0/1）
- [ ] 快速制卡（0/1）
- [ ] Card Builder Strategies（0/3）

### Phase 4: 完全统一 ⏳ (0%)
- [ ] 废弃 CardService
- [ ] 统一数据存储
- [ ] 移除所有 createDefaultCard
- [ ] 移除直接 StorageManager 操作

## 总体进度

```
████████████░░░░░░░░░░░░░░░░░░░░ 40%

已完成：
- ✅ DDD 核心架构
- ✅ 模板卡片系统

进行中：
- ⚠️ 普通卡片迁移

待完成：
- ⏳ 完全统一架构
```

## 建议

### 立即行动（本周）
1. 创建概念卡模板（`builtin-concept-simple`）
2. 迁移 BlockMenuHandler 中的概念卡创建（1 处）
3. 测试概念卡功能

### 短期目标（本月）
1. 迁移 AutoCardHandler 中的概念卡创建（7 处）
2. 扩展 CreateCardCommand 支持更多卡片类型
3. 编写迁移测试

### 长期目标（下季度）
1. 迁移所有 Card Builder Strategies
2. 废弃 CardService
3. 统一数据存储
4. 实现完全 DDD 架构

## 结论

**当前状态**：混合架构，40% DDD 化

**核心问题**：
- 两套并行系统（Xiuyuan DDD + 普通 FSRS）
- 数据分散存储（xiuyuan.msgpack + cards.msgpack）
- 代码路径不统一（CardApplicationService + createDefaultCard）

**推荐策略**：
- 采用渐进式迁移
- 优先迁移高频功能（概念卡）
- 保持向后兼容
- 充分测试每个迁移步骤
