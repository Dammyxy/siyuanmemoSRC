# DDD 重构迁移状态分析

## 执行摘要

当前 DDD 重构**部分完成**。Xiuyuan 系统的核心架构已经 DDD 化，但仍有大量代码使用旧的 `createDefaultCard` 方式创建普通闪卡，形成了**混合架构**。

## 1. 已完成的 DDD 化部分 ✅

### 1.1 领域层（Domain Layer）
- ✅ **值对象**：XiuyuanId, BlockId, TemplateId, CardFace, Priority
- ✅ **实体**：Card（卡片实体）
- ✅ **聚合根**：Xiuyuan（修缘聚合根）
- ✅ **领域服务**：CardCreationService, CardDeletionService
- ✅ **仓储接口**：IXiuyuanRepository
- ✅ **领域事件**：CardCreated, CardDeleted, CardUpdated

### 1.2 基础设施层（Infrastructure Layer）
- ✅ **仓储实现**：XiuyuanRepository
- ✅ **数据转换**：领域对象 ↔ 持久化数据

### 1.3 应用层（Application Layer）
- ✅ **命令对象**：CreateCardCommand, DeleteCardCommand, UpdateCardCommand
- ✅ **用例**：CreateCardUseCase, DeleteCardUseCase, UpdateCardUseCase
- ✅ **应用服务**：CardApplicationService
- ✅ **应用上下文**：ApplicationContext（依赖注入容器）

### 1.4 表现层（Presentation Layer）
- ✅ **插件入口**：index.ts（简化到 < 200 行）
- ✅ **UI 管理器**：DialogManager, MenuManager, TabManager
- ✅ **事件处理**：BlockMenuHandler（部分迁移）

## 2. 未完成的 DDD 化部分 ⚠️

### 2.1 普通闪卡创建（非 Xiuyuan）

以下场景仍在使用 `createDefaultCard` 创建普通 FSRS 卡片：

#### 🔴 AutoCardHandler（自动制卡）
**文件**：`src/services/handlers/AutoCardHandler.ts`

**使用场景**：
1. **符号检测制卡**（第 571 行）
   - 检测到 `<>` 符号时自动创建卡片
   - 使用 `createDefaultCard(blockId)`
   
2. **双向卡片降级**（第 633 行）
   - 当 XiuyuanService 不可用时的降级方案
   - 使用 `createDefaultCard(blockId)`

3. **概念卡创建**（第 857, 1018, 1131, 1518, 1711 行）
   - 多处创建概念卡（Concept Card）
   - 使用 `createDefaultCard(blockId)` + `card.type = 'concept'`

4. **引用卡片创建**（第 1020 行）
   - 创建引用类型的卡片
   - 使用 `createDefaultCard(blockId)`

**问题**：
- 这些卡片不是 Xiuyuan 卡片，没有模板、字段映射等高级功能
- 直接操作 StorageManager，绕过了 DDD 架构
- 没有领域事件，无法追踪卡片生命周期

#### 🔴 BlockMenuHandler（块菜单处理）
**文件**：`src/services/BlockMenuHandler.ts`

**使用场景**：
1. **制作概念卡并加入队列**（第 921 行）
   - 用户手动将块制作为概念卡
   - 使用 `createDefaultCard(blockId)` + `card.type = 'concept'`

**问题**：
- 概念卡应该有专门的 Xiuyuan 模板（如 `builtin-concept-simple`）
- 当前绕过了 CardApplicationService

#### 🔴 CardService（旧的卡片服务）
**文件**：`src/services/CardService.ts`

**使用场景**：
1. **快速制卡**（第 134 行）
   - 使用 `createDefaultCard(blockId)`

**问题**：
- CardService 本身就是旧架构的产物
- 应该被 CardApplicationService 替代

#### 🔴 Card Builder Strategies（卡片构建策略）
**文件**：`src/core/card-builder/strategies/*.ts`

**使用场景**：
1. **DefaultStrategy**：默认卡片构建
2. **QAStrategy**：问答卡片构建
3. **ClozeStrategy**：挖空卡片构建

**问题**：
- 这些策略模式的代码仍在使用 `createDefaultCard`
- 应该迁移到 Xiuyuan 模板系统

### 2.2 直接操作 StorageManager

以下代码直接调用 `StorageManager.setCard()` 和 `StorageManager.removeCard()`：

1. **AutoCardHandler**：创建卡片后直接 `storage.setCard(card)`
2. **BlockMenuHandler**：删除卡片时直接 `storage.removeCard(cardId)`
3. **CardService**：各种操作直接操作 storage

**问题**：
- 绕过了应用层和领域层
- 没有业务规则验证
- 没有领域事件发布
- 无法追踪和审计

## 3. 混合架构现状

### 3.1 两套并行系统

```
┌─────────────────────────────────────────────────────────────┐
│                      当前架构（混合）                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────┐      ┌──────────────────────┐    │
│  │   Xiuyuan 系统       │      │   普通 FSRS 卡片     │    │
│  │   (DDD 架构)         │      │   (旧架构)           │    │
│  ├──────────────────────┤      ├──────────────────────┤    │
│  │ • 模板卡片           │      │ • 概念卡             │    │
│  │ • 列表模版卡         │      │ • 自动制卡           │    │
│  │ • 字段映射           │      │ • 快速制卡           │    │
│  │ • 多卡片生成         │      │ • 符号检测卡         │    │
│  │                      │      │                      │    │
│  │ 使用：               │      │ 使用：               │    │
│  │ • CardApplicationService │  │ • createDefaultCard  │    │
│  │ • XiuyuanRepository  │      │ • StorageManager     │    │
│  │ • 领域事件           │      │ • 直接操作           │    │
│  └──────────────────────┘      └──────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 数据存储

**两个独立的存储系统**：

1. **Xiuyuan 存储**（`xiuyuan.msgpack`）
   - 存储 Xiuyuan 聚合根
   - 包含模板、字段映射、卡片关系
   - 通过 XiuyuanRepository 访问

2. **FSRS 卡片存储**（`cards.msgpack`）
   - 存储所有 FSRS 卡片（包括 Xiuyuan 卡片和普通卡片）
   - 通过 StorageManager 访问
   - 混合了两种类型的卡片

**问题**：
- 数据冗余：Xiuyuan 卡片同时存在于两个存储中
- 同步问题：需要手动保持两边数据一致
- 查询复杂：需要同时查询两个存储

## 4. 迁移优先级建议

### 🔥 高优先级（P0）

#### 4.1 统一概念卡创建
**目标**：将所有概念卡创建迁移到 Xiuyuan 系统

**步骤**：
1. 创建内置概念卡模板（`builtin-concept-simple`）
2. 扩展 CreateCardCommand 支持概念卡类型
3. 迁移 AutoCardHandler 中的概念卡创建
4. 迁移 BlockMenuHandler 中的概念卡创建

**影响**：
- AutoCardHandler：5 处修改
- BlockMenuHandler：1 处修改

#### 4.2 废弃 CardService
**目标**：完全移除 CardService，使用 CardApplicationService

**步骤**：
1. 找到所有 CardService 的调用点
2. 替换为 CardApplicationService
3. 删除 CardService 文件

**影响**：
- 需要检查所有引用 CardService 的代码

### ⚠️ 中优先级（P1）

#### 4.3 迁移 Card Builder Strategies
**目标**：将卡片构建策略迁移到 Xiuyuan 模板系统

**步骤**：
1. 为每种策略创建对应的 Xiuyuan 模板
2. 更新策略使用 CardApplicationService
3. 保持向后兼容

**影响**：
- DefaultStrategy
- QAStrategy
- ClozeStrategy

#### 4.4 统一自动制卡
**目标**：AutoCardHandler 使用 CardApplicationService

**步骤**：
1. 扩展 CreateCardCommand 支持符号检测
2. 迁移符号检测制卡逻辑
3. 迁移双向卡片创建逻辑

**影响**：
- AutoCardHandler：多处修改

### 📝 低优先级（P2）

#### 4.5 统一数据存储
**目标**：合并 Xiuyuan 存储和 FSRS 卡片存储

**步骤**：
1. 设计统一的存储模型
2. 实现数据迁移工具
3. 更新所有查询逻辑

**影响**：
- 需要数据迁移
- 可能影响性能

## 5. 完全 DDD 化的目标架构

```
┌─────────────────────────────────────────────────────────────┐
│                    目标架构（完全 DDD）                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │              统一的 Xiuyuan 系统                    │    │
│  │              (完全 DDD 架构)                        │    │
│  ├────────────────────────────────────────────────────┤    │
│  │ • 所有类型的卡片（模板卡、概念卡、普通卡）         │    │
│  │ • 统一的创建流程                                   │    │
│  │ • 统一的存储                                       │    │
│  │ • 完整的领域事件                                   │    │
│  │                                                     │    │
│  │ 使用：                                             │    │
│  │ • CardApplicationService（唯一入口）               │    │
│  │ • XiuyuanRepository（唯一存储）                    │    │
│  │ • 领域事件（完整追踪）                             │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 6. 迁移路线图

### Phase 1: 核心功能 DDD 化（已完成 ✅）
- [x] 创建领域模型
- [x] 实现仓储
- [x] 创建应用服务
- [x] 迁移模板卡片创建
- [x] 迁移卡片删除

### Phase 2: 概念卡统一（建议优先）
- [ ] 创建概念卡模板
- [ ] 迁移 AutoCardHandler 概念卡创建
- [ ] 迁移 BlockMenuHandler 概念卡创建
- [ ] 测试概念卡功能

### Phase 3: 自动制卡迁移
- [ ] 扩展 CreateCardCommand
- [ ] 迁移符号检测制卡
- [ ] 迁移双向卡片创建
- [ ] 废弃 CardService

### Phase 4: 完全统一
- [ ] 迁移 Card Builder Strategies
- [ ] 统一数据存储
- [ ] 移除所有 createDefaultCard 调用
- [ ] 移除所有直接 StorageManager 操作

## 7. 风险和注意事项

### 7.1 向后兼容性
- 现有的普通 FSRS 卡片需要能继续工作
- 数据迁移需要无损
- 用户不应感知到变化

### 7.2 性能影响
- Xiuyuan 系统比简单的 FSRS 卡片更重
- 需要评估性能影响
- 可能需要优化查询

### 7.3 测试覆盖
- 需要大量的集成测试
- 需要测试迁移路径
- 需要测试混合场景

## 8. 结论

**当前状态**：
- ✅ Xiuyuan 核心系统已完全 DDD 化
- ⚠️ 普通 FSRS 卡片仍使用旧架构
- ⚠️ 存在混合架构，两套系统并行

**建议**：
1. **短期**：保持混合架构，确保现有功能稳定
2. **中期**：优先迁移概念卡（使用频率高）
3. **长期**：逐步迁移所有卡片类型，实现完全统一

**是否需要完全统一**：
- 如果追求架构纯粹性和长期维护性：**是**
- 如果追求快速迭代和功能稳定性：**可以暂缓**

建议采用**渐进式迁移**策略，先迁移高频功能，再逐步统一。
